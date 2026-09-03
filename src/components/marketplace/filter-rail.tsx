"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, Input, Select, cn, Spinner } from "@/components/ui/primitives";
import { useUrlFilters } from "./url-filters";
import { formatMoney } from "@/lib/format";

export interface Facets {
  cities: { value: string; count: number }[];
  developers: { id: string; nameEn: string; nameAr: string }[];
  unitTypes: { value: string; count: number }[];
  cashMin: number;
  cashMax: number;
  installmentMin: number;
  installmentMax: number;
  deliveryMinYear: number;
  deliveryMaxYear: number;
  maxDiscountPct: number;
}

const FINISHING = ["CORE_AND_SHELL", "SEMI_FINISHED", "FULLY_FINISHED", "FINISHED_WITH_AC", "FURNISHED"];

export function FilterRail({ facets }: { facets: Facets }) {
  const t = useTranslations("market");
  const [open, setOpen] = useState(false);
  const { activeCount } = useUrlFilters();

  return (
    <>
      {/* Mobile: filters live behind a sheet so the grid owns the viewport. */}
      <div className="lg:hidden">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button variant="secondary" className="w-full">
              {t("filters")}
              {activeCount > 0 ? (
                <span className="ms-1 rounded-xs bg-ink px-1.5 text-2xs text-ink-text">{activeCount}</span>
              ) : null}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
            <Dialog.Content className="fixed inset-inline-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl bg-paper p-5">
              <Dialog.Title className="mb-4 font-display text-xl">{t("filters")}</Dialog.Title>
              <FilterFields facets={facets} />
              <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
                {t("apply")}
              </Button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] self-start overflow-y-auto pe-2 lg:block scrollbar-thin">
        <FilterFields facets={facets} />
      </aside>
    </>
  );
}

