import "server-only";
import { createHash } from "node:crypto";
import { config } from "@/lib/config";
import { storage } from "@/lib/providers/storage";
import type {
  AiProvider,
  AssistantAnswer,
  ExtractedFieldResult,
  ExtractionRequest,
  ExtractionResult,
} from "@/lib/providers/types";

/**
 * Live document intelligence via the Anthropic Messages API.
 *
 * Same signatures as `MockAiProvider` — nothing that calls this knows the
 * difference. Enabled with AI_MODE=live and an ANTHROPIC_API_KEY; the whole
 * product runs without it.
 *
 * The SDK is loaded dynamically so the package remains an optional dependency
 * and `AI_MODE=mock` never pulls it in.
 */

const EXTRACTION_TOOL = {
  name: "record_contract_extraction",
  description:
    "Record every material value read from the uploaded Egyptian real-estate installment contract and its receipts.",
  input_schema: {
    type: "object" as const,
    properties: {
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: {
              type: "string",
              enum: [
                "TOTAL_PRICE",
                "DOWN_PAYMENT",
                "AMOUNT_PAID",
                "OUTSTANDING_BALANCE",
                "INSTALLMENT_AMOUNT",
                "INSTALLMENT_FREQUENCY",
                "NUMBER_OF_INSTALLMENTS",
                "MAINTENANCE_DEPOSIT",
                "CLUB_FEE",
                "ASSIGNMENT_FEE",
                "CANCELLATION_PENALTY_PCT",
                "CONTRACT_SIGNING_DATE",
                "PLAN_START_DATE",
                "NEXT_DUE_DATE",
                "DELIVERY_DATE",
              ],
            },
            valueNum: { type: ["string", "null"], description: "Decimal string, EGP, no separators" },
            valueDate: { type: ["string", "null"], description: "ISO 8601 date" },
            valueText: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            documentIndex: { type: "integer" },
            page: { type: ["integer", "null"] },
            bbox: {
              type: ["object", "null"],
              properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
            },
            clauseText: { type: ["string", "null"], description: "Verbatim clause text where relevant" },
          },
          required: ["key", "confidence", "documentIndex"],
        },
      },
      receipts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            documentIndex: { type: "integer" },
            amount: { type: "string" },
            date: { type: "string" },
            method: { type: "string", enum: ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "UNKNOWN"] },
            reference: { type: ["string", "null"] },
            confidence: { type: "number" },
            page: { type: "integer" },
          },
          required: ["documentIndex", "amount", "date", "confidence", "page"],
        },
      },
      clauses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["ASSIGNMENT", "CANCELLATION", "DELIVERY"] },
            text: { type: "string" },
            documentIndex: { type: "integer" },
            page: { type: "integer" },
          },
          required: ["kind", "text", "documentIndex", "page"],
        },
      },
    },
    required: ["fields", "receipts", "clauses"],
  },
};

const SYSTEM_PROMPT = `You are Aqary's contract document-intelligence engine.

You read Egyptian off-plan real-estate installment contracts and their payment
receipts. Documents are frequently Arabic RTL, scanned, photographed on phones,
skewed and shadowed, and every developer formats their contract differently.

Rules you must follow exactly:
- Report ONLY what the documents show. Never infer a figure that is not printed.
- Never copy a value from the seller's own declaration. If a value is not in the
  documents, omit the field entirely rather than guessing.
- Money values are EGP. Return them as plain decimal strings, no separators.
- Give an honest per-field confidence. A blurred or partially occluded figure is
  low confidence, not a guess presented as certain.
- Cite the document index, the page and a normalised bounding box (0-1) for the
  region you read the value from.
- For assignment (التنازل) and cancellation clauses, return the clause text verbatim.

Your output is never the truth. A human analyst reviews every field you produce.`;

export class LiveAiProvider implements AiProvider {
  readonly name = "anthropic-document-intelligence";
  readonly mode = "LIVE" as const;

