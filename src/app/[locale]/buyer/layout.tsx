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
  const tn = await getTranslations({ locale, namespace: "nav" });
  const tbn = await getTranslations({ locale, namespace: "buyerNav" });

  const [openOffers, saved, docsCount] = await Promise.all([
    prisma.offer.count({ where: { buyerId: user.id, status: { in: ["PENDING", "COUNTERED"] } } }),
    prisma.savedListing.count({ where: { buyerId: user.id } }),
    prisma.document.count({ where: { ownerId: user.id, listingId: null } }),
  ]);

  return (
    <WorkspaceShell
      locale={locale}
      role="BUYER"
      nav={[
        { href: "/buyer", label: tbn("overview") },
        { href: "/buyer/verification", label: tbn("verification") },
        { href: "/buyer/capacity", label: tbn("capacity") },
        { href: "/buyer/matches", label: tbn("matches") },
        { href: "/opportunities", label: tn("marketplace") },
        { href: "/buyer/offers", label: tbn("offers"), badge: openOffers || undefined },
        { href: "/buyer/saved", label: tbn("saved"), badge: saved || undefined },
        { href: "/deals", label: tbn("deals") },
        { href: "/buyer/documents", label: tbn("documents"), badge: docsCount || undefined },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
