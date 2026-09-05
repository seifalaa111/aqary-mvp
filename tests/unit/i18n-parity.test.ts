import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Arabic is not an afterthought, and a hardcoded `isAr ? "…" : "…"` puts a
 * translation somewhere no translator will ever find it. The internal console
 * had drifted to 164 of them; these tests hold the line.
 *
 * Selecting a localised column off a database row (`isAr ? p.nameAr : p.nameEn`)
 * is the correct pattern and stays — the schema, not the message catalogue, is
 * where that text lives.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** `isAr ? "literal" : "literal"` — UI copy welded into a component. */
const HARDCODED = /isAr\s*\?\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"/s;

describe("i18n", () => {
  it("keeps en.json and ar.json at exact key parity", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "src/messages/en.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(ROOT, "src/messages/ar.json"), "utf8"));

    const flat = (o: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );

    const enKeys = flat(en).sort();
    const arKeys = flat(ar).sort();

    expect(enKeys.filter((k) => !arKeys.includes(k)), "keys missing from ar.json").toEqual([]);
    expect(arKeys.filter((k) => !enKeys.includes(k)), "keys missing from en.json").toEqual([]);
    expect(enKeys.length).toBe(arKeys.length);
  });

  it("has no empty translations in either catalogue", () => {
    for (const lang of ["en", "ar"]) {
      const msgs = JSON.parse(readFileSync(join(ROOT, `src/messages/${lang}.json`), "utf8"));
      const walkValues = (o: Record<string, unknown>, prefix = ""): [string, unknown][] =>
        Object.entries(o).flatMap(([k, v]) =>
          v && typeof v === "object"
            ? walkValues(v as Record<string, unknown>, `${prefix}${k}.`)
            : ([[`${prefix}${k}`, v]] as [string, unknown][]),
        );
      for (const [key, value] of walkValues(msgs)) {
        expect(String(value).trim(), `${lang}.json ${key} is empty`).not.toBe("");
      }
    }
  });

  it("has no hardcoded bilingual string literals in the internal console", () => {
    const dirs = [
      "src/app/[locale]/admin",
      "src/app/[locale]/analyst",
      "src/components/admin",
      "src/components/analyst",
    ];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        if (HARDCODED.test(src)) {
          offenders.push(file.replace(ROOT, "").replace(/\\/g, "/"));
        }
      }
    }
    expect(
      offenders,
      "move these strings into src/messages and read them through useTranslations/getTranslations",
    ).toEqual([]);
  });
});
