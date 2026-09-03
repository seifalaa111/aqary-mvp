"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, cn, Spinner } from "@/components/ui/primitives";
import {
  completeStep4,
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep5,
  submitForVerification,
} from "@/app/actions/seller";
import { StepIdentity } from "./step-identity";
import { StepProperty } from "./step-property";
import { StepEconomics } from "./step-economics";
import { StepUploads } from "./step-uploads";
import { StepExitTerms } from "./step-exit-terms";
import { WizardRail } from "./wizard-rail";

export interface WizardInitial {
  listingId: string;
  reference: string;
  status: string;
  wizardStep: number;
  wizardCompleted: number[];
  infoRequestItems: { code: string; labelEn: string; labelAr: string; detail?: string }[] | null;
  step1: Record<string, unknown>;
  step2: Record<string, unknown>;
  step3: Record<string, unknown>;
  step5: Record<string, unknown>;
  documents: {
    id: string;
    type: string;
    fileName: string;
    pageCount: number;
    sizeBytes: number;
    blurWarning: boolean;
  }[];
  media: {
    id: string;
    kind: string;
    roomTag: string | null;
    altEn: string;
    isCover: boolean;
    moderationStatus: string;
    thumb: string;
  }[];
  developers: {
    id: string;
    nameEn: string;
    nameAr: string;
    projects: { id: string; nameEn: string; nameAr: string; city: string; area: string }[];
  }[];
  minImages: number;
  maxFlexibility: number;
}

/**
 * Six steps, every one of which writes to the database the moment it is saved.
 * Leaving mid-wizard and coming back on another device restores exactly where
 * the seller left off, because there is no wizard state in the browser that
 * is not also a row.
 */
