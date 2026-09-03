/**
 * Egyptian national ID (الرقم القومي): 14 digits.
 *   C YY MM DD GG SSS G K
 *   C  century (2 = 1900s, 3 = 2000s)
 *   GG governorate code
 *   SSS sequence, G gender parity, K check digit (mod-11 weighted)
 */

export const GOVERNORATES: Record<string, { en: string; ar: string }> = {
  "01": { en: "Cairo", ar: "القاهرة" },
  "02": { en: "Alexandria", ar: "الإسكندرية" },
  "03": { en: "Port Said", ar: "بورسعيد" },
  "04": { en: "Suez", ar: "السويس" },
  "11": { en: "Damietta", ar: "دمياط" },
  "12": { en: "Dakahlia", ar: "الدقهلية" },
  "13": { en: "Sharqia", ar: "الشرقية" },
  "14": { en: "Qalyubia", ar: "القليوبية" },
  "15": { en: "Kafr El Sheikh", ar: "كفر الشيخ" },
  "16": { en: "Gharbia", ar: "الغربية" },
  "17": { en: "Monufia", ar: "المنوفية" },
  "18": { en: "Beheira", ar: "البحيرة" },
  "19": { en: "Ismailia", ar: "الإسماعيلية" },
  "21": { en: "Giza", ar: "الجيزة" },
  "22": { en: "Beni Suef", ar: "بني سويف" },
  "23": { en: "Fayoum", ar: "الفيوم" },
  "24": { en: "Minya", ar: "المنيا" },
  "25": { en: "Assiut", ar: "أسيوط" },
  "26": { en: "Sohag", ar: "سوهاج" },
  "27": { en: "Qena", ar: "قنا" },
  "28": { en: "Aswan", ar: "أسوان" },
  "29": { en: "Luxor", ar: "الأقصر" },
  "31": { en: "Red Sea", ar: "البحر الأحمر" },
  "32": { en: "New Valley", ar: "الوادي الجديد" },
  "33": { en: "Matrouh", ar: "مطروح" },
  "34": { en: "North Sinai", ar: "شمال سيناء" },
  "35": { en: "South Sinai", ar: "جنوب سيناء" },
  "88": { en: "Born abroad", ar: "خارج الجمهورية" },
};

export interface ParsedNationalId {
  valid: boolean;
  error?: string;
  dateOfBirth?: Date;
  governorate?: string;
  governorateAr?: string;
  gender?: "MALE" | "FEMALE";
}

const WEIGHTS = [2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function nationalIdCheckDigit(first13: string): number {
  const sum = first13
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * WEIGHTS[i]!, 0);
  const rem = sum % 11;
  return rem < 2 ? rem : 11 - rem;
}

export function parseNationalId(raw: string): ParsedNationalId {
  const id = (raw ?? "").replace(/[^0-9]/g, "");
  if (id.length !== 14) return { valid: false, error: "Must be exactly 14 digits" };

  const century = Number(id[0]);
  if (century !== 2 && century !== 3) return { valid: false, error: "Invalid century digit" };

  const year = (century === 2 ? 1900 : 2000) + Number(id.slice(1, 3));
  const month = Number(id.slice(3, 5));
  const day = Number(id.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, error: "Invalid date of birth in ID" };
  }
  const dob = new Date(Date.UTC(year, month - 1, day));
  if (dob.getUTCMonth() !== month - 1 || dob.getUTCDate() !== day) {
    return { valid: false, error: "Invalid date of birth in ID" };
  }

  const govCode = id.slice(7, 9);
  const gov = GOVERNORATES[govCode];
  if (!gov) return { valid: false, error: "Unrecognised governorate code" };

  if (nationalIdCheckDigit(id.slice(0, 13)) !== Number(id[13])) {
    return { valid: false, error: "Checksum failed" };
  }

  return {
    valid: true,
    dateOfBirth: dob,
    governorate: gov.en,
    governorateAr: gov.ar,
    gender: Number(id[12]) % 2 === 1 ? "MALE" : "FEMALE",
  };
}

/** Builds a checksum-valid ID for seeded demo users. Never a real person's number. */
export function makeDemoNationalId(dob: Date, govCode: string, seq: number): string {
  const century = dob.getUTCFullYear() < 2000 ? "2" : "3";
  const yy = String(dob.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(dob.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dob.getUTCDate()).padStart(2, "0");
  const body = `${century}${yy}${mm}${dd}${govCode}${String(seq % 10000).padStart(4, "0")}`;
  return `${body}${nationalIdCheckDigit(body)}`;
}

/** Egyptian mobile: +20 1[0125] XXXXXXXX. Stored canonically as +201XXXXXXXXX. */
export function normalizeEgyptianPhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  let local = digits;
  if (local.startsWith("0020")) local = local.slice(4);
  else if (local.startsWith("20")) local = local.slice(2);
  if (local.startsWith("0")) local = local.slice(1);
  if (!/^1[0125][0-9]{8}$/.test(local)) return null;
  return `+20${local}`;
}

export function formatEgyptianPhone(canonical: string, locale: "en" | "ar" = "en"): string {
  const m = /^\+20(1[0125])([0-9]{4})([0-9]{4})$/.exec(canonical);
  if (!m) return canonical;
  const s = `+20 ${m[1]} ${m[2]} ${m[3]}`;
  return locale === "ar" ? s : s;
}

export function maskPhone(canonical: string): string {
  const m = /^\+20(1[0125])([0-9]{4})([0-9]{4})$/.exec(canonical);
  if (!m) return "•••• ••••";
  return `+20 ${m[1]} •••• ${m[3]}`;
}
