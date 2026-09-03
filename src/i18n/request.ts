import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { routing } from "./routing";

/**
 * Resolving the locale.
 *
 * `requestLocale` comes from the `[locale]` segment, but a layout and its page
 * render concurrently, so a dynamically-rendered page can ask for translations
 * before the layout has established the segment locale. When that happens we
 * fall back to the locale the middleware resolved, and then to the path itself,
 * so a page never quietly renders English inside `/ar`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : await localeFromRequest();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Africa/Cairo",
    now: new Date(),
  };
});

async function localeFromRequest(): Promise<(typeof routing.locales)[number]> {
  try {
    const h = await headers();

    const fromMiddleware = h.get("x-next-intl-locale");
    if (hasLocale(routing.locales, fromMiddleware)) return fromMiddleware;

    // `next-url` carries the internal rewritten path; `x-invoke-path` and the
    // referer are backstops depending on how the request arrived.
    const candidates = [h.get("x-next-intl-pathname"), h.get("next-url"), h.get("x-invoke-path"), h.get("referer")];
    for (const value of candidates) {
      if (!value) continue;
      const path = value.startsWith("http") ? new URL(value).pathname : value;
      const first = path.split("/").filter(Boolean)[0];
      if (hasLocale(routing.locales, first)) return first;
    }
  } catch {
    // headers() is unavailable during static generation; the default is correct there.
  }
  return routing.defaultLocale;
}
