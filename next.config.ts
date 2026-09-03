import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

import path from "node:path";

const nextConfig: NextConfig = {
  // This repo sits inside a directory that has its own lockfile; pin the root.
  outputFileTracingRoot: path.resolve(process.cwd()),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["sharp", "@prisma/client", "bcryptjs"],
  images: {
    formats: ["image/webp"],
    remotePatterns: [],
  },

  // Seeded evidence — contract pages, receipts, developer statements — lives
  // under ./storage and is deliberately NOT in public/: every read is
  // authorised and logged by the file route. Static-file tracing can't see it,
  // because the keys are only known from the database, so it is declared here.
  //
  // Only the file route needs it. Extraction of a newly uploaded document has
  // no sidecar to read either way, so bundling storage into the seller routes
  // would cost ~44MB per function for nothing.
  outputFileTracingIncludes: {
    "/api/files/[key]": ["./storage/**/*"],
  },
};

export default withNextIntl(nextConfig);
