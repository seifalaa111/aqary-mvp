import { NextResponse, type NextRequest } from "next/server";
import type { DocumentType, MediaKind, RoomTag } from "@prisma/client";
import { requireListingAccess, AuthorizationError } from "@/lib/auth/guard";
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES, uploadDocument, uploadMedia } from "@/lib/services/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One upload endpoint for documents and listing media. Authorization is checked
 * against the listing before a byte is written, and the seller may only write to
 * a listing that is still theirs to edit.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const listingId = String(form.get("listingId") ?? "");
    const target = String(form.get("target") ?? "document");
    const file = form.get("file");

    if (!listingId) return bad("listingId is required");
    if (!(file instanceof File)) return bad("file is required");
    if (file.size === 0) return bad("That file is empty");
    if (file.size > MAX_UPLOAD_BYTES) {
      return bad(`Files must be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
    }
    if (!ACCEPTED_MIME.has(file.type)) {
      return bad("Upload a JPEG, PNG, WebP or PDF");
    }

    const { user, listing } = await requireListingAccess(listingId, { as: "SELLER" });

    const editable = ["DRAFT", "SUBMITTED", "INFO_REQUESTED", "AI_PROCESSING", "PENDING_REVIEW"];
    if (!editable.includes(listing.status)) {
      return bad("This listing can no longer be edited", 409);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (target === "media") {
      if (file.type === "application/pdf") return bad("Listing media must be an image");
      const result = await uploadMedia({
        buffer,
        fileName: file.name,
        listingId,
        ownerId: user.id,
        kind: (String(form.get("kind") ?? "PHOTO") as MediaKind) || "PHOTO",
        roomTag: (form.get("roomTag") ? (String(form.get("roomTag")) as RoomTag) : null),
        altEn: String(form.get("alt") ?? file.name.replace(/\.[^.]+$/, "")),
        caption: form.get("caption") ? String(form.get("caption")) : null,
      });
      return NextResponse.json({ ok: true, media: result });
    }

    const result = await uploadDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type,
      type: String(form.get("type") ?? "OTHER") as DocumentType,
      ownerId: user.id,
      listingId,
      actorRole: "SELLER",
    });
    return NextResponse.json({ ok: true, document: result });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    console.error("[upload] failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Upload failed. Try again." }, { status: 500 });
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