export function IntakeWizard({ initial, locale }: { initial: WizardInitial; locale: string }) {
  const t = useTranslations("seller");
  const router = useRouter();
  const [step, setStep] = useState(Math.min(6, Math.max(1, initial.wizardStep)));
  const [completed, setCompleted] = useState<number[]>(initial.wizardCompleted);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const [s1, setS1] = useState(initial.step1);
  const [s2, setS2] = useState(initial.step2);
  const [s3, setS3] = useState(initial.step3);
  const [s5, setS5] = useState(initial.step5);
  const [documents, setDocuments] = useState(initial.documents);
  const [media, setMedia] = useState(initial.media);

  const steps = useMemo(
    () => [
      { n: 1, label: t("step1") },
      { n: 2, label: t("step2") },
      { n: 3, label: t("step3") },
      { n: 4, label: t("step4") },
      { n: 5, label: t("step5") },
      { n: 6, label: t("step6") },
    ],
    [t],
  );

  const save = (n: number, advance = true) => {
    setError(null);
    setFieldErrors({});
    setSaveState("saving");

    startTransition(async () => {
      const listingId = initial.listingId;
      let res;
      if (n === 1) res = await saveStep1({ listingId, ...s1 });
      else if (n === 2) res = await saveStep2({ listingId, ...s2 });
      else if (n === 3) res = await saveStep3({ listingId, ...s3 });
      else if (n === 4) res = await completeStep4(listingId);
      else if (n === 5) res = await saveStep5({ listingId, ...s5, consents: (s5 as { consents?: Record<string, boolean> }).consents ?? {} });
      else res = { ok: true as const };

      if (!res.ok) {
        setSaveState("idle");
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setSaveState("saved");
      setCompleted((c) => [...new Set([...c, n])].sort((a, b) => a - b));
      if (advance) setStep(Math.min(6, n + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSaveState("idle"), 2200);
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await submitForVerification(initial.listingId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/seller/listings/${initial.listingId}/review` as never);
      router.refresh();
    });
  };

  const canSubmit =
    [1, 2, 3, 4, 5].every((n) => completed.includes(n)) &&
    documents.some((d) => d.type === "SALE_CONTRACT") &&
    documents.some((d) => d.type === "PAYMENT_RECEIPT");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {/* ---- Step rail ---- */}
        <ol className="mb-8 flex flex-wrap gap-1.5" role="list">
          {steps.map((s) => {
            const done = completed.includes(s.n);
            const active = step === s.n;
            const reachable = done || s.n <= Math.max(...completed, 0) + 1;
            return (
              <li key={s.n}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(s.n)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-3 py-2 text-xs transition-colors",
                    active
                      ? "border-ink bg-ink text-ink-text"
                      : done
                        ? "border-verified/40 bg-verified-soft text-verified"
                        : reachable
                          ? "border-rule-strong text-ink-50 hover:border-ink-50 hover:text-ink"
                          : "border-rule text-ink-30",
                  )}
                >
                  <span className="money font-mono">{done && !active ? "✓" : s.n}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {initial.infoRequestItems && initial.infoRequestItems.length > 0 ? (
          <div className="mb-6">
            <Callout tone="pending" title={t("infoRequestedTitle")}>
              <ul className="mt-1 flex flex-col gap-1.5">
                {initial.infoRequestItems.map((i) => (
                  <li key={i.code} className="text-sm">
                    • {locale === "ar" ? i.labelAr : i.labelEn}
                    {i.detail ? <span className="block ps-3 text-xs text-ink-50">{i.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : null}

        {error ? (
          <div className="mb-6">
            <Callout tone="flagged">{error}</Callout>
          </div>
        ) : null}

        <Card>
          <CardBody>
            {step === 1 ? (
              <StepIdentity value={s1} onChange={setS1} errors={fieldErrors} listingId={initial.listingId} documents={documents} onDocuments={setDocuments} />
            ) : null}
            {step === 2 ? (
              <StepProperty value={s2} onChange={setS2} errors={fieldErrors} developers={initial.developers} locale={locale} />
            ) : null}
            {step === 3 ? <StepEconomics value={s3} onChange={setS3} errors={fieldErrors} locale={locale} /> : null}
            {step === 4 ? (
              <StepUploads
                listingId={initial.listingId}
                documents={documents}
                media={media}
                onDocuments={setDocuments}
                onMedia={setMedia}
                minImages={initial.minImages}
                locale={locale}
              />
            ) : null}
            {step === 5 ? (
              <StepExitTerms
                value={s5}
                onChange={setS5}
                errors={fieldErrors}
                declaredPaid={String((s3 as { totalPaid?: string }).totalPaid ?? "0")}
                maxFlexibility={initial.maxFlexibility}
                locale={locale}
              />
            ) : null}
            {step === 6 ? (
              <div className="flex flex-col gap-4">
                <h2 className="font-display text-xl text-ink">{t("submit")}</h2>
                <p className="max-w-xl text-sm leading-relaxed text-ink-70">
                  {locale === "ar"
                    ? "بمجرد الإرسال يقرأ محرك الاستخراج مستنداتك ويعيد بناء جدول السداد، ثم تراجع أنت الملخّص قبل أن يصل إلى محلل بشري."
                    : "On submission our extraction engine reads your documents and rebuilds your payment schedule. You review the summary before it reaches a human analyst."}
                </p>

                <ul className="rule-t my-2">
                  {[
                    { label: t("step1"), ok: completed.includes(1) },
                    { label: t("step2"), ok: completed.includes(2) },
                    { label: t("step3"), ok: completed.includes(3) },
                    { label: "Sale contract uploaded", ok: documents.some((d) => d.type === "SALE_CONTRACT") },
                    { label: "Payment receipts uploaded", ok: documents.some((d) => d.type === "PAYMENT_RECEIPT") },
                    { label: `${media.length} of ${initial.minImages} images`, ok: media.length >= initial.minImages },
                    { label: t("step5"), ok: completed.includes(5) },
                  ].map((row) => (
                    <li key={row.label} className="rule-b flex items-center justify-between py-2.5 text-sm">
                      <span className={row.ok ? "text-ink" : "text-ink-50"}>{row.label}</span>
                      <span className={row.ok ? "text-verified" : "text-ink-30"}>{row.ok ? "✓" : "—"}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-2xs leading-relaxed text-ink-50">
                  {locale === "ar"
                    ? "أقل من 5 صور معتمدة يمنع النشر لاحقًا، لكنه لا يمنع الإرسال للمراجعة الآن."
                    : `Fewer than ${initial.minImages} approved images will block publishing later, but it does not block submitting for review now.`}
                </p>

                <Button size="lg" onClick={submit} loading={pending} disabled={!canSubmit}>
                  {t("submit")}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* ---- Footer controls ---- */}
        {step < 6 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              ← {t("back")}
            </Button>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-ink-50" aria-live="polite">
                {saveState === "saving" ? (
                  <>
                    <Spinner className="size-3" /> {t("saving")}
                  </>
                ) : saveState === "saved" ? (
                  <span className="text-verified">✓ {t("autoSaved")}</span>
                ) : null}
              </span>
              <Button variant="secondary" onClick={() => save(step, false)} loading={pending}>
                {t("saveAndExit")}
              </Button>
              <Button onClick={() => save(step)} loading={pending}>
                {t("next")} →
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <WizardRail step={step} locale={locale} />
    </div>
  );
}
