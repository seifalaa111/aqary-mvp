import sharp from "sharp";

/**
 * Floor-plan and master-plan drawings, generated from each unit's own record.
 *
 * These are schematic drawings, not architectural drawings of record — but they
 * are drawn from the real data (bedroom count, bathroom count, built-up area,
 * garden and terrace areas, floor, project), so what a buyer sees matches what
 * the listing says. That is why they are generated rather than sourced: a stock
 * floor plan of somebody else's apartment would be a lie about this unit.
 */

const INK = "#14211E";
const RULE = "#B9B2A6";
const WALL = "#14211E";
const FILL = "#F4F1EA";
const ROOM_FILL = "#FFFFFF";
const OUTDOOR = "#E7EDE4";
const ACCENT = "#B4833C";
const LABEL = "#5C6B66";

export interface FloorPlanInput {
  unitCode: string;
  projectName: string;
  unitType: string;
  buaSqm: number;
  gardenSqm?: number;
  terraceSqm?: number;
  bedrooms: number;
  bathrooms: number;
  floor?: number | null;
  locale?: "en" | "ar";
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  nameAr: string;
  area: number;
  kind: "room" | "outdoor" | "service";
}

/**
 * Slice-and-dice partition. The unit is split into a day zone (reception,
 * kitchen, guest WC) and a night zone (bedrooms and their bathrooms), which is
 * how Egyptian apartment plans of this size are actually organised.
 */
function partition(input: FloorPlanInput): { rects: Rect[]; w: number; h: number; outdoor: Rect[] } {
  const bua = Math.max(input.buaSqm, 40);
  const aspect = 1.45;
  const W = Math.sqrt(bua * aspect);
  const H = bua / W;

  const beds = Math.max(1, input.bedrooms);
  const baths = Math.max(1, input.bathrooms);

  // Programme shares of BUA.
  const receptionShare = beds >= 3 ? 0.3 : 0.34;
  const kitchenShare = 0.1;
  const bathShare = 0.045;
  const masterShare = beds === 1 ? 0.26 : 0.16;
  const otherBedShare = beds > 1 ? (1 - receptionShare - kitchenShare - baths * bathShare - masterShare - 0.1) / (beds - 1) : 0;

  const dayDepth = H * (receptionShare + kitchenShare + 0.06);
  const nightDepth = H - dayDepth;

  const rects: Rect[] = [];

  // --- Day zone: reception across the front, kitchen and WC beside it ------
  const receptionW = W * 0.62;
  rects.push({
    x: 0,
    y: 0,
    w: receptionW,
    h: dayDepth,
    name: "Reception",
    nameAr: "ريسبشن",
    area: round1((receptionW * dayDepth)),
    kind: "room",
  });

  const kitchenH = dayDepth * 0.62;
  rects.push({
    x: receptionW,
    y: 0,
    w: W - receptionW,
    h: kitchenH,
    name: "Kitchen",
    nameAr: "مطبخ",
    area: round1((W - receptionW) * kitchenH),
    kind: "service",
  });
  rects.push({
    x: receptionW,
    y: kitchenH,
    w: W - receptionW,
    h: dayDepth - kitchenH,
    name: "Guest WC",
    nameAr: "حمام ضيوف",
    area: round1((W - receptionW) * (dayDepth - kitchenH)),
    kind: "service",
  });

  // --- Circulation spine --------------------------------------------------
  const corridorH = Math.min(1.6, nightDepth * 0.16);
  rects.push({
    x: 0,
    y: dayDepth,
    w: W,
    h: corridorH,
    name: "Hall",
    nameAr: "صالة",
    area: round1(W * corridorH),
    kind: "service",
  });

  // --- Night zone: bedrooms in a row, en-suite on the master --------------
  const bedBandY = dayDepth + corridorH;
  const bedBandH = H - bedBandY;
  const totalBedShare = masterShare + otherBedShare * (beds - 1);
  let cursorX = 0;

  for (let i = 0; i < beds; i++) {
    const share = i === 0 ? masterShare : otherBedShare;
    const w = (share / totalBedShare) * W;
    const isMaster = i === 0;
    const ensuite = isMaster && baths > 1;
    const bedH = ensuite ? bedBandH * 0.72 : bedBandH;

    rects.push({
      x: cursorX,
      y: bedBandY,
      w,
      h: bedH,
      name: isMaster ? "Master bedroom" : `Bedroom ${i + 1}`,
      nameAr: isMaster ? "غرفة رئيسية" : `غرفة ${i + 1}`,
      area: round1(w * bedH),
      kind: "room",
    });

    if (ensuite) {
      rects.push({
        x: cursorX,
        y: bedBandY + bedH,
        w,
        h: bedBandH - bedH,
        name: "En-suite",
        nameAr: "حمام داخلي",
        area: round1(w * (bedBandH - bedH)),
        kind: "service",
      });
    }
    cursorX += w;
  }

  // --- Outdoor -------------------------------------------------------------
  const outdoor: Rect[] = [];
  const terrace = input.terraceSqm ?? 0;
  if (terrace > 0) {
    const h = terrace / W;
    outdoor.push({
      x: 0,
      y: -h,
      w: W,
      h,
      name: "Terrace",
      nameAr: "تراس",
      area: round1(terrace),
      kind: "outdoor",
    });
  }
  const garden = input.gardenSqm ?? 0;
  if (garden > 0) {
    const h = garden / W;
    outdoor.push({
      x: 0,
      y: H,
      w: W,
      h,
      name: "Private garden",
      nameAr: "حديقة خاصة",
      area: round1(garden),
      kind: "outdoor",
    });
  }
  if (terrace === 0 && garden === 0) {
    const balconyArea = Math.max(4, bua * 0.05);
    const h = balconyArea / (W * 0.5);
    outdoor.push({
      x: W * 0.5,
      y: -h,
      w: W * 0.5,
      h,
      name: "Balcony",
      nameAr: "بلكونة",
      area: round1(balconyArea),
      kind: "outdoor",
    });
  }

  return { rects, w: W, h: H, outdoor };
}

