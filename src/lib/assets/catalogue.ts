/**
 * The property-photography catalogue.
 *
 * Real photographs, downloaded into `public/property/` by `npm run assets:fetch`
 * and served locally — nothing is hot-linked at runtime. Sources and licence
 * terms are written to ASSETS.md by the same script.
 *
 * Every entry below was categorised by looking at the actual image, not by
 * guessing from its filename. A photograph is never filed under a room it does
 * not show, and a photograph is never presented as a developer render.
 */

export type PhotoCategory =
  | "COMPOUND_EXTERIOR"
  | "BUILDING_FACADE"
  | "ENTRANCE"
  | "LIVING"
  | "BEDROOM"
  | "KITCHEN"
  | "BATHROOM"
  | "BALCONY"
  | "AMENITY";

export interface CataloguePhoto {
  id: string;
  category: PhotoCategory;
  /** What the picture actually shows. Used verbatim as the image alt text. */
  altEn: string;
  altAr: string;
}

/** Unsplash photo IDs, each verified reachable and visually checked. */
export const CATALOGUE: CataloguePhoto[] = [
  // --- Compound exteriors and whole buildings ----------------------------
  { id: "1512699355324-f07e3106dae5", category: "COMPOUND_EXTERIOR", altEn: "Aerial view of a low-rise gated community with private pools", altAr: "منظر جوي لمجتمع سكني منخفض الارتفاع بحمامات سباحة خاصة" },
  { id: "1512917774080-9991f1c4c750", category: "COMPOUND_EXTERIOR", altEn: "Modern house with a pool at dusk", altAr: "منزل حديث بحمام سباحة عند الغروب" },
  { id: "1568605114967-8130f3a36994", category: "COMPOUND_EXTERIOR", altEn: "Contemporary dark-clad house lit at dusk", altAr: "منزل معاصر بكسوة داكنة مضاء عند الغروب" },
  { id: "1580216643062-cf460548a66a", category: "COMPOUND_EXTERIOR", altEn: "Residential towers seen from open ground", altAr: "أبراج سكنية من مساحة مفتوحة" },
  { id: "1580587771525-78b9dba3b914", category: "COMPOUND_EXTERIOR", altEn: "Villa with a swimming pool and landscaped terrace", altAr: "فيلا بحمام سباحة وتراس منسّق" },
  { id: "1583608205776-bfd35f0d9f83", category: "COMPOUND_EXTERIOR", altEn: "Two-storey house with palms and a driveway", altAr: "منزل من دورين بنخيل ومدخل سيارات" },
  { id: "1600047509807-ba8f99d2cdde", category: "COMPOUND_EXTERIOR", altEn: "Modern villa facade with a lawn", altAr: "واجهة فيلا حديثة بحديقة أمامية" },
  { id: "1600566753190-17f0baa2a6c3", category: "COMPOUND_EXTERIOR", altEn: "Modern house in wood and concrete", altAr: "منزل حديث بالخشب والخرسانة" },
  { id: "1600573472592-401b489a3cdc", category: "COMPOUND_EXTERIOR", altEn: "Long low-rise residential block with slatted screens", altAr: "مبنى سكني منخفض الارتفاع بمشربيات" },
  { id: "1600585154340-be6161a56a0c", category: "COMPOUND_EXTERIOR", altEn: "Contemporary house at night beside a mature tree", altAr: "منزل معاصر ليلًا بجوار شجرة كبيرة" },
  { id: "1600607688969-a5bfcd646154", category: "COMPOUND_EXTERIOR", altEn: "House exterior with a lawn and a shade tree", altAr: "واجهة منزل بحديقة وشجرة ظليلة" },
  { id: "1613490493576-7fde63acd811", category: "COMPOUND_EXTERIOR", altEn: "Modern residence with a pool along its length", altAr: "منزل حديث بحمام سباحة ممتد" },
  { id: "1613977257363-707ba9348227", category: "COMPOUND_EXTERIOR", altEn: "Two-storey villa with a pool and terrace", altAr: "فيلا من دورين بحمام سباحة وتراس" },

  { id: "1523217582562-09d0def993a6", category: "BUILDING_FACADE", altEn: "White cubic building elevation with a lawn", altAr: "واجهة مبنى بيضاء بتكوين مكعّب" },
  { id: "1600585154526-990dced4db0d", category: "BUILDING_FACADE", altEn: "Dark timber-clad facade with a recessed entrance", altAr: "واجهة بكسوة خشبية داكنة ومدخل غائر" },

  { id: "1565182999561-18d7dc61c393", category: "ENTRANCE", altEn: "Entrance hall with a staircase", altAr: "مدخل بسلم داخلي" },

  // --- Living, reception and dining --------------------------------------
  { id: "1493809842364-78817add7ffb", category: "LIVING", altEn: "Bright room with an armchair beside a tall window", altAr: "غرفة مضيئة بكرسي بجوار نافذة عالية" },
  { id: "1502005229762-cf1b2da7c5d6", category: "LIVING", altEn: "Double-height living space with an open staircase", altAr: "مساحة معيشة مزدوجة الارتفاع بسلم مفتوح" },
  { id: "1502672260266-1c1ef2d93688", category: "LIVING", altEn: "Living room with a sofa and indoor plants", altAr: "غرفة معيشة بكنبة ونباتات داخلية" },
  { id: "1505873242700-f289a29e1e0f", category: "LIVING", altEn: "Loft living and dining area with exposed brick", altAr: "مساحة معيشة وسفرة بطراز لوفت وطوب ظاهر" },
  { id: "1519643381401-22c77e60520e", category: "LIVING", altEn: "Dining table set beneath pendant lights", altAr: "طاولة طعام تحت وحدات إضاءة معلقة" },
  { id: "1522708323590-d24dbb6b0267", category: "LIVING", altEn: "Living area with a red accent chair", altAr: "منطقة معيشة بكرسي أحمر مميز" },
  { id: "1536376072261-38c75010e6c9", category: "LIVING", altEn: "Living room with full-height bookshelves", altAr: "غرفة معيشة برفوف كتب ممتدة" },
  { id: "1552321554-5fefe8c9ef14", category: "LIVING", altEn: "Minimal white interior with plants", altAr: "تشطيب داخلي أبيض بسيط مع نباتات" },
  { id: "1554995207-c18c203602cb", category: "LIVING", altEn: "Living room with a leather sofa", altAr: "غرفة معيشة بكنبة جلدية" },
  { id: "1556228453-efd6c1ff04f6", category: "LIVING", altEn: "Living room with a leather sofa and wall hanging", altAr: "غرفة معيشة بكنبة جلدية ومعلقة جدارية" },
  { id: "1560185127-6ed189bf02f4", category: "LIVING", altEn: "Living room with a low coffee table", altAr: "غرفة معيشة بترابيزة قهوة منخفضة" },
  { id: "1560448204-61dc36dc98c8", category: "LIVING", altEn: "Dining room with upholstered chairs", altAr: "غرفة سفرة بكراسي منجّدة" },
  { id: "1560448204-e02f11c3d0e2", category: "LIVING", altEn: "Open living area with a sofa and rug", altAr: "منطقة معيشة مفتوحة بكنبة وسجادة" },
  { id: "1567767292278-a4f21aa2d36e", category: "LIVING", altEn: "Grey-toned living room with an armchair", altAr: "غرفة معيشة رمادية بكرسي وثير" },
  { id: "1583847268964-b28dc8f51f92", category: "LIVING", altEn: "Living room with cane furniture and framed art", altAr: "غرفة معيشة بأثاث خيزران ولوحات" },
  { id: "1586023492125-27b2c045efd7", category: "LIVING", altEn: "Seating nook with a yellow armchair", altAr: "ركن جلوس بكرسي أصفر" },
  { id: "1590490360182-c33d57733427", category: "LIVING", altEn: "Classic living room with floor-length curtains", altAr: "غرفة معيشة كلاسيكية بستائر ممتدة" },
  { id: "1594026112284-02bb6f3352fe", category: "LIVING", altEn: "Living room with a gallery wall and shelving", altAr: "غرفة معيشة بحائط لوحات ورفوف" },
  { id: "1598928506311-c55ded91a20c", category: "LIVING", altEn: "Living room with built-in shelving", altAr: "غرفة معيشة برفوف مدمجة" },
  { id: "1600121848594-d8644e57abab", category: "LIVING", altEn: "Staged living room in neutral tones", altAr: "غرفة معيشة بألوان محايدة" },
  { id: "1600210491892-03d54c0aaf87", category: "LIVING", altEn: "Living room with beamed ceiling and arched windows", altAr: "غرفة معيشة بأسقف بكمرات ونوافذ مقوّسة" },
  { id: "1600210492486-724fe5c67fb0", category: "LIVING", altEn: "Living room with a gallery wall", altAr: "غرفة معيشة بحائط لوحات" },
  { id: "1600566753086-00f18fb6b3ea", category: "LIVING", altEn: "Living area beside an open staircase", altAr: "منطقة معيشة بجوار سلم مفتوح" },
  { id: "1600573472550-8090b5e0745e", category: "LIVING", altEn: "Glass-walled living space overlooking a pool", altAr: "مساحة معيشة بواجهة زجاجية تطل على حمام السباحة" },
  { id: "1600607687939-ce8a6c25118c", category: "LIVING", altEn: "Living space with a round table and glass wall", altAr: "مساحة معيشة بطاولة دائرية وحائط زجاجي" },
  { id: "1615529182904-14819c35db37", category: "LIVING", altEn: "Living and dining area under pendant lamps", altAr: "منطقة معيشة وسفرة تحت وحدات إضاءة معلقة" },
  { id: "1616486338812-3dadae4b4ace", category: "LIVING", altEn: "Neutral living room with a wall clock", altAr: "غرفة معيشة محايدة بساعة حائط" },
  { id: "1617103996702-96ff29b1c467", category: "LIVING", altEn: "Living room with rattan furniture and a patterned rug", altAr: "غرفة معيشة بأثاث خيزران وسجادة منقوشة" },
  { id: "1617806118233-18e1de247200", category: "LIVING", altEn: "Dining room with green upholstered chairs", altAr: "غرفة سفرة بكراسي خضراء منجّدة" },
  { id: "1631679706909-1844bbd07221", category: "LIVING", altEn: "Living room with round mirrors above the sofa", altAr: "غرفة معيشة بمرايا دائرية فوق الكنبة" },
  { id: "1600607687920-4e2a09cf159d", category: "LIVING", altEn: "Open-plan kitchen and dining with a dark island", altAr: "مطبخ وسفرة مفتوحان بجزيرة داكنة" },

  // --- Kitchens -----------------------------------------------------------
  { id: "1484154218962-a197022b5858", category: "KITCHEN", altEn: "White fitted kitchen with a wood floor", altAr: "مطبخ أبيض مجهّز بأرضية خشبية" },
  { id: "1502005097973-6a7082348e28", category: "KITCHEN", altEn: "Galley kitchen opening onto the garden", altAr: "مطبخ ممتد يفتح على الحديقة" },
  { id: "1507089947368-19c1da9775ae", category: "KITCHEN", altEn: "Kitchen island under pendant lighting", altAr: "جزيرة مطبخ تحت إضاءة معلقة" },
  { id: "1556909212-d5b604d0c90d", category: "KITCHEN", altEn: "Kitchen with open shelving and copper pans", altAr: "مطبخ برفوف مفتوحة وأواني نحاسية" },
  { id: "1565538810643-b5bdb714032a", category: "KITCHEN", altEn: "Kitchen counter with a fruit bowl", altAr: "بلاطة مطبخ عليها طبق فاكهة" },
  { id: "1600585152220-90363fe7e115", category: "KITCHEN", altEn: "Kitchen island with bar stools", altAr: "جزيرة مطبخ بكراسي بار" },
  { id: "1600607686527-6fb886090705", category: "KITCHEN", altEn: "Kitchen with pendant lights and stools", altAr: "مطبخ بإضاءة معلقة وكراسي" },
  { id: "1600607688066-890987f18a86", category: "KITCHEN", altEn: "Kitchen with a marble counter and dark floor", altAr: "مطبخ ببلاطة رخامية وأرضية داكنة" },

  // --- Bedrooms -----------------------------------------------------------
  { id: "1522444195799-478538b28823", category: "BEDROOM", altEn: "Bedroom with layered textiles", altAr: "غرفة نوم بمفروشات متعددة الطبقات" },
  { id: "1595526114035-0d45ed16cfbf", category: "BEDROOM", altEn: "Bedroom with white bedding and side tables", altAr: "غرفة نوم بمفروشات بيضاء وكوميدينو" },
  { id: "1616594039964-ae9021a400a0", category: "BEDROOM", altEn: "Bedroom with dark painted walls", altAr: "غرفة نوم بجدران داكنة" },

  // --- Bathrooms ----------------------------------------------------------
  { id: "1584622650111-993a426fbf0a", category: "BATHROOM", altEn: "Bathroom with a walk-in shower and basin", altAr: "حمام بكابينة دش وحوض" },
  { id: "1600566752355-35792bedcfea", category: "BATHROOM", altEn: "Dark bathroom with a freestanding bath", altAr: "حمام داكن ببانيو مستقل" },

  // --- Balcony / outdoor living ------------------------------------------
  { id: "1560184897-ae75f418493e", category: "BALCONY", altEn: "Covered porch with wicker seating", altAr: "شرفة مغطاة بجلسة خيزران" },

  // --- Amenities ----------------------------------------------------------
  { id: "1584132967334-10e028bd69f7", category: "AMENITY", altEn: "Pool deck with sun loungers and palms", altAr: "منطقة حمام سباحة بكراسي تشمس ونخيل" },
];

