"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button, Field, Input, Callout, cn } from "@/components/ui/primitives";
import { requestOtp, signUpWithPassword, verifyOtp } from "@/app/actions/auth";

type Role = "SELLER" | "BUYER";
type Step = "role" | "details" | "otp";

export interface SignUpCopy {
  chooseRole: string;
  chooseRoleSub: string;
  sellerCard: string;
  sellerCardSub: string;
  sellerBullets: string[];
  buyerCard: string;
  buyerCardSub: string;
  buyerBullets: string[];
  signUpTitle: string;
  phone: string;
  phoneHint: string;
  fullNameEn: string;
  fullNameAr: string;
  email: string;
  password: string;
  continueLabel: string;
  otpTitle: string;
  otpSub: string;
  otpDevNote: string;
  otpResend: string;
  verify: string;
  usePassword: string;
  useOtp: string;
  back: string;
}

/**
 * The role fork is the very first decision, because it changes the entire
 * product: different onboarding, navigation, dashboard and permissions.
 */
export function SignUpForm({
  initialRole,
  copy,
}: {
  initialRole: Role | null;
  copy: SignUpCopy;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(initialRole);
  const [step, setStep] = useState<Step>(initialRole ? "details" : "role");
  const [method, setMethod] = useState<"otp" | "password">("otp");
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    fullNameEn: "",
    fullNameAr: "",
    phone: "",
    email: "",
    password: "",
    code: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (step === "role") {
    return (
      <div className="animate-in-up">
        <h1 className="display-section mb-3 text-ink">{copy.chooseRole}</h1>
        <p className="mb-10 max-w-xl text-sm text-ink-50">{copy.chooseRoleSub}</p>

        <div className="grid gap-5 md:grid-cols-2">
          <RoleCard
            title={copy.sellerCard}
            sub={copy.sellerCardSub}
            bullets={copy.sellerBullets}
            tone="ink"
            onSelect={() => {
              setRole("SELLER");
              setStep("details");
            }}
          />
          <RoleCard
            title={copy.buyerCard}
            sub={copy.buyerCardSub}
            bullets={copy.buyerBullets}
            tone="paper"
            onSelect={() => {
              setRole("BUYER");
              setStep("details");
            }}
          />
        </div>
      </div>
    );
  }

  const submitDetails = () => {
    setError(null);
    setFieldError(null);
    startTransition(async () => {
      if (method === "password") {
        const res = await signUpWithPassword({ ...form, role });
        if (!res.ok) {
          setError(res.error);
          setFieldError(res.field ?? null);
          return;
        }
        router.push((res.redirectTo ?? "/") as never);
        router.refresh();
        return;
      }
      const res = await requestOtp({ phone: form.phone, purpose: "SIGNUP" });
      if (!res.ok) {
        setError(res.error);
        setFieldError(res.field ?? null);
        return;
      }
      setDevCode(res.devCode ?? null);
      setStep("otp");
    });
  };

  const submitOtp = () => {
    setError(null);
    startTransition(async () => {
      const res = await verifyOtp({
        phone: form.phone,
        code: form.code,
        purpose: "SIGNUP",
        role,
        fullNameEn: form.fullNameEn,
        fullNameAr: form.fullNameAr || undefined,
        email: form.email || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        setFieldError(res.field ?? null);
        return;
      }
      router.push((res.redirectTo ?? "/") as never);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto w-full max-w-md animate-in-up">
      <button
        type="button"
        onClick={() => (step === "otp" ? setStep("details") : setStep("role"))}
        className="mb-6 text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
      >
        ← {copy.back}
      </button>

      <p className="eyebrow mb-2">{role === "SELLER" ? copy.sellerCard : copy.buyerCard}</p>
      <h1 className="display-section mb-8 text-ink">
        {step === "otp" ? copy.otpTitle : copy.signUpTitle}
      </h1>

      {error ? (
        <div className="mb-5">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      {step === "details" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitDetails();
          }}
        >
          <Field label={copy.fullNameEn} htmlFor="fullNameEn" required error={fieldError === "fullNameEn" ? error ?? undefined : undefined}>
            <Input id="fullNameEn" value={form.fullNameEn} onChange={set("fullNameEn")} required autoComplete="name" />
          </Field>
          <Field label={copy.fullNameAr} htmlFor="fullNameAr">
            <Input id="fullNameAr" value={form.fullNameAr} onChange={set("fullNameAr")} dir="rtl" lang="ar" />
          </Field>
          <Field
            label={copy.phone}
            htmlFor="phone"
            required
            hint={copy.phoneHint}
            error={fieldError === "phone" ? error ?? undefined : undefined}
          >
            <Input
              id="phone"
              value={form.phone}
              onChange={set("phone")}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="010 1234 5678"
              dir="ltr"
            />
          </Field>
          <Field label={copy.email} htmlFor="email">
            <Input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" dir="ltr" />
          </Field>

          {method === "password" ? (
            <Field label={copy.password} htmlFor="password" required error={fieldError === "password" ? error ?? undefined : undefined}>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={set("password")}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
          ) : null}

          <Button type="submit" size="lg" loading={pending} className="mt-2">
            {copy.continueLabel}
          </Button>

          <button
            type="button"
            onClick={() => setMethod((m) => (m === "otp" ? "password" : "otp"))}
            className="mt-1 text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
          >
            {method === "otp" ? copy.usePassword : copy.useOtp}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitOtp();
          }}
        >
          <p className="text-sm text-ink-50">
            {copy.otpSub} <span className="money text-ink" dir="ltr">{form.phone}</span>
          </p>

          {devCode ? (
            <Callout tone="info" title={copy.otpDevNote}>
              <span className="money text-money-md font-semibold tracking-[0.3em] text-ink">{devCode}</span>
            </Callout>
          ) : null}

          <Field label={copy.otpTitle} htmlFor="code" required>
            <Input
              id="code"
              value={form.code}
              onChange={set("code")}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              dir="ltr"
              className="money text-center text-money-md tracking-[0.4em]"
            />
          </Field>

          <Button type="submit" size="lg" loading={pending}>
            {copy.verify}
          </Button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await requestOtp({ phone: form.phone, purpose: "SIGNUP" });
                if (res.ok) setDevCode(res.devCode ?? null);
                else setError(res.error);
              })
            }
            className="text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
          >
            {copy.otpResend}
          </button>
        </form>
      )}
    </div>
  );
}

