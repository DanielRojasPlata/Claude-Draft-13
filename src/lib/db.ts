import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
/** Created on first use so the desktop build (which never touches Postgres) never loads the query engine. */
const client = () => (g.prisma ??= new PrismaClient());
export const db = new Proxy({} as PrismaClient, { get: (_t, p) => Reflect.get(client(), p) });
