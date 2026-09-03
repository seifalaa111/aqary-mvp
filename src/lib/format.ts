import { formatMoney, type FormatMoneyOptions, type MoneyInput } from "./money";

export { formatMoney, formatPct, formatSqm, money, maybeMoney } from "./money";

/** Prisma Decimal, string or number → the canonical EGP string. */
export function egp(v: MoneyInput | { toString(): string }, opts?: FormatMoneyOptions): string {
  if (v === null || v === undefined) return "—";
  return formatMoney(typeof v === "object" && "toString" in v ? v.toString() : (v as MoneyInput), opts);
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Egyptian date convention: d MMM yyyy, Arabic month names in Arabic. */
export function formatDate(d: Date | string | null | undefined, locale = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.getUTCDate();
  const month = (locale === "ar" ? AR_MONTHS : EN_MONTHS)[date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

export function formatQuarter(d: Date | string | null | undefined, locale = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return locale === "ar" ? `الربع ${q} ${date.getUTCFullYear()}` : `Q${q} ${date.getUTCFullYear()}`;
}

export function relativeTime(d: Date | string | null | undefined, locale = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  const unit =
    mins < 60
      ? { n: mins, en: mins === 1 ? "minute" : "minutes", ar: "دقيقة" }
      : hours < 48
        ? { n: hours, en: hours === 1 ? "hour" : "hours", ar: "ساعة" }
        : { n: days, en: days === 1 ? "day" : "days", ar: "يوم" };

  if (locale === "ar") {
    return diff >= 0 ? `خلال ${unit.n} ${unit.ar}` : `منذ ${unit.n} ${unit.ar}`;
  }
  return diff >= 0 ? `in ${unit.n} ${unit.en}` : `${unit.n} ${unit.en} ago`;
}

export function countdown(to: Date | string, locale = "en"): string {
  const date = typeof to === "string" ? new Date(to) : to;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return locale === "ar" ? "منتهي" : "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return locale === "ar" ? `${d} يوم و${h % 24} ساعة` : `${d}d ${h % 24}h`;
  }
  return locale === "ar" ? `${h} ساعة و${m} دقيقة` : `${h}h ${m}m`;
}

export function frequencyLabel(f: string | null | undefined, locale = "en"): string {
  if (!f) return "—";
  const map: Record<string, { en: string; ar: string }> = {
    MONTHLY: { en: "monthly", ar: "شهري" },
    QUARTERLY: { en: "quarterly", ar: "ربع سنوي" },
    SEMI_ANNUAL: { en: "semi-annual", ar: "نصف سنوي" },
    ANNUAL: { en: "annual", ar: "سنوي" },
  };
  const entry = map[f];
  if (!entry) return f;
  return locale === "ar" ? entry.ar : entry.en;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
