"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/primitives";
import { claimListing } from "@/app/actions/analyst";

export function ClaimButton({ listingId, label }: { listingId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await claimListing(listingId);
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
