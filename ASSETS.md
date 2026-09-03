# ASSETS

Every image in this repository, where it came from, and what it is allowed to be used for.

## 1. Property photography

**Source:** Unsplash  
**Licence:** Unsplash Licence — free to use, no permission needed, attribution appreciated  
**Licence terms:** https://unsplash.com/license

Files are downloaded by `npm run assets:fetch` into `public/property/` and served
locally. Nothing is hot-linked at runtime. Each photograph is emitted as a
responsive set (`-thumb.webp` 320px, `-card.webp` 800px, `-card.jpg` fallback,
`-detail.webp` 1600px), with EXIF stripped, auto-orientation applied and one
consistent grade across the whole set so mixed-source photography reads as a
single system.

### What these photographs are, and are not

These are real photographs of real architecture and real interiors. They are
**not** photographs of the seeded units, because the seeded units do not exist.
Nothing in the product presents them as evidence of a specific property: seeded
listings are flagged `isDemo` and the interface carries a standing notice that
all people, contracts, receipts, prices and valuations in this build are synthetic.

In production these slots are filled by photographs the seller uploads of their
own unit, and the product already distinguishes `Actual photos` from
`Developer renders` on every card and gallery.

### Catalogue

#### amenity

| File | Description | Source page |
|---|---|---|
| `1584132967334-10e028bd69f7` | Pool deck with sun loungers and palms | https://unsplash.com/photos/1584132967334-10e028bd69f7 |

#### balcony

| File | Description | Source page |
|---|---|---|
| `1560184897-ae75f418493e` | Covered porch with wicker seating | https://unsplash.com/photos/1560184897-ae75f418493e |

#### bathroom

| File | Description | Source page |
|---|---|---|
| `1584622650111-993a426fbf0a` | Bathroom with a walk-in shower and basin | https://unsplash.com/photos/1584622650111-993a426fbf0a |
| `1600566752355-35792bedcfea` | Dark bathroom with a freestanding bath | https://unsplash.com/photos/1600566752355-35792bedcfea |

#### bedroom

| File | Description | Source page |
|---|---|---|
| `1522444195799-478538b28823` | Bedroom with layered textiles | https://unsplash.com/photos/1522444195799-478538b28823 |
| `1595526114035-0d45ed16cfbf` | Bedroom with white bedding and side tables | https://unsplash.com/photos/1595526114035-0d45ed16cfbf |
| `1616594039964-ae9021a400a0` | Bedroom with dark painted walls | https://unsplash.com/photos/1616594039964-ae9021a400a0 |

#### building facade

| File | Description | Source page |
|---|---|---|
| `1523217582562-09d0def993a6` | White cubic building elevation with a lawn | https://unsplash.com/photos/1523217582562-09d0def993a6 |
| `1600585154526-990dced4db0d` | Dark timber-clad facade with a recessed entrance | https://unsplash.com/photos/1600585154526-990dced4db0d |

#### compound exterior

| File | Description | Source page |
|---|---|---|
| `1512699355324-f07e3106dae5` | Aerial view of a low-rise gated community with private pools | https://unsplash.com/photos/1512699355324-f07e3106dae5 |
| `1512917774080-9991f1c4c750` | Modern house with a pool at dusk | https://unsplash.com/photos/1512917774080-9991f1c4c750 |
| `1568605114967-8130f3a36994` | Contemporary dark-clad house lit at dusk | https://unsplash.com/photos/1568605114967-8130f3a36994 |
| `1580216643062-cf460548a66a` | Residential towers seen from open ground | https://unsplash.com/photos/1580216643062-cf460548a66a |
| `1580587771525-78b9dba3b914` | Villa with a swimming pool and landscaped terrace | https://unsplash.com/photos/1580587771525-78b9dba3b914 |
| `1583608205776-bfd35f0d9f83` | Two-storey house with palms and a driveway | https://unsplash.com/photos/1583608205776-bfd35f0d9f83 |
| `1600047509807-ba8f99d2cdde` | Modern villa facade with a lawn | https://unsplash.com/photos/1600047509807-ba8f99d2cdde |
| `1600566753190-17f0baa2a6c3` | Modern house in wood and concrete | https://unsplash.com/photos/1600566753190-17f0baa2a6c3 |
| `1600573472592-401b489a3cdc` | Long low-rise residential block with slatted screens | https://unsplash.com/photos/1600573472592-401b489a3cdc |
| `1600585154340-be6161a56a0c` | Contemporary house at night beside a mature tree | https://unsplash.com/photos/1600585154340-be6161a56a0c |
| `1600607688969-a5bfcd646154` | House exterior with a lawn and a shade tree | https://unsplash.com/photos/1600607688969-a5bfcd646154 |
| `1613490493576-7fde63acd811` | Modern residence with a pool along its length | https://unsplash.com/photos/1613490493576-7fde63acd811 |
| `1613977257363-707ba9348227` | Two-storey villa with a pool and terrace | https://unsplash.com/photos/1613977257363-707ba9348227 |

