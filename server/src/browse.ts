import { z } from "zod";
import { Prisma, type Match } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
import type { MatchState } from "../../shared/domain";
type Query = Record<string, unknown>;
export function pagination(query: Query) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(query.limit ?? 20);
  let boundary: { createdAt: Date; id: string } | undefined;
  if (query.cursor !== undefined) {
    const cursor = z.string().max(500).parse(query.cursor);
    try {
      const decoded = z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      boundary = { createdAt: new Date(decoded.at), id: decoded.id };
    } catch {
      assert(false, "VALIDATION_ERROR", 400);
    }
  }
  return { limit, boundary };
}
export function before(query: Query) {
  const { boundary } = pagination(query);
  return boundary
    ? {
        OR: [
          { createdAt: { lt: boundary.createdAt } },
          { createdAt: boundary.createdAt, id: { lt: boundary.id } },
        ],
      }
    : {};
}
export function page<T extends { id: string; createdAt: Date }>(
  rows: T[],
  query: Query,
  map: (row: T) => unknown = (row) => row,
) {
  const { limit } = pagination(query),
    more = rows.length > limit,
    items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items: items.map(map),
    nextCursor:
      more && last
        ? Buffer.from(
            JSON.stringify({ at: last.createdAt.toISOString(), id: last.id }),
          ).toString("base64url")
        : null,
  };
}
export const order = [{ createdAt: "desc" }, { id: "desc" }] as const;
export function summary(row: Match) {
  const m = row.state as unknown as MatchState;
  return {
    id: row.id,
    red: row.red,
    black: row.black,
    names: m.names,
    publicCodes: m.publicCodes,
    status: row.status,
    version: row.version,
    mode: row.mode,
    minutes: m.minutes,
    result: m.result,
    remaining: m.remaining,
    turn: m.position.turn,
    moveCount: m.log.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export async function historyRows(
  subject: string,
  viewer: string,
  hidden: boolean,
  query: Query,
) {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`(m."red"=${subject} OR m."black"=${subject})`,
    Prisma.sql`m."status" IN ('FINISHED','CANCELED')`,
  ];
  if (hidden && subject !== viewer)
    clauses.push(Prisma.sql`(m."red"=${viewer} OR m."black"=${viewer})`);
  if (subject !== viewer && !hidden) {
    // Correlate against the two player primary keys, never load the global user list.
    clauses.push(Prisma.sql`(m."red"=${viewer} OR m."black"=${viewer} OR (
      EXISTS (SELECT 1 FROM "User" u WHERE u."id"=m."red" AND u."status"='ACTIVE' AND u."deletedAt" IS NULL AND NOT u."hideHistory")
      AND EXISTS (SELECT 1 FROM "User" u WHERE u."id"=m."black" AND u."status"='ACTIVE' AND u."deletedAt" IS NULL AND NOT u."hideHistory")
      AND NOT EXISTS (SELECT 1 FROM "Friend" f WHERE f."pair" IN (
        LEAST(${viewer},m."red")||':'||GREATEST(${viewer},m."red"),
        LEAST(${viewer},m."black")||':'||GREATEST(${viewer},m."black")
      ) AND cardinality(f."blockedBy")>0)
    ))`);
  }
  const mode = z
    .enum(["all", "PUBLIC", "PRIVATE", "RANDOM", "UNKNOWN"])
    .parse(query.mode ?? "all");
  if (mode !== "all") clauses.push(Prisma.sql`m."mode"=${mode}`);
  if (query.date) {
    const date = z.iso.date().parse(query.date),
      start = new Date(date + "T00:00:00.000+07:00");
    clauses.push(
      Prisma.sql`m."createdAt">=${start.toISOString()}::timestamp AND m."createdAt"<${new Date(start.getTime() + 86400000).toISOString()}::timestamp`,
    );
  }
  if (query.opponent) {
    const q = z.string().trim().max(120).parse(query.opponent);
    clauses.push(
      Prisma.sql`position(lower(${q}) in lower(CASE WHEN m."red"=${subject} THEN m."state"->'names'->>'black' ELSE m."state"->'names'->>'red' END))>0`,
    );
  }
  const result = z
    .enum(["all", "win", "loss", "draw", "canceled"])
    .parse(query.result ?? "all");
  if (result === "canceled") clauses.push(Prisma.sql`m."status"='CANCELED'`);
  if (result === "draw")
    clauses.push(
      Prisma.sql`m."status"='FINISHED' AND m."state"->'result'->'winner'='null'::jsonb`,
    );
  if (result === "win" || result === "loss")
    clauses.push(
      Prisma.sql`m."status"='FINISHED' AND ((m."red"=${subject} AND m."state"->'result'->>'winner'=${result === "win" ? "red" : "black"}) OR (m."black"=${subject} AND m."state"->'result'->>'winner'=${result === "win" ? "black" : "red"}))`,
    );
  const { limit, boundary } = pagination(query);
  if (query.limit !== undefined && boundary)
    clauses.push(
      Prisma.sql`(m."createdAt",m."id")<(${boundary.createdAt.toISOString()}::timestamp,${boundary.id})`,
    );
  const rows = await db.$queryRaw<Match[]>(
    Prisma.sql`SELECT m.* FROM "Match" m WHERE ${Prisma.join(
      clauses.map((clause) => Prisma.sql`(${clause})`),
      " AND ",
    )} ORDER BY m."createdAt" DESC,m."id" DESC LIMIT ${query.limit !== undefined ? limit + 1 : 100}`,
  );
  return query.limit !== undefined
    ? page(rows, query, summary)
    : rows.map((row) => ({
        ...(row.state as object),
        mode: row.mode,
        createdAt: row.createdAt.toISOString(),
        messages: [],
        receipts: {},
        windows: {},
        requests: [],
        ready: [],
        video: false,
      }));
}
