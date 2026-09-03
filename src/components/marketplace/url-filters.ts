"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

/**
 * Every filter is URL state: a view is shareable, back-button-safe and
 * server-rendered. Nothing filters in the client.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const get = useCallback((key: string) => search.get(key) ?? "", [search]);

  const getList = useCallback(
    (key: string) => (search.get(key) ?? "").split(",").filter(Boolean),
    [search],
  );

  const set = useCallback(
    (updates: Record<string, string | string[] | undefined | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(updates)) {
        const v = Array.isArray(value) ? value.join(",") : value;
        if (v === undefined || v === null || v === "") next.delete(key);
        else next.set(key, v);
      }
      if (opts?.resetPage !== false) next.delete("page");
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}` as never, { scroll: false });
    },
    [router, pathname, search],
  );

  const toggleInList = useCallback(
    (key: string, value: string) => {
      const current = getList(key);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      set({ [key]: next });
    },
    [getList, set],
  );

  const clearAll = useCallback(() => {
    const keep = new URLSearchParams();
    const sort = search.get("sort");
    const view = search.get("view");
    if (sort) keep.set("sort", sort);
    if (view) keep.set("view", view);
    const qs = keep.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}` as never, { scroll: false });
  }, [router, pathname, search]);

  const activeCount = [...search.keys()].filter((k) => !["sort", "view", "page"].includes(k)).length;

  return { get, getList, set, toggleInList, clearAll, activeCount, search };
}
