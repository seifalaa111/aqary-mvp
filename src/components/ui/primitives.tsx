import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inkPrimary";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass " +
  "whitespace-nowrap select-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-ink-text hover:bg-ink-90 active:bg-ink border border-transparent shadow-e1",
  inkPrimary:
    "bg-brass text-ink hover:bg-brass-hover active:bg-brass border border-transparent font-semibold",
  secondary:
    "bg-paper-raised text-ink border border-rule-strong hover:border-ink-50 hover:bg-paper-sunken",
  ghost: "bg-transparent text-ink-70 hover:text-ink hover:bg-paper-sunken border border-transparent",
  danger: "bg-flagged text-white hover:brightness-95 border border-transparent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-sm",
  md: "h-10 px-4 text-sm rounded-sm",
  lg: "h-12 px-6 text-base rounded-md",
};

/** The button's visual classes, for anchors that should look like buttons. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className ?? "size-4",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  as: As = "div",
  ...props
}: ComponentPropsWithoutRef<"div"> & { as?: ElementType }) {
  return (
    <As
      className={cn("rounded-lg border border-rule bg-paper-raised", className)}
      {...props}
    >
      {children}
    </As>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rule-b px-5 py-4", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn("font-sans text-base font-semibold tracking-tight", className)}>{children}</h3>;
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/** Small uppercase mono label. The product's connective tissue. */
export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-70">
        {label}
        {required ? <span className="text-flagged" aria-hidden> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-flagged" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-50">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-sm border border-rule-strong bg-paper-raised px-3 text-ink placeholder:text-ink-30 " +
  "transition-colors focus:border-ink-50 focus:outline-2 focus:outline-offset-0 focus:outline-brass/40 " +
  "disabled:bg-paper-sunken disabled:text-ink-30 aria-[invalid=true]:border-flagged";

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn(CONTROL, "h-10 text-sm", className)} {...props} />;
}

/** Money input: tabular figures, EGP affix, right-aligned digits. */
export function MoneyInput({
  className,
  locale = "en",
  ...props
}: ComponentPropsWithoutRef<"input"> & { locale?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-mono text-2xs tracking-wider text-ink-50">
        {locale === "ar" ? "ج.م" : "EGP"}
      </span>
      <input
        inputMode="decimal"
        className={cn(CONTROL, "money h-10 ps-12 text-end text-base", className)}
        {...props}
      />
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-24 py-2 text-sm", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentPropsWithoutRef<"select">) {
  return (
    <select className={cn(CONTROL, "h-10 text-sm", className)} {...props}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-sm", className)} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-rule-strong bg-paper-sunken/50 px-6 py-14 text-center">
      {icon}
      <h4 className="font-display text-lg text-ink">{title}</h4>
      {body ? <p className="max-w-sm text-sm text-ink-50">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg border border-flagged/30 bg-flagged-soft px-5 py-4"
    >
      <h4 className="text-sm font-semibold text-flagged">{title}</h4>
      {body ? <p className="text-sm text-ink-70">{body}</p> : null}
      {action}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "verified" | "pending" | "flagged";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-info/25 bg-info-soft",
    verified: "border-verified/25 bg-verified-soft",
    pending: "border-pending/30 bg-pending-soft",
    flagged: "border-flagged/25 bg-flagged-soft",
  };
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", tones[tone])}>
      {title ? <p className="mb-1 font-semibold text-ink">{title}</p> : null}
      <div className="text-ink-70">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Term-sheet table — the structural signature
// ---------------------------------------------------------------------------

export function TermSheet({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("rule-t", className)}>{children}</dl>;
}

export function TermRow({
  label,
  children,
  emphasis = false,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rule-b grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5",
        emphasis && "bg-paper-sunken/60 px-3",
        className,
      )}
    >
      <dt className={cn("text-sm", emphasis ? "font-semibold text-ink" : "text-ink-70")}>{label}</dt>
      <dd className={cn("money text-end", emphasis ? "text-money-sm font-semibold text-ink" : "text-sm text-ink")}>
        {children}
      </dd>
    </div>
  );
}
