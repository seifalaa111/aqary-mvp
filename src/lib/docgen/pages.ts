import sharp from "sharp";

/**
 * Document page renderer.
 *
 * Aqary's seed data ships real, readable contract pages, payment receipts and
 * developer account statements — rendered from each seeded contract's own
 * figures — together with a `.truth.json` sidecar recording exactly where on the
 * page every value was drawn.
 *
 * That sidecar is what makes the rest of the system honest: the mock extraction
 * engine reads the page and cites the real region, and when an analyst clicks a
 * citation in the review workspace the highlight lands on the actual number.
 */

export const PAGE_W = 1240;
export const PAGE_H = 1754; // A4 at 150 dpi

const INK = "#161B18";
const MUTED = "#5F6B66";
const RULE = "#C9C3B7";
const PAPER = "#FDFCF8";
const STAMP = "#2F5D8C";

const AR_FONT = "'Segoe UI', Tahoma, 'Arial', sans-serif";
const LAT_FONT = "'Segoe UI', 'Arial', sans-serif";
const MONO_FONT = "'Consolas', 'Courier New', monospace";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedValue {
  key: string;
  page: number;
  bbox: BBox;
  num?: string;
  date?: string;
  text?: string;
  clauseText?: string;
}

interface Builder {
  svg: string[];
  placed: PlacedValue[];
  page: number;
}

