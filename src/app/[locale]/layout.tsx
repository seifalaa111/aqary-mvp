import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { routing, dirFor } from "@/i18n/routing";
import { DemoBanner } from "@/components/chrome/demo-banner";
import { config } from "@/lib/config";
import "../globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Aqary — Egypt's secondary market for installment contracts",
    template: "%s · Aqary",
  },
  description:
    "Transfer an installment property contract with no overprice. The seller recovers what they paid in cash; the buyer takes over at the old contract price. Every figure verified by a human analyst.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} ${plexArabic.variable}`}
      suppressHydrationWarning
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-ink-text"
        >
          {locale === "ar" ? "تخطٍّ إلى المحتوى" : "Skip to content"}
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          {config.SHOW_DEMO_BANNER ? <DemoBanner /> : null}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
