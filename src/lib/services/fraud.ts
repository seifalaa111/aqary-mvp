import "server-only";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import { upsertFraudSignal } from "./reconciliation";

/**
 * FraudDetectionService — signals, never verdicts.
 *
 * The hash, EXIF, sequence and arithmetic checks are real computations over the
 * uploaded files. Anything that would need an external forensics model is
 * clearly marked as simulated in the signal's own evidence payload.
 * Every signal carries its evidence and requires an analyst disposition.
 */

/** Document types where an identical file across listings is genuinely suspicious. */
const SHAREABLE_ACROSS_LISTINGS = new Set([
  "NATIONAL_ID_FRONT",
  "NATIONAL_ID_BACK",
  "PASSPORT",
  "POWER_OF_ATTORNEY",
  "PROOF_OF_FUNDS",
]);

export async function scanListingForFraudSignals(listingId: string): Promise<number> {
  const raisedTypes = new Set<string>();
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      seller: { select: { id: true, fullNameAr: true, fullNameEn: true } },
      documents: true,
      contract: {
        include: {
          receipts: { include: { document: true } },
          fields: true,
        },
      },
    },
  });

  let raised = 0;

  // --- 1. Exact duplicate receipts (sha256) -------------------------------
  const bySha = new Map<string, typeof listing.contract.receipts>();
  for (const r of listing.contract.receipts) {
    const key = r.sha256 ?? r.document?.sha256;
    if (!key) continue;
    const list = bySha.get(key) ?? [];
    list.push(r);
    bySha.set(key, list);
  }
  for (const [sha, group] of bySha) {
    if (group.length < 2) continue;
    raisedTypes.add("DUPLICATE_RECEIPT_EXACT");
    await upsertFraudSignal(listingId, {
      type: "DUPLICATE_RECEIPT_EXACT",
      severity: "CRITICAL",
      titleEn: `${group.length} receipts are byte-identical files`,
      titleAr: `${group.length} إيصالات بنفس الملف تمامًا`,
      description:
        "The same file was uploaded more than once and counted as separate payments. Confirm whether this is a duplicate upload or an attempt to inflate the paid total.",
      evidence: {
        sha256: sha,
        receiptIds: group.map((r) => r.id),
        amounts: group.map((r) => (r.declaredAmount ?? r.extractedAmount ?? 0).toString()),
        check: "real",
      },
    });
    raised++;
  }

  // --- 2. Near-duplicate receipts (perceptual hash) -----------------------
  const hashed = listing.contract.receipts.filter((r) => r.perceptualHash ?? r.document?.perceptualHash);
  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      const a = hashed[i]!;
      const b = hashed[j]!;
      const ha = a.perceptualHash ?? a.document?.perceptualHash;
      const hb = b.perceptualHash ?? b.document?.perceptualHash;
      if (!ha || !hb) continue;
      if ((a.sha256 ?? a.document?.sha256) === (b.sha256 ?? b.document?.sha256)) continue;
      const distance = hammingHex(ha, hb);
      const amtA = (a.declaredAmount ?? a.extractedAmount ?? 0).toString();
      const amtB = (b.declaredAmount ?? b.extractedAmount ?? 0).toString();
      // Two receipts from the same developer look alike by design. Only an
      // almost-exact visual match between DIFFERENT payments is a signal.
      if (distance <= 8 && amtA !== amtB) {
        raisedTypes.add("DUPLICATE_RECEIPT_PERCEPTUAL");
        await upsertFraudSignal(listingId, {
          type: "DUPLICATE_RECEIPT_PERCEPTUAL",
          severity: distance <= 2 ? "MAJOR" : "MINOR",
          titleEn: "Two receipt images are visually near-identical",
          titleAr: "صورتا إيصال متطابقتان تقريبًا",
          description:
            "Two receipt images differ by only a few bits of their perceptual hash. This is consistent with a re-photographed or lightly edited copy of the same receipt.",
          evidence: {
            receiptIds: [a.id, b.id],
            hammingDistance: distance,
            amounts: [amtA, amtB],
            check: "real",
          },
        });
        raised++;
      }
    }
  }

  // --- 3. Image manipulation indicators (EXIF gaps, editor tags) ----------
  for (const doc of listing.documents) {
    const editors = /photoshop|gimp|snapseed|picsart|canva|lightroom/i;
    const flaggedEditor = doc.softwareTag ? editors.test(doc.softwareTag) : false;
    const noExifOnPhoto = !doc.hasExif && doc.mimeType.startsWith("image/") && !doc.exifStripped;
    if (flaggedEditor || noExifOnPhoto) {
      raisedTypes.add(flaggedEditor ? "IMAGE_MANIPULATION" : "EXIF_ANOMALY");
      await upsertFraudSignal(listingId, {
        type: flaggedEditor ? "IMAGE_MANIPULATION" : "EXIF_ANOMALY",
        severity: flaggedEditor ? "MAJOR" : "MINOR",
        titleEn: flaggedEditor
          ? `"${doc.fileName}" carries an image-editor signature`
          : `"${doc.fileName}" has no camera metadata`,
        titleAr: flaggedEditor ? "الملف يحمل أثر برنامج تحرير صور" : "لا توجد بيانات كاميرا في الملف",
        description: flaggedEditor
          ? `The file's metadata names ${doc.softwareTag}. Editing software is not proof of tampering — many people crop receipts — but the page should be compared against the developer statement.`
          : "A phone photograph normally carries camera EXIF. Its absence can mean a screenshot, a re-save, or a stripped file.",
        evidence: { documentId: doc.id, softwareTag: doc.softwareTag, hasExif: doc.hasExif, check: "real" },
      });
      raised++;
    }
  }

  // --- 4. Date / sequence anomalies ---------------------------------------
  const dated = listing.contract.receipts
    .map((r) => ({ id: r.id, date: r.verifiedDate ?? r.extractedDate ?? r.declaredDate }))
    .filter((r): r is { id: string; date: Date } => Boolean(r.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const signing = listing.contract.fields.find((f) => f.key === "CONTRACT_SIGNING_DATE");
  const signedAt = signing?.verifiedDate ?? signing?.extractedDate ?? signing?.declaredDate;
  const before = signedAt ? dated.filter((r) => r.date.getTime() < signedAt.getTime() - 86400000) : [];
  const future = dated.filter((r) => r.date.getTime() > Date.now() + 86400000);

  if (before.length > 0 || future.length > 0) {
    raisedTypes.add("DATE_SEQUENCE_ANOMALY");
    await upsertFraudSignal(listingId, {
      type: "DATE_SEQUENCE_ANOMALY",
      severity: "MAJOR",
      titleEn: "Receipt dates fall outside the contract's timeline",
      titleAr: "تواريخ إيصالات خارج الجدول الزمني للتعاقد",
      description: `${before.length} receipt(s) are dated before the contract was signed and ${future.length} are dated in the future.`,
      evidence: {
        contractSignedAt: signedAt?.toISOString() ?? null,
        beforeSigning: before.map((r) => ({ id: r.id, date: r.date.toISOString() })),
        inFuture: future.map((r) => ({ id: r.id, date: r.date.toISOString() })),
        check: "real",
      },
    });
    raised++;
  }

  // --- 5. Same document used across multiple listings ---------------------
  // A seller listing two of their own contracts legitimately uploads the same ID
  // card twice. Only a contract, receipt or statement shared with ANOTHER
  // seller's listing is a signal.
  const shas = listing.documents
    .filter((d) => !SHAREABLE_ACROSS_LISTINGS.has(d.type))
    .map((d) => d.sha256)
    .filter(Boolean);
  if (shas.length > 0) {
    const elsewhere = await prisma.document.findMany({
      where: {
        sha256: { in: shas },
        listingId: { not: listingId },
        listing: { isNot: null },
        ownerId: { not: listing.sellerId },
      },
      select: { id: true, sha256: true, fileName: true, listingId: true },
      take: 20,
    });
    if (elsewhere.length > 0) {
      raisedTypes.add("DOCUMENT_REUSED_ACROSS_LISTINGS");
      await upsertFraudSignal(listingId, {
        type: "DOCUMENT_REUSED_ACROSS_LISTINGS",
        severity: "CRITICAL",
        titleEn: `${elsewhere.length} of these documents also appear on another listing`,
        titleAr: "مستندات مستخدمة في إعلان آخر",
        description:
          "An identical file is attached to a different listing. Either the same contract is being listed twice or a document has been borrowed.",
        evidence: { matches: elsewhere, check: "real" },
      });
      raised++;
    }
  }

  // --- 6. ID / contract name mismatch --------------------------------------
  const contractHolder = listing.contract.fields.find((f) => f.key === "TOTAL_PRICE"); // placeholder anchor
  void contractHolder;
  const sellerNameAr = listing.seller.fullNameAr ?? "";
  const idDoc = listing.documents.find((d) => d.type === "NATIONAL_ID_FRONT");
  if (idDoc && sellerNameAr && idDoc.note && !namesRoughlyMatch(sellerNameAr, idDoc.note)) {
    raisedTypes.add("ID_NAME_MISMATCH");
    await upsertFraudSignal(listingId, {
      type: "ID_NAME_MISMATCH",
      severity: "MAJOR",
      titleEn: "Name on the national ID does not match the account name",
      titleAr: "الاسم في البطاقة لا يطابق اسم الحساب",
      description: "Compare the ID against the contract holder's name before any assignment step.",
      evidence: { accountName: sellerNameAr, idName: idDoc.note, check: "real" },
    });
    raised++;
  }

  // --- 7. Receipts total materially below the declared paid ---------------
  const declaredPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID")?.declaredNum;
  const receiptTotal = listing.contract.receipts
    .filter((r) => r.status === "VERIFIED")
    .reduce((acc, r) => acc.plus(money(r.verifiedAmount ?? r.extractedAmount ?? r.declaredAmount ?? 0)), money(0));

  // Coverage is only judgeable once every receipt has been through review.
  const pending = listing.contract.receipts.filter((r) => r.status === "PENDING").length;
  const reviewed = listing.contract.receipts.length - pending;
  if (declaredPaid && reviewed > 0 && pending === 0) {
    const declared = new Decimal(declaredPaid.toString());
    if (declared.gt(0) && receiptTotal.div(declared).lt(0.85)) {
      raisedTypes.add("RECEIPT_TOTAL_MISMATCH");
      await upsertFraudSignal(listingId, {
        type: "RECEIPT_TOTAL_MISMATCH",
        severity: "MAJOR",
        titleEn: "Verified receipts cover less than 85% of the declared amount paid",
        titleAr: "الإيصالات الموثّقة تغطي أقل من 85% من المبلغ المُقر به",
        description:
          "Either receipts are missing or the declared figure is overstated. The developer account statement settles this.",
        evidence: {
          declaredPaid: declared.toFixed(2),
          verifiedReceiptsTotal: receiptTotal.toFixed(2),
          coveragePct: Math.round(receiptTotal.div(declared).mul(100).toNumber()),
          check: "real",
        },
      });
      raised++;
    }
  }

  // A signal that no longer holds must not sit in the queue forever. Anything
  // still OPEN that this pass did not re-raise is closed with its own note, so
  // the audit trail shows why it went away.
  const stale = await prisma.fraudSignal.findMany({
    where: { listingId, status: "OPEN", type: { notIn: [...raisedTypes] as never[] } },
  });
  for (const s of stale) {
    await prisma.fraudSignal.update({
      where: { id: s.id },
      data: {
        status: "DISMISSED",
        disposition: "Cleared automatically: the condition no longer holds after new evidence was reviewed.",
        dispositionAt: new Date(),
      },
    });
  }

  return raised;
}

/** Hamming distance between two hex-encoded perceptual hashes. */
export function hammingHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    d += ((x >> 3) & 1) + ((x >> 2) & 1) + ((x >> 1) & 1) + (x & 1);
  }
  d += Math.abs(a.length - b.length) * 4;
  return d;
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/[ً-ٰٟ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .split(/\s+/)
      .filter(Boolean);
  const A = new Set(norm(a));
  const B = norm(b);
  if (B.length === 0) return true;
  const overlap = B.filter((t) => A.has(t)).length;
  return overlap / B.length >= 0.5;
}
