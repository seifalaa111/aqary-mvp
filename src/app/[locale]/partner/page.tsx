import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireDeveloperPartnerAccess } from "@/lib/auth/guard";
import { egp, formatDate, relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Eyebrow } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export const dynamic = "force-dynamic";

/** Operational, tenant-scoped developer assignment inbox. */
export default async function PartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const access = await requireDeveloperPartnerAccess();
  const developerIds =
    access.developerIds ??
    (await prisma.developer.findMany({ select: { id: true } })).map((developer) => developer.id);
  const [developers, deals] = await Promise.all([
    prisma.developer.findMany({
      where: { id: { in: developerIds } },
      include: { policy: true, _count: { select: { projects: true } } },
      orderBy: { nameEn: "asc" },
    }),
    prisma.deal.findMany({
      where: { developerId: { in: developerIds } },
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          select: {
            reference: true,
            verifiedAmountPaid: true,
            outstandingBalance: true,
            deliveryDate: true,
            contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true } } } } } },
          },
        },
        buyer: { select: { fullNameEn: true, kycStatus: true, buyerProfile: { select: { tier: true } } } },
        seller: { select: { fullNameEn: true } },
        milestones: { orderBy: { order: "asc" } },
      },
    }),
  ]);

  const active = deals.filter((deal) => deal.status === "ACTIVE");
  const completed = deals.filter((deal) => deal.status === "COMPLETED");
  const blocked = active.filter((deal) => deal.milestones.some((milestone) => milestone.status === "BLOCKED"));
  const outstanding = active.reduce((sum, deal) => sum + Number(deal.listing.outstandingBalance ?? 0), 0);
  const isAr = locale === "ar";

  return (
    <WorkspaceShell
      locale={locale}
      role={access.user.activeRole}
      nav={[
        { href: "/partner", label: isAr ? "بوابة المطوّر" : "Developer portal" },
        { href: "/deals", label: isAr ? "الطلبات" : "Assignment requests", badge: active.length || undefined },
      ]}
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>{isAr ? "عمليات التنازل" : "Assignment operations"}</Eyebrow>
            <h1 className="mt-2 display-section text-ink">{isAr ? "طلبات منظمتك" : "Your organisation’s requests"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-50">
              {isAr
                ? "لا تظهر هنا إلا العقود المرتبطة بجهات التطوير التي تم تعيين حسابك لها."
                : "This inbox contains only contracts for developer organisations assigned to your account."}
            </p>
          </div>
          <Badge tone="verified">{developers.length} {isAr ? "جهة مطوّر" : "developer tenants"}</Badge>
        </header>

        <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={isAr ? "قيد التنفيذ" : "In progress"} value={String(active.length)} />
          <Metric label={isAr ? "محجوب" : "Blocked"} value={String(blocked.length)} />
          <Metric label={isAr ? "مكتمل" : "Completed"} value={String(completed.length)} />
          <Metric label={isAr ? "محفظة متبقية" : "Outstanding portfolio"} value={egp(outstanding, { style: "compact" })} />
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <Eyebrow>{isAr ? "طلبات التنازل" : "Assignment requests"}</Eyebrow>
              <h2 className="mt-1 text-xl font-semibold text-ink">{isAr ? "الملفات التي تتطلب إجراءً" : "Files requiring action"}</h2>
            </div>
            <Link href="/deals" className="text-xs font-medium text-ink underline underline-offset-4">
              {isAr ? "كل غرف الصفقات" : "All deal workspaces"}
            </Link>
          </div>
          {deals.length === 0 ? (
            <EmptyState
              title={isAr ? "لا توجد طلبات" : "No assignment requests"}
              body={isAr ? "ستظهر الطلبات هنا بعد قبول عرض على عقد تابع لمنظمتك." : "Requests appear here after an offer on one of your contracts is accepted."}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-paper-sunken/60">
                  <tr className="rule-b">
                    <th className="p-3 text-start text-2xs font-medium text-ink-50">Contract / unit</th>
                    <th className="p-3 text-start text-2xs font-medium text-ink-50">Seller / buyer</th>
                    <th className="p-3 text-end text-2xs font-medium text-ink-50">Paid / outstanding</th>
                    <th className="p-3 text-start text-2xs font-medium text-ink-50">Next action</th>
                    <th className="p-3 text-start text-2xs font-medium text-ink-50">Delivery</th>
                    <th className="p-3 text-end text-2xs font-medium text-ink-50">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => {
                    const next = deal.milestones.find((milestone) => milestone.status !== "COMPLETED");
                    const project = deal.listing.contract.unit.project;
                    const blocker = deal.milestones.find((milestone) => milestone.status === "BLOCKED");
                    return (
                      <tr key={deal.id} className="rule-b last:border-0">
                        <td className="p-3">
                          <Link href={"/deals/" + deal.id} className="font-medium text-ink hover:underline">
                            {isAr ? project.nameAr : project.nameEn} · {deal.listing.contract.unit.unitCode}
                          </Link>
                          <span className="mt-0.5 block font-mono text-2xs text-ink-30">{deal.reference} · {deal.listing.reference}</span>
                        </td>
                        <td className="p-3 text-xs text-ink-70">
                          <span className="block">{deal.seller.fullNameEn}</span>
                          <span className="block">{deal.buyer.fullNameEn} · {deal.buyer.kycStatus.toLowerCase()} / {deal.buyer.buyerProfile?.tier?.toLowerCase() ?? "browser"}</span>
                        </td>
                        <td className="p-3 text-end">
                          <span className="money block text-xs text-ink">{egp(deal.listing.verifiedAmountPaid, { style: "compact" })}</span>
                          <span className="money block text-2xs text-ink-50">{egp(deal.listing.outstandingBalance, { style: "compact" })}</span>
                        </td>
                        <td className="p-3">
                          <Badge tone={blocker ? "flagged" : next?.ownerRole === "DEVELOPER_PARTNER" ? "info" : "neutral"}>
                            {blocker ? "Blocked: " + (blocker.blockedReason ?? "needs resolution") : (next?.key ?? "complete").replace(/_/g, " ").toLowerCase()}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-ink-50">{formatDate(deal.listing.deliveryDate, locale)}</td>
                        <td className="p-3 text-end text-2xs text-ink-30">{relativeTime(deal.createdAt, locale)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {developers.map((developer) => (
            <Card key={developer.id}>
              <CardHeader><CardTitle>{isAr ? developer.nameAr : developer.nameEn}</CardTitle></CardHeader>
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
                  <Term label="Projects" value={String(developer._count.projects)} />
                  <Term label="Assignment eligibility" value={developer.policy?.assignmentAllowed.toLowerCase() ?? "unknown"} />
                  <Term label="Minimum paid" value={developer.policy?.minPercentPaidBps ? developer.policy.minPercentPaidBps / 100 + "%" : "Not recorded"} />
                  <Term label="Typical NOC" value={developer.policy?.typicalNocDays ? developer.policy.typicalNocDays + " days" : "Not recorded"} />
                </dl>
                <p className="mt-4 text-2xs leading-relaxed text-ink-50">{isAr ? developer.policy?.conditionsAr : developer.policy?.conditionsEn}</p>
              </CardBody>
            </Card>
          ))}
        </section>
      </div>
    </WorkspaceShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardBody><p className="eyebrow">{label}</p><p className="mt-2 money text-money-md font-semibold text-ink">{value}</p></CardBody></Card>;
}

function Term({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-ink-50">{label}</dt><dd className="mt-0.5 font-medium text-ink">{value}</dd></div>;
}