function RoleCard({
  title,
  sub,
  bullets,
  tone,
  onSelect,
}: {
  title: string;
  sub: string;
  bullets: string[];
  tone: "ink" | "paper";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col rounded-lg border p-7 text-start transition-transform duration-200 hover:-translate-y-1",
        tone === "ink"
          ? "border-transparent bg-ink text-ink-text"
          : "border-rule-strong bg-paper-raised text-ink hover:border-ink",
      )}
    >
      <h2 className="font-display text-2xl leading-snug">{title}</h2>
      <p className={cn("mt-3 text-sm", tone === "ink" ? "text-ink-text-70" : "text-ink-50")}>{sub}</p>
      <ul className="mt-6 flex flex-col gap-2.5">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2 text-sm">
            <span className={cn("mt-1.5 size-1 shrink-0 rounded-full", tone === "ink" ? "bg-brass" : "bg-brass")} />
            <span className={tone === "ink" ? "text-ink-text-70" : "text-ink-70"}>{b}</span>
          </li>
        ))}
      </ul>
      <span
        className={cn(
          "mt-8 font-mono text-2xs uppercase tracking-wider transition-transform group-hover:translate-x-1",
          tone === "ink" ? "text-ink-text-50" : "text-ink-50",
        )}
      >
        Continue →
      </span>
    </button>
  );
}
