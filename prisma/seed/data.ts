import type { AssignmentPermission, FeeType, UnitType } from "@prisma/client";

/**
 * Reference data for the seed.
 *
 * Developer and project names are real — they are the market Aqary operates in.
 * Everything attached to them (assignment policies, fees, waiting periods,
 * price benchmarks, units, contracts, people) is SYNTHETIC and marked
 * `isSynthetic` / `isDemo` in the database. No policy here should be read as a
 * statement of any developer's actual terms.
 */

export interface DeveloperSeed {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  policy: {
    assignmentAllowed: AssignmentPermission;
    feeType: FeeType;
    feePercentBps?: number;
    feeFixedAmount?: string;
    feeBasis?: string;
    minPercentPaidBps?: number;
    minMonthsElapsed?: number;
    typicalNocDays?: number;
    waitingPeriodDays?: number;
    requiredDocuments: string[];
    conditionsEn: string;
    conditionsAr: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  };
  projects: ProjectSeed[];
}

export interface ProjectSeed {
  slug: string;
  nameEn: string;
  nameAr: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  /** Developer price per m², EGP, in the year the benchmark series starts. */
  basePricePerSqm2021: number;
  /** Compound annual developer price growth used to build the benchmark series. */
  annualGrowth: number;
  descriptionEn: string;
  descriptionAr: string;
}

const COMMON_DOCS = [
  "Assignment request form signed by both parties",
  "Original contract and all annexes",
  "Seller national ID (copy + original for sighting)",
  "Buyer national ID (copy + original for sighting)",
  "Clearance of all instalments due to date",
];

