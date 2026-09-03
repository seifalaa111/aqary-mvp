import { Decimal } from "decimal.js";

/**
 * Money in Aqary is always EGP and always Decimal. Never float, never a bare
 * number on screen. This module is the single formatting authority.
 */

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;
export type MoneyInput = Decimal | string | number | null | undefined;

export function money(v: MoneyInput): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return v instanceof Decimal ? v : new Decimal(v.toString());
}

/** Nullable variant — keeps "we do not know this yet" distinct from zero. */
export function maybeMoney(v: MoneyInput): Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  return v instanceof Decimal ? v : new Decimal(v.toString());
}

export function toCents(v: MoneyInput): string {
  return money(v).toFixed(2);
}

export function bps(value: MoneyInput, basisPoints: number): Decimal {
  return money(value).mul(basisPoints).div(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function pctOf(part: MoneyInput, whole: MoneyInput): number {
  const w = money(whole);
  if (w.isZero()) return 0;
  return money(part).div(w).mul(100).toNumber();
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Egyptian Arabic UI conventionally keeps Latin digits for money. Opt in explicitly. */
export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]!);
}

export interface FormatMoneyOptions {
  /** "EGP 9,450,000" (default) | "9,450,000" | "EGP 9.45m" */
  style?: "full" | "bare" | "compact";
  locale?: "en" | "ar";
  decimals?: number;
  arabicDigits?: boolean;
}

/**
 * The one EGP formatting helper. `EGP 9,450,000` — grouped, no decimals unless
 * asked, currency code before the figure in both locales (Egyptian financial
 * documents keep the Latin code).
 */
export function formatMoney(v: MoneyInput, opts: FormatMoneyOptions = {}): string {
  const { style = "full", locale = "en", decimals, arabicDigits = false } = opts;
  const d = money(v);

  if (style === "compact") {
    const abs = d.abs();
    let out: string;
    if (abs.gte(1_000_000_000)) out = `${trimZeros(d.div(1_000_000_000).toFixed(2))}bn`;
    else if (abs.gte(1_000_000)) out = `${trimZeros(d.div(1_000_000).toFixed(2))}m`;
    else if (abs.gte(1_000)) out = `${trimZeros(d.div(1_000).toFixed(1))}k`;
    else out = d.toFixed(0);
    const s = `EGP ${out}`;
    return arabicDigits ? toArabicDigits(s) : s;
  }

  const places = decimals ?? (d.decimalPlaces() > 0 && !d.isInteger() ? 2 : 0);
  const grouped = groupDigits(d.toFixed(places));
  const s = style === "bare" ? grouped : `EGP ${grouped}`;
  return arabicDigits && locale === "ar" ? toArabicDigits(s) : s;
}

function groupDigits(fixed: string): string {
  const negative = fixed.startsWith("-");
  const body = negative ? fixed.slice(1) : fixed;
  const [intPart = "0", fracPart] = body.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fracPart ? `.${fracPart}` : ""}`;
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, "");
}

export function formatPct(value: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const { decimals = 1, sign = false } = opts;
  const v = Number.isFinite(value) ? value : 0;
  const s = `${v.toFixed(decimals)}%`;
  return sign && v > 0 ? `+${s}` : s;
}

export function formatSqm(v: MoneyInput, locale: "en" | "ar" = "en"): string {
  const n = money(v).toFixed(0);
  return locale === "ar" ? `${n} م²` : `${n} m²`;
}
