import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Cached in every environment, not just dev. In dev this survives HMR; on a
// serverless host it keeps separate route bundles inside one instance from each
// opening their own pool, which is how a connection limit gets exhausted.
globalForPrisma.prisma = prisma;

export * from "@prisma/client";