export const DEVELOPERS: DeveloperSeed[] = [
  {
    slug: "talaat-moustafa-group",
    nameEn: "Talaat Moustafa Group",
    nameAr: "مجموعة طلعت مصطفى",
    descriptionEn: "Egypt's largest listed community developer, best known for Madinaty and Al Rehab.",
    descriptionAr: "أكبر مطوّر مجتمعات سكنية مدرج في مصر، وأشهر مشروعاته مدينتي والرحاب.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 250,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 1500,
      minMonthsElapsed: 24,
      typicalNocDays: 21,
      waitingPeriodDays: 14,
      requiredDocuments: [...COMMON_DOCS, "Latest account statement issued within 30 days"],
      conditionsEn:
        "Assignment permitted after 24 months from contract date and at least 15% of the price paid. One assignment per contract.",
      conditionsAr:
        "التنازل مسموح بعد 24 شهرًا من تاريخ التعاقد وسداد 15% من الثمن على الأقل. تنازل واحد لكل عقد.",
      contactName: "Assignments desk — customer service",
      contactEmail: "assignments@example-tmg.test",
      contactPhone: "+20 2 1234 0001",
    },
    projects: [
      { slug: "madinaty", nameEn: "Madinaty", nameAr: "مدينتي", city: "New Cairo", area: "Madinaty", lat: 30.106, lng: 31.641, basePricePerSqm2021: 17500, annualGrowth: 0.144, descriptionEn: "Large master-planned city east of Cairo with its own services spine.", descriptionAr: "مدينة متكاملة شرق القاهرة بخدمات مستقلة." },
      { slug: "celia", nameEn: "Celia", nameAr: "سيليا", city: "New Administrative Capital", area: "R7", lat: 30.006, lng: 31.749, basePricePerSqm2021: 16200, annualGrowth: 0.163, descriptionEn: "TMG's residential district in the New Capital's R7 zone.", descriptionAr: "الحي السكني لمجموعة طلعت مصطفى في منطقة R7 بالعاصمة الإدارية." },
      { slug: "noor-city", nameEn: "Noor", nameAr: "نور", city: "Mostakbal City", area: "Noor", lat: 30.055, lng: 31.699, basePricePerSqm2021: 14800, annualGrowth: 0.156, descriptionEn: "Smart-city development in Mostakbal City.", descriptionAr: "مشروع المدينة الذكية في مدينة المستقبل." },
    ],
  },
  {
    slug: "palm-hills",
    nameEn: "Palm Hills Developments",
    nameAr: "بالم هيلز للتعمير",
    descriptionEn: "Listed developer with a large West and East Cairo portfolio.",
    descriptionAr: "مطوّر مدرج بمحفظة كبيرة في غرب وشرق القاهرة.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 300,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 2000,
      minMonthsElapsed: 18,
      typicalNocDays: 28,
      waitingPeriodDays: 21,
      requiredDocuments: [...COMMON_DOCS, "Buyer financial capability declaration"],
      conditionsEn: "Assignment permitted after 18 months and 20% paid. Buyer must pass the developer's own credit screen.",
      conditionsAr: "التنازل مسموح بعد 18 شهرًا وسداد 20%. يخضع المشتري لفحص الجدارة لدى المطوّر.",
      contactName: "Contracts department",
      contactEmail: "contracts@example-palmhills.test",
      contactPhone: "+20 2 1234 0002",
    },
    projects: [
      { slug: "palm-hills-new-cairo", nameEn: "Palm Hills New Cairo", nameAr: "بالم هيلز نيو كايرو", city: "New Cairo", area: "Fifth Settlement", lat: 30.026, lng: 31.472, basePricePerSqm2021: 22000, annualGrowth: 0.138, descriptionEn: "Established low-density compound in the Fifth Settlement.", descriptionAr: "كمبوند منخفض الكثافة بالتجمع الخامس." },
      { slug: "badya", nameEn: "Badya", nameAr: "بادية", city: "6th of October", area: "Badya", lat: 29.948, lng: 30.898, basePricePerSqm2021: 13500, annualGrowth: 0.169, descriptionEn: "Long-horizon city development west of Cairo.", descriptionAr: "مشروع مدينة طويل الأجل غرب القاهرة." },
      { slug: "palm-hills-alamein", nameEn: "Palm Hills New Alamein", nameAr: "بالم هيلز العلمين الجديدة", city: "North Coast", area: "New Alamein", lat: 30.83, lng: 28.95, basePricePerSqm2021: 26000, annualGrowth: 0.15, descriptionEn: "Coastal towers and chalets at New Alamein.", descriptionAr: "أبراج وشاليهات ساحلية بالعلمين الجديدة." },
    ],
  },
  {
    slug: "sodic",
    nameEn: "SODIC",
    nameAr: "سوديك",
    descriptionEn: "Listed developer known for design-led communities in East and West Cairo.",
    descriptionAr: "مطوّر مدرج معروف بمجتمعات ذات طابع تصميمي في شرق وغرب القاهرة.",
    policy: {
      assignmentAllowed: "ALLOWED",
      feeType: "PERCENT",
      feePercentBps: 200,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 1000,
      minMonthsElapsed: 12,
      typicalNocDays: 14,
      waitingPeriodDays: 7,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Assignment permitted after 12 months and 10% paid. No cap on the number of assignments.",
      conditionsAr: "التنازل مسموح بعد 12 شهرًا وسداد 10%. لا يوجد حد لعدد مرات التنازل.",
      contactName: "Customer relations — assignments",
      contactEmail: "assignments@example-sodic.test",
      contactPhone: "+20 2 1234 0003",
    },
    projects: [
      { slug: "eastown", nameEn: "Eastown", nameAr: "إيستاون", city: "New Cairo", area: "Fifth Settlement", lat: 30.014, lng: 31.446, basePricePerSqm2021: 24500, annualGrowth: 0.131, descriptionEn: "Mixed-use district around a walkable retail spine.", descriptionAr: "حي متعدد الاستخدامات حول ممشى تجاري." },
      { slug: "villette", nameEn: "Villette", nameAr: "فيليت", city: "New Cairo", area: "Fifth Settlement", lat: 30.005, lng: 31.489, basePricePerSqm2021: 26500, annualGrowth: 0.125, descriptionEn: "Low-rise residential quarter with a central park.", descriptionAr: "حي سكني منخفض الارتفاع بحديقة مركزية." },
      { slug: "june-north-coast", nameEn: "June", nameAr: "چون", city: "North Coast", area: "Ras El Hekma", lat: 31.115, lng: 27.585, basePricePerSqm2021: 30000, annualGrowth: 0.175, descriptionEn: "Coastal resort community at Ras El Hekma.", descriptionAr: "مجتمع ساحلي في رأس الحكمة." },
    ],
  },
  {
    slug: "emaar-misr",
    nameEn: "Emaar Misr",
    nameAr: "إعمار مصر",
    descriptionEn: "Egyptian arm of Emaar Properties.",
    descriptionAr: "الذراع المصرية لشركة إعمار العقارية.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 350,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 2500,
      minMonthsElapsed: 24,
      typicalNocDays: 30,
      waitingPeriodDays: 30,
      requiredDocuments: [...COMMON_DOCS, "Notarised power of attorney where a representative signs"],
      conditionsEn: "Assignment permitted after 24 months and 25% paid. Developer reserves a right of first refusal.",
      conditionsAr: "التنازل مسموح بعد 24 شهرًا وسداد 25%. للمطوّر حق الأولوية في الشراء.",
      contactName: "Sales administration",
      contactEmail: "assignments@example-emaarmisr.test",
      contactPhone: "+20 2 1234 0004",
    },
    projects: [
      { slug: "mivida", nameEn: "Mivida", nameAr: "ميفيدا", city: "New Cairo", area: "Fifth Settlement", lat: 30.021, lng: 31.535, basePricePerSqm2021: 27000, annualGrowth: 0.125, descriptionEn: "Established compound around a lake and business park.", descriptionAr: "كمبوند حول بحيرة ومنطقة أعمال." },
      { slug: "marassi", nameEn: "Marassi", nameAr: "مراسي", city: "North Coast", area: "Sidi Abdel Rahman", lat: 30.936, lng: 28.694, basePricePerSqm2021: 38000, annualGrowth: 0.156, descriptionEn: "Large coastal resort town on the North Coast.", descriptionAr: "مدينة منتجعات ساحلية كبرى على الساحل الشمالي." },
      { slug: "cairo-gate", nameEn: "Cairo Gate", nameAr: "كايرو جيت", city: "Sheikh Zayed", area: "Cairo–Alex Road", lat: 30.043, lng: 31.006, basePricePerSqm2021: 29000, annualGrowth: 0.138, descriptionEn: "Gateway development on the Cairo–Alexandria desert road.", descriptionAr: "مشروع عند مدخل طريق القاهرة الإسكندرية الصحراوي." },
    ],
  },
  {
    slug: "mountain-view",
    nameEn: "Mountain View",
    nameAr: "ماونتن فيو",
    descriptionEn: "Developer known for themed communities and its iCity series.",
    descriptionAr: "مطوّر معروف بمجتمعاته ذات الطابع الخاص وسلسلة iCity.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 275,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 1500,
      minMonthsElapsed: 18,
      typicalNocDays: 21,
      waitingPeriodDays: 14,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Assignment permitted after 18 months and 15% paid. Maintenance deposit transfers with the contract.",
      conditionsAr: "التنازل مسموح بعد 18 شهرًا وسداد 15%. تنتقل وديعة الصيانة مع العقد.",
      contactName: "Client services",
      contactEmail: "assignments@example-mountainview.test",
      contactPhone: "+20 2 1234 0005",
    },
    projects: [
      { slug: "icity-new-cairo", nameEn: "iCity New Cairo", nameAr: "آي سيتي نيو كايرو", city: "New Cairo", area: "Fifth Settlement", lat: 30.024, lng: 31.556, basePricePerSqm2021: 21000, annualGrowth: 0.144, descriptionEn: "Large mixed-density community east of the ring road.", descriptionAr: "مجتمع كبير متعدد الكثافات شرق الطريق الدائري." },
      { slug: "aliva", nameEn: "Aliva", nameAr: "أليفا", city: "Mostakbal City", area: "Aliva", lat: 30.062, lng: 31.716, basePricePerSqm2021: 15500, annualGrowth: 0.163, descriptionEn: "Mountain View's Mostakbal City community.", descriptionAr: "مجتمع ماونتن فيو في مدينة المستقبل." },
    ],
  },
  {
    slug: "ora-developers",
    nameEn: "Ora Developers",
    nameAr: "أورا للتطوير",
    descriptionEn: "Developer of the ZED communities in East and West Cairo.",
    descriptionAr: "مطوّر مجتمعات زد في شرق وغرب القاهرة.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 400,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 3000,
      minMonthsElapsed: 24,
      typicalNocDays: 35,
      waitingPeriodDays: 30,
      requiredDocuments: [...COMMON_DOCS, "Bank letter confirming the buyer's funds"],
      conditionsEn: "Assignment permitted after 24 months and 30% paid. Fee is non-refundable once the NOC issues.",
      conditionsAr: "التنازل مسموح بعد 24 شهرًا وسداد 30%. الرسوم غير مستردة بعد إصدار الموافقة.",
      contactName: "Contracts and assignments",
      contactEmail: "assignments@example-ora.test",
      contactPhone: "+20 2 1234 0006",
    },
    projects: [
      { slug: "zed-east", nameEn: "ZED East", nameAr: "زد إيست", city: "New Cairo", area: "Fifth Settlement", lat: 30.031, lng: 31.516, basePricePerSqm2021: 25500, annualGrowth: 0.15, descriptionEn: "High-density towers around a central park.", descriptionAr: "أبراج عالية الكثافة حول حديقة مركزية." },
      { slug: "zed-west", nameEn: "ZED West", nameAr: "زد ويست", city: "Sheikh Zayed", area: "Sheikh Zayed", lat: 30.032, lng: 30.977, basePricePerSqm2021: 31000, annualGrowth: 0.138, descriptionEn: "Mixed-use towers in Sheikh Zayed.", descriptionAr: "أبراج متعددة الاستخدامات في الشيخ زايد." },
    ],
  },
  {
    slug: "hassan-allam-properties",
    nameEn: "Hassan Allam Properties",
    nameAr: "حسن علام العقارية",
    descriptionEn: "Property arm of the Hassan Allam group.",
    descriptionAr: "الذراع العقارية لمجموعة حسن علام.",
    policy: {
      assignmentAllowed: "ALLOWED",
      feeType: "FIXED",
      feeFixedAmount: "75000",
      minPercentPaidBps: 1000,
      minMonthsElapsed: 12,
      typicalNocDays: 18,
      waitingPeriodDays: 10,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Flat assignment fee regardless of unit value, after 12 months and 10% paid.",
      conditionsAr: "رسوم تنازل ثابتة بغض النظر عن قيمة الوحدة، بعد 12 شهرًا وسداد 10%.",
      contactName: "Customer care",
      contactEmail: "assignments@example-hassanallam.test",
      contactPhone: "+20 2 1234 0007",
    },
    projects: [
      { slug: "swan-lake-residences", nameEn: "Swan Lake Residences", nameAr: "سوان ليك ريزيدنس", city: "New Cairo", area: "Fifth Settlement", lat: 30.036, lng: 31.502, basePricePerSqm2021: 23500, annualGrowth: 0.131, descriptionEn: "Lagoon-centred residential compound.", descriptionAr: "كمبوند سكني حول بحيرة صناعية." },
      { slug: "little-venice", nameEn: "Little Venice", nameAr: "ليتل فينيس", city: "Ain Sokhna", area: "Ain Sokhna", lat: 29.588, lng: 32.34, basePricePerSqm2021: 21000, annualGrowth: 0.144, descriptionEn: "Sokhna resort with canal-side chalets.", descriptionAr: "منتجع في السخنة بشاليهات على القنوات المائية." },
    ],
  },
  {
    slug: "misr-italia",
    nameEn: "Misr Italia Properties",
    nameAr: "مصر إيطاليا العقارية",
    descriptionEn: "Developer of IL Bosco and Vinci in the New Capital.",
    descriptionAr: "مطوّر إل بوسكو وفينشي بالعاصمة الإدارية.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 300,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 2000,
      minMonthsElapsed: 12,
      typicalNocDays: 25,
      waitingPeriodDays: 14,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Assignment permitted after 12 months and 20% paid.",
      conditionsAr: "التنازل مسموح بعد 12 شهرًا وسداد 20%.",
      contactName: "Assignments unit",
      contactEmail: "assignments@example-misritalia.test",
      contactPhone: "+20 2 1234 0008",
    },
    projects: [
      { slug: "il-bosco", nameEn: "IL Bosco", nameAr: "إل بوسكو", city: "New Administrative Capital", area: "R7", lat: 30.009, lng: 31.756, basePricePerSqm2021: 15800, annualGrowth: 0.169, descriptionEn: "Green-facade residential district in the New Capital.", descriptionAr: "حي سكني بواجهات خضراء في العاصمة الإدارية." },
      { slug: "vinci", nameEn: "Vinci", nameAr: "فينشي", city: "New Administrative Capital", area: "R7", lat: 30.002, lng: 31.762, basePricePerSqm2021: 16500, annualGrowth: 0.169, descriptionEn: "Residential community around an art-themed spine.", descriptionAr: "مجتمع سكني حول محور فني." },
    ],
  },
  {
    slug: "tatweer-misr",
    nameEn: "Tatweer Misr",
    nameAr: "تطوير مصر",
    descriptionEn: "Developer of Bloomfields, Fouka Bay and IL Monte Galala.",
    descriptionAr: "مطوّر بلومفيلدز وفوكا باي وإل مونت جلالة.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 225,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 1500,
      minMonthsElapsed: 15,
      typicalNocDays: 20,
      waitingPeriodDays: 14,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Assignment permitted after 15 months and 15% paid.",
      conditionsAr: "التنازل مسموح بعد 15 شهرًا وسداد 15%.",
      contactName: "Customer experience",
      contactEmail: "assignments@example-tatweermisr.test",
      contactPhone: "+20 2 1234 0009",
    },
    projects: [
      { slug: "bloomfields", nameEn: "Bloomfields", nameAr: "بلومفيلدز", city: "Mostakbal City", area: "Bloomfields", lat: 30.068, lng: 31.706, basePricePerSqm2021: 14200, annualGrowth: 0.163, descriptionEn: "Mixed-density community in Mostakbal City.", descriptionAr: "مجتمع متعدد الكثافات في مدينة المستقبل." },
      { slug: "fouka-bay", nameEn: "Fouka Bay", nameAr: "فوكا باي", city: "North Coast", area: "Ras El Hekma", lat: 31.107, lng: 27.62, basePricePerSqm2021: 28000, annualGrowth: 0.169, descriptionEn: "Ras El Hekma beachfront resort.", descriptionAr: "منتجع على شاطئ رأس الحكمة." },
      { slug: "il-monte-galala", nameEn: "IL Monte Galala", nameAr: "إل مونت جلالة", city: "Ain Sokhna", area: "Galala", lat: 29.53, lng: 32.36, basePricePerSqm2021: 22500, annualGrowth: 0.15, descriptionEn: "Terraced mountain resort above Ain Sokhna.", descriptionAr: "منتجع جبلي مدرج فوق العين السخنة." },
    ],
  },
  {
    slug: "madinet-masr",
    nameEn: "Madinet Masr",
    nameAr: "مدينة مصر",
    descriptionEn: "Listed developer behind Taj City and Sarai.",
    descriptionAr: "مطوّر مدرج صاحب تاج سيتي وسراي.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 250,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 1200,
      minMonthsElapsed: 12,
      typicalNocDays: 22,
      waitingPeriodDays: 14,
      requiredDocuments: COMMON_DOCS,
      conditionsEn: "Assignment permitted after 12 months and 12% paid.",
      conditionsAr: "التنازل مسموح بعد 12 شهرًا وسداد 12%.",
      contactName: "Contracts desk",
      contactEmail: "assignments@example-madinetmasr.test",
      contactPhone: "+20 2 1234 0010",
    },
    projects: [
      { slug: "taj-city", nameEn: "Taj City", nameAr: "تاج سيتي", city: "New Cairo", area: "Ring Road", lat: 30.098, lng: 31.401, basePricePerSqm2021: 19500, annualGrowth: 0.15, descriptionEn: "Large community close to Cairo Airport.", descriptionAr: "مجتمع كبير قريب من مطار القاهرة." },
      { slug: "sarai", nameEn: "Sarai", nameAr: "سراي", city: "Mostakbal City", area: "Sarai", lat: 30.041, lng: 31.688, basePricePerSqm2021: 16800, annualGrowth: 0.156, descriptionEn: "Community on the Suez road corridor.", descriptionAr: "مجتمع على محور طريق السويس." },
    ],
  },
  {
    slug: "city-edge",
    nameEn: "City Edge Developments",
    nameAr: "سيتي إيدج للتطوير",
    descriptionEn: "State-linked developer active in the New Capital and New Mansoura.",
    descriptionAr: "مطوّر مرتبط بالدولة ينشط في العاصمة الإدارية والمنصورة الجديدة.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 200,
      feeBasis: "TOTAL_CONTRACT_PRICE",
      minPercentPaidBps: 2500,
      minMonthsElapsed: 36,
      typicalNocDays: 45,
      waitingPeriodDays: 30,
      requiredDocuments: [...COMMON_DOCS, "Government-issued clearance certificate"],
      conditionsEn:
        "Assignment permitted after 36 months and 25% paid, subject to administrative clearance. Longest turnaround in the library.",
      conditionsAr:
        "التنازل مسموح بعد 36 شهرًا وسداد 25%، بشرط الحصول على الموافقات الإدارية. أطول مدة إنجاز في المكتبة.",
      contactName: "Assignment administration",
      contactEmail: "assignments@example-cityedge.test",
      contactPhone: "+20 2 1234 0011",
    },
    projects: [
      { slug: "etapa", nameEn: "Etapa", nameAr: "إتابا", city: "Sheikh Zayed", area: "Sheikh Zayed", lat: 30.019, lng: 30.955, basePricePerSqm2021: 24000, annualGrowth: 0.138, descriptionEn: "Compound in the Sheikh Zayed extension.", descriptionAr: "كمبوند في امتداد الشيخ زايد." },
      { slug: "zahya", nameEn: "Zahya", nameAr: "زهية", city: "New Mansoura", area: "New Mansoura", lat: 31.437, lng: 31.606, basePricePerSqm2021: 12500, annualGrowth: 0.175, descriptionEn: "Coastal city development in the Delta.", descriptionAr: "مشروع مدينة ساحلية في الدلتا." },
    ],
  },
  {
    slug: "al-ahly-sabbour",
    nameEn: "Al Ahly Sabbour",
    nameAr: "الأهلي صبور",
    descriptionEn: "Long-established developer across Cairo and the coasts.",
    descriptionAr: "مطوّر عريق في القاهرة والسواحل.",
    policy: {
      assignmentAllowed: "CONDITIONAL",
      feeType: "PERCENT",
      feePercentBps: 275,
      feeBasis: "OUTSTANDING_BALANCE",
      minPercentPaidBps: 1800,
      minMonthsElapsed: 18,
      typicalNocDays: 24,
      waitingPeriodDays: 14,
      requiredDocuments: COMMON_DOCS,
      conditionsEn:
        "Fee is charged on the outstanding balance rather than the contract price, after 18 months and 18% paid.",
      conditionsAr: "تُحتسب الرسوم على الرصيد المتبقي وليس على ثمن التعاقد، بعد 18 شهرًا وسداد 18%.",
      contactName: "Client affairs",
      contactEmail: "assignments@example-sabbour.test",
      contactPhone: "+20 2 1234 0012",
    },
    projects: [
      { slug: "katameya-creeks", nameEn: "Katameya Creeks", nameAr: "قطامية كريكس", city: "New Cairo", area: "Katameya", lat: 30.006, lng: 31.428, basePricePerSqm2021: 25000, annualGrowth: 0.125, descriptionEn: "Villa-led compound around water features.", descriptionAr: "كمبوند فيلات حول ممرات مائية." },
      { slug: "lavenir", nameEn: "L'Avenir", nameAr: "لافنير", city: "Mostakbal City", area: "L'Avenir", lat: 30.049, lng: 31.723, basePricePerSqm2021: 15200, annualGrowth: 0.156, descriptionEn: "Mostakbal City community with a green spine.", descriptionAr: "مجتمع في مدينة المستقبل بمحور أخضر." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Unit archetypes
// ---------------------------------------------------------------------------

export interface UnitArchetype {
  unitType: UnitType;
  bua: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  garden?: number;
  roof?: number;
  terrace?: number;
  view: string;
  weight: number;
}

export const UNIT_ARCHETYPES: UnitArchetype[] = [
  { unitType: "STUDIO", bua: 62, bedrooms: 1, bathrooms: 1, floor: 3, view: "Internal", weight: 4 },
  { unitType: "APARTMENT", bua: 118, bedrooms: 2, bathrooms: 2, floor: 2, view: "Landscape", weight: 12 },
  { unitType: "APARTMENT", bua: 145, bedrooms: 3, bathrooms: 2, floor: 4, view: "Landscape", weight: 14 },
  { unitType: "APARTMENT", bua: 168, bedrooms: 3, bathrooms: 3, floor: 6, view: "Pool", weight: 10 },
  { unitType: "APARTMENT", bua: 196, bedrooms: 4, bathrooms: 3, floor: 5, view: "Golf", weight: 6 },
  { unitType: "APARTMENT", bua: 132, bedrooms: 2, bathrooms: 2, floor: 0, garden: 60, view: "Landscape", weight: 7 },
  { unitType: "DUPLEX", bua: 232, bedrooms: 4, bathrooms: 4, floor: 7, terrace: 40, view: "Landscape", weight: 5 },
  { unitType: "PENTHOUSE", bua: 210, bedrooms: 3, bathrooms: 3, floor: 9, roof: 85, view: "Pool", weight: 4 },
  { unitType: "TOWNHOUSE", bua: 255, bedrooms: 4, bathrooms: 4, floor: null, garden: 120, view: "Landscape", weight: 6 },
  { unitType: "TWIN_HOUSE", bua: 295, bedrooms: 4, bathrooms: 5, floor: null, garden: 190, view: "Landscape", weight: 5 },
  { unitType: "STANDALONE_VILLA", bua: 385, bedrooms: 5, bathrooms: 6, floor: null, garden: 420, view: "Golf", weight: 4 },
  { unitType: "CHALET", bua: 105, bedrooms: 2, bathrooms: 2, floor: 1, terrace: 25, view: "Sea", weight: 8 },
  { unitType: "CHALET", bua: 138, bedrooms: 3, bathrooms: 3, floor: 0, garden: 55, view: "Lagoon", weight: 5 },
];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface PersonSeed {
  nameEn: string;
  nameAr: string;
  phone: string;
  email: string;
  govCode: string;
  birthYear: number;
}

export const SELLERS: PersonSeed[] = [
  { nameEn: "Ahmed Mahmoud Abdelrahman", nameAr: "أحمد محمود عبد الرحمن", phone: "+201001110001", email: "ahmed.seller@aqary.test", govCode: "01", birthYear: 1985 },
  { nameEn: "Mona Sherif El Sayed", nameAr: "منى شريف السيد", phone: "+201001110002", email: "mona.seller@aqary.test", govCode: "21", birthYear: 1979 },
  { nameEn: "Karim Adel Hassan", nameAr: "كريم عادل حسن", phone: "+201001110003", email: "karim.seller@aqary.test", govCode: "01", birthYear: 1990 },
  { nameEn: "Nourhan Tarek Ibrahim", nameAr: "نورهان طارق إبراهيم", phone: "+201001110004", email: "nourhan.seller@aqary.test", govCode: "12", birthYear: 1988 },
  { nameEn: "Hossam Fathy Zaki", nameAr: "حسام فتحي زكي", phone: "+201001110005", email: "hossam.seller@aqary.test", govCode: "02", birthYear: 1975 },
  { nameEn: "Salma Ayman Farouk", nameAr: "سلمى أيمن فاروق", phone: "+201001110006", email: "salma.seller@aqary.test", govCode: "01", birthYear: 1992 },
  { nameEn: "Omar Wael Nassar", nameAr: "عمر وائل نصار", phone: "+201001110007", email: "omar.seller@aqary.test", govCode: "21", birthYear: 1983 },
  { nameEn: "Dina Mostafa Kamel", nameAr: "دينا مصطفى كامل", phone: "+201001110008", email: "dina.seller@aqary.test", govCode: "01", birthYear: 1986 },
  { nameEn: "Youssef Ali Ghanem", nameAr: "يوسف علي غانم", phone: "+201001110009", email: "youssef.seller@aqary.test", govCode: "16", birthYear: 1981 },
  { nameEn: "Hana Ashraf Selim", nameAr: "هنا أشرف سليم", phone: "+201001110010", email: "hana.seller@aqary.test", govCode: "01", birthYear: 1994 },
  { nameEn: "Tarek Sameh Roushdy", nameAr: "طارق سامح رشدي", phone: "+201001110011", email: "tarek.seller@aqary.test", govCode: "21", birthYear: 1977 },
  { nameEn: "Radwa Hesham Bakr", nameAr: "رضوى هشام بكر", phone: "+201001110012", email: "radwa.seller@aqary.test", govCode: "13", birthYear: 1989 },
  { nameEn: "Mahmoud Emad Selim", nameAr: "محمود عماد سليم", phone: "+201001110013", email: "mahmoud.seller@aqary.test", govCode: "01", birthYear: 1984 },
  { nameEn: "Yara Nabil Shaker", nameAr: "يارا نبيل شاكر", phone: "+201001110014", email: "yara.seller@aqary.test", govCode: "21", birthYear: 1991 },
  { nameEn: "Sherif Gamal Habib", nameAr: "شريف جمال حبيب", phone: "+201001110015", email: "sherif.seller@aqary.test", govCode: "01", birthYear: 1972 },
  { nameEn: "Aya Khaled Mansour", nameAr: "آية خالد منصور", phone: "+201001110016", email: "aya.seller@aqary.test", govCode: "14", birthYear: 1987 },
];

export interface BuyerSeed extends PersonSeed {
  tier: "BROWSER" | "VERIFIED" | "PRIORITY";
  availableCash: string;
  maxInstallment: string;
  frequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  incomeRange: string;
  employmentType: string;
  purpose: string;
  readiness: string;
  cities: string[];
  unitTypes: UnitType[];
  bedroomsMin: number;
  buaMin: number;
  deliveryByYear: number;
  priorities: string;
}

export const BUYERS: BuyerSeed[] = [
  {
    nameEn: "Mostafa Ragab Elwan", nameAr: "مصطفى رجب علوان", phone: "+201002220001", email: "mostafa.buyer@aqary.test", govCode: "01", birthYear: 1986,
    tier: "PRIORITY", availableCash: "4200000", maxInstallment: "220000", frequency: "QUARTERLY",
    incomeRange: "EGP 120k–200k / month", employmentType: "Business owner", purpose: "Own use", readiness: "Ready now",
    cities: ["New Cairo", "Mostakbal City"], unitTypes: ["APARTMENT", "DUPLEX"], bedroomsMin: 3, buaMin: 140, deliveryByYear: 2028,
    priorities: "Delivery before my daughter starts school in New Cairo, and an installment I can carry on a business income that moves month to month.",
  },
  {
    nameEn: "Laila Hisham Abdelaziz", nameAr: "ليلى هشام عبد العزيز", phone: "+201002220002", email: "laila.buyer@aqary.test", govCode: "21", birthYear: 1990,
    tier: "VERIFIED", availableCash: "2600000", maxInstallment: "140000", frequency: "QUARTERLY",
    incomeRange: "EGP 60k–120k / month", employmentType: "Employee", purpose: "Own use", readiness: "Ready in 30 days",
    cities: ["Sheikh Zayed", "6th of October"], unitTypes: ["APARTMENT"], bedroomsMin: 2, buaMin: 110, deliveryByYear: 2027,
    priorities: "West Cairo, close to my work in Zayed. I care more about a short remaining plan than about size.",
  },
  {
    nameEn: "Ziad Osama Khalil", nameAr: "زياد أسامة خليل", phone: "+201002220003", email: "ziad.buyer@aqary.test", govCode: "01", birthYear: 1982,
    tier: "PRIORITY", availableCash: "7500000", maxInstallment: "450000", frequency: "QUARTERLY",
    incomeRange: "EGP 200k+ / month", employmentType: "Business owner", purpose: "Investment", readiness: "Ready now",
    cities: ["New Cairo", "North Coast"], unitTypes: ["TOWNHOUSE", "TWIN_HOUSE", "STANDALONE_VILLA", "CHALET"], bedroomsMin: 3, buaMin: 200, deliveryByYear: 2029,
    priorities: "Biggest gap between the old contract price and today's developer price. I am buying the discount, not the unit.",
  },
  {
    nameEn: "Nada Ehab Sultan", nameAr: "ندى إيهاب سلطان", phone: "+201002220004", email: "nada.buyer@aqary.test", govCode: "12", birthYear: 1995,
    tier: "VERIFIED", availableCash: "1250000", maxInstallment: "70000", frequency: "QUARTERLY",
    incomeRange: "EGP 30k–60k / month", employmentType: "Employee", purpose: "Own use", readiness: "Ready in 90 days",
    cities: ["Mostakbal City", "New Cairo"], unitTypes: ["STUDIO", "APARTMENT"], bedroomsMin: 1, buaMin: 60, deliveryByYear: 2029,
    priorities: "First home. The cash I have is the whole constraint — I need the smallest cash figure that still gets me a real unit.",
  },
  {
    nameEn: "Amr Sabry Bahgat", nameAr: "عمرو صبري بهجت", phone: "+201002220005", email: "amr.buyer@aqary.test", govCode: "02", birthYear: 1978,
    tier: "VERIFIED", availableCash: "3400000", maxInstallment: "260000", frequency: "SEMI_ANNUAL",
    incomeRange: "EGP 120k–200k / month", employmentType: "Expatriate remittance", purpose: "Investment", readiness: "Ready in 30 days",
    cities: ["North Coast", "Ain Sokhna"], unitTypes: ["CHALET", "APARTMENT"], bedroomsMin: 2, buaMin: 100, deliveryByYear: 2028,
    priorities: "Coastal, rentable in summer. I transfer money twice a year so semi-annual installments suit me.",
  },
  {
    nameEn: "Farida Magdy Rashwan", nameAr: "فريدة مجدي رشوان", phone: "+201002220006", email: "farida.buyer@aqary.test", govCode: "01", birthYear: 1993,
    tier: "BROWSER", availableCash: "1800000", maxInstallment: "95000", frequency: "MONTHLY",
    incomeRange: "EGP 60k–120k / month", employmentType: "Freelancer", purpose: "Own use", readiness: "Just exploring",
    cities: ["New Cairo"], unitTypes: ["APARTMENT"], bedroomsMin: 2, buaMin: 100, deliveryByYear: 2030,
    priorities: "Still comparing. Monthly installments work better for freelance income than a big quarterly hit.",
  },
  {
    nameEn: "Bassem Nader Wahba", nameAr: "باسم نادر وهبة", phone: "+201002220007", email: "bassem.buyer@aqary.test", govCode: "21", birthYear: 1984,
    tier: "VERIFIED", availableCash: "5100000", maxInstallment: "300000", frequency: "QUARTERLY",
    incomeRange: "EGP 200k+ / month", employmentType: "Employee", purpose: "Upgrade", readiness: "Ready now",
    cities: ["New Cairo", "New Administrative Capital"], unitTypes: ["APARTMENT", "DUPLEX", "PENTHOUSE"], bedroomsMin: 3, buaMin: 160, deliveryByYear: 2028,
    priorities: "Upgrading from a smaller apartment. Verified paperwork matters more to me than saving another few percent.",
  },
  {
    nameEn: "Reem Alaa Shoukry", nameAr: "ريم علاء شكري", phone: "+201002220008", email: "reem.buyer@aqary.test", govCode: "16", birthYear: 1996,
    tier: "BROWSER", availableCash: "900000", maxInstallment: "55000", frequency: "QUARTERLY",
    incomeRange: "under EGP 30k / month", employmentType: "Employee", purpose: "Own use", readiness: "Just exploring",
    cities: ["New Mansoura", "Mostakbal City"], unitTypes: ["STUDIO", "APARTMENT"], bedroomsMin: 1, buaMin: 55, deliveryByYear: 2030,
    priorities: "Seeing what is actually reachable on my budget before I commit to anything.",
  },
];

export const ANALYSTS: PersonSeed[] = [
  { nameEn: "Heba Samir Nagy", nameAr: "هبة سمير ناجي", phone: "+201003330001", email: "heba.analyst@aqary.test", govCode: "01", birthYear: 1989 },
  { nameEn: "Mohamed Refaat Diab", nameAr: "محمد رفعت دياب", phone: "+201003330002", email: "mohamed.analyst@aqary.test", govCode: "21", birthYear: 1987 },
  { nameEn: "Passant Ihab Lotfy", nameAr: "بسنت إيهاب لطفي", phone: "+201003330003", email: "passant.analyst@aqary.test", govCode: "01", birthYear: 1992 },
];

export const ADMIN: PersonSeed = {
  nameEn: "Aqary Operations", nameAr: "إدارة أقاري", phone: "+201004440001", email: "admin@aqary.test", govCode: "01", birthYear: 1980,
};

export const PARTNER: PersonSeed = {
  nameEn: "Developer Partner Desk", nameAr: "مكتب شريك التطوير", phone: "+201005550001", email: "partner@aqary.test", govCode: "01", birthYear: 1982,
};

export const EXIT_REASONS = [
  "JOB_CHANGE",
  "BUSINESS_DIFFICULTY",
  "INCREASED_OBLIGATIONS",
  "FAMILY_CIRCUMSTANCES",
  "LIQUIDITY_NEED",
  "STRATEGY_CHANGE",
  "CANNOT_CONTINUE_INSTALLMENTS",
] as const;

export const DEMO_PASSWORD = "aqary2026";
