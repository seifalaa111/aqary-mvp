"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Spinner, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { deleteUpload } from "@/app/actions/seller";

export interface UploadedDocument {
  id: string;
  type: string;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
  blurWarning: boolean;
}

interface Progress {
  key: string;
  name: string;
  pct: number;
  error?: string;
}

/**
 * Real uploads with real progress. Files go to /api/upload, which hashes them,
 * strips EXIF, renders page images and returns the persisted row — so what you
 * see in this list is what is in the database.
 */
export function UploadZone({
  listingId,
  type,
  label,
  hint,
  documents,
  onDocuments,
  accept = "image/*,application/pdf",
  max,
}: {
  listingId: string;
  type: string;
  label: string;
  hint?: string;
  documents: UploadedDocument[];
  onDocuments: (d: UploadedDocument[]) => void;
  accept?: string;
  max?: number;
}) {
  const t = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [, startTransition] = useTransition();

  const mine = documents.filter((d) => d.type === type);
  const atLimit = max !== undefined && mine.length >= max;

  const upload = (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (max !== undefined && documents.filter((d) => d.type === type).length >= max) break;
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      setProgress((p) => [...p, { key, name: file.name, pct: 0 }]);

      const form = new FormData();
      form.set("listingId", listingId);
      form.set("type", type);
      form.set("target", "document");
      form.set("file", file);

      // XHR, because fetch cannot report upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 95);
        setProgress((p) => p.map((x) => (x.key === key ? { ...x, pct } : x)));
      };
      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (!res.ok) throw new Error(res.error ?? "Upload failed");
          setProgress((p) => p.filter((x) => x.key !== key));
          onDocuments([...documents.filter((d) => d.id !== res.document.id), { ...res.document, type }]);
        } catch (err) {
          setProgress((p) =>
            p.map((x) =>
              x.key === key ? { ...x, pct: 100, error: err instanceof Error ? err.message : "Failed" } : x,
            ),
          );
        }
      };
      xhr.onerror = () => {
        setProgress((p) => p.map((x) => (x.key === key ? { ...x, error: "Network error" } : x)));
      };
      xhr.send(form);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink-70">{label}</p>
        {mine.length > 0 ? <Badge tone="verified">{mine.length}</Badge> : null}
      </div>

      {!atLimit ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-brass bg-brass-soft" : "border-rule-strong bg-paper-sunken/40",
          )}
        >
          <p className="text-xs text-ink-50">
            {t("uploadDrop")}{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-ink underline underline-offset-2"
            >
              {t("uploadBrowse")}
            </button>
          </p>
          {hint ? <p className="mt-1 max-w-xs text-2xs text-ink-30">{hint}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            capture={accept.startsWith("image") ? "environment" : undefined}
            multiple={max !== 1}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}

      {progress.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {progress.map((p) => (
            <li key={p.key} className="rounded-sm border border-rule bg-paper-raised px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-2xs">
                <span className="truncate text-ink-70">{p.name}</span>
                {p.error ? (
                  <span className="text-flagged">{p.error}</span>
                ) : (
                  <span className="money flex items-center gap-1.5 text-ink-50">
                    <Spinner className="size-3" /> {p.pct}%
                  </span>
                )}
              </div>
              {!p.error ? (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-paper-sunken">
                  <div className="h-full bg-brass transition-[width]" style={{ width: `${p.pct}%` }} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setProgress((x) => x.filter((y) => y.key !== p.key))}
                  className="mt-1 text-2xs text-ink-50 underline"
                >
                  {t("dismiss")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {mine.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {mine.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-sm border border-rule bg-paper-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-ink">{d.fileName}</p>
                <p className="money text-2xs text-ink-30">
                  {(d.sizeBytes / 1024).toFixed(0)} KB · {d.pageCount}p
                  {d.blurWarning ? <span className="ms-2 text-pending">may be too blurry — retake</span> : null}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await deleteUpload({ listingId, documentId: d.id });
                    onDocuments(documents.filter((x) => x.id !== d.id));
                  })
                }
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
