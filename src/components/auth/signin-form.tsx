"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button, Field, Input, Callout } from "@/components/ui/primitives";
import { requestOtp, signInWithPassword, verifyOtp } from "@/app/actions/auth";

export function SignInForm({
  copy,
}: {
  copy: {
    title: string;
    phone: string;
    phoneHint: string;
    password: string;
    identifier: string;
    continueLabel: string;
    otpTitle: string;
    otpDevNote: string;
    otpResend: string;
    verify: string;
    usePassword: string;
    useOtp: string;
  };
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"otp" | "password">("password");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ identifier: "", password: "", phone: "", code: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const go = (to?: string) => {
    router.push((to ?? "/") as never);
    router.refresh();
  };

  return (
    <div className="w-full">
      <h1 className="display-section mb-8 text-ink">{copy.title}</h1>

      {error ? (
        <div className="mb-5">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      {method === "password" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await signInWithPassword(form);
              if (!res.ok) setError(res.error);
              else go(res.redirectTo);
            });
          }}
        >
          <Field label={copy.identifier} htmlFor="identifier" required>
            <Input id="identifier" value={form.identifier} onChange={set("identifier")} required autoComplete="username" dir="ltr" />
          </Field>
          <Field label={copy.password} htmlFor="password" required>
            <Input id="password" type="password" value={form.password} onChange={set("password")} required autoComplete="current-password" />
          </Field>
          <Button type="submit" size="lg" loading={pending}>
            {copy.continueLabel}
          </Button>
          <button type="button" onClick={() => { setMethod("otp"); setError(null); }} className="text-xs text-ink-50 underline underline-offset-2 hover:text-ink">
            {copy.useOtp}
          </button>
        </form>
      ) : !sent ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await requestOtp({ phone: form.phone, purpose: "LOGIN" });
              if (!res.ok) setError(res.error);
              else {
                setDevCode(res.devCode ?? null);
                setSent(true);
              }
            });
          }}
        >
          <Field label={copy.phone} htmlFor="phone" hint={copy.phoneHint} required>
            <Input id="phone" value={form.phone} onChange={set("phone")} required inputMode="tel" autoComplete="tel" dir="ltr" placeholder="010 1234 5678" />
          </Field>
          <Button type="submit" size="lg" loading={pending}>
            {copy.continueLabel}
          </Button>
          <button type="button" onClick={() => { setMethod("password"); setError(null); }} className="text-xs text-ink-50 underline underline-offset-2 hover:text-ink">
            {copy.usePassword}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await verifyOtp({ phone: form.phone, code: form.code, purpose: "LOGIN" });
              if (!res.ok) setError(res.error);
              else go(res.redirectTo);
            });
          }}
        >
          {devCode ? (
            <Callout tone="info" title={copy.otpDevNote}>
              <span className="money text-money-md font-semibold tracking-[0.3em] text-ink">{devCode}</span>
            </Callout>
          ) : null}
          <Field label={copy.otpTitle} htmlFor="code" required>
            <Input id="code" value={form.code} onChange={set("code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required dir="ltr" className="money text-center text-money-md tracking-[0.4em]" />
          </Field>
          <Button type="submit" size="lg" loading={pending}>
            {copy.verify}
          </Button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await requestOtp({ phone: form.phone, purpose: "LOGIN" });
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
