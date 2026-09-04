import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, CardTitle, Eyebrow } from "@/components/ui/primitives";
import { KycChecklist, ChecklistSlot } from "@/components/buyer/kyc-checklist";

export const dynamic = "force-dynamic";

export default async function BuyerVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyerNav" });
  const tk = await getTranslations({ locale, namespace: "kycState" });
  const td = await getTranslations({ locale, namespace: "docType" });

  const docs = await prisma.document.findMany({
    where: { ownerId: user.id, listingId: null },
    orderBy: { createdAt: "desc" },
  });

  const findDoc = (type: string) => {
    const found = docs.find((d) => d.type === type);
    if (!found) return null;
    return {
      id: found.id,
      type: found.type,
      fileName: found.fileName,
      status: found.status,
      rejectionReason: found.rejectionReason,
      createdAt: found.createdAt.toISOString(),
    };
  };

  const slots: ChecklistSlot[] = [
    {
      type: "NATIONAL_ID_FRONT",
      title: td("NATIONAL_ID_FRONT"),
      description: "Front face of your valid Egyptian National ID card showing national number and photo.",
      required: true,
      doc: findDoc("NATIONAL_ID_FRONT"),
    },
    {
      type: "NATIONAL_ID_BACK",
      title: td("NATIONAL_ID_BACK"),
      description: "Back face of your Egyptian National ID card.",
      required: false,
      doc: findDoc("NATIONAL_ID_BACK"),
    },
    {
      type: "PASSPORT",
      title: td("PASSPORT"),
      description: "Valid passport photo page (required for non-Egyptian citizens or expats).",
      required: false,
      doc: findDoc("PASSPORT"),
    },
    {
      type: "PROOF_OF_ADDRESS",
      title: td("PROOF_OF_ADDRESS"),
      description: "Recent utility bill (electricity, water, gas) or bank statement showing residential address.",
      required: true,
      doc: findDoc("PROOF_OF_ADDRESS"),
    },
    {
      type: "PROOF_OF_FUNDS",
      title: td("PROOF_OF_FUNDS"),
      description: "Bank statement (last 3 months) or certificate of deposit to unlock Priority Tier status.",
      required: false,
      doc: findDoc("PROOF_OF_FUNDS"),
    },
    {
      type: "EMPLOYMENT_PROOF",
      title: td("EMPLOYMENT_PROOF"),
      description: "HR salary certificate or company commercial register if self-employed.",
      required: false,
      doc: findDoc("EMPLOYMENT_PROOF"),
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>{t("verification")}</Eyebrow>
            <h1 className="mt-1 font-display text-2xl text-ink md:text-3xl">Identity & KYC Verification</h1>
            <p className="mt-1 text-sm text-ink-50">
              Upload your identification documents to activate full buying privileges and make binding offers.
            </p>
          </div>
          <Badge
            tone={
              user.kycStatus === "VERIFIED"
                ? "verified"
                : user.kycStatus === "REJECTED"
                  ? "flagged"
                  : "pending"
            }
          >
            {user.kycStatus}
          </Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Required Verification Checklist</CardTitle>
        </CardHeader>
        <CardBody>
          <KycChecklist slots={slots} locale={locale} />
        </CardBody>
      </Card>
    </div>
  );
}
