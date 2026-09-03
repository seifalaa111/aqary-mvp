import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  // Always visible. An Aqary URL is something people paste to each other, and
  // an un-prefixed path is one more thing that can silently resolve to the
  // wrong language.
  localePrefix: "always",
  localeCookie: { name: "AQARY_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

export function dirFor(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
