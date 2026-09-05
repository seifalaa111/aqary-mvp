import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export const dynamic = "force-dynamic";

const STAGES = [
  { key: "OFFER_ACCEPTED", labelEn: "1. Offer Accepted", labelAr: "١. قبول العرض" },
  { key: "RESERVATION_DEPOSIT", labelEn: "2. Reservation", labelAr: "٢. جدية الحجز" },
  { key: "DEVELOPER_NOC_REQUESTED", labelEn: "3. Developer NOC", labelAr: "٣. عدم ممانعة المطور" },
  { key: "ASSIGNMENT_APPOINTMENT", labelEn: "4. Appointment", labelAr: "٤. موعد التنازل" },
  { key: "DOCUMENTS_SIGNED", labelEn: "5. Documents Signed", labelAr: "٥. توقيع العقود" },
  { key: "ASSIGNMENT_REGISTERED", labelEn: "6. Registered", labelAr: "٦. تسجيل التنازل" },
  { key: "COMPLETED", labelEn: "7. Completed", labelAr: "٧. مكتملة" },
] as const;

export default async function AdminPipelinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const deals = await prisma.deal.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      milestones: { orderBy: { order: "asc" } },
      listing: {
        select: {
          reference: true,
          contract: {
            select: {
              unit: {
                select: {
                  unitCode: true,
                  project: { select: { nameEn: true, nameAr: true, developer: { select: { nameEn: true } } } },
                },
              },
            },
          },
        },
      },
      buyer: { select: { fullNameEn: true } },
      seller: { select: { fullNameEn: true } },
      coordinator: { select: { fullNameEn: true } },
      payments: { select: { status: true, kind: true, amount: true } },
    },
  });

  const isAr = locale === "ar";

  const stageOf = (d: (typeof deals)[number]) => {
    if (d.status === "COMPLETED") return "COMPLETED";
    const open = d.milestones.find((m) => m.status !== "COMPLETED");
    if (!open) return "COMPLETED";
    // Map milestone key to one of our 7 stages
    if (["CASH_RELEASED_TO_SELLER", "PLATFORM_FEE_COLLECTED"].includes(open.key)) {
      return "COMPLETED";
    }
    return open.key;
  };

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "إدارة التدفق المالي والصفقات" : "Deal Oversight"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "مسار الصفقات عبر مراحل التنازل" : "7-Stage Deal Pipeline"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "متابعة شاملة لجميع الصفقات من قبول العرض حتى تسليم الشيكات والرسوم وتسجيل التنازل."
            : "Monitor transactions from offer acceptance through developer NOC, assignment signing, and completion."}
        </p>
      </header>

      {deals.length === 0 ? (
        <EmptyState
          title={isAr ? "لا توجد صفقات جارية" : "No deals in pipeline yet"}
          body={isAr ? "تفتح غرفة الصفقة بمجرد قبول البائع لعرض المشتري." : "Deal rooms open when a seller accepts a buyer offer."}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {STAGES.map((stage) => {
            const inStage = deals.filter((d) => stageOf(d) === stage.key);
            return (
              <div key={stage.key} className="w-72 shrink-0">
                <div className="mb-3 flex items-center justify-between border-b border-rule pb-2">
                  <h2 className="text-xs font-semibold text-ink">
                    {isAr ? stage.labelAr : stage.labelEn}
                  </h2>
                  <span className="money rounded-xs bg-ink px-1.5 text-2xs text-ink-text">
                    {inStage.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {inStage.map((d) => {
                    const currentMilestone = d.milestones.find((m) => m.status !== "COMPLETED") ?? d.milestones[d.milestones.length - 1];
                    const isBlocked = d.milestones.some((m) => m.status === "BLOCKED");
                    const failedPayment = d.payments.some((p) => p.status === "FAILED");

                    return (
                      <Link key={d.id} href={`/deals/${d.id}`}>
                        <Card className={cn(
                          "transition-shadow hover:shadow-md border",
                          isBlocked || failedPayment ? "border-flagged/60 bg-flagged-soft/20" : "border-rule bg-paper-raised"
                        )}>
                          <CardBody className="p-3.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-2xs text-ink-50 font-semibold">{d.reference}</span>
                              <span className="text-[10px] text-ink-30">{relativeTime(d.createdAt, locale)}</span>
                            </div>

                            <div>
                              <p className="truncate text-xs font-semibold text-ink">
                                {isAr ? d.listing.contract.unit.project.nameAr : d.listing.contract.unit.project.nameEn} · {d.listing.contract.unit.unitCode}
                              </p>
                              <p className="text-2xs text-ink-50">
                                Dev: {d.listing.contract.unit.project.developer.nameEn}
                              </p>
                            </div>

                            <div className="flex items-baseline justify-between pt-1 border-t border-rule/60">
                              <span className="money text-xs font-bold text-ink">
                                {egp(d.cashToSeller.toString(), { style: "compact" })}
                              </span>
                              <span className="text-2xs text-ink-50">
                                {d.buyer.fullNameEn.split(" ")[0]} ← {d.seller.fullNameEn.split(" ")[0]}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {isBlocked && (
                                <Badge tone="flagged">BLOCKED</Badge>
                              )}
                              {failedPayment && (
                                <Badge tone="flagged">PAYMENT FAILED</Badge>
                              )}
                              {!isBlocked && !failedPayment && (
                                <Badge tone={d.status === "COMPLETED" ? "verified" : "info"}>
                                  {d.status}
                                </Badge>
                              )}
                              {d.coordinator && (
                                <span className="text-[10px] text-ink-50 ms-auto">
                                  Lead: {d.coordinator.fullNameEn.split(" ")[0]}
                                </span>
                              )}
                            </div>

                            {currentMilestone?.blockedReason && (
                              <p className="text-2xs text-flagged bg-flagged-soft p-1.5 rounded-sm">
                                {currentMilestone.blockedReason}
                              </p>
                            )}
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
    </div>
  );
}