/** Normalised bbox for a right-aligned value drawn at (xRight, yBaseline). */
function bboxFor(xRight: number, yBaseline: number, approxW: number, fontSize: number): BBox {
  return {
    x: round4((xRight - approxW) / PAGE_W),
    y: round4((yBaseline - fontSize) / PAGE_H),
    w: round4(approxW / PAGE_W),
    h: round4((fontSize * 1.35) / PAGE_H),
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------------------

export interface ContractDocInput {
  developerNameAr: string;
  developerNameEn: string;
  projectNameAr: string;
  projectNameEn: string;
  unitCode: string;
  phase?: string | null;
  buyerNameAr: string;
  buyerNationalId: string;
  contractNumber: string;
  signingDate: Date;
  unitTypeAr: string;
  buaSqm: number;
  gardenSqm?: number;
  floor?: number | null;
  bedrooms: number;
  totalPrice: string;
  downPayment: string;
  installmentAmount: string;
  installmentsCount: number;
  frequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  planStart: Date;
  deliveryDate: Date;
  maintenanceDeposit: string;
  clubFee: string;
  assignmentFeePct: number;
  cancellationPenaltyPct: number;
  minMonthsBeforeAssignment: number;
  schedule: { seq: number; dueDate: Date; amount: string; balance: string; label?: string }[];
}

const FREQ_AR: Record<ContractDocInput["frequency"], string> = {
  MONTHLY: "شهري",
  QUARTERLY: "ربع سنوي",
  SEMI_ANNUAL: "نصف سنوي",
  ANNUAL: "سنوي",
};
const FREQ_EN: Record<ContractDocInput["frequency"], string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-annual",
  ANNUAL: "Annual",
};

export interface RenderedDocument {
  pages: string[];
  placed: PlacedValue[];
  clauses: { kind: "ASSIGNMENT" | "CANCELLATION" | "DELIVERY"; text: string; page: number }[];
}

export function renderContract(d: ContractDocInput): RenderedDocument {
  const placed: PlacedValue[] = [];
  const pages: string[] = [];

  // ---------------- page 1 — parties and unit ----------------
  {
    const b: Builder = { svg: [], placed, page: 1 };
    header(b, d, "عقد بيع وحدة سكنية", "UNIT SALE CONTRACT");

    sectionTitle(b, 300, "أولاً: أطراف التعاقد", "Parties");
    kvAr(b, 350, "الطرف الأول (البائع)", d.developerNameAr, d.developerNameEn);
    kvAr(b, 398, "الطرف الثاني (المشتري)", d.buyerNameAr, "");
    kvAr(b, 446, "الرقم القومي", d.buyerNationalId, "National ID");

    const signY = 494;
    kvAr(b, signY, "تاريخ تحرير العقد", arDate(d.signingDate), enDate(d.signingDate));
    placed.push({
      key: "CONTRACT_SIGNING_DATE",
      page: 1,
      bbox: bboxFor(880, signY, 190, 21),
      date: d.signingDate.toISOString(),
    });

    kvAr(b, 542, "رقم العقد", d.contractNumber, "Contract no.");

    sectionTitle(b, 620, "ثانياً: بيانات الوحدة", "The unit");
    kvAr(b, 670, "المشروع", d.projectNameAr, d.projectNameEn);
    kvAr(b, 718, "كود الوحدة", d.unitCode, d.phase ? `Phase ${d.phase}` : "");
    kvAr(b, 766, "نوع الوحدة", d.unitTypeAr, "");
    kvAr(b, 814, "مساحة البناء", `${d.buaSqm.toFixed(0)} م²`, `${d.buaSqm.toFixed(0)} sqm BUA`);
    if (d.gardenSqm && d.gardenSqm > 0) {
      kvAr(b, 862, "مساحة الحديقة", `${d.gardenSqm.toFixed(0)} م²`, `${d.gardenSqm.toFixed(0)} sqm garden`);
    }
    kvAr(b, 910, "الدور", d.floor != null ? String(d.floor) : "—", "Floor");
    kvAr(b, 958, "عدد الغرف", String(d.bedrooms), "Bedrooms");

    paragraph(
      b,
      1050,
      [
        "يقر الطرف الثاني بأنه عاين الوحدة محل التعاقد المعاينة النافية للجهالة، وقبلها بحالتها",
        "ومواصفاتها الواردة بهذا العقد وملاحقه، وأن كافة الملاحق المرفقة تعتبر جزءاً لا يتجزأ",
        "من هذا العقد ومكملة له.",
      ],
    );

    footer(b, 1, 5, d.contractNumber);
    pages.push(page(b));
  }

  // ---------------- page 2 — the financial terms ----------------
  {
    const b: Builder = { svg: [], placed, page: 2 };
    header(b, d, "ثالثاً: الشروط المالية", "FINANCIAL TERMS");

    let y = 300;
    const row = (
      labelAr: string,
      labelEn: string,
      value: string,
      key?: string,
      payload?: Partial<PlacedValue>,
      emphasis = false,
    ) => {
      moneyRow(b, y, labelAr, labelEn, value, emphasis);
      if (key) {
        placed.push({
          key,
          page: 2,
          bbox: bboxFor(1090, y, Math.max(150, value.length * 13), emphasis ? 26 : 21),
          ...payload,
        });
      }
      y += emphasis ? 66 : 54;
    };

    row("إجمالي ثمن الوحدة", "Total unit price", `${fmt(d.totalPrice)} ج.م`, "TOTAL_PRICE", { num: d.totalPrice }, true);
    row("الدفعة المقدمة", "Down payment", `${fmt(d.downPayment)} ج.م`, "DOWN_PAYMENT", { num: d.downPayment });
    row("قيمة القسط", "Installment amount", `${fmt(d.installmentAmount)} ج.م`, "INSTALLMENT_AMOUNT", {
      num: d.installmentAmount,
    });
    row("دورية السداد", "Payment frequency", `${FREQ_AR[d.frequency]} / ${FREQ_EN[d.frequency]}`, "INSTALLMENT_FREQUENCY", {
      text: d.frequency,
    });
    row("عدد الأقساط", "Number of installments", String(d.installmentsCount), "NUMBER_OF_INSTALLMENTS", {
      num: String(d.installmentsCount),
    });
    row("تاريخ بدء السداد", "Plan start date", arDate(d.planStart), "PLAN_START_DATE", {
      date: d.planStart.toISOString(),
    });
    row("تاريخ التسليم التعاقدي", "Contractual delivery", arDate(d.deliveryDate), "DELIVERY_DATE", {
      date: d.deliveryDate.toISOString(),
    });
    row("وديعة الصيانة", "Maintenance deposit", `${fmt(d.maintenanceDeposit)} ج.م`, "MAINTENANCE_DEPOSIT", {
      num: d.maintenanceDeposit,
    });
    row("رسوم النادي", "Club membership fee", `${fmt(d.clubFee)} ج.م`, "CLUB_FEE", { num: d.clubFee });

    paragraph(b, y + 40, [
      "يلتزم الطرف الثاني بسداد الأقساط في مواعيدها المحددة بجدول السداد المرفق كملحق (أ).",
      "وفي حالة التأخر عن السداد لمدة تجاوز ثلاثين يوماً يستحق على الطرف الثاني غرامة تأخير",
      "بواقع 1% شهرياً من قيمة القسط المتأخر.",
    ]);

    footer(b, 2, 5, d.contractNumber);
    pages.push(page(b));
  }

  // ---------------- page 3 — payment schedule (annex A) ----------------
  {
    const b: Builder = { svg: [], placed, page: 3 };
    header(b, d, "ملحق (أ) — جدول السداد", "ANNEX A — PAYMENT SCHEDULE");

    const startY = 300;
    const rowH = 34;
    b.svg.push(
      `<g font-family="${AR_FONT}" font-size="17" fill="${MUTED}">
        <text x="1090" y="${startY}" text-anchor="end">م</text>
        <text x="960" y="${startY}" text-anchor="end">تاريخ الاستحقاق</text>
        <text x="700" y="${startY}" text-anchor="end">قيمة القسط (ج.م)</text>
        <text x="420" y="${startY}" text-anchor="end">الرصيد المتبقي (ج.م)</text>
        <text x="200" y="${startY}" text-anchor="end">البيان</text>
      </g>
      <line x1="150" y1="${startY + 12}" x2="1090" y2="${startY + 12}" stroke="${RULE}" stroke-width="1.4" />`,
    );

    const visible = d.schedule.slice(0, 34);
    visible.forEach((r, i) => {
      const y = startY + 44 + i * rowH;
      b.svg.push(
        `<g font-family="${MONO_FONT}" font-size="16" fill="${INK}">
          <text x="1090" y="${y}" text-anchor="end">${r.seq}</text>
          <text x="960" y="${y}" text-anchor="end">${enDate(r.dueDate)}</text>
          <text x="700" y="${y}" text-anchor="end">${fmt(r.amount)}</text>
          <text x="420" y="${y}" text-anchor="end">${fmt(r.balance)}</text>
        </g>
        <text x="200" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="15" fill="${MUTED}">${escapeXml(
          r.label ?? "قسط دوري",
        )}</text>
        <line x1="150" y1="${y + 10}" x2="1090" y2="${y + 10}" stroke="${RULE}" stroke-width="0.5" opacity="0.6" />`,
      );
    });

    if (d.schedule.length > visible.length) {
      b.svg.push(
        `<text x="1090" y="${startY + 60 + visible.length * rowH}" text-anchor="end" font-family="${AR_FONT}" font-size="15" fill="${MUTED}">... يتبع (${
          d.schedule.length - visible.length
        } قسط إضافي)</text>`,
      );
    }

    footer(b, 3, 5, d.contractNumber);
    pages.push(page(b));
  }

  // ---------------- page 4 — assignment and cancellation clauses ----------------
  const assignmentText =
    `يحق للطرف الثاني التنازل عن هذا العقد للغير بعد سداد ما لا يقل عن ${pctAr(d.minMonthsBeforeAssignment)} ` +
    `شهراً من تاريخ التعاقد وبعد الحصول على موافقة كتابية مسبقة من الطرف الأول، ` +
    `وذلك مقابل سداد رسوم تنازل قدرها ${d.assignmentFeePct.toFixed(2)}% من إجمالي ثمن الوحدة. ` +
    `ولا يعتد بأي تنازل لم يتم إثباته في سجلات الطرف الأول.`;
  const cancellationText =
    `في حالة رغبة الطرف الثاني في إلغاء التعاقد، يستحق للطرف الأول خصم نسبة ${d.cancellationPenaltyPct.toFixed(
      2,
    )}% من إجمالي ثمن الوحدة كتعويض اتفاقي، ` +
    `ويُرد باقي المبالغ المسددة على أقساط سنوية متساوية على مدى ثلاث سنوات من تاريخ اعتماد طلب الإلغاء.`;
  const deliveryText =
    `يلتزم الطرف الأول بتسليم الوحدة في موعد أقصاه ${arDate(d.deliveryDate)}، ` +
    `ويجوز للطرف الأول التأخير لمدة لا تجاوز ستة أشهر دون أن يترتب على ذلك أي تعويض.`;

  {
    const b: Builder = { svg: [], placed, page: 4 };
    header(b, d, "رابعاً: التنازل والإلغاء", "ASSIGNMENT & CANCELLATION");

    clause(b, 300, "بند (7) — التنازل عن العقد", "Clause 7 — Assignment", assignmentText);

    // The assignment fee percentage is the value the extraction engine reads here.
    placed.push({
      key: "ASSIGNMENT_FEE_PCT",
      page: 4,
      bbox: { x: 0.13, y: 0.238, w: 0.2, h: 0.016 },
      num: d.assignmentFeePct.toFixed(2),
      clauseText: assignmentText,
    });

    clause(b, 620, "بند (8) — إلغاء التعاقد", "Clause 8 — Cancellation", cancellationText);
    placed.push({
      key: "CANCELLATION_PENALTY_PCT",
      page: 4,
      bbox: { x: 0.42, y: 0.372, w: 0.12, h: 0.016 },
      num: d.cancellationPenaltyPct.toFixed(2),
      clauseText: cancellationText,
    });

    clause(b, 900, "بند (9) — التسليم", "Clause 9 — Delivery", deliveryText);

    paragraph(b, 1180, [
      "حرر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها عند اللزوم.",
    ]);

    footer(b, 4, 5, d.contractNumber);
    pages.push(page(b));
  }

  // ---------------- page 5 — signatures ----------------
  {
    const b: Builder = { svg: [], placed, page: 5 };
    header(b, d, "خامساً: التوقيعات", "SIGNATURES");

    b.svg.push(`
      <g font-family="${AR_FONT}" font-size="19" fill="${INK}">
        <text x="1090" y="420" text-anchor="end">الطرف الأول (البائع)</text>
        <text x="1090" y="470" text-anchor="end" font-size="16" fill="${MUTED}">${escapeXml(d.developerNameAr)}</text>
        <text x="560" y="420" text-anchor="end">الطرف الثاني (المشتري)</text>
        <text x="560" y="470" text-anchor="end" font-size="16" fill="${MUTED}">${escapeXml(d.buyerNameAr)}</text>
      </g>
      <line x1="760" y1="600" x2="1090" y2="600" stroke="${INK}" stroke-width="1.2" />
      <line x1="230" y1="600" x2="560" y2="600" stroke="${INK}" stroke-width="1.2" />
      <g transform="translate(880, 560) rotate(-8)" opacity="0.55">
        <ellipse rx="105" ry="52" fill="none" stroke="${STAMP}" stroke-width="2.4" />
        <ellipse rx="93" ry="42" fill="none" stroke="${STAMP}" stroke-width="1" />
        <text text-anchor="middle" y="-8" font-family="${AR_FONT}" font-size="15" fill="${STAMP}">${escapeXml(
          d.developerNameAr.slice(0, 22),
        )}</text>
        <text text-anchor="middle" y="14" font-family="${MONO_FONT}" font-size="12" fill="${STAMP}">OFFICIAL SEAL</text>
      </g>
      <path d="M 260 590 c 30 -34 52 12 78 -18 c 22 -26 44 22 70 -6 c 20 -22 40 14 58 -4"
            fill="none" stroke="#1A2E5C" stroke-width="2.4" stroke-linecap="round" opacity="0.85" />
    `);

    footer(b, 5, 5, d.contractNumber);
    pages.push(page(b));
  }

  return {
    pages,
    placed,
    clauses: [
      { kind: "ASSIGNMENT", text: assignmentText, page: 4 },
      { kind: "CANCELLATION", text: cancellationText, page: 4 },
      { kind: "DELIVERY", text: deliveryText, page: 4 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export interface ReceiptDocInput {
  developerNameAr: string;
  projectNameAr: string;
  unitCode: string;
  buyerNameAr: string;
  receiptNumber: string;
  amount: string;
  date: Date;
  method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
  reference: string | null;
  installmentLabel: string;
  /** Renders the page as a slightly skewed, shadowed phone photograph. */
  photographed?: boolean;
}

const METHOD_AR: Record<ReceiptDocInput["method"], string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CHEQUE: "شيك",
  CARD: "بطاقة",
};

export function renderReceipt(r: ReceiptDocInput): { svg: string; placed: PlacedValue[] } {
  const W = 900;
  const H = 1180;
  const placed: PlacedValue[] = [];

  const body = `
    <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="#FFFEFA" stroke="${RULE}" stroke-width="1.5" />
    <text x="${W - 80}" y="120" text-anchor="end" font-family="${AR_FONT}" font-size="26" fill="${INK}">${escapeXml(
      r.developerNameAr,
    )}</text>
    <text x="${W - 80}" y="156" text-anchor="end" font-family="${AR_FONT}" font-size="17" fill="${MUTED}">${escapeXml(
      r.projectNameAr,
    )}</text>
    <line x1="80" y1="185" x2="${W - 80}" y2="185" stroke="${RULE}" stroke-width="1.2" />

    <text x="${W / 2}" y="240" text-anchor="middle" font-family="${AR_FONT}" font-size="30" fill="${INK}">إيصال سداد</text>
    <text x="${W / 2}" y="272" text-anchor="middle" font-family="${MONO_FONT}" font-size="15" fill="${MUTED}">PAYMENT RECEIPT · ${escapeXml(
      r.receiptNumber,
    )}</text>

    <g font-family="${AR_FONT}" font-size="18" fill="${MUTED}">
      <text x="${W - 80}" y="360" text-anchor="end">المستلم من السيد/</text>
      <text x="${W - 80}" y="430" text-anchor="end">عن الوحدة رقم</text>
      <text x="${W - 80}" y="500" text-anchor="end">بيان الدفعة</text>
      <text x="${W - 80}" y="570" text-anchor="end">طريقة السداد</text>
      <text x="${W - 80}" y="640" text-anchor="end">التاريخ</text>
    </g>
    <g font-family="${AR_FONT}" font-size="20" fill="${INK}">
      <text x="440" y="360" text-anchor="end">${escapeXml(r.buyerNameAr)}</text>
      <text x="440" y="430" text-anchor="end">${escapeXml(r.unitCode)}</text>
      <text x="440" y="500" text-anchor="end">${escapeXml(r.installmentLabel)}</text>
      <text x="440" y="570" text-anchor="end">${METHOD_AR[r.method]}${r.reference ? ` — ${escapeXml(r.reference)}` : ""}</text>
      <text x="440" y="640" text-anchor="end">${arDate(r.date)}</text>
    </g>

    <rect x="80" y="700" width="${W - 160}" height="110" fill="#F3EFE6" stroke="${RULE}" stroke-width="1" />
    <text x="${W - 110}" y="748" text-anchor="end" font-family="${AR_FONT}" font-size="19" fill="${MUTED}">المبلغ المدفوع</text>
    <text x="${W - 110}" y="792" text-anchor="end" font-family="${MONO_FONT}" font-size="34" fill="${INK}">${fmt(
      r.amount,
    )} EGP</text>

    <text x="${W - 80}" y="880" text-anchor="end" font-family="${AR_FONT}" font-size="16" fill="${MUTED}">فقط ${escapeXml(
      arabicWords(r.amount),
    )} جنيهاً مصرياً لا غير</text>

    <g transform="translate(${W - 210}, 1010) rotate(-6)" opacity="0.5">
      <ellipse rx="86" ry="44" fill="none" stroke="${STAMP}" stroke-width="2" />
      <text text-anchor="middle" y="-4" font-family="${AR_FONT}" font-size="14" fill="${STAMP}">تم التحصيل</text>
      <text text-anchor="middle" y="18" font-family="${MONO_FONT}" font-size="11" fill="${STAMP}">RECEIVED</text>
    </g>
    <path d="M 130 1030 c 26 -28 44 10 66 -14 c 18 -22 38 18 60 -4"
          fill="none" stroke="#1A2E5C" stroke-width="2.2" stroke-linecap="round" opacity="0.8" />
    <text x="80" y="1110" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(r.receiptNumber)}</text>
  `;

  // Amount region — 34px mono digits right-aligned at x = W-110.
  const amountW = fmt(r.amount).length * 20 + 60;
  placed.push({
    key: "RECEIPT_AMOUNT",
    page: 1,
    bbox: {
      x: round4((W - 110 - amountW) / W),
      y: round4((792 - 34) / H),
      w: round4(amountW / W),
      h: round4(46 / H),
    },
    num: r.amount,
  });
  placed.push({
    key: "RECEIPT_DATE",
    page: 1,
    bbox: { x: round4(260 / W), y: round4(618 / H), w: round4(180 / W), h: round4(30 / H) },
    date: r.date.toISOString(),
  });

  const tilt = r.photographed ? (hashFloat(r.receiptNumber) - 0.5) * 3.2 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.05" />
        <stop offset="55%" stop-color="#000" stop-opacity="0" />
        <stop offset="100%" stop-color="#000" stop-opacity="0.09" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="${r.photographed ? "#DCD7CC" : PAPER}" />
    <g transform="rotate(${tilt.toFixed(2)} ${W / 2} ${H / 2})">${body}</g>
    ${r.photographed ? `<rect width="100%" height="100%" fill="url(#shade)" />` : ""}
  </svg>`;

  return { svg, placed };
}

// ---------------------------------------------------------------------------
// Developer account statement — the highest-value verification document
// ---------------------------------------------------------------------------

export interface StatementDocInput {
  developerNameAr: string;
  developerNameEn: string;
  projectNameAr: string;
  unitCode: string;
  buyerNameAr: string;
  contractNumber: string;
  issuedAt: Date;
  totalPrice: string;
  amountPaid: string;
  outstanding: string;
  nextDueDate: Date;
  nextDueAmount: string;
  rows: { date: Date; description: string; debit?: string; credit?: string; balance: string }[];
}

export function renderStatement(s: StatementDocInput): { svg: string; placed: PlacedValue[] } {
  const placed: PlacedValue[] = [];
  const b: Builder = { svg: [], placed, page: 1 };

  b.svg.push(`
    <text x="1090" y="120" text-anchor="end" font-family="${AR_FONT}" font-size="28" fill="${INK}">${escapeXml(
      s.developerNameAr,
    )}</text>
    <text x="1090" y="154" text-anchor="end" font-family="${MONO_FONT}" font-size="14" fill="${MUTED}">${escapeXml(
      s.developerNameEn.toUpperCase(),
    )}</text>
    <line x1="150" y1="180" x2="1090" y2="180" stroke="${INK}" stroke-width="1.6" />
    <text x="620" y="238" text-anchor="middle" font-family="${AR_FONT}" font-size="30" fill="${INK}">كشف حساب عميل</text>
    <text x="620" y="268" text-anchor="middle" font-family="${MONO_FONT}" font-size="14" fill="${MUTED}">CUSTOMER ACCOUNT STATEMENT</text>

    <g font-family="${AR_FONT}" font-size="17" fill="${MUTED}">
      <text x="1090" y="336" text-anchor="end">العميل</text>
      <text x="1090" y="372" text-anchor="end">المشروع / الوحدة</text>
      <text x="1090" y="408" text-anchor="end">رقم العقد</text>
      <text x="1090" y="444" text-anchor="end">تاريخ الإصدار</text>
    </g>
    <g font-family="${AR_FONT}" font-size="18" fill="${INK}">
      <text x="780" y="336" text-anchor="end">${escapeXml(s.buyerNameAr)}</text>
      <text x="780" y="372" text-anchor="end">${escapeXml(s.projectNameAr)} — ${escapeXml(s.unitCode)}</text>
      <text x="780" y="408" text-anchor="end">${escapeXml(s.contractNumber)}</text>
      <text x="780" y="444" text-anchor="end">${arDate(s.issuedAt)}</text>
    </g>
  `);

  // Summary block — the figures an analyst promotes to DEVELOPER_CONFIRMED.
  const boxY = 500;
  b.svg.push(
    `<rect x="150" y="${boxY}" width="940" height="180" fill="#F3EFE6" stroke="${RULE}" stroke-width="1.2" />`,
  );
  const sum = (i: number, labelAr: string, value: string, key: string, num: string) => {
    const y = boxY + 62 + i * 52;
    b.svg.push(
      `<text x="1060" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="18" fill="${MUTED}">${labelAr}</text>
       <text x="640" y="${y}" text-anchor="end" font-family="${MONO_FONT}" font-size="24" fill="${INK}">${fmt(value)} EGP</text>`,
    );
    placed.push({ key, page: 1, bbox: bboxFor(640, y, fmt(value).length * 14 + 60, 24), num });
  };
  sum(0, "إجمالي ثمن الوحدة", s.totalPrice, "TOTAL_PRICE", s.totalPrice);
  sum(1, "إجمالي المسدد حتى تاريخه", s.amountPaid, "AMOUNT_PAID", s.amountPaid);
  sum(2, "الرصيد المستحق", s.outstanding, "OUTSTANDING_BALANCE", s.outstanding);

  const nextY = boxY + 240;
  b.svg.push(
    `<text x="1090" y="${nextY}" text-anchor="end" font-family="${AR_FONT}" font-size="18" fill="${MUTED}">القسط القادم</text>
     <text x="700" y="${nextY}" text-anchor="end" font-family="${MONO_FONT}" font-size="19" fill="${INK}">${fmt(
       s.nextDueAmount,
     )} EGP — ${enDate(s.nextDueDate)}</text>`,
  );
  placed.push({
    key: "NEXT_DUE_DATE",
    page: 1,
    bbox: bboxFor(700, nextY, 300, 19),
    date: s.nextDueDate.toISOString(),
  });

  // Ledger
  const ledY = nextY + 70;
  b.svg.push(
    `<g font-family="${AR_FONT}" font-size="16" fill="${MUTED}">
      <text x="1090" y="${ledY}" text-anchor="end">التاريخ</text>
      <text x="880" y="${ledY}" text-anchor="end">البيان</text>
      <text x="560" y="${ledY}" text-anchor="end">مدين</text>
      <text x="400" y="${ledY}" text-anchor="end">دائن</text>
      <text x="230" y="${ledY}" text-anchor="end">الرصيد</text>
     </g>
     <line x1="150" y1="${ledY + 12}" x2="1090" y2="${ledY + 12}" stroke="${RULE}" stroke-width="1.2" />`,
  );
  s.rows.slice(0, 22).forEach((r, i) => {
    const y = ledY + 44 + i * 30;
    b.svg.push(
      `<g font-family="${MONO_FONT}" font-size="14" fill="${INK}">
        <text x="1090" y="${y}" text-anchor="end">${enDate(r.date)}</text>
        <text x="560" y="${y}" text-anchor="end">${r.debit ? fmt(r.debit) : "—"}</text>
        <text x="400" y="${y}" text-anchor="end">${r.credit ? fmt(r.credit) : "—"}</text>
        <text x="230" y="${y}" text-anchor="end">${fmt(r.balance)}</text>
       </g>
       <text x="880" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="14" fill="${MUTED}">${escapeXml(
         r.description,
       )}</text>`,
    );
  });

  b.svg.push(
    `<text x="620" y="1690" text-anchor="middle" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(
      s.contractNumber,
    )} · ISSUED ${enDate(s.issuedAt)}</text>`,
  );

  return { svg: page(b), placed };
}

// ---------------------------------------------------------------------------
// Shared drawing helpers
// ---------------------------------------------------------------------------

function page(b: Builder): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <rect width="100%" height="100%" fill="${PAPER}" />
    ${b.svg.join("\n")}
  </svg>`;
}

function header(b: Builder, d: ContractDocInput, titleAr: string, titleEn: string) {
  b.svg.push(`
    <text x="1090" y="110" text-anchor="end" font-family="${AR_FONT}" font-size="26" fill="${INK}">${escapeXml(
      d.developerNameAr,
    )}</text>
    <text x="1090" y="142" text-anchor="end" font-family="${MONO_FONT}" font-size="13" fill="${MUTED}">${escapeXml(
      d.developerNameEn.toUpperCase(),
    )} · ${escapeXml(d.projectNameEn.toUpperCase())}</text>
    <line x1="150" y1="170" x2="1090" y2="170" stroke="${INK}" stroke-width="1.6" />
    <text x="1090" y="228" text-anchor="end" font-family="${AR_FONT}" font-size="27" fill="${INK}">${escapeXml(titleAr)}</text>
    <text x="150" y="228" font-family="${MONO_FONT}" font-size="14" fill="${MUTED}">${escapeXml(titleEn)}</text>
  `);
}

function sectionTitle(b: Builder, y: number, ar: string, en: string) {
  b.svg.push(`
    <text x="1090" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="21" fill="${INK}">${escapeXml(ar)}</text>
    <text x="150" y="${y}" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(en.toUpperCase())}</text>
    <line x1="150" y1="${y + 14}" x2="1090" y2="${y + 14}" stroke="${RULE}" stroke-width="0.8" />
  `);
}

function kvAr(b: Builder, y: number, labelAr: string, value: string, note: string) {
  b.svg.push(`
    <text x="1090" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="17" fill="${MUTED}">${escapeXml(labelAr)}</text>
    <text x="880" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="19" fill="${INK}">${escapeXml(value)}</text>
    ${note ? `<text x="150" y="${y}" font-family="${MONO_FONT}" font-size="13" fill="${MUTED}">${escapeXml(note)}</text>` : ""}
  `);
}

function moneyRow(
  b: Builder,
  y: number,
  labelAr: string,
  labelEn: string,
  value: string,
  emphasis: boolean,
) {
  b.svg.push(`
    ${emphasis ? `<rect x="150" y="${y - 34}" width="940" height="48" fill="#F3EFE6" />` : ""}
    <text x="1090" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="${emphasis ? 20 : 18}" fill="${MUTED}">${escapeXml(
      labelAr,
    )}</text>
    <text x="${emphasis ? 1090 : 1090}" y="${y}" text-anchor="end" opacity="0"></text>
    <text x="150" y="${y}" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(labelEn.toUpperCase())}</text>
    <text x="1090" y="${y}" text-anchor="end" opacity="0"></text>
    <text x="700" y="${y}" text-anchor="end" font-family="${MONO_FONT}" font-size="${emphasis ? 26 : 21}" fill="${INK}">${escapeXml(
      value,
    )}</text>
    <line x1="150" y1="${y + 16}" x2="1090" y2="${y + 16}" stroke="${RULE}" stroke-width="0.6" opacity="0.7" />
  `);
}

function paragraph(b: Builder, y: number, lines: string[]) {
  b.svg.push(
    lines
      .map(
        (l, i) =>
          `<text x="1090" y="${y + i * 34}" text-anchor="end" font-family="${AR_FONT}" font-size="17" fill="${INK}">${escapeXml(
            l,
          )}</text>`,
      )
      .join("\n"),
  );
}

function clause(b: Builder, y: number, titleAr: string, titleEn: string, text: string) {
  const wrapped = wrapArabic(text, 62);
  b.svg.push(`
    <text x="1090" y="${y}" text-anchor="end" font-family="${AR_FONT}" font-size="20" fill="${INK}">${escapeXml(titleAr)}</text>
    <text x="150" y="${y}" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(titleEn.toUpperCase())}</text>
    <line x1="150" y1="${y + 12}" x2="1090" y2="${y + 12}" stroke="${RULE}" stroke-width="0.8" />
    ${wrapped
      .map(
        (l, i) =>
          `<text x="1090" y="${y + 52 + i * 32}" text-anchor="end" font-family="${AR_FONT}" font-size="17" fill="${INK}">${escapeXml(
            l,
          )}</text>`,
      )
      .join("\n")}
  `);
}

function footer(b: Builder, n: number, total: number, contractNumber: string) {
  b.svg.push(`
    <line x1="150" y1="1650" x2="1090" y2="1650" stroke="${RULE}" stroke-width="0.8" />
    <text x="150" y="1684" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">${escapeXml(contractNumber)}</text>
    <text x="1090" y="1684" text-anchor="end" font-family="${MONO_FONT}" font-size="12" fill="${MUTED}">PAGE ${n} / ${total}</text>
  `);
}

function wrapArabic(text: string, perLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > perLine) {
      lines.push(current.trim());
      current = w;
    } else {
      current += ` ${w}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

const AR_DATE_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const EN_DATE_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function arDate(d: Date): string {
  return `${d.getUTCDate()} ${AR_DATE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function enDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${EN_DATE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function pctAr(n: number): string {
  return String(n);
}

function fmt(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];

/** Rough Arabic amount-in-words, as printed on Egyptian receipts. */
function arabicWords(v: string): string {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return "";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "مليون" : millions === 2 ? "مليونان" : `${millions} مليون`);
  if (thousands) parts.push(thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : `${thousands} ألف`);
  if (rest) parts.push(rest < 10 ? ONES[rest]! : String(rest));
  return parts.join(" و") || "صفر";
}

function hashFloat(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function svgToPng(svg: string, width = PAGE_W): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
}

export async function svgToWebp(svg: string, width = PAGE_W, quality = 82): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize({ width }).webp({ quality }).toBuffer();
}
