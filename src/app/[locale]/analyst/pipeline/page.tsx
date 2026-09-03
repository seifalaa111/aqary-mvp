import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "OFFER_ACCEPTED",
  "RESERVATION_DEPOSIT",
  "DEVELOPER_NOC_REQUESTED",
  "ASSIGNMENT_APPOINTMENT",
  "DOCUMENTS_SIGNED",
  "ASSIGNMENT_REGISTERED",
  "CASH_RELEASED_TO_SELLER",
  "PLATFORM_FEE_COLLECTED",
  "COMPLETED",
] as const;

/** Deal pipeline, grouped by the milestone each deal is actually sitting on. */
export default async function PipelinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });
  const tm = await getTranslations({ locale, namespace: "milestone" });

  const deals = await prisma.deal.findMany({
    include: {
      milestones: { orderBy: { order: "asc" } },
      listing: { select: { reference: true, contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true } } } } } } } },
      buyer: { select: { fullNameEn: true } },
      seller: { select: { fullNameEn: true } },
      coordinator: { select: { fullNameEn: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const stageOf = (d: (typeof deals)[number]) => {
    const open = d.milestones.find((m) => m.status !== "COMPLETED");
    return open?.key ?? "COMPLETED";
  };

  return (
    <>
      <Eyebrow>{t("console")}</Eyebrow>
      <h1 className="mb-6 mt-1 display-section text-ink">{t("pipeline")}</h1>

      {deals.length === 0 ? (
        <EmptyState title="No deals in the pipeline yet" body="A deal room opens the moment an offer is accepted." />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {COLUMNS.map((col) => {
            const inCol = deals.filter((d) => stageOf(d) === col);
            return (
              <div key={col} className="w-64 shrink-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-medium text-ink-70">{tm(col)}</h2>
                  <Badge tone="neutral">{inCol.length}</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {inCol.map((d) => {
                    const blocked = d.milestones.some((m) => m.status === "BLOCKED");
                    return (
                      <Link key={d.id} href={`/deals/${d.id}`}>
                        <Card className={cn("transition-shadow hover:shadow-e2", blocked && "border-flagged/40")}>
                          <CardBody className="p-3">
                            <p className="font-mono text-2xs text-ink-30">{d.reference}</p>
                            <p className="truncate text-sm font-medium text-ink">
                              {d.listing.contract.unit.project.nameEn}
                            </p>
                            <p className="money mt-1 text-sm font-semibold text-ink">
                              {egp(d.cashToSeller, { style: "compact" })}
                            </p>
                            <p className="mt-1 text-2xs text-ink-30">
                              {d.buyer.fullNameEn.split(" ")[0]} ← {d.seller.fullNameEn.split(" ")[0]}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              <Badge tone={d.status === "COMPLETED" ? "verified" : blocked ? "flagged" : "info"}>
                                {blocked ? "blocked" : d.status.toLowerCase()}
                              </Badge>
                              <span className="text-[10px] text-ink-30">{relativeTime(d.createdAt, locale)}</span>
                            </div>
                          </CardBody>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
