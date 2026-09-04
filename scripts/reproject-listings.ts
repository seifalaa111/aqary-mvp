/**
 * Re-derives every listing's cached read model from its verified contract
 * fields and the current `config`.
 *
 * `projectVerifiedReadModel` writes a projection — outstanding balance,
 * remaining installments, the developer assignment fee, and `discountPctBps`,
 * which is a saving against the developer's price today and therefore depends
 * on `PLATFORM_FEE_BPS`. Changing an economic constant leaves that projection
 * stale on an already-seeded database, so run this after such a change:
 *
 *     node --env-file=.env --conditions=react-server --import tsx scripts/reproject-listings.ts
 *
 * It reads verified fields and rewrites only derived columns, so it mints no
 * CUIDs and leaves the `./storage` coupling intact — unlike a reseed.
 */
import { prisma } from "../src/lib/db";
import { projectVerifiedReadModel } from "../src/lib/services/listings";
import { config } from "../src/lib/config";

async function main() {
  const listings = await prisma.listing.findMany({ select: { id: true, reference: true } });
  console.log(
    `Re-projecting ${listings.length} listings at PLATFORM_FEE_BPS=${config.PLATFORM_FEE_BPS}…`,
  );

  let ok = 0;
  const failures: { reference: string; error: string }[] = [];

  for (const l of listings) {
    try {
      await projectVerifiedReadModel(l.id);
      ok++;
    } catch (e) {
      // A listing with no verified fields yet cannot be projected; that is not
      // a failure of this script, but it is reported rather than swallowed.
      failures.push({ reference: l.reference, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`Re-projected ${ok}/${listings.length}.`);
  if (failures.length > 0) {
    console.log("Skipped:");
    for (const f of failures) console.log(`  ${f.reference}: ${f.error}`);
  }
  await prisma.$disconnect();
  process.exit(failures.length > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