#### entrance

| File | Description | Source page |
|---|---|---|
| `1565182999561-18d7dc61c393` | Entrance hall with a staircase | https://unsplash.com/photos/1565182999561-18d7dc61c393 |

#### kitchen

| File | Description | Source page |
|---|---|---|
| `1484154218962-a197022b5858` | White fitted kitchen with a wood floor | https://unsplash.com/photos/1484154218962-a197022b5858 |
| `1502005097973-6a7082348e28` | Galley kitchen opening onto the garden | https://unsplash.com/photos/1502005097973-6a7082348e28 |
| `1507089947368-19c1da9775ae` | Kitchen island under pendant lighting | https://unsplash.com/photos/1507089947368-19c1da9775ae |
| `1556909212-d5b604d0c90d` | Kitchen with open shelving and copper pans | https://unsplash.com/photos/1556909212-d5b604d0c90d |
| `1565538810643-b5bdb714032a` | Kitchen counter with a fruit bowl | https://unsplash.com/photos/1565538810643-b5bdb714032a |
| `1600585152220-90363fe7e115` | Kitchen island with bar stools | https://unsplash.com/photos/1600585152220-90363fe7e115 |
| `1600607686527-6fb886090705` | Kitchen with pendant lights and stools | https://unsplash.com/photos/1600607686527-6fb886090705 |
| `1600607688066-890987f18a86` | Kitchen with a marble counter and dark floor | https://unsplash.com/photos/1600607688066-890987f18a86 |

#### living

