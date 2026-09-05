"use client";

import { useState } from "react";
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
}: {
  locale: string;
  events: AuditEventRow[];
  actionTypes: string[];
}) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null);

  const isAr = locale === "ar";

  const entityTypes = Array.from(new Set(events.map((e) => e.entityType)));

  const filtered = events.filter((e) => {
    if (actionFilter !== "ALL" && e.action !== actionFilter) return false;
    if (entityFilter !== "ALL" && e.entityType !== entityFilter) return false;
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
            placeholder={isAr ? "بحث بالإجراء، الكيان، المعرف، أو الفاعل..." : "Search action, entity ID, actor..."}
          />
        </div>
        <div className="w-52">
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="ALL">{isAr ? "جميع الإجراءات" : "All Actions"}</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="ALL">{isAr ? "جميع الكيانات" : "All Entities"}</option>
            {entityTypes.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </Select>
        </div>
        {(search || actionFilter !== "ALL" || entityFilter !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setActionFilter("ALL");
              setEntityFilter("ALL");
            }}
          >
            {isAr ? "إلغاء التصفية" : "Clear filters"}
          </Button>
        )}
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
                <span className="text-2xs text-ink-50 block">Timestamp:</span>
                <span className="text-ink">{formatDate(selectedEvent.at, locale)}</span>
              </div>
            </div>

            {/* Before and After Diffs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">State Before (FROM):</p>
                <pre className="text-[11px] bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono max-h-56">
                  {selectedEvent.before ? JSON.stringify(selectedEvent.before, null, 2) : "null (initial creation)"}
                </pre>
              </div>
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">State After (TO):</p>
                <pre className="text-[11px] bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono max-h-56">
                  {selectedEvent.after ? JSON.stringify(selectedEvent.after, null, 2) : "null (no change recorded)"}
                </pre>
              </div>
            </div>

            {Boolean(selectedEvent.metadata) && (
              <div>
                <p className="text-2xs font-semibold text-ink-50 mb-1">Metadata / Operational Justification (WHY):</p>
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
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          No audit events recorded for current filter criteria.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">Action (WHAT)</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Actor (WHO)</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Target (TARGET)</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Reason / Details (WHY)</th>
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
    </div>
  );
}
