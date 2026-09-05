import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { AuthorizationError, requireDealAccess } from "@/lib/auth/guard";
import { auditTrail } from "@/lib/audit";
import { MILESTONES } from "@/lib/services/deals";
import { maskPhone } from "@/lib/domain/national-id";
import { DealRoom } from "@/components/deals/deal-room";

export const dynamic = "force-dynamic";

export default async function DealPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  let access;
  try {
    access = await requireDealAccess(id);
  } catch (err) {
    if (err instanceof AuthorizationError) notFound();
    throw err;
  }
  const { user, party } = access;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      listing: {
        select: {
          id: true,
          reference: true,
          status: true,
          totalContractPrice: true,
          outstandingBalance: true,
          installmentAmount: true,
          installmentFrequency: true,
          deliveryDate: true,
          contract: {
            select: {
              unit: {
                select: {
                  unitCode: true,
                  bedrooms: true,
                  buaSqm: true,
                  project: {
                    select: {
                      nameEn: true,
                      nameAr: true,
                      city: true,
                      // Name only. The policy terms this deal runs under come
                      // from the snapshot frozen on the deal, not from whatever
                      // the developer's policy happens to say today.
                      developer: { select: { nameEn: true } },
                    },
                  },
                },
              },
            },
          },
          media: {
            where: { moderationStatus: "APPROVED" },
            orderBy: [{ isCover: "desc" }, { order: "asc" }],
            take: 1,
            select: { variants: true, altEn: true },
          },
          documents: {
            orderBy: { createdAt: "desc" },
            select: { id: true, type: true, fileName: true, storageKey: true, status: true },
          },
        },
      },
      buyer: { select: { id: true, fullNameEn: true, phone: true, email: true, avatarColor: true } },
      seller: { select: { id: true, fullNameEn: true, phone: true, email: true, avatarColor: true } },
      coordinator: { select: { id: true, fullNameEn: true, phone: true, email: true, avatarColor: true } },
      milestones: { orderBy: { order: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { events: { orderBy: { at: "asc" } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, fullNameEn: true, avatarColor: true } } } },
      offer: { select: { amount: true, proposedCompletionDays: true } },
    },
  });

  if (!deal) notFound();

  const trail = await auditTrail("Deal", id, 50);

  // The policy terms in force when this deal opened. Stored as JSON on the deal
  // so a later policy edit cannot rewrite an in-flight assignment's terms.
  const snapshot = (deal.developerPolicySnapshot ?? {}) as {
    requiredDocuments?: string[];
    typicalNocDays?: number | null;
  };
  const policySnapshot = {
    requiredDocuments: Array.isArray(snapshot.requiredDocuments) ? snapshot.requiredDocuments : [],
    typicalNocDays: typeof snapshot.typicalNocDays === "number" ? snapshot.typicalNocDays : null,
  };

  // Contact details stay masked until the reservation deposit clears.
  const contact = (u: { fullNameEn: string; phone: string; email: string | null }) =>
    deal.contactUnmasked
      ? { name: u.fullNameEn, phone: u.phone, email: u.email }
      : { name: `${u.fullNameEn.split(" ")[0]} ${u.fullNameEn.split(" ")[1]?.[0] ?? ""}.`, phone: maskPhone(u.phone), email: null };

  return (
    <DealRoom
      locale={locale}
      viewer={{ id: user.id, party, activeRole: user.activeRole }}
      deal={{
        id: deal.id,
        reference: deal.reference,
        status: deal.status,
        cashToSeller: deal.cashToSeller.toString(),
        platformFee: deal.platformFee.toString(),
        developerAssignmentFee: deal.developerAssignmentFee.toString(),
        reservationDeposit: deal.reservationDeposit.toString(),
        contactUnmasked: deal.contactUnmasked,
        createdAt: deal.createdAt.toISOString(),
        completedAt: deal.completedAt?.toISOString() ?? null,
        buyerRating: deal.buyerRating,
        sellerRating: deal.sellerRating,
        outcomeNotes: deal.outcomeNotes,
        offerAmount: deal.offer.amount.toString(),
        completionDays: deal.offer.proposedCompletionDays,
      }}
      listing={{
        id: deal.listing.id,
        reference: deal.listing.reference,
        project: deal.listing.contract.unit.project.nameEn,
        projectAr: deal.listing.contract.unit.project.nameAr,
        city: deal.listing.contract.unit.project.city,
        developer: deal.listing.contract.unit.project.developer.nameEn,
        unitCode: deal.listing.contract.unit.unitCode,
        bedrooms: deal.listing.contract.unit.bedrooms,
        buaSqm: deal.listing.contract.unit.buaSqm.toString(),
        outstandingBalance: deal.listing.outstandingBalance?.toString() ?? null,
        installmentAmount: deal.listing.installmentAmount?.toString() ?? null,
        installmentFrequency: deal.listing.installmentFrequency,
        deliveryDate: deal.listing.deliveryDate?.toISOString() ?? null,
        cover: (deal.listing.media[0]?.variants as { card?: string } | undefined)?.card ?? null,
        coverAlt: deal.listing.media[0]?.altEn ?? "",
        // Deal.developerPolicySnapshot is an immutable copy taken when the deal
        // opened. Reading the live policy here let an admin policy edit
        // retroactively change what an in-flight assignment requires — the
        // exact silent rewrite the snapshot exists to prevent.
        requiredDocuments: policySnapshot.requiredDocuments,
        nocDays: policySnapshot.typicalNocDays,
        documents: deal.listing.documents,
      }}
      parties={{
        buyer: { ...contact(deal.buyer), color: deal.buyer.avatarColor, isYou: deal.buyer.id === user.id },
        seller: { ...contact(deal.seller), color: deal.seller.avatarColor, isYou: deal.seller.id === user.id },
        coordinator: deal.coordinator
          ? {
              name: deal.coordinator.fullNameEn,
              phone: deal.coordinator.phone,
              email: deal.coordinator.email,
              color: deal.coordinator.avatarColor,
              isYou: deal.coordinator.id === user.id,
            }
          : null,
      }}
      milestones={deal.milestones.map((m) => {
        const spec = MILESTONES.find((s) => s.key === m.key)!;
        return {
          key: m.key,
          order: m.order,
          status: m.status,
          ownerRole: m.ownerRole,
          dueDate: m.dueDate?.toISOString() ?? null,
          completedAt: m.completedAt?.toISOString() ?? null,
          blockedReason: m.blockedReason,
          notes: m.notes,
          requiredDocuments: m.requiredDocuments,
          titleEn: spec.titleEn,
          titleAr: spec.titleAr,
          descriptionEn: spec.descriptionEn,
          requiresPayment: spec.requiresPayment ?? null,
        };
      })}
      payments={deal.payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        amount: p.amount.toString(),
        status: p.status,
        provider: p.provider,
        providerRef: p.providerRef,
        instructionRef: p.instructionRef,
        idempotencyKey: p.idempotencyKey,
        failureCode: p.failureCode,
        failureReason: p.failureReason,
        attempts: p.attempts,
        createdAt: p.createdAt.toISOString(),
        settledAt: p.settledAt?.toISOString() ?? null,
        events: p.events.map((e) => ({ type: e.type, at: e.at.toISOString() })),
      }))}
      messages={deal.messages.map((m) => ({
        id: m.id,
        body: m.body,
        isSystem: m.isSystem,
        senderId: m.senderId,
        senderName: m.sender?.fullNameEn ?? null,
        senderColor: m.sender?.avatarColor ?? null,
        createdAt: m.createdAt.toISOString(),
      }))}
      events={trail.map((e) => ({
        id: e.id,
        action: e.action,
        actor: e.actor?.fullNameEn ?? null,
        at: e.at.toISOString(),
        metadata: e.metadata,
      }))}
    />
  );
}
