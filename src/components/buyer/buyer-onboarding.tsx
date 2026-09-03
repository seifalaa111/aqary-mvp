"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, Field, MoneyInput, Select, Textarea, Input, cn } from "@/components/ui/primitives";
import { saveBuyerProfile } from "@/app/actions/buyer";
import { egp } from "@/lib/format";

export interface OnboardingOptions {
  developers: { id: string; nameEn: string; nameAr: string }[];
  cities: string[];
  unitTypes: string[];
  cashMin: number;
  cashMax: number;
  installmentMin: number;
  installmentMax: number;
}

/**
 * Onboarding ends on matches, never on a dead end: the moment the profile
 * saves, the matching service runs against every live listing and the buyer
 * lands on the results.
 */
export function BuyerOnboarding({
  locale,
  initial,
  options,
}: {
  locale: string;
  initial: Record<string, unknown>;
  options: OnboardingOptions;
}) {
  const t = useTranslations("buyer");
  const tu = useTranslations("unitType");
  const router = useRouter();
  const isAr = locale === "ar";

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    availableCash: Number(initial.availableCash) || Math.round(options.cashMax * 0.4),
    maxInstallment: Number(initial.maxInstallment) || Math.round(options.installmentMax * 0.4),
    installmentFrequency: String(initial.installmentFrequency ?? "QUARTERLY"),
    incomeRange: String(initial.incomeRange ?? ""),
    employmentType: String(initial.employmentType ?? ""),
    purchasePurpose: String(initial.purchasePurpose ?? ""),
    readiness: String(initial.readiness ?? ""),
    prefCities: (initial.prefCities as string[]) ?? [],
    prefUnitTypes: (initial.prefUnitTypes as string[]) ?? [],
    prefDeveloperIds: (initial.prefDeveloperIds as string[]) ?? [],
    prefBedroomsMin: (initial.prefBedroomsMin as number | undefined) ?? undefined,
    prefBuaMin: (initial.prefBuaMin as number | undefined) ?? undefined,
    prefDeliveryByYear: (initial.prefDeliveryByYear as number | undefined) ?? undefined,
    freeTextPriorities: String(initial.freeTextPriorities ?? ""),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggle = (k: "prefCities" | "prefUnitTypes" | "prefDeveloperIds", v: string) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
    }));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveBuyerProfile(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/buyer/matches" as never);
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-[760px]">
      <p className="eyebrow mb-1">{t("onboarding")}</p>
      <h1 className="mb-2 display-section text-ink">{t("onboarding")}</h1>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-50">{t("onboardingSub")}</p>

      <ol className="mb-8 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex-1">
            <button
              type="button"
              onClick={() => setStep(n)}
              className={cn(
                "h-1 w-full rounded-full transition-colors",
                n <= step ? "bg-brass" : "bg-rule",
              )}
              aria-label={`Step ${n}`}
            />
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mb-5">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-6">
          {step === 1 ? (
            <>
              <h2 className="font-display text-xl text-ink">
                {isAr ? "ما الذي تستطيع تمويله؟" : "What can you actually fund?"}
              </h2>
              <p className="-mt-3 text-sm text-ink-50">
                {isAr
                  ? "نطابق على هذين الرقمين قبل أي شيء آخر."
                  : "We match on these two figures before anything else."}
              </p>

              <Field label={t("availableCash")} htmlFor="cash" required hint={t("availableCashHint")}>
                <MoneyInput
                  id="cash"
                  locale={locale}
                  value={form.availableCash}
                  onChange={(e) => set("availableCash", Number(e.currentTarget.value))}
                />
              </Field>
              <input
                type="range"
                min={0}
                max={Math.max(options.cashMax, form.availableCash)}
                step={50000}
                value={form.availableCash}
                onChange={(e) => set("availableCash", Number(e.target.value))}
                className="-mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
                aria-label={t("availableCash")}
              />
              <p className="-mt-3 font-mono text-2xs uppercase tracking-wider text-ink-30">
                {isAr ? "المدى في السوق الآن" : "Range on the marketplace right now"}:{" "}
                {egp(options.cashMin, { style: "compact" })} – {egp(options.cashMax, { style: "compact" })}
              </p>

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label={t("maxInstallment")} htmlFor="inst" required>
                  <MoneyInput
                    id="inst"
                    locale={locale}
                    value={form.maxInstallment}
                    onChange={(e) => set("maxInstallment", Number(e.currentTarget.value))}
                  />
                </Field>
                <Field label={t("frequency")} htmlFor="freq" required>
                  <Select
                    id="freq"
                    value={form.installmentFrequency}
                    onChange={(e) => set("installmentFrequency", e.target.value)}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="SEMI_ANNUAL">Semi-annual</option>
                    <option value="ANNUAL">Annual</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("incomeRange")} htmlFor="income" required>
                  <Select id="income" value={form.incomeRange} onChange={(e) => set("incomeRange", e.target.value)}>
                    <option value="">Choose</option>
                    <option value="under EGP 30k / month">under EGP 30k / month</option>
                    <option value="EGP 30k–60k / month">EGP 30k–60k / month</option>
                    <option value="EGP 60k–120k / month">EGP 60k–120k / month</option>
                    <option value="EGP 120k–200k / month">EGP 120k–200k / month</option>
                    <option value="EGP 200k+ / month">EGP 200k+ / month</option>
                  </Select>
                </Field>
                <Field label={t("employmentType")} htmlFor="employment" required>
                  <Select
                    id="employment"
                    value={form.employmentType}
                    onChange={(e) => set("employmentType", e.target.value)}
                  >
                    <option value="">Choose</option>
                    <option value="Employee">Employee</option>
                    <option value="Business owner">Business owner</option>
                    <option value="Freelancer">Freelancer</option>
                    <option value="Expatriate remittance">Expatriate remittance</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("purpose")} htmlFor="purpose" required>
                  <Select id="purpose" value={form.purchasePurpose} onChange={(e) => set("purchasePurpose", e.target.value)}>
                    <option value="">Choose</option>
                    <option value="Own use">Own use</option>
                    <option value="Investment">Investment</option>
                    <option value="Upgrade">Upgrade</option>
                    <option value="Downsize">Downsize</option>
                  </Select>
                </Field>
                <Field label={t("readiness")} htmlFor="readiness" required>
                  <Select id="readiness" value={form.readiness} onChange={(e) => set("readiness", e.target.value)}>
                    <option value="">Choose</option>
                    <option value="Just exploring">Just exploring</option>
                    <option value="Ready in 90 days">Ready in 90 days</option>
                    <option value="Ready in 30 days">Ready in 30 days</option>
                    <option value="Ready now">Ready now</option>
                  </Select>
                </Field>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="font-display text-xl text-ink">{t("preferences")}</h2>

              <div>
                <p className="mb-2 text-xs font-medium text-ink-70">{t("cities")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {options.cities.map((c) => (
                    <Chip key={c} active={form.prefCities.includes(c)} onClick={() => toggle("prefCities", c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-ink-70">{t("unitTypes")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {options.unitTypes.map((u) => (
                    <Chip key={u} active={form.prefUnitTypes.includes(u)} onClick={() => toggle("prefUnitTypes", u)}>
                      {tu(u as "APARTMENT")}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-ink-70">{t("developers")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {options.developers.map((d) => (
                    <Chip
                      key={d.id}
                      active={form.prefDeveloperIds.includes(d.id)}
                      onClick={() => toggle("prefDeveloperIds", d.id)}
                    >
                      {isAr ? d.nameAr : d.nameEn}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("bedroomsMin")} htmlFor="beds">
                  <Select
                    id="beds"
                    value={form.prefBedroomsMin ?? ""}
                    onChange={(e) => set("prefBedroomsMin", e.target.value ? Number(e.target.value) : undefined)}
                  >
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}+
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("buaMin")} htmlFor="bua">
                  <Input
                    id="bua"
                    type="number"
                    className="money"
                    value={form.prefBuaMin ?? ""}
                    onChange={(e) => set("prefBuaMin", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </Field>
                <Field label={t("deliveryBy")} htmlFor="delivery">
                  <Select
                    id="delivery"
                    value={form.prefDeliveryByYear ?? ""}
                    onChange={(e) => set("prefDeliveryByYear", e.target.value ? Number(e.target.value) : undefined)}
                  >
                    <option value="">Any</option>
                    {Array.from({ length: 8 }, (_, i) => new Date().getUTCFullYear() + i).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="font-display text-xl text-ink">{t("priorities")}</h2>
              <Field label={t("priorities")} htmlFor="priorities" hint={t("prioritiesHint")}>
                <Textarea
                  id="priorities"
                  rows={5}
                  maxLength={1000}
                  value={form.freeTextPriorities}
                  onChange={(e) => set("freeTextPriorities", e.target.value)}
                  placeholder={
                    isAr
                      ? "مثال: أحتاج التسليم قبل 2028، والقسط الربع سنوي يناسب دخلي أكثر."
                      : "e.g. Delivery before 2028 matters more to me than size, and quarterly instalments fit my income better than monthly."
                  }
                />
              </Field>

              <div className="rounded-md bg-paper-sunken p-4">
                <p className="eyebrow mb-2">{isAr ? "ملخّص" : "Your profile"}</p>
                <dl className="rule-t text-sm">
                  <Row label={t("availableCash")} value={egp(form.availableCash, { decimals: 0 })} />
                  <Row
                    label={t("maxInstallment")}
                    value={`${egp(form.maxInstallment, { decimals: 0 })} ${form.installmentFrequency.toLowerCase().replace("_", "-")}`}
                  />
                  <Row label={t("cities")} value={form.prefCities.join(", ") || "Any"} />
                  <Row
                    label={t("unitTypes")}
                    value={form.prefUnitTypes.map((u) => tu(u as "APARTMENT")).join(", ") || "Any"}
                  />
                </dl>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              ← Back
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  step === 1 &&
                  (!form.incomeRange || !form.employmentType || !form.purchasePurpose || !form.readiness)
                }
              >
                Continue →
              </Button>
            ) : (
              <Button size="lg" loading={pending} onClick={submit}>
                {t("finish")}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm border px-3 py-1.5 text-xs transition-colors",
        active ? "border-ink bg-ink text-ink-text" : "border-rule-strong text-ink-70 hover:border-ink-50",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-xs text-ink">{value}</dd>
    </div>
  );
}
