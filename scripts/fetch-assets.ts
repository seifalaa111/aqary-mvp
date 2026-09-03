/**
 * Downloads the property photography into `public/property/` and writes
 * ASSETS.md. Nothing is hot-linked at runtime.
 *
 * Run: npm run assets:fetch      (idempotent — already-downloaded files are skipped)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CATALOGUE, ATTRIBUTION, type CataloguePhoto } from "../src/lib/assets/catalogue.js";

const OUT_DIR = path.resolve(process.cwd(), "public/property");
const VARIANTS = [
  { name: "thumb", width: 320 },
  { name: "card", width: 800 },
  { name: "detail", width: 1600 },
] as const;

interface FetchedRecord {
  photo: CataloguePhoto;
  ok: boolean;
  width: number;
  height: number;
  dominantColor: string;
  lqip: string;
  error?: string;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const results: FetchedRecord[] = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const photo of CATALOGUE) {
    const detailPath = path.join(OUT_DIR, `${photo.id}-detail.webp`);
    const metaPath = path.join(OUT_DIR, `${photo.id}.json`);

    if (await exists(detailPath)) {
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
        results.push({ photo, ok: true, ...meta });
        skipped++;
        continue;
      } catch {
        /* metadata missing — re-process below */
      }
    }

    try {
      const source = ATTRIBUTION.fileUrl(photo.id, 2000);
      const res = await fetch(source, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      // Strip EXIF, auto-orient, apply one consistent grade so mixed-source
      // photography reads as a single system, then emit a responsive set.
      const base = sharp(buf).rotate().modulate({ saturation: 0.93, brightness: 1.02 }).gamma(1.02);
      const meta = await base.metadata();

      for (const v of VARIANTS) {
        await base
          .clone()
          .resize({ width: v.width, withoutEnlargement: true })
          .webp({ quality: v.name === "thumb" ? 68 : 80 })
          .toFile(path.join(OUT_DIR, `${photo.id}-${v.name}.webp`));
        // JPEG fallback for the card size only — the size that matters most.
        if (v.name === "card") {
          await base
            .clone()
            .resize({ width: v.width, withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(path.join(OUT_DIR, `${photo.id}-card.jpg`));
        }
      }

      const stats = await sharp(buf).stats();
      const { r, g, b } = stats.dominant;
      const dominantColor = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

      // Tiny blurred placeholder inlined as a data URI — prevents layout flash.
      const lqipBuf = await sharp(buf).resize({ width: 20 }).blur(1.2).webp({ quality: 40 }).toBuffer();
      const lqip = `data:image/webp;base64,${lqipBuf.toString("base64")}`;

      const record = {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        dominantColor,
        lqip,
      };
      await fs.writeFile(metaPath, JSON.stringify(record));
      results.push({ photo, ok: true, ...record });
      downloaded++;
      process.stdout.write(`  ✓ ${photo.id} (${photo.category})\n`);
    } catch (err) {
      failed++;
      results.push({
        photo,
        ok: false,
        width: 0,
        height: 0,
        dominantColor: "#e8e3da",
        lqip: "",
        error: err instanceof Error ? err.message : String(err),
      });
      process.stdout.write(`  ✗ ${photo.id} — ${err instanceof Error ? err.message : err}\n`);
    }
  }

  await writeAssetsDoc(results);

  console.log(
    `\nProperty photography: ${downloaded} downloaded, ${skipped} already present, ${failed} failed.`,
  );
  if (failed > 0) {
    console.log(
      "Failed images are skipped by the seed; listings draw from the photos that did download.",
    );
  }
  if (downloaded + skipped === 0) {
    console.error("\nNo photography available. Check your network connection and re-run.");
    process.exitCode = 1;
  }
}

async function writeAssetsDoc(results: FetchedRecord[]) {
  const ok = results.filter((r) => r.ok);
  const byCat = new Map<string, FetchedRecord[]>();
  for (const r of ok) {
    const list = byCat.get(r.photo.category) ?? [];
    list.push(r);
    byCat.set(r.photo.category, list);
  }

  const lines: string[] = [
    "# ASSETS",
    "",
    "Every image in this repository, where it came from, and what it is allowed to be used for.",
    "",
    "## 1. Property photography",
    "",
    `**Source:** ${ATTRIBUTION.source}  `,
    `**Licence:** ${ATTRIBUTION.licence}  `,
    `**Licence terms:** ${ATTRIBUTION.licenceUrl}`,
    "",
    "Files are downloaded by `npm run assets:fetch` into `public/property/` and served",
    "locally. Nothing is hot-linked at runtime. Each photograph is emitted as a",
    "responsive set (`-thumb.webp` 320px, `-card.webp` 800px, `-card.jpg` fallback,",
    "`-detail.webp` 1600px), with EXIF stripped, auto-orientation applied and one",
    "consistent grade across the whole set so mixed-source photography reads as a",
    "single system.",
    "",
    "### What these photographs are, and are not",
    "",
    "These are real photographs of real architecture and real interiors. They are",
    "**not** photographs of the seeded units, because the seeded units do not exist.",
    "Nothing in the product presents them as evidence of a specific property: seeded",
    "listings are flagged `isDemo` and the interface carries a standing notice that",
    "all people, contracts, receipts, prices and valuations in this build are synthetic.",
    "",
    "In production these slots are filled by photographs the seller uploads of their",
    "own unit, and the product already distinguishes `Actual photos` from",
    "`Developer renders` on every card and gallery.",
    "",
    "### Catalogue",
    "",
  ];

  for (const [category, items] of [...byCat.entries()].sort()) {
    lines.push(`#### ${category.replace(/_/g, " ").toLowerCase()}`, "");
    lines.push("| File | Description | Source page |", "|---|---|---|");
    for (const r of items) {
      lines.push(
        `| \`${r.photo.id}\` | ${r.photo.altEn} | ${ATTRIBUTION.pageUrl(r.photo.id)} |`,
      );
    }
    lines.push("");
  }

  const failedItems = results.filter((r) => !r.ok);
  if (failedItems.length > 0) {
    lines.push(
      "### Not downloaded",
      "",
      "These entries were unreachable when assets were last fetched. The seed skips them.",
      "",
    );
    for (const r of failedItems) lines.push(`- \`${r.photo.id}\` — ${r.error}`);
    lines.push("");
  }

  lines.push(
    "## 2. Floor plans and master plans",
    "",
    "**Generated, not sourced.** `src/lib/assets/plans.ts` draws each unit's floor plan",
    "from that unit's own record — bedroom count, bathroom count, built-up area, garden",
    "and terrace areas, orientation — and draws each project's master plan with the",
    "specific unit located on it. They are vector drawings rendered to PNG at seed time,",
    "so they are accurate to the data rather than being stock images of somebody else's",
    "apartment. They are schematic: they are not architectural drawings of record.",
    "",
    "## 3. Contract documents, receipts and developer statements",
    "",
    "**Generated, not sourced.** `src/lib/docgen/` renders Arabic/English contract pages,",
    "payment receipts and developer account statements containing each seeded contract's",
    "real figures, and writes a `.truth.json` sidecar recording where on the page every",
    "value was drawn. The mock extraction engine reads those pages and cites the real",
    "regions, which is what makes the analyst's side-by-side review genuine rather than",
    "decorative. No real contract, receipt or personal document appears anywhere in this",
    "repository.",
    "",
    "## 4. Brand identity",
    "",
    "**Placeholder.** The Aqary wordmark in `src/components/chrome/wordmark.tsx` is a",
    "typographic treatment standing in for an identity that does not exist yet. It is",
    "flagged as a placeholder in `ASSUMPTIONS.md` and needs to be replaced by real brand",
    "work before any public use.",
    "",
    "## 5. Icons",
    "",
    "Hand-drawn inline SVG, authored in this repository. No icon library is bundled and",
    "no emoji is used as an icon.",
    "",
  );

  await fs.writeFile(path.resolve(process.cwd(), "ASSETS.md"), lines.join("\n"), "utf8");
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
