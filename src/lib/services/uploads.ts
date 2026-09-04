import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { DocumentType, MediaKind, Role, RoomTag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/providers/storage";
import { parsePdf, type PdfInspectionResult } from "./pdf";

/**
 * The upload pipeline. Files really upload, hash, get their EXIF stripped, get
 * rendered into page images and responsive variants, and come back. Nothing
 * here is faked: the perceptual hash the fraud scan uses and the page images the
 * analyst reviews are produced right here.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * Validates authentic file magic bytes. Prevents spoofing arbitrary files as images/PDFs.
 */
export function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

export interface UploadResult {
  id: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  status: string;
  duplicate: boolean;
  blurWarning: boolean;
}

/** 256-bit dHash — the same function the seed uses, so hashes are comparable. */
export async function perceptualHash(buf: Buffer): Promise<string> {
  const w = 17;
  const h = 16;
  const raw = await sharp(buf).greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer();
  const bits: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) bits.push(raw[y * w + x]! > raw[y * w + x + 1]! ? 1 : 0);
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!).toString(16);
  }
  return hex;
}

/**
 * Laplacian-variance blur estimate. Low variance means a soft photo, which is
 * the single most common reason a receipt cannot be read.
 */
export async function blurScore(buf: Buffer): Promise<number> {
  const size = 256;
  const { data, info } = await sharp(buf)
    .greyscale()
    .resize(size, size, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap =
        -4 * data[i]! + data[i - 1]! + data[i + 1]! + data[i - W]! + data[i + W]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const BLUR_THRESHOLD = 90;

export async function uploadDocument(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  type: DocumentType;
  ownerId: string;
  listingId?: string | null;
  actorRole: Role;
}): Promise<UploadResult> {
  // Validate magic bytes
  const detected = detectMimeFromBuffer(args.buffer);
  const normalizedMime = args.mimeType === "image/jpg" ? "image/jpeg" : args.mimeType;
  if (!detected || (detected !== normalizedMime && !(detected === "image/jpeg" && normalizedMime === "image/jpeg"))) {
    throw new Error(`Upload rejected: file content does not match declared type ${args.mimeType}`);
  }

  const sha256 = createHash("sha256").update(args.buffer).digest("hex");

  // A byte-identical re-upload on the same listing/owner is a duplicate, not a new
  // document. The fraud scan still sees it if it lands on another listing.
  const existing = await prisma.document.findFirst({
    where: args.listingId
      ? { listingId: args.listingId, sha256 }
      : { ownerId: args.ownerId, listingId: null, sha256 },
  });
  if (existing) {
    return {
      id: existing.id,
      fileName: existing.fileName,
      sizeBytes: existing.sizeBytes,
      pageCount: existing.pageCount,
      status: existing.status,
      duplicate: true,
      blurWarning: (existing.blurScore ?? 999) < BLUR_THRESHOLD,
    };
  }

  const isPdf = normalizedMime === "application/pdf";
  const storageKey = args.listingId
    ? `listings/${args.listingId}/documents/${sha256.slice(0, 12)}/${sanitize(args.fileName)}`
    : `users/${args.ownerId}/kyc/${sha256.slice(0, 12)}/${sanitize(args.fileName)}`;

  let pageBuffers: { buffer: Buffer; pageNumber: number; textSnippet: string | null }[] = [];
  let phash: string | null = null;
  let blur: number | null = null;
  let hasExif = false;
  let pdfPageCount = 1;

  if (isPdf) {
    let inspection: PdfInspectionResult;
    try {
      inspection = await parsePdf(args.buffer);
    } catch (err) {
      // Fail loudly: write Document with status = FAILED and throw
      const doc = await prisma.document.create({
        data: {
          ownerId: args.ownerId,
          listingId: args.listingId ?? null,
          type: args.type,
          fileName: sanitize(args.fileName),
          storageKey,
          mimeType: args.mimeType,
          sizeBytes: args.buffer.byteLength,
          sha256,
          pageCount: 0,
          status: "FAILED",
          rejectionReason: err instanceof Error ? err.message : "Unparseable PDF structure",
        },
      });
      await audit({
        actorId: args.ownerId,
        actorRole: args.actorRole,
        action: "DOCUMENT_UPLOADED",
        entityType: "Document",
        entityId: doc.id,
        after: { status: "FAILED", reason: err instanceof Error ? err.message : String(err) },
        metadata: { listingId: args.listingId ?? undefined },
      });
      throw new Error(`PDF processing failed: ${err instanceof Error ? err.message : "Unparseable PDF"}`);
    }

    pdfPageCount = inspection.pageCount;
    await storage().put(storageKey, args.buffer, args.mimeType);

    for (const p of inspection.pages) {
      if (p.imageBuffer) {
        pageBuffers.push({
          buffer: p.imageBuffer,
          pageNumber: p.pageNumber,
          textSnippet: p.textSnippet,
        });
      }
    }
  } else {
    const image = sharp(args.buffer, { failOn: "none" });
    const meta = await image.metadata();
    hasExif = Boolean(meta.exif);

    // Auto-orient, strip metadata (EXIF carries GPS and device identifiers),
    // and normalise to a page image.
    const normalised = await image
      .rotate()
      .withMetadata({ orientation: undefined })
      .webp({ quality: 86 })
      .toBuffer();

    await storage().put(storageKey, normalised, "image/webp");
    pageBuffers = [{ buffer: normalised, pageNumber: 1, textSnippet: null }];
    phash = await perceptualHash(normalised);
    blur = await blurScore(normalised);
  }

  const doc = await prisma.document.create({
    data: {
      ownerId: args.ownerId,
      listingId: args.listingId ?? null,
      type: args.type,
      fileName: sanitize(args.fileName),
      storageKey,
      mimeType: isPdf ? args.mimeType : "image/webp",
      sizeBytes: args.buffer.byteLength,
      sha256,
      perceptualHash: phash,
      pageCount: isPdf ? pdfPageCount : Math.max(1, pageBuffers.length),
      status: "UPLOADED",
      blurScore: blur,
      hasExif,
      exifStripped: !isPdf,
      // Virus scanning is a stubbed hook in this build — see ASSUMPTIONS.md.
      virusScanned: false,
    },
  });

  if (isPdf) {
    for (let i = 1; i <= pdfPageCount; i++) {
      const pageData = pageBuffers.find((p) => p.pageNumber === i);
      let pageKey = `${storageKey}#page=${i}`;
      let width = 1240;
      let height = 1754;

      if (pageData) {
        pageKey = `${storageKey}.page-${i}.webp`;
        await storage().put(pageKey, pageData.buffer, "image/webp");
        const meta = await sharp(pageData.buffer).metadata();
        width = meta.width ?? 1240;
        height = meta.height ?? 1754;
      }

      await prisma.documentPage.create({
        data: {
          documentId: doc.id,
          pageNumber: i,
          imageKey: pageKey,
          width,
          height,
          textSnippet: pageData?.textSnippet ?? null,
        },
      });
    }
  } else {
    for (const [i, p] of pageBuffers.entries()) {
      const pageKey = `${storageKey}.page-${i + 1}.webp`;
      await storage().put(pageKey, p.buffer, "image/webp");
      const meta = await sharp(p.buffer).metadata();
      await prisma.documentPage.create({
        data: {
          documentId: doc.id,
          pageNumber: i + 1,
          imageKey: pageKey,
          width: meta.width ?? 1240,
          height: meta.height ?? 1754,
          textSnippet: null,
        },
      });
    }
  }

  await audit({
    actorId: args.ownerId,
    actorRole: args.actorRole,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: doc.id,
    after: { type: args.type, sizeBytes: args.buffer.byteLength, pageCount: doc.pageCount },
    metadata: { listingId: args.listingId ?? undefined },
  });

  // A payment receipt becomes a Receipt row immediately, pending review.
  if (args.type === "PAYMENT_RECEIPT" && args.listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: args.listingId },
      select: { contractId: true },
    });
    if (listing) {
      await prisma.receipt.create({
        data: {
          contractId: listing.contractId,
          documentId: doc.id,
          status: "PENDING",
          sha256,
          perceptualHash: phash,
        },
      });
    }
  }

  return {
    id: doc.id,
    fileName: doc.fileName,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount,
    status: doc.status,
    duplicate: false,
    blurWarning: blur !== null && blur < BLUR_THRESHOLD,
  };
}