function FilterFields({ facets }: { facets: Facets }) {
  const t = useTranslations("market");
  const tu = useTranslations("unitType");
  const tf = useTranslations("finishing");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { get, getList, set, toggleInList, clearAll, activeCount } = useUrlFilters();
  const [pending, startTransition] = useTransition();

  const update = (u: Parameters<typeof set>[0]) => startTransition(() => set(u));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">
          {t("filters")}
          {pending ? <Spinner className="ms-2 inline-block size-3 align-middle" /> : null}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => startTransition(() => clearAll())}
            className="text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>

      <Group label={tc("search")}>
        <Input
          type="search"
          defaultValue={get("q")}
          placeholder={t("searchPlaceholder")}
          onChange={(e) => {
            const v = e.currentTarget.value;
            window.clearTimeout((window as unknown as { __aqQ?: number }).__aqQ);
            (window as unknown as { __aqQ?: number }).__aqQ = window.setTimeout(
              () => update({ q: v }),
              350,
            );
          }}
        />
      </Group>

      <Group label={t("filterCash")}>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder={formatMoney(facets.cashMin, { style: "compact" })}
            defaultValue={get("cashMin")}
            onBlur={(e) => update({ cashMin: e.currentTarget.value })}
            aria-label="Minimum cash"
          />
          <Input
            type="number"
            inputMode="numeric"
            placeholder={formatMoney(facets.cashMax, { style: "compact" })}
            defaultValue={get("cashMax")}
            onBlur={(e) => update({ cashMax: e.currentTarget.value })}
            aria-label="Maximum cash"
          />
        </div>
      </Group>

      <Group label={t("filterInstallment")}>
        <Input
          type="number"
          inputMode="numeric"
          placeholder={`max ${formatMoney(facets.installmentMax, { style: "compact" })}`}
          defaultValue={get("installmentMax")}
          onBlur={(e) => update({ installmentMax: e.currentTarget.value })}
          aria-label="Maximum installment"
        />
      </Group>

      <Group label={t("filterDiscount")}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(10, facets.maxDiscountPct)}
            step={1}
            defaultValue={get("discountMin") || 0}
            onChange={(e) => update({ discountMin: e.currentTarget.value === "0" ? "" : e.currentTarget.value })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-rule accent-brass"
            aria-label={t("filterDiscount")}
          />
          <span className="money w-12 text-end text-xs text-ink-70">{get("discountMin") || 0}%</span>
        </div>
      </Group>

      <Group label={t("filterDeliveryYear")}>
        <Select
          defaultValue={get("deliveryBy")}
          onChange={(e) => update({ deliveryBy: e.currentTarget.value })}
        >
          <option value="">Any</option>
          {Array.from(
            { length: facets.deliveryMaxYear - facets.deliveryMinYear + 1 },
            (_, i) => facets.deliveryMinYear + i,
          ).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Group>

      <Group label={t("filterCity")}>
        <CheckList
          options={facets.cities.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
          selected={getList("cities")}
          onToggle={(v) => startTransition(() => toggleInList("cities", v))}
        />
      </Group>

      <Group label={t("filterDeveloper")}>
        <CheckList
          options={facets.developers.map((d) => ({
            value: d.id,
            label: locale === "ar" ? d.nameAr : d.nameEn,
          }))}
          selected={getList("developers")}
          onToggle={(v) => startTransition(() => toggleInList("developers", v))}
          max={8}
        />
      </Group>

      <Group label={t("filterUnitType")}>
        <CheckList
          options={facets.unitTypes.map((u) => ({
            value: u.value,
            label: tu(u.value as "APARTMENT"),
            count: u.count,
          }))}
          selected={getList("unitTypes")}
          onToggle={(v) => startTransition(() => toggleInList("unitTypes", v))}
        />
      </Group>

      <Group label={t("filterBedrooms")}>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = get("bedroomsMin") === String(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => update({ bedroomsMin: active ? "" : String(n) })}
                aria-pressed={active}
                className={cn(
                  "h-8 flex-1 rounded-sm border text-xs transition-colors",
                  active
                    ? "border-ink bg-ink text-ink-text"
                    : "border-rule-strong text-ink-70 hover:border-ink-50",
                )}
              >
                {n}+
              </button>
            );
          })}
        </div>
      </Group>

      <Group label={t("filterBua")}>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="min m²"
          defaultValue={get("buaMin")}
          onBlur={(e) => update({ buaMin: e.currentTarget.value })}
          aria-label={t("filterBua")}
        />
      </Group>

      <Group label={t("filterFinishing")}>
        <CheckList
          options={FINISHING.map((f) => ({ value: f, label: tf(f as "SEMI_FINISHED") }))}
          selected={getList("finishing")}
          onToggle={(v) => startTransition(() => toggleInList("finishing", v))}
        />
      </Group>

      <Group label={t("filterVerification")}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={get("verificationMin") || 0}
            onChange={(e) =>
              update({ verificationMin: e.currentTarget.value === "0" ? "" : e.currentTarget.value })
            }
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-rule accent-brass"
            aria-label={t("filterVerification")}
          />
          <span className="money w-12 text-end text-xs text-ink-70">{get("verificationMin") || 0}</span>
        </div>
      </Group>

      <div className="flex flex-col gap-2">
        <Toggle
          label={t("filterAssignmentReady")}
          checked={get("assignmentReady") === "1"}
          onChange={(v) => update({ assignmentReady: v ? "1" : "" })}
        />
        <Toggle
          label={t("filterDelivered")}
          checked={get("delivered") === "1"}
          onChange={(v) => update({ delivered: v ? "1" : "" })}
        />
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium text-ink-70">{label}</legend>
      {children}
    </fieldset>
  );
}

function CheckList({
  options,
  selected,
  onToggle,
  max = 6,
}: {
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onToggle: (v: string) => void;
  max?: number;
}) {
  const t = useTranslations("common");
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.slice(0, max);

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-ink-70">
          <input
            type="checkbox"
            checked={selected.includes(o.value)}
            onChange={() => onToggle(o.value)}
            className="size-3.5 rounded-xs accent-ink"
          />
          <span className="flex-1 truncate">{o.label}</span>
          {o.count !== undefined ? <span className="money text-2xs text-ink-30">{o.count}</span> : null}
        </label>
      ))}
      {options.length > max ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 self-start text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-rule px-3 py-2 text-sm text-ink-70">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="size-3.5 accent-ink"
      />
    </label>
  );
}