export function floorPlanSvg(input: FloorPlanInput): string {
  const { rects, w, h, outdoor } = partition(input);
  const isAr = input.locale === "ar";

  const minY = Math.min(0, ...outdoor.map((o) => o.y));
  const maxY = Math.max(h, ...outdoor.map((o) => o.y + o.h));
  const planW = w;
  const planH = maxY - minY;

  const PAD = 12; // metres of margin
  const HEADER = 9;
  const vbW = planW + PAD * 2;
  const vbH = planH + PAD * 2 + HEADER;

  const scale = 1000 / vbW;
  const pxW = 1000;
  const pxH = Math.round(vbH * scale);

  const shift = (r: Rect) => ({ ...r, y: r.y - minY + HEADER });

  const room = (r: Rect) => {
    const s = shift(r);
    const fill = s.kind === "outdoor" ? OUTDOOR : s.kind === "service" ? FILL : ROOM_FILL;
    const fontSize = Math.min(1.5, Math.max(0.85, Math.min(s.w, s.h) * 0.16));
    const showLabel = s.w > 2.6 && s.h > 1.6;
    return `
    <g>
      <rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}"
            fill="${fill}" stroke="${WALL}" stroke-width="0.14" />
      ${
        showLabel
          ? `<text x="${f(s.x + s.w / 2)}" y="${f(s.y + s.h / 2 - fontSize * 0.15)}" text-anchor="middle"
              font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="${f(fontSize)}" fill="${INK}">${escapeXml(isAr ? s.nameAr : s.name)}</text>
             <text x="${f(s.x + s.w / 2)}" y="${f(s.y + s.h / 2 + fontSize * 1.1)}" text-anchor="middle"
              font-family="IBM Plex Mono, monospace" font-size="${f(fontSize * 0.78)}" fill="${LABEL}">${s.area} m²</text>`
          : ""
      }
    </g>`;
  };

  const title = isAr
    ? `${input.projectName} · ${input.unitCode}`
    : `${input.projectName} · ${input.unitCode}`;
  const sub = isAr
    ? `${input.bedrooms} غرف · ${input.bathrooms} حمام · ${Math.round(input.buaSqm)} م² بناء${input.floor ? ` · الدور ${input.floor}` : ""}`
    : `${input.bedrooms} bed · ${input.bathrooms} bath · ${Math.round(input.buaSqm)} m² BUA${input.floor ? ` · floor ${input.floor}` : ""}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${f(vbW)} ${f(vbH)}">
  <rect width="100%" height="100%" fill="#FAF8F3" />
  <g transform="translate(${f(PAD)}, ${f(PAD)})">
    <text x="0" y="2.6" font-family="Newsreader, Georgia, serif" font-size="3.1" fill="${INK}">${escapeXml(title)}</text>
    <text x="0" y="5.9" font-family="IBM Plex Mono, monospace" font-size="1.55" fill="${LABEL}">${escapeXml(sub)}</text>
    <line x1="0" y1="7.4" x2="${f(planW)}" y2="7.4" stroke="${RULE}" stroke-width="0.1" />

    ${outdoor.map(room).join("")}
    ${rects.map(room).join("")}

    <!-- external wall -->
    <rect x="0" y="${f(HEADER - minY)}" width="${f(w)}" height="${f(h)}"
          fill="none" stroke="${WALL}" stroke-width="0.42" />

    <!-- entrance marker -->
    <g transform="translate(${f(w * 0.66)}, ${f(HEADER - minY + h)})">
      <path d="M 0 0 L 2.4 0" stroke="${ACCENT}" stroke-width="0.5" />
      <path d="M 0 0 A 2.4 2.4 0 0 1 2.4 -2.4" fill="none" stroke="${ACCENT}" stroke-width="0.12" stroke-dasharray="0.5 0.4" />
      <text x="3.1" y="0.5" font-family="IBM Plex Mono, monospace" font-size="1.3" fill="${ACCENT}">${isAr ? "المدخل" : "ENTRY"}</text>
    </g>

    <!-- scale bar -->
    <g transform="translate(0, ${f(HEADER - minY + planH + 5)})">
      <line x1="0" y1="0" x2="5" y2="0" stroke="${INK}" stroke-width="0.18" />
      <line x1="0" y1="-0.7" x2="0" y2="0.7" stroke="${INK}" stroke-width="0.18" />
      <line x1="5" y1="-0.7" x2="5" y2="0.7" stroke="${INK}" stroke-width="0.18" />
      <text x="6" y="0.5" font-family="IBM Plex Mono, monospace" font-size="1.35" fill="${LABEL}">5 m</text>
      <text x="${f(planW)}" y="0.5" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="1.2" fill="${LABEL}">${
        isAr ? "رسم تخطيطي — ليس رسمًا هندسيًا معتمدًا" : "SCHEMATIC — NOT AN ARCHITECTURAL DRAWING OF RECORD"
      }</text>
    </g>

    <!-- north arrow -->
    <g transform="translate(${f(planW - 4)}, ${f(HEADER - minY - 3.5)})">
      <path d="M 0 -2.6 L 1.1 1.4 L 0 0.6 L -1.1 1.4 Z" fill="${INK}" />
      <text x="0" y="3.4" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="1.3" fill="${LABEL}">N</text>
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Master plan
// ---------------------------------------------------------------------------

export interface MasterPlanInput {
  projectName: string;
  developerName: string;
  city: string;
  /** Cluster this unit sits in, so the marker lands somewhere meaningful. */
  phase?: string | null;
  unitCode: string;
  seed: number;
  locale?: "en" | "ar";
}

export function masterPlanSvg(input: MasterPlanInput): string {
  const isAr = input.locale === "ar";
  const W = 1000;
  const H = 700;
  const rng = mulberry(input.seed);

  const clusters: { x: number; y: number; w: number; h: number; label: string }[] = [];
  const cols = 4;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 1 && c === 1) continue; // central park
      clusters.push({
        x: 90 + c * 205 + rng() * 10,
        y: 110 + r * 175 + rng() * 8,
        w: 150 + rng() * 25,
        h: 118 + rng() * 18,
        label: String.fromCharCode(65 + clusters.length),
      });
    }
  }

  const markerIndex = input.seed % clusters.length;
  const marker = clusters[markerIndex]!;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#FAF8F3" />

  <!-- site boundary -->
  <rect x="60" y="80" width="880" height="565" fill="#F1EDE6" stroke="${RULE}" stroke-width="1.5" />

  <!-- spine road -->
  <path d="M 60 372 H 940" stroke="#DED7CB" stroke-width="26" fill="none" />
  <path d="M 60 372 H 940" stroke="#FAF8F3" stroke-width="1.5" stroke-dasharray="10 12" fill="none" />
  <path d="M 500 80 V 645" stroke="#DED7CB" stroke-width="22" fill="none" />
  <path d="M 500 80 V 645" stroke="#FAF8F3" stroke-width="1.5" stroke-dasharray="10 12" fill="none" />

  <!-- central park -->
  <rect x="298" y="288" width="200" height="165" rx="6" fill="${OUTDOOR}" stroke="#CBD8C6" stroke-width="1.2" />
  <text x="398" y="375" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" fill="#6E7F72">${
    isAr ? "الحديقة المركزية" : "CENTRAL PARK"
  }</text>

  <!-- clusters -->
  ${clusters
    .map(
      (c, i) => `<g>
    <rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${c.w.toFixed(1)}" height="${c.h.toFixed(1)}" rx="3"
          fill="${i === markerIndex ? "#FFFFFF" : "#FFFFFF"}" stroke="${i === markerIndex ? ACCENT : RULE}" stroke-width="${i === markerIndex ? 2.2 : 1}" />
    ${footprints(c, rng, i === markerIndex)}
    <text x="${(c.x + 7).toFixed(1)}" y="${(c.y + 15).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="11" fill="${
      i === markerIndex ? ACCENT : LABEL
    }">${isAr ? "قطاع" : "PHASE"} ${c.label}</text>
  </g>`,
    )
    .join("")}

  <!-- unit marker -->
  <g transform="translate(${(marker.x + marker.w / 2).toFixed(1)}, ${(marker.y + marker.h / 2).toFixed(1)})">
    <circle r="20" fill="none" stroke="${ACCENT}" stroke-width="1.4" opacity="0.5" />
    <circle r="8" fill="${ACCENT}" />
    <circle r="3" fill="#FAF8F3" />
    <text x="0" y="-30" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="13" fill="${ACCENT}">${escapeXml(
      input.unitCode,
    )}</text>
  </g>

  <!-- header -->
  <text x="60" y="42" font-family="Newsreader, Georgia, serif" font-size="27" fill="${INK}">${escapeXml(input.projectName)}</text>
  <text x="60" y="64" font-family="IBM Plex Mono, monospace" font-size="12.5" fill="${LABEL}">${escapeXml(
    `${input.developerName.toUpperCase()} · ${input.city.toUpperCase()} · ${isAr ? "المخطط العام" : "MASTER PLAN"}`,
  )}</text>

  <!-- footer -->
  <text x="60" y="672" font-family="IBM Plex Mono, monospace" font-size="11" fill="${LABEL}">${
    isAr
      ? "مخطط توضيحي مُولَّد من بيانات المشروع — ليس المخطط الرسمي للمطوّر"
      : "SCHEMATIC, GENERATED FROM PROJECT DATA — NOT THE DEVELOPER'S OFFICIAL MASTER PLAN"
  }</text>
  <g transform="translate(900, 620)">
    <path d="M 0 -14 L 6 8 L 0 3.5 L -6 8 Z" fill="${INK}" />
    <text x="0" y="20" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="${LABEL}">N</text>
  </g>
</svg>`;
}

function footprints(
  c: { x: number; y: number; w: number; h: number },
  rng: () => number,
  highlight: boolean,
) {
  const out: string[] = [];
  const cols = 4;
  const rows = 3;
  const pad = 14;
  const cw = (c.w - pad * 2) / cols;
  const ch = (c.h - pad * 2 - 8) / rows;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      if (rng() < 0.18) continue;
      out.push(
        `<rect x="${(c.x + pad + i * cw + 1.5).toFixed(1)}" y="${(c.y + pad + 8 + r * ch + 1.5).toFixed(1)}" width="${(cw - 3).toFixed(1)}" height="${(ch - 3).toFixed(1)}" fill="${
          highlight ? "#F5E7D0" : "#EDE8DE"
        }" stroke="${RULE}" stroke-width="0.6" />`,
      );
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------------------

export async function renderSvgToPng(svg: string, width: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
}

export async function renderSvgToWebp(svg: string, width: number, quality = 84): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize({ width }).webp({ quality }).toBuffer();
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Number(n.toFixed(2));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
