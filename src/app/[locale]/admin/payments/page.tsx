import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { PaymentsManager, type PaymentRowItem } from "@/components/admin/payments-manager";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const payments = await prisma.payment.findMany({
    take: 60,
    orderBy: { createdAt: "desc" },
    include: {
      deal: {
        select: {
          id: true,
          reference: true,
          listing: {
            select: {
              reference: true,
              contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true } } } } } },
            },
          },
        },
      },
      events: { orderBy: { at: "desc" } },
    },
  });

  const rows: PaymentRowItem[] = payments.map((p) => ({
    id: p.id,
    dealId: p.dealId,
    dealReference: p.deal.reference,
    unitCode: p.deal.listing.contract.unit.unitCode,
    projectName: p.deal.listing.contract.unit.project.nameEn,
    kind: p.kind,
    status: p.status,
    amount: p.amount.toString(),
    provider: p.provider,
    providerRef: p.providerRef,
    failureCode: p.failureCode,
    failureReason: p.failureReason,
    attempts: p.attempts,
    createdAt: p.createdAt.toISOString(),
    settledAt: p.settledAt ? p.settledAt.toISOString() : null,
    events: p.events.map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      createdAt: e.at.toISOString(),
    })),
  }));

  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "العمليات المالية" : "Financial Operations"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "إدارة المدفوعات والتحصيل" : "Payment Operations & Settlement"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "متابعة عمليات السداد، إعادة المحاولة للمدفوعات المتعثرة، المطابقة مع بوابة الدفع، والتسويات الاستثنائية."
            : "Supervise payment gateway transactions, inspect event logs, trigger safe retries, and record authorized bank exceptions."}
        </p>
      </header>

      <PaymentsManager locale={locale} payments={rows} />
    </div>
  );
}
