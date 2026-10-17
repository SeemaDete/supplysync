import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads (dev) and warm serverless invocations (Vercel)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Business transactions recalculate status + follow-ups; give them headroom over a pooled connection
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
