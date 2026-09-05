"use client";

import { useEffect, useRef } from "react";
import { recordListingView } from "@/app/actions/buyer";

/**
 * Records one view, once, after the page is live in a real browser.
 *
 * The counter used to be incremented inside the server render of the
 * opportunity page. That made a GET mutate domain state — every prefetch,
 * crawler and re-render inflated the number, and a failed write was swallowed.
 * Firing it from an effect means a view is what the name says: a person opened
 * the page.
 */
export function ViewRecorder({ listingId }: { listingId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    // React runs effects twice in development's strict mode; the ref keeps one
    // mount to one view.
    if (fired.current) return;
    fired.current = true;
    void recordListingView(listingId);
  }, [listingId]);

  return null;
}
