import "server-only";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { ContractFieldKey } from "@prisma/client";
import { storage } from "@/lib/providers/storage";
import { makeRng, type Rng } from "./rng";
import type {
  AiProvider,
  AssistantAnswer,
  ExtractedFieldResult,
  ExtractedReceiptResult,
  ExtractionRequest,
  ExtractionResult,
} from "@/lib/providers/types";

/**
 * MockDocumentIntelligence.
 *
 * It behaves like the real thing from the application's point of view:
 *  - it receives the actual uploaded document,
 *  - it reads the page images that were generated for that document,
 *  - it returns per-field values with confidence, page numbers and bounding
 *    boxes that point at real regions of those pages,
 *  - it is deterministic per document but varied across documents,
 *  - it disagrees with the seller sometimes, which is what produces the
 *    discrepancies the analyst has to resolve.
 *
 * Documents rendered by Aqary's own document generator carry a `.truth.json`
 * sidecar describing where each value was drawn. When that exists the mock
 * "reads" the page: values and bounding boxes are real. When it does not
 * (a seller uploading their own PDF), the mock degrades to a noisy read of the
 * declared values with lower confidence — the same shape a weak OCR pass gives.
 */

interface TruthField {
  key: ContractFieldKey;
  num?: string;
  date?: string;
  text?: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
  clauseText?: string;
}

interface TruthSidecar {
  fields: TruthField[];
  receipts?: { amount: string; date: string; method: string; reference: string | null; page: number }[];
  clauses?: { kind: "ASSIGNMENT" | "CANCELLATION" | "DELIVERY"; text: string; page: number }[];
  /** Deliberately seeded document defects the mock should reproduce. */
  quirks?: { lowConfidenceKeys?: ContractFieldKey[]; misreadKey?: ContractFieldKey; misreadFactor?: number };
}

const MONEY_KEYS: ContractFieldKey[] = [
  "TOTAL_PRICE",
  "DOWN_PAYMENT",
  "AMOUNT_PAID",
  "OUTSTANDING_BALANCE",
  "INSTALLMENT_AMOUNT",
  "MAINTENANCE_DEPOSIT",
  "CLUB_FEE",
  "ASSIGNMENT_FEE",
];

export class MockAiProvider implements AiProvider {
  readonly name = "mock-document-intelligence";
  readonly mode = "MOCK" as const;

  async extractContract(req: ExtractionRequest): Promise<ExtractionResult> {
    const started = Date.now();

    const corpusSeed = req.documents.map((d) => d.sha256).sort().join("|") + req.listingId;
    const rng = makeRng(corpusSeed);

    const fields: ExtractedFieldResult[] = [];
    const receipts: ExtractedReceiptResult[] = [];
    const clauses: ExtractionResult["clauses"] = [];

    for (const doc of req.documents) {
      const truth = await this.readTruth(doc.storageKey);
      const docRng = makeRng(doc.sha256);

      if (truth) {
        for (const f of truth.fields) {
          fields.push(this.readField(f, doc.id, docRng, truth));
        }
        for (const [i, r] of (truth.receipts ?? []).entries()) {
          receipts.push({
            documentId: doc.id,
            amount: noisyMoney(r.amount, docRng, 0.06),
            date: r.date,
            method: (r.method as ExtractedReceiptResult["method"]) ?? "UNKNOWN",
            reference: r.reference,
            confidence: round2(docRng.float(0.82, 0.985) - (i % 5 === 4 ? 0.2 : 0)),
            page: r.page,
          });
        }
        for (const c of truth.clauses ?? []) {
          clauses.push({ kind: c.kind, text: c.text, documentId: doc.id, page: c.page });
        }
      }
    }

    // Nothing machine-readable was found — fall back to a noisy read of what
    // the seller declared, at the low confidence a bad scan would produce.
    if (fields.length === 0 && req.declaredHints) {
      const primary = req.documents[0];
      for (const [k, v] of Object.entries(req.declaredHints)) {
        if (v === undefined || v === null || v === "") continue;
        const key = k as ContractFieldKey;
        const isMoney = MONEY_KEYS.includes(key);
        const isDate = /DATE/.test(key);
        fields.push({
          key,
          valueNum: isMoney ? noisyMoney(v, rng, 0.09) : isDate ? null : /\d/.test(v) ? v : null,
          valueDate: isDate ? v : null,
          valueText: !isMoney && !isDate && !/^\d/.test(v) ? v : null,
          confidence: round2(rng.float(0.44, 0.74)),
          documentId: primary?.id ?? null,
          page: primary ? rng.int(1, Math.max(1, primary.pageCount)) : null,
          bbox: primary ? randomBbox(rng) : null,
          clauseText: null,
        });
      }
    }

    // Latency shaped like a real multimodal pass over a long Arabic contract.
    const pages = req.documents.reduce((n, d) => n + d.pageCount, 0);
    const latencyMs = Math.round(900 + pages * rng.float(110, 260));

    const promptHash = createHash("sha256").update(corpusSeed).digest("hex").slice(0, 16);
    const costUsd = new Decimal(pages).mul(0.0142).plus(0.021).toFixed(6);

    return {
      model: "aqary-doc-intelligence-mock",
      version: "1.4.0",
      mode: "MOCK",
      latencyMs: Math.max(latencyMs, Date.now() - started),
      costUsd,
      promptHash,
      fields,
      receipts,
      clauses,
      raw: {
        engine: "mock",
        documents: req.documents.map((d) => ({ id: d.id, type: d.type, pages: d.pageCount })),
        fieldCount: fields.length,
        receiptCount: receipts.length,
      },
    };
  }