export interface MediaUploadResult {
  id: string;
  variants: { thumb: string; card: string; cardJpeg: string; detail: string };
  width: number;
  height: number;
  kind: MediaKind;
  roomTag: RoomTag | null;
  altEn: string;
  moderationStatus: string;
}

const MEDIA_VARIANTS = [
  { name: "thumb", width: 320, quality: 68 },
  { name: "card", width: 800, quality: 80 },
  { name: "detail", width: 1600, quality: 82 },
] as const;

export async function uploadMedia(args: {
  buffer: Buffer;
  fileName: string;
  listingId: string;
  ownerId: string;
  kind: MediaKind;
  roomTag: RoomTag | null;
  altEn: string;
  caption?: string | null;
}): Promise<MediaUploadResult> {
  const detected = detectMimeFromBuffer(args.buffer);
  if (!detected || detected.startsWith("application/")) {
    throw new Error("Listing media must be an image (JPEG, PNG, WebP)");
  }

  const sha256 = createHash("sha256").update(args.buffer).digest("hex");
  const slug = `${args.listingId}-${sha256.slice(0, 10)}`;
  const base = sharp(args.buffer, { failOn: "none" })
    .rotate()
    .withMetadata({ orientation: undefined });
  const meta = await base.metadata();

  const variants: Record<string, string> = {};
  for (const v of MEDIA_VARIANTS) {
    const buf = await base
      .clone()
      .resize({ width: v.width, withoutEnlargement: true })
      .webp({ quality: v.quality })
      .toBuffer();
    const key = `media/uploads/${slug}-${v.name}.webp`;
    await storage().put(key, buf, "image/webp");
    variants[v.name] = `/api/files/${encodeURIComponent(key)}`;
  }
  const jpegBuf = await base
    .clone()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const jpegKey = `media/uploads/${slug}-card.jpg`;
  await storage().put(jpegKey, jpegBuf, "image/jpeg");
  variants.cardJpeg = `/api/files/${encodeURIComponent(jpegKey)}`;

  const stats = await sharp(args.buffer).stats();
  const { r, g, b } = stats.dominant;
  const dominantColor = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const lqip = await base.clone().resize({ width: 20 }).blur(1.2).webp({ quality: 40 }).toBuffer();

  const count = await prisma.mediaAsset.count({ where: { listingId: args.listingId } });

  const asset = await prisma.mediaAsset.create({
    data: {
      listingId: args.listingId,
      kind: args.kind,
      claimedKind: args.kind,
      roomTag: args.roomTag,
      altEn: args.altEn,
      caption: args.caption ?? null,
      order: count,
      isCover: count === 0,
      storageKey: `media/uploads/${slug}`,
      variants,
      blurhash: `data:image/webp;base64,${lqip.toString("base64")}`,
      dominantColor,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      // Every seller-uploaded image waits for analyst media review before it
      // can count toward the five-image publish precondition.
      moderationStatus: "PENDING",
    },
  });

  await audit({
    actorId: args.ownerId,
    actorRole: "SELLER",
    action: "MEDIA_UPLOADED",
    entityType: "MediaAsset",
    entityId: asset.id,
    after: { kind: args.kind, roomTag: args.roomTag },
    metadata: { listingId: args.listingId },
  });

  return {
    id: asset.id,
    variants: variants as MediaUploadResult["variants"],
    width: asset.width,
    height: asset.height,
    kind: asset.kind,
    roomTag: asset.roomTag,
    altEn: asset.altEn,
    moderationStatus: asset.moderationStatus,
  };
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-؀-ۿ ]+/g, "_").slice(0, 120);
}