| File | Description | Source page |
|---|---|---|
| `1493809842364-78817add7ffb` | Bright room with an armchair beside a tall window | https://unsplash.com/photos/1493809842364-78817add7ffb |
| `1502005229762-cf1b2da7c5d6` | Double-height living space with an open staircase | https://unsplash.com/photos/1502005229762-cf1b2da7c5d6 |
| `1502672260266-1c1ef2d93688` | Living room with a sofa and indoor plants | https://unsplash.com/photos/1502672260266-1c1ef2d93688 |
| `1505873242700-f289a29e1e0f` | Loft living and dining area with exposed brick | https://unsplash.com/photos/1505873242700-f289a29e1e0f |
| `1519643381401-22c77e60520e` | Dining table set beneath pendant lights | https://unsplash.com/photos/1519643381401-22c77e60520e |
| `1522708323590-d24dbb6b0267` | Living area with a red accent chair | https://unsplash.com/photos/1522708323590-d24dbb6b0267 |
| `1536376072261-38c75010e6c9` | Living room with full-height bookshelves | https://unsplash.com/photos/1536376072261-38c75010e6c9 |
| `1552321554-5fefe8c9ef14` | Minimal white interior with plants | https://unsplash.com/photos/1552321554-5fefe8c9ef14 |
| `1554995207-c18c203602cb` | Living room with a leather sofa | https://unsplash.com/photos/1554995207-c18c203602cb |
| `1556228453-efd6c1ff04f6` | Living room with a leather sofa and wall hanging | https://unsplash.com/photos/1556228453-efd6c1ff04f6 |
| `1560185127-6ed189bf02f4` | Living room with a low coffee table | https://unsplash.com/photos/1560185127-6ed189bf02f4 |
| `1560448204-61dc36dc98c8` | Dining room with upholstered chairs | https://unsplash.com/photos/1560448204-61dc36dc98c8 |
| `1560448204-e02f11c3d0e2` | Open living area with a sofa and rug | https://unsplash.com/photos/1560448204-e02f11c3d0e2 |
| `1567767292278-a4f21aa2d36e` | Grey-toned living room with an armchair | https://unsplash.com/photos/1567767292278-a4f21aa2d36e |
| `1583847268964-b28dc8f51f92` | Living room with cane furniture and framed art | https://unsplash.com/photos/1583847268964-b28dc8f51f92 |
| `1586023492125-27b2c045efd7` | Seating nook with a yellow armchair | https://unsplash.com/photos/1586023492125-27b2c045efd7 |
| `1590490360182-c33d57733427` | Classic living room with floor-length curtains | https://unsplash.com/photos/1590490360182-c33d57733427 |
| `1594026112284-02bb6f3352fe` | Living room with a gallery wall and shelving | https://unsplash.com/photos/1594026112284-02bb6f3352fe |
| `1598928506311-c55ded91a20c` | Living room with built-in shelving | https://unsplash.com/photos/1598928506311-c55ded91a20c |
| `1600121848594-d8644e57abab` | Staged living room in neutral tones | https://unsplash.com/photos/1600121848594-d8644e57abab |
| `1600210491892-03d54c0aaf87` | Living room with beamed ceiling and arched windows | https://unsplash.com/photos/1600210491892-03d54c0aaf87 |
| `1600210492486-724fe5c67fb0` | Living room with a gallery wall | https://unsplash.com/photos/1600210492486-724fe5c67fb0 |
| `1600566753086-00f18fb6b3ea` | Living area beside an open staircase | https://unsplash.com/photos/1600566753086-00f18fb6b3ea |
| `1600573472550-8090b5e0745e` | Glass-walled living space overlooking a pool | https://unsplash.com/photos/1600573472550-8090b5e0745e |
| `1600607687939-ce8a6c25118c` | Living space with a round table and glass wall | https://unsplash.com/photos/1600607687939-ce8a6c25118c |
| `1615529182904-14819c35db37` | Living and dining area under pendant lamps | https://unsplash.com/photos/1615529182904-14819c35db37 |
| `1616486338812-3dadae4b4ace` | Neutral living room with a wall clock | https://unsplash.com/photos/1616486338812-3dadae4b4ace |
| `1617103996702-96ff29b1c467` | Living room with rattan furniture and a patterned rug | https://unsplash.com/photos/1617103996702-96ff29b1c467 |
| `1617806118233-18e1de247200` | Dining room with green upholstered chairs | https://unsplash.com/photos/1617806118233-18e1de247200 |
| `1631679706909-1844bbd07221` | Living room with round mirrors above the sofa | https://unsplash.com/photos/1631679706909-1844bbd07221 |
| `1600607687920-4e2a09cf159d` | Open-plan kitchen and dining with a dark island | https://unsplash.com/photos/1600607687920-4e2a09cf159d |

## 2. Floor plans and master plans

**Generated, not sourced.** `src/lib/assets/plans.ts` draws each unit's floor plan
from that unit's own record — bedroom count, bathroom count, built-up area, garden
and terrace areas, orientation — and draws each project's master plan with the
specific unit located on it. They are vector drawings rendered to PNG at seed time,
so they are accurate to the data rather than being stock images of somebody else's
apartment. They are schematic: they are not architectural drawings of record.

## 3. Contract documents, receipts and developer statements

**Generated, not sourced.** `src/lib/docgen/` renders Arabic/English contract pages,
payment receipts and developer account statements containing each seeded contract's
real figures, and writes a `.truth.json` sidecar recording where on the page every
value was drawn. The mock extraction engine reads those pages and cites the real
regions, which is what makes the analyst's side-by-side review genuine rather than
decorative. No real contract, receipt or personal document appears anywhere in this
repository.

## 4. Brand identity

**Placeholder.** The Aqary wordmark in `src/components/chrome/wordmark.tsx` is a
typographic treatment standing in for an identity that does not exist yet. It is
flagged as a placeholder in `ASSUMPTIONS.md` and needs to be replaced by real brand
work before any public use.

## 5. Icons

Hand-drawn inline SVG, authored in this repository. No icon library is bundled and
no emoji is used as an icon.
