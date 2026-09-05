import { createHash } from "node:crypto";
import type { DocumentType, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { storage } from "../../src/lib/providers/storage.js";
import { svgToWebp } from "../../src/lib/docgen/pages.js";

/**
 * Identity evidence for a seeded buyer.
 *
 * A buyer carrying `kycStatus: VERIFIED` with an empty document vault is not a
 * cosmetic problem: the verification screen has to show a VERIFIED badge above a
 * checklist of nothing but "Missing", and every reviewer surface that counts
 * document completeness reports zero. The seed grants the status, so it must
 * also supply what an analyst would have looked at.
 *
 * These are specimens, drawn as such. Nothing here claims to be a real card.
 */

const CARD_W = 900;
const CARD_H = 560;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function specimenChrome(titleEn: string, titleAr: string): string {
  return `
    <rect width="${CARD_W}" height="${CARD_H}" fill="#F4F6F8"/>
    <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" rx="18" fill="#FFFFFF" stroke="#C9D4DE" stroke-width="2"/>
    <text x="${CARD_W - 48}" y="78" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="28" fill="#1F3346">${esc(titleAr)}</text>
    <text x="48" y="78" font-family="Consolas, monospace" font-size="15" fill="#3E556B">${esc(titleEn)}</text>
    <line x1="48" y1="98" x2="${CARD_W - 48}" y2="98" stroke="#DCE4EB" stroke-width="2"/>
    <text x="${CARD_W / 2}" y="${CARD_H - 44}" text-anchor="middle" font-family="Consolas, monospace" font-size="18" fill="#B0472F" letter-spacing="4">SPECIMEN — DEMONSTRATION DATA</text>`;
}

function row(y: number, labelAr: string, value: string): string {
  return `
    <text x="${CARD_W - 48}" y="${y}" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="21" fill="#42556A">${esc(labelAr)}</text>
    <text x="${CARD_W - 48}" y="${y + 34}" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="27" fill="#16232E">${esc(value)}</text>`;
}

function nationalIdSvg(args: { nameAr: string; nationalId: string; governorate: string }, front: boolean): string {
  const body = front
    ? `${row(170, "الاسم", args.nameAr)}${row(268, "الرقم القومي", args.nationalId)}
       <rect x="48" y="150" width="220" height="260" rx="10" fill="#EDF1F5" stroke="#C9D4DE" stroke-width="2"/>
       <text x="158" y="288" text-anchor="middle" font-family="Consolas, monospace" font-size="16" fill="#7C8EA0">PHOTO</text>`
    : `${row(170, "محل الإقامة", args.governorate)}${row(268, "الحالة", "ساري")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${specimenChrome(
      `ARAB REPUBLIC OF EGYPT — NATIONAL ID (${front ? "FRONT" : "BACK"})`,
      "جمهورية مصر العربية",
    )}
    ${body}
  </svg>`;
}

function proofOfAddressSvg(args: { nameAr: string; governorate: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${specimenChrome("UTILITY STATEMENT — PROOF OF ADDRESS", "إثبات محل الإقامة")}
    ${row(170, "المشترك", args.nameAr)}
    ${row(268, "المحافظة", args.governorate)}
    ${row(366, "نوع المستند", "فاتورة مرافق")}
  </svg>`;
}

/** One document: rendered, stored, recorded, and marked as an analyst left it. */
async function store(
  prisma: PrismaClient,
  args: { ownerId: string; type: DocumentType; fileName: string; svg: string; textSnippet: string | null },
) {
  const buffer = await svgToWebp(args.svg, CARD_W, 82);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  // Owner-scoped, never under a listing: identity evidence belongs to the person.
  const storageKey = `users/${args.ownerId}/kyc/${sha256.slice(0, 12)}/${args.fileName}`;

  await storage().put(storageKey, buffer, "image/webp");
  const pageKey = `${storageKey}.page-1.webp`;
  await storage().put(pageKey, buffer, "image/webp");
  const meta = await sharp(buffer).metadata();

  await prisma.document.create({
    data: {
      ownerId: args.ownerId,
      listingId: null,
      type: args.type,
      fileName: args.fileName,
      storageKey,
      mimeType: "image/webp",
      sizeBytes: buffer.byteLength,
      sha256,
      pageCount: 1,
      // The seed grants kycStatus VERIFIED, so the evidence behind it reads as
      // reviewed and accepted — anything else would contradict the status.
      status: "APPROVED",
      exifStripped: true,
      hasExif: false,
      pages: {
        create: {
          pageNumber: 1,
          imageKey: pageKey,
          width: meta.width ?? CARD_W,
          height: meta.height ?? CARD_H,
          // Identity documents are SENSITIVE_TYPES. Their text is deliberately
          // not recorded, so it can never enter the assistant's retrieval corpus.
          textSnippet: args.textSnippet,
        },
      },
    },
  });
}

export async function seedKycDocuments(
  prisma: PrismaClient,
  user: { id: string; fullNameEn: string; fullNameAr: string | null; nationalId: string | null; governorate: string | null },
) {
  const nameAr = user.fullNameAr ?? user.fullNameEn;
  const nationalId = user.nationalId ?? "";
  const governorate = user.governorate ?? "القاهرة";

  await store(prisma, {
    ownerId: user.id,
    type: "NATIONAL_ID_FRONT",
    fileName: "national-id-front.webp",
    svg: nationalIdSvg({ nameAr, nationalId, governorate }, true),
    textSnippet: null,
  });
  await store(prisma, {
    ownerId: user.id,
    type: "NATIONAL_ID_BACK",
    fileName: "national-id-back.webp",
    svg: nationalIdSvg({ nameAr, nationalId, governorate }, false),
    textSnippet: null,
  });
  await store(prisma, {
    ownerId: user.id,
    type: "PROOF_OF_ADDRESS",
    fileName: "proof-of-address.webp",
    svg: proofOfAddressSvg({ nameAr, governorate }),
    textSnippet: null,
  });
}
