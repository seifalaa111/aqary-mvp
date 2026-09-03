import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intl = createMiddleware(routing);

const LOCALES = new Set<string>(routing.locales);

/**
 * next-intl handles locale negotiation. On top of it we make sure a hand-typed
 * or bookmarked un-prefixed path never dead-ends: `/signin` goes to
 * `/en/signin` (or the visitor's remembered locale) rather than a 404.
 */
export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/").filter(Boolean)[0];

  if (pathname !== "/" && (!first || !LOCALES.has(first))) {
    const remembered = request.cookies.get(routing.localeCookie ? "AQARY_LOCALE" : "")?.value;
    const locale = remembered && LOCALES.has(remembered) ? remembered : routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}${pathname}${search}`, request.url));
  }

  return intl(request);
}

export const config = {
  // Everything except API routes, Next internals, the statically served media
  // directories, and any path with a file extension.
  //
  // NOTE the double backslash: in a JavaScript string `\.` collapses to `.`,
  // which turns the lookahead into `.*..*` and silently disables the middleware
  // for almost every route. That bug is how un-prefixed paths started 404ing.
  matcher: ["/((?!api|_next|_vercel|media|property|favicon|.*\\..*).*)"],
};