  private readField(
    f: TruthField,
    documentId: string,
    rng: Rng,
    truth: TruthSidecar,
  ): ExtractedFieldResult {
    const lowConf = truth.quirks?.lowConfidenceKeys?.includes(f.key) ?? false;
    const misread = truth.quirks?.misreadKey === f.key;

    let valueNum = f.num ?? null;
    if (valueNum && misread) {
      valueNum = new Decimal(valueNum).mul(truth.quirks?.misreadFactor ?? 0.94).toFixed(2);
    } else if (valueNum) {
      // A good multimodal read of a printed figure is usually exact.
      valueNum = rng.chance(0.86) ? new Decimal(valueNum).toFixed(2) : noisyMoney(valueNum, rng, 0.015);
    }

    const confidence = lowConf
      ? round2(rng.float(0.41, 0.66))
      : misread
        ? round2(rng.float(0.62, 0.79))
        : round2(rng.float(0.88, 0.995));

    return {
      key: f.key,
      valueNum,
      valueDate: f.date ?? null,
      valueText: f.text ?? null,
      confidence,
      documentId,
      page: f.page,
      bbox: f.bbox,
      clauseText: f.clauseText ?? null,
    };
  }

  private async readTruth(storageKey: string): Promise<TruthSidecar | null> {
    const key = `${storageKey}.truth.json`;
    try {
      if (!(await storage().exists(key))) return null;
      const buf = await storage().get(key);
      return JSON.parse(buf.toString("utf8")) as TruthSidecar;
    } catch {
      return null;
    }
  }

  async answerDealQuestion(req: {
    listingId: string;
    question: string;
    corpus: { documentId: string; page: number; text: string }[];
    locale: "ar" | "en";
  }): Promise<AssistantAnswer> {
    const q = req.question.toLowerCase();
    const terms = q
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3);

    const scored = req.corpus
      .map((c) => {
        const text = c.text.toLowerCase();
        const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
        return { ...c, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        answer:
          req.locale === "ar"
            ? "هذه المعلومة غير مذكورة في مستندات هذه الصفقة. سأحوّل سؤالك إلى منسّق الصفقة."
            : "That is not stated in this deal's documents. I have routed your question to the deal coordinator.",
        citations: [],
        notStated: true,
        routeToHuman: true,
      };
    }

    const top = scored[0]!;
    const quote = extractSentence(top.text, terms);
    const answer =
      req.locale === "ar"
        ? `حسب المستندات الموثّقة لهذه الصفقة: «${quote}»`
        : `From this deal's verified documents: “${quote}”`;

    return {
      answer,
      citations: scored.map((c) => ({
        documentId: c.documentId,
        page: c.page,
        quote: extractSentence(c.text, terms),
      })),
      notStated: false,
      routeToHuman: false,
    };
  }
}

function extractSentence(text: string, terms: string[]): string {
  const sentences = text.split(/(?<=[.!?؟।])\s+|\n+/).filter(Boolean);
  const best =
    sentences.find((s) => terms.some((t) => s.toLowerCase().includes(t))) ?? sentences[0] ?? text;
  return best.trim().slice(0, 260);
}

function noisyMoney(v: string, rng: Rng, spread: number): string {
  const base = new Decimal(v);
  const factor = 1 + rng.float(-spread, spread);
  return base.mul(factor).toDecimalPlaces(2).toFixed(2);
}

function randomBbox(rng: Rng) {
  const x = round3(rng.float(0.08, 0.5));
  const y = round3(rng.float(0.12, 0.82));
  return { x, y, w: round3(rng.float(0.18, 0.36)), h: 0.028 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
