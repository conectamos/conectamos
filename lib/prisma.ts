import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
      lock_timeout: 10_000,
      query_timeout: 60_000,
      statement_timeout: 60_000,
    }),
  });

globalForPrisma.prisma = prisma;

export default prisma;
