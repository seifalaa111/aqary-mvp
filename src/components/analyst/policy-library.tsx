"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, Field, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { savePolicy } from "@/app/actions/analyst";
import { egp } from "@/lib/format";

export interface PolicyView {
  assignmentAllowed: string;
  feeType: string;
  feePercentBps: number | null;
  feeFixedAmount: string | null;
  feeBasis: string;
  minPercentPaidBps: number | null;
  minMonthsElapsed: number | null;
  typicalNocDays: number | null;
  waitingPeriodDays: number | null;
  requiredDocuments: string[];
  conditionsEn: string | null;
  conditionsAr: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isSynthetic: boolean;
}

export interface DeveloperView {
  id: string;
  nameEn: string;
  nameAr: string;
  projectCount: number;
  policy: PolicyView | null;
}

export function PolicyLibrary({
  developers,
  locale,
}: {
  developers: DeveloperView[];
  locale: string;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startEdit = (d: DeveloperView) => {
    setEditing(d.id);
    setError(null);
    setDraft({
      developerId: d.id,
      assignmentAllowed: d.policy?.assignmentAllowed ?? "UNKNOWN",
      feeType: d.policy?.feeType ?? "PERCENT",
      feePercentBps: d.policy?.feePercentBps ?? 0,
      feeFixedAmount: d.policy?.feeFixedAmount ?? "",
      feeBasis: d.policy?.feeBasis ?? "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: d.policy?.minPercentPaidBps ?? 0,
      minMonthsElapsed: d.policy?.minMonthsElapsed ?? 0,
      typicalNocDays: d.policy?.typicalNocDays ?? 0,
      waitingPeriodDays: d.policy?.waitingPeriodDays ?? 0,
      requiredDocuments: d.policy?.requiredDocuments ?? [],
      conditionsEn: d.policy?.conditionsEn ?? "",
      conditionsAr: d.policy?.conditionsAr ?? "",
      contactName: d.policy?.contactName ?? "",
      contactEmail: d.policy?.contactEmail ?? "",
      contactPhone: d.policy?.contactPhone ?? "",
    });
  };

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      {developers.map((d) => {
        const p = d.policy;
        const isEditing = editing === d.id;

        return (
          <Card key={d.id}>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{isAr ? d.nameAr : d.nameEn}</h2>
                  <p className="text-2xs text-ink-30">{d.projectCount} projects</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p ? (
                    <>
                      <Badge
                        tone={
                          p.assignmentAllowed === "ALLOWED"
                            ? "verified"
                            : p.assignmentAllowed === "NOT_ALLOWED"
                              ? "flagged"
                              : "pending"
                        }
                      >
                        {p.assignmentAllowed.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      {p.isSynthetic ? <Badge tone="info">synthetic</Badge> : null}
                    </>
                  ) : (
                    <Badge tone="neutral">no policy on file</Badge>
                  )}
                  {!isEditing ? (
                    <Button size="sm" variant="secondary" onClick={() => startEdit(d)}>
                      {p ? "Edit" : "Add policy"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {!isEditing && p ? (
                <>
                  <dl className="rule-t grid gap-x-6 sm:grid-cols-2">
                    <Row
                      label="Assignment fee"
                      value={
                        p.feeType === "PERCENT"
                          ? `${((p.feePercentBps ?? 0) / 100).toFixed(2)}% of ${p.feeBasis === "OUTSTANDING_BALANCE" ? "outstanding" : "contract price"}`
                          : p.feeType === "FIXED"
                            ? egp(p.feeFixedAmount)
                            : "none"
                      }
                    />
                    <Row label="Minimum % paid" value={p.minPercentPaidBps ? `${p.minPercentPaidBps / 100}%` : "—"} />
                    <Row label="Minimum months elapsed" value={p.minMonthsElapsed ? String(p.minMonthsElapsed) : "—"} />
                    <Row label="Typical NOC turnaround" value={p.typicalNocDays ? `${p.typicalNocDays} days` : "—"} />
                    <Row label="Waiting period" value={p.waitingPeriodDays ? `${p.waitingPeriodDays} days` : "—"} />
                    <Row label="Contact" value={p.contactName ?? "—"} />
                  </dl>

                  {p.conditionsEn ? (
                    <p className="mt-3 text-xs leading-relaxed text-ink-70">
                      {isAr ? (p.conditionsAr ?? p.conditionsEn) : p.conditionsEn}
                    </p>
                  ) : null}

                  {p.requiredDocuments.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {p.requiredDocuments.map((doc) => (
                        <li key={doc}>
                          <Badge tone="neutral">{doc}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}

              {isEditing ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Assignment" htmlFor={`aa-${d.id}`}>
                      <Select
                        id={`aa-${d.id}`}
                        value={String(draft.assignmentAllowed)}
                        onChange={(e) => set("assignmentAllowed", e.target.value)}
                      >
                        <option value="ALLOWED">Allowed</option>
                        <option value="CONDITIONAL">Conditional</option>
                        <option value="NOT_ALLOWED">Not allowed</option>
                        <option value="UNKNOWN">Unknown</option>
                      </Select>
                    </Field>
                    <Field label="Fee type" htmlFor={`ft-${d.id}`}>
                      <Select id={`ft-${d.id}`} value={String(draft.feeType)} onChange={(e) => set("feeType", e.target.value)}>
                        <option value="PERCENT">Percent</option>
                        <option value="FIXED">Fixed</option>
                        <option value="NONE">None</option>
                      </Select>
                    </Field>
                    {draft.feeType === "PERCENT" ? (
                      <Field label="Fee (bps)" htmlFor={`fb-${d.id}`} hint="250 = 2.50%">
                        <Input
                          id={`fb-${d.id}`}
                          type="number"
                          className="money"
                          value={String(draft.feePercentBps ?? "")}
                          onChange={(e) => set("feePercentBps", Number(e.target.value))}
                        />
                      </Field>
                    ) : draft.feeType === "FIXED" ? (
                      <Field label="Fixed fee (EGP)" htmlFor={`ff-${d.id}`}>
                        <Input
                          id={`ff-${d.id}`}
                          className="money"
                          value={String(draft.feeFixedAmount ?? "")}
                          onChange={(e) => set("feeFixedAmount", e.target.value)}
                        />
                      </Field>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Min % paid (bps)" htmlFor={`mp-${d.id}`}>
                      <Input
                        id={`mp-${d.id}`}
                        type="number"
                        className="money"
                        value={String(draft.minPercentPaidBps ?? "")}
                        onChange={(e) => set("minPercentPaidBps", Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Min months" htmlFor={`mm-${d.id}`}>
                      <Input
                        id={`mm-${d.id}`}
                        type="number"
                        className="money"
                        value={String(draft.minMonthsElapsed ?? "")}
                        onChange={(e) => set("minMonthsElapsed", Number(e.target.value))}
                      />
                    </Field>
                    <Field label="NOC days" htmlFor={`nd-${d.id}`}>
                      <Input
                        id={`nd-${d.id}`}
                        type="number"
                        className="money"
                        value={String(draft.typicalNocDays ?? "")}
                        onChange={(e) => set("typicalNocDays", Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Waiting days" htmlFor={`wd-${d.id}`}>
                      <Input
                        id={`wd-${d.id}`}
                        type="number"
                        className="money"
                        value={String(draft.waitingPeriodDays ?? "")}
                        onChange={(e) => set("waitingPeriodDays", Number(e.target.value))}
                      />
                    </Field>
                  </div>

                  <Field label="Required documents (one per line)" htmlFor={`rd-${d.id}`}>
                    <Textarea
                      id={`rd-${d.id}`}
                      rows={4}
                      value={(draft.requiredDocuments as string[]).join("\n")}
                      onChange={(e) => set("requiredDocuments", e.target.value.split("\n"))}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Conditions (English)" htmlFor={`ce-${d.id}`}>
                      <Textarea
                        id={`ce-${d.id}`}
                        rows={3}
                        value={String(draft.conditionsEn ?? "")}
                        onChange={(e) => set("conditionsEn", e.target.value)}
                      />
                    </Field>
                    <Field label="Conditions (Arabic)" htmlFor={`ca-${d.id}`}>
                      <Textarea
                        id={`ca-${d.id}`}
                        rows={3}
                        dir="rtl"
                        value={String(draft.conditionsAr ?? "")}
                        onChange={(e) => set("conditionsAr", e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Contact name" htmlFor={`cn-${d.id}`}>
                      <Input id={`cn-${d.id}`} value={String(draft.contactName ?? "")} onChange={(e) => set("contactName", e.target.value)} />
                    </Field>
                    <Field label="Contact email" htmlFor={`cem-${d.id}`}>
                      <Input id={`cem-${d.id}`} dir="ltr" value={String(draft.contactEmail ?? "")} onChange={(e) => set("contactEmail", e.target.value)} />
                    </Field>
                    <Field label="Contact phone" htmlFor={`cp-${d.id}`}>
                      <Input id={`cp-${d.id}`} dir="ltr" value={String(draft.contactPhone ?? "")} onChange={(e) => set("contactPhone", e.target.value)} />
                    </Field>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      loading={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await savePolicy({
                            ...draft,
                            requiredDocuments: (draft.requiredDocuments as string[]).map((x) => x.trim()).filter(Boolean),
                          });
                          if (!res.ok) setError(res.error);
                          else {
                            setEditing(null);
                            router.refresh();
                          }
                        })
                      }
                    >
                      Save policy
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-xs text-ink">{value}</dd>
    </div>
  );
}
