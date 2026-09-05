"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Input, Select, Button, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { formatDate, relativeTime } from "@/lib/format";

export interface AuditEventRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRoles: string[];
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  at: string;
}

export function AuditViewer({
  locale,
  events,
  actionTypes,
  entityTypes,
  activeAction,
  activeEntity,
  nextCursor,
  matchingTotal,
}: {
  locale: string;
  events: AuditEventRow[];
  actionTypes: string[];
  entityTypes: string[];
  activeAction: string;
  activeEntity: string;
  nextCursor: string | null;
  matchingTotal: number;
}) {
  const router = useRouter();
  // Action and entity filter the query; search refines the page already loaded.
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null);

  const t = useTranslations("admin");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";

  const go = (next: { action?: string; entity?: string; cursor?: string | null }) => {
    const qs = new URLSearchParams();
    const a = next.action ?? activeAction;
    const e = next.entity ?? activeEntity;
    if (a && a !== "ALL") qs.set("action", a);
    if (e && e !== "ALL") qs.set("entity", e);
    // Any filter change restarts paging: a cursor from the previous filter
    // would silently skip rows.
    if (next.cursor) qs.set("cursor", next.cursor);
    router.push(`/admin/audit${qs.toString() ? `?${qs}` : ""}`);
  };

  const filtered = events.filter((e) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.action.toLowerCase().includes(q) ||
        e.entityType.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        (e.actorName && e.actorName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchActionEntityIdActor")}
          />
        </div>
        <div className="w-52">
          <Select value={activeAction} onChange={(e) => go({ action: e.target.value, cursor: null })}>
            <option value="ALL">{t("allActions")}</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={activeEntity} onChange={(e) => go({ entity: e.target.value, cursor: null })}>
            <option value="ALL">{t("allEntities")}</option>
            {entityTypes.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </Select>
        </div>
        {(search || activeAction !== "ALL" || activeEntity !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              go({ action: "ALL", entity: "ALL", cursor: null });
            }}
          >
            {t("clearFilters")}
          </Button>
        )}
        <p className="font-mono text-2xs text-ink-30">
          {isAr
            ? `${filtered.length} من ${matchingTotal} حدثًا`
            : `${filtered.length} shown of ${matchingTotal} matching`}
        </p>
      </div>

      {/* Diff / Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-rule bg-paper-raised p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 className="font-display text-base text-ink font-mono">{selectedEvent.action}</h2>
                <p className="text-2xs text-ink-50">
                  Target: {selectedEvent.entityType} ({selectedEvent.entityId})
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)}>
                ✕
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-paper-sunken/40 p-3 rounded-md border border-rule">
              <div>
                <span className="text-2xs text-ink-50 block">Actor:</span>
                <span className="font-semibold text-ink">
                  {selectedEvent.actorName ?? "System"} ({selectedEvent.actorRoles.join(", ") || "INTERNAL"})
                </span>
              </div>
              <div>
                <span className="text-2xs text-ink-50 block">{tk("timestampLabel")}</span>
                <span className="text-ink">{formatDate(selectedEvent.at, locale)}</span>
              </div>
            </div>

            {/* Before and After Diffs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">{tk("stateBefore")}</p>
                <pre className="text-[11px] bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono max-h-56">
                  {selectedEvent.before ? JSON.stringify(selectedEvent.before, null, 2) : "null (initial creation)"}
                </pre>
              </div>
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">{tk("stateAfter")}</p>
                <pre className="text-[11px] bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono max-h-56">
                  {selectedEvent.after ? JSON.stringify(selectedEvent.after, null, 2) : "null (no change recorded)"}
                </pre>
              </div>
            </div>

            {Boolean(selectedEvent.metadata) && (
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">{tk("metadataWhy")}</p>
                <pre className="text-[11px] bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">{tk("noAuditEvents")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("actionWhat")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("actorWho")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("targetLabel")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("reasonWhy")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">When</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Diff</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const meta = e.metadata as Record<string, unknown> | null;
                const reason = meta?.reason ?? meta?.note ?? meta?.changeReason ?? null;
                return (
                  <tr key={e.id} className="border-b border-rule hover:bg-paper-sunken/30 transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs font-bold text-ink">{e.action}</span>
                    </td>

                    <td className="p-3">
                      <div className="font-medium text-ink text-xs">{e.actorName ?? "System Worker"}</div>
                      <span className="text-2xs text-ink-50">
                        {e.actorRoles.length > 0 ? e.actorRoles.join(", ") : "SYSTEM"}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="text-xs font-semibold text-ink">{e.entityType}</div>
                      <span className="font-mono text-2xs text-ink-50">{e.entityId.slice(-10)}</span>
                    </td>

                    <td className="p-3">
                      {reason ? (
                        <p className="text-xs text-ink truncate max-w-sm">{String(reason)}</p>
                      ) : (
                        <span className="text-2xs text-ink-30">—</span>
                      )}
                    </td>

                    <td className="p-3 text-end text-2xs text-ink-50">
                      {relativeTime(e.at, locale)}
                    </td>

                    <td className="p-3 text-end">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(e)}>
                        Inspect
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(nextCursor || matchingTotal > events.length) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-paper-raised px-4 py-3">
          <p className="text-2xs text-ink-50">
            {t("searchRefinesPageUseFilters")}
          </p>
          {nextCursor ? (
            <Button size="sm" variant="ghost" onClick={() => go({ cursor: nextCursor })}>
              {t("older")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
