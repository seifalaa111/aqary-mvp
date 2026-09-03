import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export const dynamic = "force-dynamic";

export default async function DealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER", "SELLER", "ANALYST", "ADMIN");
  const isAr = locale === "ar";

  const deals = await prisma.deal.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }, { coordinatorId: user.id }] },
    orderBy: { createdAt: "desc" },
    include: {
      milestones: { orderBy: { order: "asc" } },
      listing: {
        select: {
          reference: true,
          contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true, city: true } } } } } },
          media: { where: { moderationStatus: "APPROVED" }, orderBy: [{ isCover: "desc" }], take: 1, select: { variants: true, altEn: true } },
        },
      },
    },
  });

  if (deals.length === 0) {
    return (
      <EmptyState
        title={isAr ? "لا توجد صفقات بعد" : "No deals yet"}
        body={isAr ? "تُفتح غرفة الصفقة بمجرد قبول عرض." : "A deal room opens the moment an offer is accepted."}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="mb-6 display-section text-ink">{isAr ? "الصفقات" : "Deals"}</h1>
      <div className="flex flex-col gap-4">
        {deals.map((d) => {
          const done = d.milestones.filter((m) => m.status === "COMPLETED").length;
          const pct = Math.round((done / Math.max(1, d.milestones.length)) * 100);
          const next = d.milestones.find((m) => m.status !== "COMPLETED");
          const cover = (d.listing.media[0]?.variants as { thumb?: string } | undefined)?.thumb;
          const project = d.listing.contract.unit.project;

          return (
            <Link key={d.id} href={`/deals/${d.id}`}>
              <Card className="transition-shadow hover:shadow-e2">
                <CardBody className="flex flex-wrap items-center gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-paper-sunken">
                    {cover ? <Image src={cover} alt={d.listing.media[0]!.altEn} fill sizes="80px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xs text-ink-30">{d.reference}</span>
                      <Badge tone={d.status === "COMPLETED" ? "verified" : "info"}>{d.status.toLowerCase()}</Badge>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {isAr ? project.nameAr : project.nameEn} · {d.listing.contract.unit.unitCode}
                    </p>
                    <p className="text-xs text-ink-50">
                      {project.city} · {isAr ? "فُتحت" : "opened"} {relativeTime(d.createdAt, locale)}
                    </p>
                    <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-paper-sunken">
                      <div className="h-full rounded-full bg-verified" style={{ width: `${pct}%` }} />
                    </div>
                    {next ? <p className="mt-1 text-2xs text-ink-30">next: {next.key.replace(/_/g, " ").toLowerCase()}</p> : null}
                  </div>
                  <div className="text-end">
                    <p className="eyebrow mb-1">{isAr ? "المبلغ" : "Cash"}</p>
                    <p className="money text-money-sm font-semibold text-ink">{egp(d.cashToSeller, { style: "compact" })}</p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