  private async client() {
    // Resolved through a variable so the package stays optional: `AI_MODE=mock`
    // (the default) never needs it installed, and typecheck does not require it.
    const specifier = "@anthropic-ai/sdk";
    const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier).catch(() => {
      throw new Error(
        "AI_MODE=live requires the @anthropic-ai/sdk package. Run: npm i @anthropic-ai/sdk",
      );
    });
    const Anthropic = (mod as { default: new (o: { apiKey: string }) => unknown }).default;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("AI_MODE=live requires ANTHROPIC_API_KEY");
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as {
      messages: { create: (args: unknown) => Promise<AnthropicResponse> };
    };
  }

  async extractContract(req: ExtractionRequest): Promise<ExtractionResult> {
    const started = Date.now();
    const client = await this.client();

    // Page images, capped so a 60-page contract does not blow the request.
    const content: unknown[] = [];
    let pageBudget = 24;
    for (const [index, doc] of req.documents.entries()) {
      content.push({ type: "text", text: `--- Document ${index} · ${doc.type} · ${doc.fileName} ---` });
      for (const key of doc.pageKeys) {
        if (pageBudget-- <= 0) break;
        const buf = await storage().get(key);
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: buf.toString("base64") },
        });
      }
    }
    content.push({
      type: "text",
      text: `Extract every material contract value and every payment receipt you can read. Use the record_contract_extraction tool. Locale hint: ${req.locale}.`,
    });

    const response = await withRetry(() =>
      client.messages.create({
        model: config.AI_MODEL_EXTRACTION,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
        messages: [{ role: "user", content }],
      }),
    );

    const toolUse = response.content.find((c) => c.type === "tool_use");
    const parsed = (toolUse?.input ?? { fields: [], receipts: [], clauses: [] }) as LiveExtractionPayload;

    const docId = (i: number) => req.documents[i]?.id ?? null;

    const fields: ExtractedFieldResult[] = (parsed.fields ?? []).map((f) => ({
      key: f.key,
      valueNum: f.valueNum ?? null,
      valueDate: f.valueDate ?? null,
      valueText: f.valueText ?? null,
      confidence: f.confidence,
      documentId: docId(f.documentIndex),
      page: f.page ?? null,
      bbox: f.bbox ?? null,
      clauseText: f.clauseText ?? null,
    }));

    const usage = response.usage ?? { input_tokens: 0, output_tokens: 0 };
    const costUsd = (usage.input_tokens * 0.000005 + usage.output_tokens * 0.000025).toFixed(6);

    return {
      model: config.AI_MODEL_EXTRACTION,
      version: response.model ?? config.AI_MODEL_EXTRACTION,
      mode: "LIVE",
      latencyMs: Date.now() - started,
      costUsd,
      promptHash: createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 16),
      fields,
      receipts: (parsed.receipts ?? []).map((r) => ({
        documentId: docId(r.documentIndex) ?? "",
        amount: r.amount,
        date: r.date,
        method: r.method ?? "UNKNOWN",
        reference: r.reference ?? null,
        confidence: r.confidence,
        page: r.page,
      })),
      clauses: (parsed.clauses ?? []).map((c) => ({
        kind: c.kind,
        text: c.text,
        documentId: docId(c.documentIndex) ?? "",
        page: c.page,
      })),
      raw: parsed,
    };
  }

  async answerDealQuestion(req: {
    listingId: string;
    question: string;
    corpus: { documentId: string; page: number; text: string }[];
    locale: "ar" | "en";
  }): Promise<AssistantAnswer> {
    const client = await this.client();
    const corpus = req.corpus
      .map((c, i) => `[${i}] document=${c.documentId} page=${c.page}\n${c.text}`)
      .join("\n\n");

    const response = await withRetry(() =>
      client.messages.create({
        model: config.AI_MODEL_SCORING,
        max_tokens: 1200,
        system:
          "Answer strictly from the supplied verified documents for this one deal. " +
          "Quote the clause you relied on and give its document and page. " +
          'If the documents do not answer the question, reply exactly with "NOT_STATED" and nothing else. ' +
          "Never speculate about market value, legal outcomes or the developer's intentions.",
        messages: [
          { role: "user", content: `Documents:\n${corpus}\n\nQuestion (${req.locale}): ${req.question}` },
        ],
      }),
    );

    const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (text === "NOT_STATED" || text.startsWith("NOT_STATED")) {
      return {
        answer:
          req.locale === "ar"
            ? "هذه المعلومة غير مذكورة في مستندات هذه الصفقة. تم تحويل سؤالك إلى منسّق الصفقة."
            : "That is not stated in this deal's documents. Your question has been routed to the deal coordinator.",
        citations: [],
        notStated: true,
        routeToHuman: true,
      };
    }

    return {
      answer: text,
      citations: req.corpus.slice(0, 2).map((c) => ({
        documentId: c.documentId,
        page: c.page,
        quote: c.text.slice(0, 240),
      })),
      notStated: false,
      routeToHuman: false,
    };
  }
}

interface AnthropicResponse {
  model?: string;
  content: ({ type: "text"; text: string } | { type: "tool_use"; input: unknown })[];
  usage?: { input_tokens: number; output_tokens: number };
}

interface LiveExtractionPayload {
  fields?: {
    key: ExtractedFieldResult["key"];
    valueNum?: string | null;
    valueDate?: string | null;
    valueText?: string | null;
    confidence: number;
    documentIndex: number;
    page?: number | null;
    bbox?: { x: number; y: number; w: number; h: number } | null;
    clauseText?: string | null;
  }[];
  receipts?: {
    documentIndex: number;
    amount: string;
    date: string;
    method?: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "UNKNOWN";
    reference?: string | null;
    confidence: number;
    page: number;
  }[];
  clauses?: { kind: "ASSIGNMENT" | "CANCELLATION" | "DELIVERY"; text: string; documentIndex: number; page: number }[];
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2 ** i * 800));
    }
  }
  throw lastError;
}
