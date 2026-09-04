"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Badge } from "@/components/ui/badges";
import { Button, Callout, Card, CardBody } from "@/components/ui/primitives";
import { deleteKycDocumentAction } from "@/app/actions/buyer";

export interface ChecklistDoc {
  id: string;
  type: string;
  fileName: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ChecklistSlot {
  type: string;
  title: string;
  description: string;
  required: boolean;
  doc?: ChecklistDoc | null;
}

export function KycChecklist({
  slots,
  locale,
}: {
  slots: ChecklistSlot[];
  locale: string;
}) {
  const router = useRouter();
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFileChange(type: string, file: File) {
    setError(null);
    setUploadingType(type);
    try {
      const form = new FormData();
      form.append("target", "buyer-kyc");
      form.append("type", type);
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Upload failed. Please try a different file.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  function handleDelete(documentId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    startTransition(async () => {
      setError(null);
      const res = await deleteKycDocumentAction(documentId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      <div className="flex flex-col gap-4">
        {slots.map((slot) => {
          const doc = slot.doc;
          const status = doc?.status ?? "MISSING";
          const isPending = status === "UPLOADED" || status === "PROCESSING" || status === "SCANNING";
          const isApproved = status === "APPROVED";
          const isRejected = status === "REJECTED";
          const isNeedsReplacement = status === "NEEDS_REPLACEMENT";

          return (
            <Card key={slot.type} className="overflow-hidden">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{slot.title}</span>
                    {slot.required ? (
                      <span className="text-2xs text-flagged font-medium">*Required</span>
                    ) : (
                      <span className="text-2xs text-ink-40">Optional</span>
                    )}
                    <Badge
                      tone={
                        isApproved
                          ? "verified"
                          : isRejected
                            ? "flagged"
                            : isNeedsReplacement
                              ? "pending"
                              : isPending
                                ? "info"
                                : "neutral"
                      }
                    >
                      {status === "MISSING" ? "Missing" : status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-ink-50">{slot.description}</p>

                  {doc ? (
                    <div className="mt-2 flex items-center gap-2 text-2xs">
                      <a
                        href={`/documents/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink hover:underline truncate max-w-xs"
                      >
                        ?? {doc.fileName}
                      </a>
                    </div>
                  ) : null}

                  {doc?.rejectionReason ? (
                    <p className="mt-1 text-xs text-flagged">
                      Compliance Note: {doc.rejectionReason}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingType !== null || pending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileChange(slot.type, f);
                      }}
                    />
                    <span className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-xs hover:bg-paper-raised">
                      {uploadingType === slot.type
                        ? "Uploading..."
                        : doc
                          ? "Replace Document"
                          : "Upload Document"}
                    </span>
                  </label>

                  {doc && !isApproved ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleDelete(doc.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
