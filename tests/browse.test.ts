import { afterAll, expect, it } from "vitest";
import request from "supertest";
import { registerAndLogin } from "./helpers/auth";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/src/app";
import { db } from "../server/src/db";
import { initial } from "../shared/chess";
const runtime = makeApp();
const ids: string[] = [];
const matches: string[] = [];
afterAll(async () => {
  await db.friend.deleteMany({
    where: { OR: [{ a: { in: ids } }, { b: { in: ids } }] },
  });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.audit.deleteMany({ where: { actor: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  runtime.io.close();
  runtime.http.close();
  await db.$disconnect();
});
it("history pages tied timestamps, filters across all records, and protects private replays", async () => {
  const accounts = [];
  for (let i = 0; i < 3; i++) {
    const name = "br_" + randomUUID().slice(0, 8);
    const a = (
      await registerAndLogin(runtime.app, {
        username: name,
        email: name + "@tests.invalid",
        password: "Chess12345",
      })
    ).body;
    accounts.push(a);
    ids.push(a.actor.id);
  }
  const [a, b, c] = accounts;
  const get = (who: typeof a, path: string) =>
    request(runtime.app)
      .get("/api" + path)
      .set("Authorization", "Bearer " + who.token);
  for (let i = 0; i < 5; i++) {
    const id = randomUUID();
    matches.push(id);
    const state = {
      id,
      roomId: randomUUID(),
      red: a.actor.id,
      black: b.actor.id,
      names: { red: "Alpha", black: "Beta" },
      guests: false,
      status: "FINISHED",
      version: 1,
      position: initial(),
      minutes: 10,
      remaining: { red: 1000, black: 1000 },
      lastTick: 0,
      undo: true,
      log: [],
      requests: [],
      ready: [],
      windows: {},
      video: false,
      messages: [{ text: "private chat" }],
      receipts: { secret: "hidden" },
      result: { winner: i === 0 ? null : "red", reason: "RESIGNATION" },
    };
    await db.match.create({
      data: {
        id,
        red: a.actor.id,
        black: b.actor.id,
        status: "FINISHED",
        version: 1,
        mode: i < 3 ? "RANDOM" : "PUBLIC",
        createdAt: new Date("2026-10-20T12:00:00Z"),
        state: JSON.parse(JSON.stringify(state)),
      },
    });
  }
  let cursor: string | null = null;
  const found: string[] = [];
  do {
    const r = await get(
      a,
      "/matches/history?limit=2" + (cursor ? "&cursor=" + cursor : ""),
    );
    expect(r.status).toBe(200);
    expect(found.length).toBeLessThan(6);
    found.push(...r.body.items.map((m: { id: string }) => m.id));
    cursor = r.body.nextCursor;
  } while (cursor);
  expect(new Set(found).size).toBe(5);
  expect(found).toHaveLength(5);
  const filtered = await get(
    a,
    "/matches/history?limit=2&mode=RANDOM&date=2026-10-20&opponent=beta&result=draw",
  );
  expect(filtered.body.items).toHaveLength(1);
  expect(filtered.body.items[0].messages).toBeUndefined();
  await db.match.update({
    where: { id: matches[0] },
    data: { createdAt: new Date("2026-10-19T18:00:00Z") },
  });
  expect(
    (await get(a, "/matches/history?limit=2&date=2026-10-20&result=draw")).body
      .items,
  ).toHaveLength(1);
  expect(
    (await get(a, "/matches/history?limit=2&date=2026-10-19&result=draw")).body
      .items,
  ).toHaveLength(0);
  const replay = await get(c, "/matches/" + matches[0] + "/replay");
  expect(replay.status).toBe(200);
  expect(replay.body.messages).toEqual([]);
  expect(replay.body.receipts).toEqual({});
  await db.user.update({
    where: { id: b.actor.id },
    data: { hideHistory: true },
  });
  expect(
    (await get(c, "/users/" + a.actor.id + "/history?limit=2")).body.items,
  ).toEqual([]);
  await db.user.update({
    where: { id: b.actor.id },
    data: { hideHistory: false },
  });
  const pair = [a.actor.id, c.actor.id].sort().join(":");
  await db.friend.create({
    data: {
      pair,
      a: a.actor.id,
      b: c.actor.id,
      initiatedBy: a.actor.id,
      status: "NONE",
      blockedBy: [a.actor.id],
    },
  });
  expect((await get(c, "/users/" + a.actor.id + "/profile")).status).toBe(403);
  expect(
    (await get(c, "/users/" + a.actor.id + "/history?limit=2")).status,
  ).toBe(403);
  await db.friend.delete({ where: { pair } });
  const guest = (await request(runtime.app).post("/api/auth/guest")).body;
  const guestRow = await db.match.findUniqueOrThrow({
    where: { id: matches[1] },
  });
  await db.match.update({
    where: { id: guestRow.id },
    data: {
      red: guest.actor.id,
      state: { ...(guestRow.state as object), red: guest.actor.id } as never,
    },
  });
  expect((await get(guest, "/matches/" + guestRow.id + "/replay")).status).toBe(
    200,
  );
  await db.match.update({
    where: { id: guestRow.id },
    data: { red: a.actor.id, state: guestRow.state as never },
  });
  await db.session.deleteMany({ where: { guestId: guest.actor.id } });
  await db.user.update({
    where: { id: a.actor.id },
    data: { hideHistory: true },
  });
  expect(
    (await get(c, "/users/" + a.actor.id + "/history?limit=2")).body.items,
  ).toEqual([]);
  expect((await get(c, "/matches/" + matches[0] + "/replay")).status).toBe(403);
  expect((await get(b, "/matches/" + matches[0] + "/replay")).status).toBe(200);
  await db.user.update({ where: { id: c.actor.id }, data: { role: "ADMIN" } });
  const detail = await get(c, "/admin/matches/" + matches[0]);
  expect(detail.status).toBe(200);
  expect(detail.body.messages).toBeUndefined();
  expect(detail.body.receipts).toBeUndefined();
  expect(detail.body.version).toBe(1);
  expect(
    (await get(c, "/admin/matches?limit=2&q=" + matches[0])).body.items,
  ).toHaveLength(1);
  expect((await get(c, "/admin/users?limit=2&q=" + a.actor.name)).status).toBe(
    200,
  );
  expect(
    await db.audit.count({
      where: {
        actor: c.actor.id,
        action: "ADMIN_VIEW_MATCH",
        entityId: matches[0],
      },
    }),
  ).toBe(1);
});
it("public profile exposes only public fields and admin lists accept bounded cursors", async () => {
  const username = "browse_" + randomUUID().slice(0, 8);
  const account = (
    await registerAndLogin(runtime.app, {
      username,
      email: username + "@tests.invalid",
      password: "Chess12345",
    })
  ).body;
  ids.push(account.actor.id);
  const get = (path: string) =>
    request(runtime.app)
      .get("/api" + path)
      .set("Authorization", "Bearer " + account.token);
  const profile = await get("/users/" + account.actor.id + "/profile");
  expect(profile.status).toBe(200);
  expect(profile.body.username).toBe(username);
  expect(profile.body.email).toBeUndefined();
  expect(profile.body.passwordHash).toBeUndefined();
  expect((await get("/admin/matches?limit=2")).status).toBe(403);
  await db.user.update({
    where: { id: account.actor.id },
    data: { role: "ADMIN" },
  });
  const first = await get("/admin/users?limit=2");
  expect(first.status).toBe(200);
  expect(Array.isArray(first.body.items)).toBe(true);
  expect(first.body.items.length).toBeLessThanOrEqual(2);
  expect((await get("/matches/history?limit=2&mode=RANDOM")).body).toEqual({
    items: [],
    nextCursor: null,
  });
  expect((await get("/admin/users?limit=999")).status).toBe(400);
  expect((await get("/admin/users?limit=2&cursor=bad")).status).toBe(400);
});
