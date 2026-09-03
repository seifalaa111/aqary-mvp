"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/primitives";

type V = Record<string, unknown>;

const UNIT_TYPES = [
  "APARTMENT", "DUPLEX", "PENTHOUSE", "STUDIO", "TOWNHOUSE", "TWIN_HOUSE",
  "STANDALONE_VILLA", "CHALET", "OFFICE", "CLINIC", "RETAIL", "LAND",
];
const FINISHING = ["CORE_AND_SHELL", "SEMI_FINISHED", "FULLY_FINISHED", "FINISHED_WITH_AC", "FURNISHED"];
const VIEWS = ["Landscape", "Pool", "Golf", "Sea", "Lagoon", "Street", "Internal"];

export function StepProperty({
  value,
  onChange,
  errors,
  developers,
  locale,
}: {
  value: V;
  onChange: (v: V) => void;
  errors: Record<string, string>;
  developers: {
    id: string;
    nameEn: string;
    nameAr: string;
    projects: { id: string; nameEn: string; nameAr: string; city: string; area: string }[];
  }[];
  locale: string;
}) {
  const t = useTranslations("seller");
  const tu = useTranslations("unitType");
  const tf = useTranslations("finishing");
  const isAr = locale === "ar";
  const set = (k: string) => (v: unknown) => onChange({ ...value, [k]: v });

  const [devQuery, setDevQuery] = useState("");
  const developerId = String(value.developerId ?? "");
  const developer = developers.find((d) => d.id === developerId);

  const matches = useMemo(() => {
    const q = devQuery.trim().toLowerCase();
    if (!q) return developers.slice(0, 8);
    return developers
      .filter((d) => d.nameEn.toLowerCase().includes(q) || d.nameAr.includes(devQuery.trim()))
      .slice(0, 8);
  }, [devQuery, developers]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t("step2")}</h2>
        <p className="mt-1 text-sm text-ink-50">
          Copy the unit code exactly as printed on your contract — it is how the developer finds your file.
        </p>
      </div>

      <Field label="Developer" htmlFor="developer" required error={errors.projectId}>
        <div>
          <Input
            id="developer"
            value={developer ? (isAr ? developer.nameAr : developer.nameEn) : devQuery}
            onChange={(e) => {
              setDevQuery(e.target.value);
              onChange({ ...value, developerId: "", projectId: "" });
            }}
            placeholder="Start typing — Talaat Moustafa, SODIC, Palm Hills…"
            autoComplete="off"
          />
          {!developer && devQuery.trim().length > 0 ? (
            <ul className="mt-1 max-h-52 overflow-y-auto rounded-sm border border-rule bg-paper-raised shadow-e2 scrollbar-thin">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-ink-50">
                  No developer matches that. Try the Arabic or English name.
                </li>
              ) : (
                matches.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ ...value, developerId: d.id, projectId: "" });
                        setDevQuery("");
                      }}
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-paper-sunken"
                    >
                      <span className="text-ink">{isAr ? d.nameAr : d.nameEn}</span>
                      <span className="text-2xs text-ink-30">{d.projects.length} projects</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </Field>

      {developer ? (
        <Field label="Project" htmlFor="projectId" required error={errors.projectId}>
          <Select
            id="projectId"
            value={String(value.projectId ?? "")}
            onChange={(e) => set("projectId")(e.target.value)}
          >
            <option value="">Choose the project</option>
            {developer.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {(isAr ? p.nameAr : p.nameEn)} — {p.city}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unit code" htmlFor="unitCode" required error={errors.unitCode}>
          <Input
            id="unitCode"
            dir="ltr"
            className="money"
            value={String(value.unitCode ?? "")}
            onChange={(e) => set("unitCode")(e.target.value)}
            placeholder="B7-1204"
          />
        </Field>
        <Field label="Phase / cluster" htmlFor="phase">
          <Input id="phase" value={String(value.phase ?? "")} onChange={(e) => set("phase")(e.target.value)} />
        </Field>
        <Field label="Unit type" htmlFor="unitType" required>
          <Select id="unitType" value={String(value.unitType ?? "APARTMENT")} onChange={(e) => set("unitType")(e.target.value)}>
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>
                {tu(u as "APARTMENT")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Built-up area (m²)" htmlFor="buaSqm" required error={errors.buaSqm}>
          <Input id="buaSqm" type="number" inputMode="decimal" className="money" value={String(value.buaSqm ?? "")} onChange={(e) => set("buaSqm")(e.target.value)} />
        </Field>
        <Field label="Garden (m²)" htmlFor="gardenSqm">
          <Input id="gardenSqm" type="number" className="money" value={String(value.gardenSqm ?? "")} onChange={(e) => set("gardenSqm")(e.target.value)} />
        </Field>
        <Field label="Roof (m²)" htmlFor="roofSqm">
          <Input id="roofSqm" type="number" className="money" value={String(value.roofSqm ?? "")} onChange={(e) => set("roofSqm")(e.target.value)} />
        </Field>
        <Field label="Terrace (m²)" htmlFor="terraceSqm">
          <Input id="terraceSqm" type="number" className="money" value={String(value.terraceSqm ?? "")} onChange={(e) => set("terraceSqm")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Floor" htmlFor="floor">
          <Input id="floor" type="number" className="money" value={String(value.floor ?? "")} onChange={(e) => set("floor")(e.target.value)} />
        </Field>
        <Field label="Bedrooms" htmlFor="bedrooms" required>
          <Input id="bedrooms" type="number" min={0} max={12} className="money" value={String(value.bedrooms ?? 0)} onChange={(e) => set("bedrooms")(e.target.value)} />
        </Field>
        <Field label="Bathrooms" htmlFor="bathrooms" required>
          <Input id="bathrooms" type="number" min={0} max={12} className="money" value={String(value.bathrooms ?? 0)} onChange={(e) => set("bathrooms")(e.target.value)} />
        </Field>
        <Field label="View" htmlFor="view">
          <Select id="view" value={String(value.view ?? "")} onChange={(e) => set("view")(e.target.value)}>
            <option value="">Not specified</option>
            {VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Finishing" htmlFor="finishing" required>
          <Select id="finishing" value={String(value.finishing ?? "SEMI_FINISHED")} onChange={(e) => set("finishing")(e.target.value)}>
            {FINISHING.map((f) => (
              <option key={f} value={f}>
                {tf(f as "SEMI_FINISHED")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Contractual delivery date"
          htmlFor="delivery"
          required
          error={errors.contractualDeliveryDate}
          hint="Use the date in the contract, not what you were told verbally"
        >
          <Input
            id="delivery"
            type="date"
            dir="ltr"
            value={String(value.contractualDeliveryDate ?? "")}
            onChange={(e) => set("contractualDeliveryDate")(e.target.value)}
          />
        </Field>
        <Field label="Delivery status" htmlFor="deliveryStatus" required>
          <Select id="deliveryStatus" value={String(value.deliveryStatus ?? "NOT_DELIVERED")} onChange={(e) => set("deliveryStatus")(e.target.value)}>
            <option value="NOT_DELIVERED">Not delivered yet</option>
            <option value="DELIVERED">Delivered / handed over</option>
            <option value="DELAYED">Delayed past the contractual date</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
