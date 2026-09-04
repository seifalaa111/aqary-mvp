import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/providers/storage";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { Badge } from "@/components/ui/badges";
import { formatDate } from "@/lib/format";
import { isSensitive, canReadWithConsent } from "@/lib/domain/document-access";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { page } = await searchParams;
  const td = await getTranslations({ locale, namespace: "docType" });
  const to = await getTranslations({ locale, namespace: "opportunity" });

  const user = await getSessionUser();
  if (!user) notFound();

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      pages: { orderBy: { pageNumber: "asc" } },
      listing: { select: { id: true, reference: true, status: true, sellerId: true } },
    },
  });
  if (!document) notFound();

  const isStaff = user.roles.includes("ANALYST") || user.roles.includes("ADMIN");
  const isOwner = document.ownerId === user.id;
  let allowed = isStaff || isOwner;

  if (!allowed && document.listingId && !isSensitive(document.type)) {
    const [consent, developerDeal] = await Promise.all([
      prisma.consent.findUnique({
        where: {
          userId_listingId_type: {
            userId: user.id,
            listingId: document.listingId,
            type: "BUYER_CONFIDENTIALITY",
          },
        },
      }),
      user.roles.includes("DEVELOPER_PARTNER")
        ? prisma.deal.findFirst({
            where: {
              listingId: document.listingId,
              developer: { partnerMembers: { some: { userId: user.id, active: true } } },
            },
            select: { id: true },
          })
        : null,
    ]);

    const isListingActive =
      document.listing &&
      ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"].includes(
        document.listing.status,
      );

    allowed =
      (canReadWithConsent(document.type) && Boolean(consent && consent.granted) && Boolean(isListingActive)) ||
      Boolean(developerDeal);
  }

  if (!allowed) {
    await audit({
      actorId: user.id,
      actorRole: user.activeRole,
      action: "ACCESS_DENIED",
      entityType: "Document",
      entityId: id,
    });
    notFound();
  }

  await audit({
    actorId: user.id,
    actorRole: user.activeRole,
    action: "DOCUMENT_ACCESSED",
    entityType: "Document",
    entityId: id,
    metadata: { listingId: document.listingId, pageCount: document.pageCount },
  });

  // Short-lived signed URLs, minted per request.
  const isPdf = document.mimeType === "application/pdf";
  const [pdfUrl, pages] = await Promise.all([
    isPdf ? storage().signedUrl(document.storageKey, 600) : Promise.resolve(undefined),
    Promise.all(
      document.pages.map(async (p) => ({
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        url: await storage().signedUrl(p.imageKey, 600),
      })),
    ),
  ]);

  const watermark = `${user.fullNameEn} · ${user.phone} · ${new Date().toISOString().slice(0, 10)}`;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8">
      <nav className="mb-5">
        {document.listing ? (
          <Link href={`/opportunities/${document.listing.id}`} className="text-xs text-ink-50 hover:text-ink">
            <span className="arrow-forward inline-block">←</span> {document.listing.reference}
          </Link>
        ) : null}
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">{td(document.type as "SALE_CONTRACT")}</p>
          <h1 className="font-display text-2xl text-ink">{document.fileName}</h1>
          <p className="mt-1 text-xs text-ink-50">
            {document.pageCount} page{document.pageCount === 1 ? "" : "s"} · uploaded{" "}
            {formatDate(document.createdAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Access logged</Badge>
          <Badge tone="neutral">Watermarked</Badge>
        </div>
      </header>

      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-50">{to("documentVaultSub")}</p>

      <DocumentViewer pages={pages} initialPage={Number(page ?? 1)} watermark={watermark} pdfUrl={pdfUrl} />
    </div>
  );
}
