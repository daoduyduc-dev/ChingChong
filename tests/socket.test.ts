import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { io as client, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/app";
import { GameService } from "../server/game";
import { db } from "../server/db";
import { moves } from "../shared/chess";
import { writeFileSync } from "node:fs";
let now = 1000000;
const game = new GameService(() => now);
const { app, http, io } = makeApp(game);
let url: string;
const accounts: any[] = [],
  sockets: Socket[] = [],
  rooms: string[] = [],
  matches: string[] = [];
async function join(token: string, controlId = randomUUID()) {
  const s = client(url, {
    transports: ["websocket"],
    auth: { token, controlId },
    forceNew: true,
    reconnection: false,
  });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", reject);
  });
  await game.serial(async () => {});
  return s;
}
const emit = (s: Socket, event: string, data: unknown) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, data, (e: Error | null, value: unknown) =>
        e ? reject(e) : resolve(value),
      ),
  );
beforeAll(async () => {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw Error("LISTEN_FAILED");
  url = "http://127.0.0.1:" + address.port;
  for (let i = 0; i < 3; i++) {
    const name = "sock_" + randomUUID().slice(0, 8);
    const r = await request(app)
      .post("/api/auth/register")
      .send({
        username: name,
        email: name + "@tests.invalid",
        password: "Chess12345",
      });
    accounts.push(r.body);
  }
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await game.serial(async () => {});
  await new Promise<void>((resolve) => io.close(() => resolve()));
  http.close();
  const ids = accounts.map((a) => a.actor.id);
  await db.move.deleteMany({ where: { matchId: { in: matches } } });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.room.deleteMany({ where: { id: { in: rooms } } });
  await db.friend.deleteMany({
    where: { OR: [{ a: { in: ids } }, { b: { in: ids } }] },
  });
  await db.audit.deleteMany({ where: { actor: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
it("TC-006 second tab replaces first controller; TC-036 client clock ignored; third player cannot chat or signal; active legitimate player can move", async () => {
  const [a, b, c] = accounts;
  const old = await join(a.token),
    black = await join(b.token),
    third = await join(c.token);
  const r = await game.create(a.actor, {
    minutes: 10,
    visibility: "private",
    ownerSide: "red",
    undo: true,
  });
  rooms.push(r.id);
  await game.roomAction(b.actor, r.id, "join");
  await game.roomAction(a.actor, r.id, "ready", {
    version: (await game.room(r.id)).version,
  });
  await game.roomAction(b.actor, r.id, "ready", {
    version: (await game.room(r.id)).version,
  });
  now += 3001;
  await game.tick();
  let m = await game.match((await game.room(r.id)).matchId!, a.actor.id);
  matches.push(m.id);
  const replacement = await join(a.token);
  expect(old.connected).toBe(false);
  expect(
    (
      await request(app)
        .post("/api/matches/" + m.id + "/resign")
        .set("Authorization", "Bearer " + a.token)
        .set("X-Control-ID", (old.auth as { controlId: string }).controlId)
        .send({})
    ).status,
  ).toBe(401);
  expect(
    (
      await emit(third, "chat:send", {
        matchId: m.id,
        messageId: randomUUID(),
        text: "spoof",
      })
    ).error,
  ).toBe("FORBIDDEN");
  expect(
    (
      await emit(third, "video:signal", {
        matchId: m.id,
        sessionId: randomUUID(),
        signal: { description: { type: "offer", sdp: "forged" } },
      })
    ).error,
  ).toBe("FORBIDDEN");
  m = await game.match(m.id, a.actor.id);
  expect(
    (
      await emit(replacement, "video:signal", {
        matchId: m.id,
        sessionId: randomUUID(),
        signal: { description: { type: "offer", sdp: "no-consent" } },
      })
    ).error,
  ).toBe("FORBIDDEN");
  const response = await emit(replacement, "match:move", {
    matchId: m.id,
    moveId: randomUUID(),
    expectedVersion: m.version,
    from: 54,
    to: 45,
    remainingMs: 90000000,
    clientTimestamp: 1,
  });
  expect(response.ok).toBe(true);
  expect(response.data.position.turn).toBe("black");
  expect(response.data.remaining.red).toBeLessThanOrEqual(600000);
  expect(black.connected).toBe(true);
});
it("TC-043 login on new device revokes old session and resumes same committed board", async () => {
  const a = accounts[0];
  const before = await game.match(matches[0], a.actor.id);
  const u = await db.user.findUniqueOrThrow({ where: { id: a.actor.id } });
  const old = a.token;
  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: u.username, password: "Chess12345" });
  expect(login.status).toBe(200);
  Object.assign(a, login.body);
  await join(a.token);
  const after = await game.match(matches[0], a.actor.id);
  expect(after.status).toBe("ACTIVE");
  expect(after.position).toEqual(before.position);
  expect(after.remaining).toEqual(before.remaining);
  expect(
    (
      await request(app)
        .get("/api/matches/" + after.id)
        .set("Authorization", "Bearer " + old)
    ).status,
  ).toBe(401);
});
it("TC-018 expired/invalid code; TC-023 random matching; TC-024 cancellation; TC-025 blocked pair stays unmatched", async () => {
  const [a, b, c] = accounts;
  await game.resign(a.actor, matches[0]);
  await game.roomAction(a.actor, rooms[0], "leave");
  const post = (account: any, path: string, body: object) => {
    const s = [...sockets]
      .reverse()
      .find(
        (s) =>
          s.connected && (s.auth as { token: string }).token === account.token,
      )!;
    return request(app)
      .post("/api" + path)
      .set("Authorization", "Bearer " + account.token)
      .set("X-Control-ID", (s.auth as { controlId: string }).controlId)
      .send(body);
  };
  expect((await post(a, "/rooms/join-code", { code: "000000" })).status).toBe(
    404,
  );
  expect(
    (
      await post(a, "/rooms/join-code", {
        code: (await game.room(rooms[0])).code,
      })
    ).body.error,
  ).toBe("ROOM_CLOSED");
  expect(
    (await post(c, "/matchmaking/join", { minutes: 10 })).body.searching,
  ).toBe(true);
  await post(c, "/matchmaking/cancel", {});
  expect(
    (await post(a, "/matchmaking/join", { minutes: 10 })).body.searching,
  ).toBe(true);
  const matched = await post(b, "/matchmaking/join", { minutes: 10 });
  expect(matched.status).toBe(200);
  expect(matched.body.seats.map((s: any) => s.id)).toEqual([
    a.actor.id,
    b.actor.id,
  ]);
  expect(matched.body.elo).toBeUndefined();
  rooms.push(matched.body.id);
  await game.roomAction(a.actor, matched.body.id, "leave");
  await db.friend.create({
    data: {
      pair: [a.actor.id, b.actor.id].sort().join(":"),
      a: [a.actor.id, b.actor.id].sort()[0],
      b: [a.actor.id, b.actor.id].sort()[1],
      status: "NONE",
      initiatedBy: a.actor.id,
      blockedBy: [a.actor.id],
    },
  });
  expect(
    (await post(a, "/matchmaking/join", { minutes: 5 })).body.searching,
  ).toBe(true);
  expect(
    (await post(b, "/matchmaking/join", { minutes: 5 })).body.searching,
  ).toBe(true);
  await post(a, "/matchmaking/cancel", {});
  await post(b, "/matchmaking/cancel", {});
});
it("TC-015 block suppresses room invitations and existing match chat/video without fabricating outcome", async () => {
  const [a, b] = accounts;
  const pair = [a.actor.id, b.actor.id].sort().join(":");
  await db.friend.update({
    where: { pair },
    data: { status: "ACCEPTED", blockedBy: [] },
  });
  const room = await game.create(a.actor, {
    minutes: 0,
    visibility: "private",
    ownerSide: "red",
    undo: true,
  });
  rooms.push(room.id);
  await game.roomAction(b.actor, room.id, "join");
  const action = (account: any, target: string, action: string) =>
    request(app)
      .post("/api/friends/action")
      .set("Authorization", "Bearer " + account.token)
      .send({ target, action });
  await action(a, b.actor.id, "block");
  expect(
    (
      await request(app)
        .post("/api/rooms/" + room.id + "/invite")
        .set("Authorization", "Bearer " + b.token)
        .set(
          "X-Control-ID",
          (
            [...sockets]
              .reverse()
              .find(
                (s) =>
                  s.connected &&
                  (s.auth as { token: string }).token === b.token,
              )!.auth as { controlId: string }
          ).controlId,
        )
        .send({ target: a.actor.id })
    ).status,
  ).toBe(403);
  await expect(
    game.roomAction(b.actor, room.id, "ready", {
      version: (await game.room(room.id)).version,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await action(a, b.actor.id, "unblock");
  await game.roomAction(a.actor, room.id, "ready", {
    version: (await game.room(room.id)).version,
  });
  await game.roomAction(b.actor, room.id, "ready", {
    version: (await game.room(room.id)).version,
  });
  now += 3001;
  await game.tick();
  let m = await game.match((await game.room(room.id)).matchId!, a.actor.id);
  matches.push(m.id);
  const requestId = randomUUID();
  m = await game.request(a.actor, m.id, "VIDEO", requestId);
  m = await game.respond(b.actor, m.id, requestId, true);
  expect(m.video).toBe(true);
  await action(a, b.actor.id, "block");
  m = await game.match(m.id, b.actor.id);
  expect(m.video).toBe(false);
  expect(m.status).toBe("ACTIVE");
  expect(m.result).toBeUndefined();
  const socket = [...sockets]
    .reverse()
    .find(
      (s) => s.connected && (s.auth as { token: string }).token === b.token,
    )!;
  expect(
    (
      await emit(socket, "chat:send", {
        matchId: m.id,
        messageId: randomUUID(),
        text: "blocked",
      })
    ).error,
  ).toBe("FORBIDDEN");
  expect(
    (
      await emit(socket, "video:signal", {
        matchId: m.id,
        sessionId: requestId,
        signal: { description: { type: "offer", sdp: "blocked" } },
      })
    ).error,
  ).toBe("FORBIDDEN");
  await game.resign(a.actor, m.id);
  await game.roomAction(a.actor, room.id, "leave");
});
it("NFR-03 local real Socket ACK latency sample, separate from real-network acceptance", async () => {
  const [a, b] = accounts;
  await db.friend.deleteMany({
    where: { pair: [a.actor.id, b.actor.id].sort().join(":") },
  });
  const room = await game.create(a.actor, {
    minutes: 0,
    visibility: "private",
    ownerSide: "red",
    undo: false,
  });
  rooms.push(room.id);
  await game.roomAction(b.actor, room.id, "join");
  await game.roomAction(a.actor, room.id, "ready", {
    version: (await game.room(room.id)).version,
  });
  await game.roomAction(b.actor, room.id, "ready", {
    version: (await game.room(room.id)).version,
  });
  now += 3001;
  await game.tick();
  let m = await game.match((await game.room(room.id)).matchId!, a.actor.id);
  matches.push(m.id);
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const account = m.position.turn === "red" ? a : b;
    const socket = [...sockets]
      .reverse()
      .find(
        (s) =>
          s.connected && (s.auth as { token: string }).token === account.token,
      )!;
    const move = moves(m.position)[0];
    const started = performance.now();
    const response = await emit(socket, "match:move", {
      matchId: m.id,
      moveId: randomUUID(),
      expectedVersion: m.version,
      ...move,
    });
    expect(response.ok).toBe(true);
    samples.push(performance.now() - started);
    m = response.data;
  }
  const sorted = [...samples].sort((a, b) => a - b),
    p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  writeFileSync(
    "docs/implementation/socket-latency.json",
    JSON.stringify(
      {
        environment:
          "Windows loopback, real Socket.IO and PostgreSQL, synthetic server clock only",
        samplesMs: samples,
        p95Ms: p95,
        targetMs: 200,
        realNetworkAcceptance: false,
      },
      null,
      2,
    ),
  );
  expect(p95).toBeLessThan(200);
  await game.resign(a.actor, m.id);
  await game.roomAction(a.actor, room.id, "leave");
});
