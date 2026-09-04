/**
 * Platform configuration. Every economic constant lives here — never inline.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

function mode<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name] as T | undefined;
  return raw && allowed.includes(raw) ? raw : fallback;
}

const DEFAULT_AUTH_SECRET = "dev-only-secret-change-me-0123456789abcdef";
function authSecret(): string {
  const value = process.env.AUTH_SECRET;
  // A known fallback is useful only for a local demo. In a production bundle it
  // would make session hashes and signed URLs forgeable, so fail closed during
  // startup instead of silently running insecurely.
  if (process.env.NODE_ENV === "production" && (!value || value === DEFAULT_AUTH_SECRET)) {
    throw new Error("AUTH_SECRET must be a unique, non-default value in production");
  }
  return value || DEFAULT_AUTH_SECRET;
}

export const config = {
  /** Buyer success fee, in basis points. 200 bps = 2%. Charged only on completion. */
  PLATFORM_FEE_BPS: int("PLATFORM_FEE_BPS", 200),
  /** Seller commission. Zero, by design — see the business brief. */
  SELLER_FEE_BPS: int("SELLER_FEE_BPS", 0),

  /** Reservation deposit taken when a deal is created, in bps of cash-to-seller. */
  RESERVATION_DEPOSIT_BPS: int("RESERVATION_DEPOSIT_BPS", 1000), // 10%

  /** Maximum downward flexibility a seller may offer, in percent. */
  MAX_FLEXIBILITY_PCT: int("MAX_FLEXIBILITY_PCT", 15),

  /** Publish preconditions. */
  MIN_APPROVED_IMAGES: int("MIN_APPROVED_IMAGES", 5),

  /** Reconciliation tolerance before a discrepancy is raised, in bps of the larger value. */
  RECONCILIATION_TOLERANCE_BPS: int("RECONCILIATION_TOLERANCE_BPS", 50), // 0.5%
  /** Absolute EGP tolerance floor, so tiny contracts don't raise noise. */
  RECONCILIATION_TOLERANCE_ABS: int("RECONCILIATION_TOLERANCE_ABS", 5000),

  /** Discrepancy severity thresholds, as bps of the larger value. */
  SEVERITY_MINOR_BPS: int("SEVERITY_MINOR_BPS", 100), // 1%
  SEVERITY_MAJOR_BPS: int("SEVERITY_MAJOR_BPS", 300), // 3%
  SEVERITY_CRITICAL_BPS: int("SEVERITY_CRITICAL_BPS", 800), // 8%

  /** Offer lifetime in hours. */
  OFFER_EXPIRY_HOURS: int("OFFER_EXPIRY_HOURS", 72),

  /** Analyst SLA for a file in the verification queue, in hours. */
  VERIFICATION_SLA_HOURS: int("VERIFICATION_SLA_HOURS", 48),

  CURRENCY: "EGP" as const,

  AI_MODE: mode("AI_MODE", ["mock", "live"] as const, "mock"),
  PAYMENT_MODE: mode("PAYMENT_MODE", ["mock", "live"] as const, "mock"),
  KYC_MODE: mode("KYC_MODE", ["mock", "live"] as const, "mock"),
  NOTIFICATION_MODE: mode("NOTIFICATION_MODE", ["mock", "live"] as const, "mock"),
  STORAGE_MODE: mode("STORAGE_MODE", ["local", "s3"] as const, "local"),

  AI_MODEL_EXTRACTION: process.env.AI_MODEL_EXTRACTION || "claude-opus-5",
  AI_MODEL_SCORING: process.env.AI_MODEL_SCORING || "claude-sonnet-5",

  STORAGE_ROOT: process.env.STORAGE_ROOT || "./storage",

  /**
   * True when the deployment bundle is mounted read-only and only the OS temp
   * directory can be written (Vercel and most serverless hosts). Storage then
   * reads from the bundle and writes to a temp overlay. Set explicitly to
   * override the host sniff.
   */
  READ_ONLY_FS: bool("READ_ONLY_FS", process.env.VERCEL === "1"),

  SHOW_DEMO_BANNER: bool("SHOW_DEMO_BANNER", true),
  SURFACE_OTP_IN_DEV: bool("SURFACE_OTP_IN_DEV", true),

  /**
   * Where the public "Discuss a partnership" action sends a developer. Defaults
   * to the IANA-reserved `.example` TLD so an unconfigured deployment cannot
   * pass itself off as a live inbox; set it to the real address to go live.
   */
  PARTNERSHIPS_EMAIL: process.env.PARTNERSHIPS_EMAIL || "partnerships@aqary.example",

  AUTH_SECRET: authSecret(),
  SESSION_DAYS: int("SESSION_DAYS", 14),
} as const;

export const PLATFORM_FEE_PCT = config.PLATFORM_FEE_BPS / 100;
