"use client";

import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/primitives";
import { parseNationalId } from "@/lib/domain/national-id";
import { UploadZone, type UploadedDocument } from "./upload-zone";

type V = Record<string, unknown>;

export function StepIdentity({
  value,
  onChange,
  errors,
  listingId,
  documents,
  onDocuments,
}: {
  value: V;
  onChange: (v: V) => void;
  errors: Record<string, string>;
  listingId: string;
  documents: UploadedDocument[];
  onDocuments: (d: UploadedDocument[]) => void;
}) {
  const t = useTranslations("seller");
  const ta = useTranslations("auth");
  const set = (k: string) => (v: unknown) => onChange({ ...value, [k]: v });

  const idCheck = parseNationalId(String(value.nationalId ?? ""));
  const relationship = String(value.relationshipToContract ?? "OWNER");
  const coOwnerCount = Number(value.coOwnerCount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t("step1")}</h2>
        <p className="mt-1 text-sm text-ink-50">
          The developer will only process an assignment for the person named on the contract.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ta("fullNameAr")} htmlFor="fullNameAr" required error={errors.fullNameAr}>
          <Input
            id="fullNameAr"
            dir="rtl"
            lang="ar"
            value={String(value.fullNameAr ?? "")}
            onChange={(e) => set("fullNameAr")(e.target.value)}
          />
        </Field>
        <Field label={ta("fullNameEn")} htmlFor="fullNameEn" required error={errors.fullNameEn}>
          <Input
            id="fullNameEn"
            value={String(value.fullNameEn ?? "")}
            onChange={(e) => set("fullNameEn")(e.target.value)}
          />
        </Field>

        <Field
          label="National ID (14 digits)"
          htmlFor="nationalId"
          required
          error={errors.nationalId}
          hint={
            idCheck.valid
              ? `Checksum valid · born ${idCheck.dateOfBirth?.toISOString().slice(0, 10)} · ${idCheck.governorate}`
              : String(value.nationalId ?? "").length > 0
                ? idCheck.error
                : "We derive your date of birth and governorate from it"
          }
        >
          <Input
            id="nationalId"
            dir="ltr"
            inputMode="numeric"
            maxLength={14}
            className="money tracking-widest"
            value={String(value.nationalId ?? "")}
            onChange={(e) => set("nationalId")(e.target.value.replace(/\D/g, ""))}
            aria-invalid={String(value.nationalId ?? "").length === 14 && !idCheck.valid}
          />
        </Field>

        <Field label={ta("emailOptional")} htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            dir="ltr"
            value={String(value.email ?? "")}
            onChange={(e) => set("email")(e.target.value)}
          />
        </Field>

        <Field label="Your relationship to the contract" htmlFor="relationship" required>
          <Select
            id="relationship"
            value={relationship}
            onChange={(e) => set("relationshipToContract")(e.target.value)}
          >
            <option value="OWNER">I am the contract holder</option>
            <option value="AUTHORIZED_REPRESENTATIVE">I hold a power of attorney</option>
            <option value="HEIR">I am an heir</option>
          </Select>
        </Field>

        <Field label="Co-owners on the contract" htmlFor="coOwnerCount">
          <Input
            id="coOwnerCount"
            type="number"
            min={0}
            max={10}
            value={coOwnerCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              const names = Array.from({ length: n }, (_, i) => (value.coOwnerNames as string[])?.[i] ?? "");
              onChange({ ...value, coOwnerCount: n, coOwnerNames: names });
            }}
          />
        </Field>
      </div>

      {coOwnerCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-paper-sunken p-4">
          <p className="text-xs font-medium text-ink-70">
            Every co-owner must consent before the developer will register an assignment.
          </p>
          {Array.from({ length: coOwnerCount }).map((_, i) => (
            <Input
              key={i}
              dir="rtl"
              lang="ar"
              placeholder={`Co-owner ${i + 1} — full name in Arabic`}
              value={(value.coOwnerNames as string[])?.[i] ?? ""}
              onChange={(e) => {
                const names = [...((value.coOwnerNames as string[]) ?? [])];
                names[i] = e.target.value;
                set("coOwnerNames")(names);
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Best time to reach you" htmlFor="window">
          <Select
            id="window"
            value={String(value.preferredContactWindow ?? "")}
            onChange={(e) => set("preferredContactWindow")(e.target.value)}
          >
            <option value="">No preference</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
          </Select>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-ink-70">
          <input
            type="checkbox"
            checked={Boolean(value.whatsappOptIn)}
            onChange={(e) => set("whatsappOptIn")(e.target.checked)}
            className="size-4 accent-ink"
          />
          Contact me on WhatsApp
        </label>
      </div>

      <div className="rule-t pt-6">
        <p className="eyebrow mb-3">Identity documents</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadZone
            listingId={listingId}
            type="NATIONAL_ID_FRONT"
            label="National ID — front"
            documents={documents}
            onDocuments={onDocuments}
            accept="image/*"
            max={1}
          />
          <UploadZone
            listingId={listingId}
            type="NATIONAL_ID_BACK"
            label="National ID — back"
            documents={documents}
            onDocuments={onDocuments}
            accept="image/*"
            max={1}
          />
        </div>

        {relationship !== "OWNER" ? (
          <div className="mt-4">
            <UploadZone
              listingId={listingId}
              type={relationship === "HEIR" ? "OTHER" : "POWER_OF_ATTORNEY"}
              label={relationship === "HEIR" ? "Inheritance document (إعلام وراثة)" : "Power of attorney (توكيل)"}
              documents={documents}
              onDocuments={onDocuments}
            />
          </div>
        ) : null}

        {coOwnerCount > 0 ? (
          <div className="mt-4">
            <UploadZone
              listingId={listingId}
              type="CO_OWNER_CONSENT"
              label="Co-owner consent documents"
              documents={documents}
              onDocuments={onDocuments}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
