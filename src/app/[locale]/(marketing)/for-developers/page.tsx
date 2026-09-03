import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { egp } from "@/lib/format";
import { Button, Card, CardBody, Eyebrow, Callout, buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function ForDevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tp = await getTranslations({ locale, namespace: "partner" });
  const isAr = locale === "ar";

  const [live, exposureAgg, completed, reasons] = await Promise.all([
    prisma.listing.count({ where: { status: { in: ["LISTED", "UNDER_OFFER"] } } }),
    prisma.listing.aggregate({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
      _sum: { outstandingBalance: true },
    }),
    prisma.deal.count({ where: { status: "COMPLETED" } }),
    prisma.listing.groupBy({ by: ["exitReason"], _count: true, where: { exitReason: { not: null } } }),
  ]);

  const topReason = reasons.slice().sort((a, b) => b._count - a._count)[0];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-12 md:px-8 md:py-20">
      <Eyebrow>{t("devEyebrow")}</Eyebrow>
      <h1 className="mb-5 mt-2 display-hero text-ink">{t("devTitle")}</h1>
      <p className="mb-12 max-w-2xl text-md leading-relaxed text-ink-70">{t("devSub")}</p>

      <dl className="mb-14 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
        <Stat label={isAr ? "عقود تبحث عن مخرج" : "Contracts seeking an exit"} value={String(live)} />
        <Stat
          label={isAr ? "التزامات أقساط قائمة عليها" : "Outstanding instalments on them"}
          value={egp(exposureAgg._sum.outstandingBalance ?? 0, { style: "compact" })}
        />
        <Stat label={isAr ? "تنازلات مكتملة" : "Assignments completed"} value={String(completed)} />
      </dl>

      <div className="mb-14 grid gap-6 md:grid-cols-3">
        {[
          {
            en: ["A paying account instead of a distressed one", "An assignment replaces a holder who has stopped paying with one who can continue, at the same contractual price. Collection continues; the unit is not reclaimed and repriced."],
            ar: ["حساب منتظم بدل حساب متعثر", "التنازل يستبدل مالكًا توقف عن السداد بآخر قادر على الاستمرار، بنفس السعر التعاقدي. يستمر التحصيل ولا تُسترد الوحدة."],
          },
          {
            en: ["A verified counterparty", "Every buyer reaching your assignment desk has been through identity checks and a financial profile, and every figure on the file has been confirmed by a human analyst against documents."],
            ar: ["طرف مقابل موثّق", "كل مشترٍ يصل إلى مكتب التنازل لديك مرّ بفحص هوية وملف مالي، وكل رقم في الملف اعتمده محلل بشري مقابل المستندات."],
          },
          {
            en: ["Distress signal, earlier", "Holders tell us why they are exiting at intake. Aggregated, that is an early view of where payment stress is building in your backlog."],
            ar: ["إشارة تعثر مبكرة", "يخبرنا المالكون بسبب الخروج عند التسجيل. مجمّعًا، هذا مؤشر مبكر على مواضع ضغط السداد في محفظتك."],
          },
        ].map((item, i) => {
          const [title, body] = isAr ? item.ar : item.en;
          return (
            <Card key={i}>
              <CardBody>
                <span className="money mb-4 block font-mono text-2xs tracking-widest text-brass">
                  0{i + 1}
                </span>
                <h2 className="mb-2 font-sans text-sm font-semibold text-ink">{title}</h2>
                <p className="text-xs leading-relaxed text-ink-50">{body}</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {topReason ? (
        <div className="mb-10">
          <Callout tone="info" title={isAr ? "من بيانات هذه النسخة" : "From this build's own data"}>
            {isAr
              ? `أكثر سبب معلن للخروج حاليًا هو «${(topReason.exitReason ?? "").replace(/_/g, " ").toLowerCase()}» بواقع ${topReason._count} عقد.`
              : `The most common stated reason for exiting right now is “${(topReason.exitReason ?? "").replace(/_/g, " ").toLowerCase()}”, on ${topReason._count} contracts.`}
          </Callout>
        </div>
      ) : null}

      <div className="rounded-lg border border-pending/30 bg-pending-soft p-6">
        <h2 className="mb-2 font-display text-lg text-ink">{tp("previewBadge")}</h2>
        <p className="text-sm leading-relaxed text-ink-70">{tp("previewNote")}</p>
        <p className="mt-3 text-2xs leading-relaxed text-ink-50">
          {isAr
            ? "لا توجد اتفاقية شراكة قائمة مع أي مطوّر مذكور في هذه النسخة، وكل سياسات التنازل المعروضة بيانات تجريبية."
            : "No partnership agreement is in place with any developer named in this build, and every assignment policy shown is synthetic. See ASSUMPTIONS.md."}
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/opportunities" className={buttonClass("primary", "lg")}>
            {t("liveCta")}
          </Link>
        <Link href="/how-it-works" className={buttonClass("secondary", "lg")}>
            {t("howEyebrow")}
          </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-raised p-6">
      <dd className="money text-money-lg font-semibold tracking-tight text-ink">{value}</dd>
      <dt className="mt-2 text-xs leading-snug text-ink-50">{label}</dt>
    </div>
  );
}
