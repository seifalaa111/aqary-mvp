"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Badge } from "@/components/ui/badges";
import { Button, Callout, Card, CardBody, CardHeader, CardTitle, Select } from "@/components/ui/primitives";

export interface SellerDoc {
  id: string;
  type: string;
  fileName: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

export function ListingDocuments({
  listingId,
  documents,
  locale,
}: {
  listingId: string;
  documents: SellerDoc[];
  locale: string;
}) {
  const router = useRouter();
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<string>("CONTRACT_ANNEX");

  async function handleUpload(type: string, file: File) {
    setError(null);
    setUploadingType(type);

    try {
      const form = new FormData();
      form.append("target", "listing");
      form.append("listingId", listingId);
      form.append("type", type);
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to upload document. Please try again.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listing Documents & Verification Files</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {error ? <Callout tone="flagged">{error}</Callout> : null}

        {documents.length === 0 ? (
          <p className="text-xs text-ink-50">No documents attached to this listing yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-rule-subtle">
            {documents.map((doc) => {
              const isApproved = doc.status === "APPROVED";
              const isRejected = doc.status === "REJECTED";
              const isNeedsReplacement = doc.status === "NEEDS_REPLACEMENT";
              const isPending =
                doc.status === "UPLOADED" ||
                doc.status === "PROCESSING" ||
                doc.status === "SCANNING";

              return (
                <div key={doc.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {doc.type.replace(/_/g, " ")}
                      </span>
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
                        {doc.status}
                      </Badge>
                    </div>

                    <a
                      href={`/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-ink hover:underline"
                    >
                      ?? {doc.fileName}
                    </a>

                    {doc.rejectionReason ? (
                      <div className="mt-1 rounded-xs bg-flagged/5 p-1.5 text-2xs text-flagged">
                        Compliance Feedback: {doc.rejectionReason}
                      </div>
                    ) : null}
                  </div>

                  {!isApproved ? (
                    <div className="shrink-0 pt-2 sm:pt-0">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={uploadingType !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(doc.type, f);
                          }}
                        />
                        <span className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper px-3 py-1 text-xs font-medium text-ink shadow-xs hover:bg-paper-raised">
                          {uploadingType === doc.type ? "Uploading..." : "Replace File"}
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Upload additional document */}
        <div className="rule-t pt-4">
          <span className="eyebrow block mb-2">Upload Additional Document</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <Select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                disabled={uploadingType !== null}
              >
                <option value="CONTRACT_ANNEX">Contract Annex</option>
                <option value="PAYMENT_SCHEDULE_ANNEX">Payment Schedule Annex</option>
                <option value="PAYMENT_RECEIPT">Payment Receipt</option>
                <option value="DEVELOPER_ACCOUNT_STATEMENT">Developer Statement</option>
                <option value="DEVELOPER_NOC">Developer NOC</option>
                <option value="POWER_OF_ATTORNEY">Power of Attorney</option>
                <option value="CO_OWNER_CONSENT">Co-Owner Consent</option>
                <option value="OTHER">Other Document</option>
              </Select>
            </div>

            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingType !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(newType, f);
                }}
              />
              <span className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink shadow-xs hover:bg-paper">
                {uploadingType === newType ? "Uploading..." : "Choose File & Upload"}
              </span>
            </label>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
