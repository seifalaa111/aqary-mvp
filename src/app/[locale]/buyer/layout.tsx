import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export default async function BuyerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyer" });
  const tn = await getTranslations({ locale, namespace: "nav" });

  const [openOffers, saved] = await Promise.all([
    prisma.offer.count({ where: { buyerId: user.id, status: { in: ["PENDING", "COUNTERED"] } } }),
    prisma.savedListing.count({ where: { buyerId: user.id } }),
  ]);

  return (
    <WorkspaceShell
      locale={locale}
      role="BUYER"
      nav={[
        { href: "/opportunities", label: tn("marketplace") },
        { href: "/buyer/matches", label: "Matches" },
        { href: "/buyer/offers", label: t("myOffers"), badge: openOffers || undefined },
        { href: "/buyer/saved", label: t("savedListings"), badge: saved || undefined },
        { href: "/deals", label: "Deals" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
