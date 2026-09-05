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

  it("keeps every role surface free of untranslated English copy", () => {
    // Buyer, seller, analyst, admin and the developer portal: an Arabic speaker
    // has to be able to do their job on all of them, staff included. Every
    // string belongs in the catalogue rather than welded into a component.
    const dirs = [
      "src/app/[locale]/buyer",
      "src/app/[locale]/seller",
      "src/app/[locale]/admin",
      "src/app/[locale]/analyst",
      "src/app/[locale]/partner",
      "src/components/buyer",
      "src/components/seller",
      "src/components/admin",
      "src/components/analyst",
    ];
    // JSX text nodes and placeholder/aria-label attributes holding English prose.
    const JSX_TEXT = />\s*([A-Z][A-Za-z0-9][^<>{}\n]{6,})\s*</;
    const ATTR = /(?:placeholder|aria-label|title)="([A-Z][^"]{4,})"/;

    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(join(ROOT, dir))) {
        for (const line of readFileSync(file, "utf8").split("\n")) {
          const hit = JSX_TEXT.exec(line) ?? ATTR.exec(line);
          if (hit && /[a-z]/.test(hit[1]!)) {
            const where = file.replace(ROOT, "").replace(/\\/g, "/");
            offenders.push(`${where}: ${hit[1]!.slice(0, 60)}`);
          }
        }
      }
    }
    expect(offenders, "move these strings into src/messages").toEqual([]);
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

  it("resolves every literal translation key against the namespace it is bound to", () => {
    // A missing key is a runtime MISSING_MESSAGE: invisible to typecheck, and to
    // any test that does not render that exact branch. This caught a real one —
    // a new `tu(...)` call landed in a file where `tu` was already bound to
    // `unitType`, so all of its keys resolved against the wrong namespace.
    const en = JSON.parse(readFileSync(join(ROOT, "src/messages/en.json"), "utf8"));
    const BIND =
      /const\s+(\w+)\s*=\s*(?:await\s+)?(?:get|use)Translations\(\s*(?:\{[^}]*namespace:\s*)?"([^"]+)"/g;
    const CALL = /\b(\w+)\("([^"]+)"\)/g;

    const problems: string[] = [];
    for (const dir of ["src/app", "src/components"]) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        // One file can hold several components, each binding the same variable
        // to a different namespace: resolve against the nearest binding above.
        const binds = [...src.matchAll(BIND)].map((m) => ({
          at: m.index!,
          name: m[1]!,
          ns: m[2]!,
        }));
        if (binds.length === 0) continue;

        for (const call of src.matchAll(CALL)) {
          const prior = binds.filter((b) => b.at < call.index! && b.name === call[1]);
          if (prior.length === 0) continue;
          const ns = prior[prior.length - 1]!.ns;
          let node: unknown = en;
          for (const seg of ns.split(".")) {
            node =
              node && typeof node === "object" ? (node as Record<string, unknown>)[seg] : undefined;
          }
          if (node && typeof node === "object" && !(call[2]! in (node as Record<string, unknown>))) {
            const where = file.replace(ROOT, "").replace(/\\/g, "/");
            problems.push(`${where}: ${call[1]}("${call[2]}") -> namespace "${ns}"`);
          }
        }
      }
    }
    expect(problems, "these keys do not exist in the namespace they resolve against").toEqual([]);
  });
});
