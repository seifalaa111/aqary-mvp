"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Badge } from "@/components/ui/badges";
import { Button, Callout, Card, CardBody, Field, Select } from "@/components/ui/primitives";
import { deleteKycDocumentAction } from "@/app/actions/buyer";
import { formatDate } from "@/lib/format";

export interface VaultDoc {
  id: string;
  type: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

export function DocumentVault({
  initialDocs,
  locale,
}: {
  initialDocs: VaultDoc[];
  locale: string;
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string>("PROOF_OF_FUNDS");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    setError(null);
    setUploading(true);

    try {
      const form = new FormData();
      form.append("target", "buyer-kyc");
      form.append("type", selectedType);
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Upload failed. Please try again.");
      }

      setFile(null);
      // Reset input element
      const fileInput = document.getElementById("vault-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    startTransition(async () => {
      setError(null);
      const res = await deleteKycDocumentAction(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      {/* Upload Form Card */}
      <Card>
        <CardBody>
          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            <h3 className="font-display text-base text-ink">Upload Document to Vault</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Document Type">
                <Select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  disabled={uploading}
                >
                  <option value="NATIONAL_ID_FRONT">National ID ? Front</option>
                  <option value="NATIONAL_ID_BACK">National ID ? Back</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="PROOF_OF_ADDRESS">Proof of Address</option>
                  <option value="PROOF_OF_FUNDS">Proof of Funds</option>
                  <option value="EMPLOYMENT_PROOF">Employment Proof</option>
                  <option value="POWER_OF_ATTORNEY">Power of Attorney</option>
                  <option value="OTHER">Other Evidence</option>
                </Select>
              </Field>

              <Field label="File (PDF, JPEG, PNG, WebP)">
                <input
                  id="vault-file-input"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="mt-1 block w-full text-xs text-ink file:mr-3 file:rounded-sm file:border-0 file:bg-paper-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-rule-subtle"
                  disabled={uploading}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={uploading || !file}>
                {uploading ? "Uploading..." : "Upload to Vault"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Document Table */}
      <Card>
        <CardBody className="p-0">
          {initialDocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-50">
              No documents uploaded to vault yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-paper-subtle text-ink-50 rule-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">File Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Uploaded</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule-subtle">
                  {initialDocs.map((doc) => {
                    const isApproved = doc.status === "APPROVED";
                    const isRejected = doc.status === "REJECTED";
                    const isNeedsReplacement = doc.status === "NEEDS_REPLACEMENT";
                    const isPending =
                      doc.status === "UPLOADED" ||
                      doc.status === "PROCESSING" ||
                      doc.status === "SCANNING";

                    return (
                      <tr key={doc.id} className="hover:bg-paper-raised/50">
                        <td className="px-4 py-3 font-medium text-ink">
                          {doc.type.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`/documents/${doc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-ink hover:underline"
                          >
                            {doc.fileName}
                          </a>
                          {doc.rejectionReason ? (
                            <p className="mt-0.5 text-2xs text-flagged">
                              Note: {doc.rejectionReason}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
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
                        </td>
                        <td className="px-4 py-3 text-ink-50">
                          {formatDate(doc.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={`/documents/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-ink-70 hover:text-ink hover:underline"
                            >
                              View
                            </a>
                            {!isApproved ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleDelete(doc.id)}
                                className="text-xs text-flagged hover:underline disabled:opacity-50"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