export const ATTRIBUTION = {
  source: "Unsplash",
  licence: "Unsplash Licence — free to use, no permission needed, attribution appreciated",
  licenceUrl: "https://unsplash.com/license",
  pageUrl: (id: string) => `https://unsplash.com/photos/${id}`,
  fileUrl: (id: string, w: number) =>
    `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`,
};

export function byCategory(category: PhotoCategory): CataloguePhoto[] {
  return CATALOGUE.filter((p) => p.category === category);
}

/**
 * Deterministic pick so the same listing always gets the same gallery, and no
 * shot is ever repeated inside one gallery. Each category's pool is rotated by
 * the seed and walked, so different listings draw different photographs.
 */
export function pickPhotos(
  seed: number,
  plan: { category: PhotoCategory; count: number }[],
): CataloguePhoto[] {
  const chosen = new Set<string>();
  const out: CataloguePhoto[] = [];

  for (const step of plan) {
    const pool = byCategory(step.category);
    if (pool.length === 0) continue;
    const offset = Math.abs(seed * 2654435761 + step.category.length * 7919) % pool.length;
    let taken = 0;
    for (let i = 0; i < pool.length && taken < step.count; i++) {
      const photo = pool[(offset + i) % pool.length]!;
      if (chosen.has(photo.id)) continue;
      chosen.add(photo.id);
      out.push(photo);
      taken++;
    }
  }
  return out;
}
