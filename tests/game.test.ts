import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import { GameService } from "../server/game";
import type { Actor, MatchState } from "../shared/domain";
let now = 1000000;
const game = new GameService(() => now);
let a: Actor, b: Actor, c: Actor;
const ids: string[] = [],
  roomIds: string[] = [];
beforeAll(async () => {
  for (const name of ["a", "b", "c"]) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        username: "test_" + name + "_" + id,
        email: id + "@tests.invalid",
        displayName: name,
      },
    });
    ids.push(id);
  }
  [a, b, c] = ids.map((id, i) => ({
    id,
    sessionId: randomUUID(),
    guest: false,
    name: ["a", "b", "c"][i],
    role: "USER",
  }));
  game.online.add(a.id);
  game.online.add(b.id);
  game.online.add(c.id);
});
afterAll(async () => {
  await db.move.deleteMany({
    where: { match: { OR: [{ red: { in: ids } }, { black: { in: ids } }] } },
  });
  await db.match.deleteMany({
    where: { OR: [{ red: { in: ids } }, { black: { in: ids } }] },
  });
  await db.room.deleteMany({ where: { id: { in: roomIds } } });
  await db.notification.deleteMany({ where: { receiver: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
async function start(minutes = 10) {
  const r = await game.create(a, {
    minutes,
    visibility: "private",
    ownerSide: "red",
    undo: true,
  });
  roomIds.push(r.id);
  await game.roomAction(b, r.id, "join");
  let current = await game.room(r.id);
  await game.roomAction(a, r.id, "ready", { version: current.version });
  current = await game.room(r.id);
  await game.roomAction(b, r.id, "ready", { version: current.version });
  now += 3001;
  await game.tick();
  const rr = await game.room(r.id);
  return game.match(rr.matchId!, a.id);
}
async function cancel(m: MatchState) {
  await game.mutate(a, m.id, (m) => game.finish(m, null, "TEST_CLEANUP", true));
  const r = await game.room(m.roomId);
  if (r.status !== "CLOSED")
    await game.roomAction(r.owner === a.id ? a : b, r.id, "leave");
}
describe("PostgreSQL authoritative transactions", () => {
  it("TC-016 exactly one concurrent last-seat join; TC-017 private hidden; TC-022 no self seat", async () => {
    const r = await game.create(a, {
      minutes: 10,
      visibility: "private",
      ownerSide: "red",
      undo: true,
    });
    roomIds.push(r.id);
    const results = await Promise.allSettled([
      game.roomAction(b, r.id, "join"),
      game.roomAction(c, r.id, "join"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await game.room(r.id)).seats).toHaveLength(2);
    await game.roomAction(a, r.id, "join");
    expect((await game.room(r.id)).seats).toHaveLength(2);
    expect((await game.list(c)).some((x) => x.id === r.id)).toBe(false);
    await game.roomAction(a, r.id, "leave");
  });
  it("TC-020 leave countdown cancels without result", async () => {
    const r = await game.create(a, {
      minutes: 10,
      visibility: "public",
      ownerSide: "red",
      undo: true,
    });
    roomIds.push(r.id);
    await game.roomAction(b, r.id, "join");
    let current = await game.room(r.id);
    await game.roomAction(a, r.id, "ready", { version: current.version });
    current = await game.room(r.id);
    await game.roomAction(b, r.id, "ready", { version: current.version });
    await game.roomAction(b, r.id, "leave");
    now += 4000;
    await game.tick();
    expect((await game.room(r.id)).status).toBe("WAITING");
    expect((await game.room(r.id)).matchId).toBeUndefined();
    await game.roomAction(a, r.id, "leave");
  });
  it("TC-021 config change resets ready", async () => {
    const r = await game.create(a, {
      minutes: 10,
      visibility: "public",
      ownerSide: "red",
      undo: true,
    });
    roomIds.push(r.id);
    await game.roomAction(b, r.id, "join");
    await game.roomAction(b, r.id, "ready", {
      version: (await game.room(r.id)).version,
    });
    await game.roomAction(a, r.id, "config", { minutes: 5 });
    expect((await game.room(r.id)).seats.every((s) => !s.ready)).toBe(true);
    await game.roomAction(a, r.id, "leave");
  });
  it("move idempotency, stale and wrong turn rejected, DB log one row", async () => {
    let m = await start();
    const moveId = randomUUID();
    m = await game.move(a, m.id, moveId, m.version, { from: 54, to: 45 });
    await game.move(a, m.id, moveId, m.version - 1, { from: 54, to: 45 });
    expect(await db.move.count({ where: { id: moveId } })).toBe(1);
    m = await game.match(m.id, a.id);
    await expect(
      game.move(a, m.id, randomUUID(), m.version, { from: 56, to: 47 }),
    ).rejects.toThrow("NOT_YOUR_TURN");
    await expect(
      game.move(b, m.id, randomUUID(), m.version - 1, { from: 27, to: 36 }),
    ).rejects.toThrow("STALE_VERSION");
    await cancel(m);
  });
  it("TC-034 unlimited; TC-037 invalid move clock continues; TC-035 timeout once", async () => {
    let m = await start(0);
    now += 9999999;
    await game.tick();
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("ACTIVE");
    expect(m.remaining.red).toBeNull();
    await cancel(m);
    m = await start(5);
    now += 1000;
    await expect(
      game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 55 }),
    ).rejects.toThrow("ILLEGAL_MOVE");
    now += 1000;
    await game.tick();
    m = await game.match(m.id, a.id);
    expect(m.remaining.red).toBe(298000);
    now += 300000;
    await game.tick();
    m = await game.match(m.id, a.id);
    expect(m.result).toEqual({ winner: "black", reason: "TIMEOUT" });
    const version = m.version;
    await game.tick();
    expect((await game.match(m.id, a.id)).version).toBe(version);
    await game.roomAction(a, m.roomId, "leave");
  });
  it.each([5,10,15,30])('TC-035 total %i-minute control times out once',async minutes=>{let m=await start(minutes);expect(m.remaining.red).toBe(minutes*60000);now+=minutes*60000+1;await game.tick();m=await game.match(m.id,a.id);expect(m.result).toEqual({winner:'black',reason:'TIMEOUT'});expect(m.remaining.black).toBe(minutes*60000);const version=m.version;await game.tick();expect((await game.match(m.id,a.id)).version).toBe(version);await game.roomAction(a,m.roomId,'leave');});
  it("TC-045 refusal; TC-046 save commit; TC-052 offline invitation; TC-053 resume refusal; TC-054 exact recovery; TC-055 third-party forbidden", async () => {
    let m = await start();
    m = await game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 45 });
    const pos = structuredClone(m.position);
    let requestId = randomUUID();
    m = await game.request(a, m.id, "SAVE", requestId);
    m = await game.respond(b, m.id, requestId, false);
    expect(m.status).toBe("ACTIVE");
    requestId = randomUUID();
    m = await game.request(a, m.id, "SAVE", requestId);
    m = await game.respond(b, m.id, requestId, true);
    expect(m.status).toBe("SAVED");
    const remaining = { ...m.remaining };
    game.online.delete(b.id);
    requestId = randomUUID();
    m = await game.request(a, m.id, "RESUME", requestId);
    expect(m.status).toBe("SAVED");
    expect(
      await db.notification.count({ where: { receiver: b.id } }),
    ).toBeGreaterThan(0);
    m = await game.respond(b, m.id, requestId, false);
    expect(m.status).toBe("SAVED");
    await expect(game.match(m.id, c.id)).rejects.toThrow("FORBIDDEN");
    requestId = randomUUID();
    m = await game.request(a, m.id, "RESUME", requestId);
    m = await game.respond(b, m.id, requestId, true);
    game.online.add(b.id);
    await game.resumeReady(a, m.id);
    m = await game.resumeReady(b, m.id);
    expect(m.status).toBe("ACTIVE");
    expect(m.position).toEqual(pos);
    expect(m.remaining).toEqual(remaining);
    expect(m.red).toBe(a.id);
    await cancel(m);
  });
  it("TC-049 stale save confirmation; TC-050 terminal dominates; TC-051 forced transaction rollback", async () => {
    let m = await start();
    const requestId = randomUUID();
    m = await game.request(a, m.id, "SAVE", requestId);
    m = await game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 45 });
    await expect(game.respond(b, m.id, requestId, true)).rejects.toThrow(
      "STALE_VERSION",
    );
    const before = await game.match(m.id, a.id);
    await expect(
      game.mutate(a, m.id, async (state, tx) => {
        state.status = "SAVED";
        await tx.$executeRawUnsafe(
          "SELECT nonexistent_function_for_fault_injection()",
        );
      }),
    ).rejects.toThrow();
    expect((await game.match(m.id, a.id)).status).toBe(before.status);
    expect(await game.match(m.id, a.id)).toEqual(before);
    await game.resign(a, m.id);
    await expect(game.respond(b, m.id, requestId, true)).rejects.toThrow();
    expect((await game.match(m.id, a.id)).status).toBe("FINISHED");
    await game.roomAction(a, m.roomId, "leave");
  });
  it("TC-056/057 agreed draw once; TC-058 undo restores board and clocks", async () => {
    let m = await start();
    const before = structuredClone(m);
    now += 1000;
    m = await game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 45 });
    let requestId = randomUUID();
    m = await game.request(a, m.id, "UNDO", requestId);
    m = await game.respond(b, m.id, requestId, true);
    expect(m.position).toEqual(before.position);
    expect(m.log).toHaveLength(0);
    expect(
      await db.move.count({ where: { matchId: m.id, effective: true } }),
    ).toBe(0);
    requestId = randomUUID();
    m = await game.request(a, m.id, "DRAW", requestId);
    m = await game.respond(b, m.id, requestId, false);
    expect(m.status).toBe("ACTIVE");
    requestId = randomUUID();
    m = await game.request(a, m.id, "DRAW", requestId);
    m = await game.respond(b, m.id, requestId, true);
    expect(m.result).toEqual({ winner: null, reason: "AGREED_DRAW" });
    await game.roomAction(a, m.roomId, "leave");
  });
  it("TC-038 reconnect freezes; TC-039 expired player loses to online opponent", async () => {
    let m = await start();
    now += 1234;
    await game.connection(a.id, false);
    m = await game.match(m.id, b.id);
    const frozen = { ...m.remaining };
    expect(m.status).toBe("PAUSED_RECONNECT");
    now += 50000;
    await game.connection(a.id, true);
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("ACTIVE");
    expect(m.remaining).toEqual(frozen);
    await game.connection(a.id, false);
    now += 60001;
    await game.tick();
    m = await game.match(m.id, b.id);
    expect(m.result).toEqual({ winner: "black", reason: "DISCONNECT_LOSS" });
    await game.roomAction(a, m.roomId, "leave");
    game.online.add(a.id);
  });
  it("TC-040 staggered deadlines cancel only after both expire", async () => {
    let m = await start();
    await game.connection(a.id, false);
    now += 20000;
    await game.connection(b.id, false);
    now += 40001;
    await game.tick();
    expect((await game.match(m.id, a.id)).status).toBe("PAUSED_RECONNECT");
    now += 20000;
    await game.tick();
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("CANCELED");
    expect(m.result).toEqual({ winner: null, reason: "BOTH_DISCONNECTED" });
    await game.roomAction(a, m.roomId, "leave");
    game.online.add(a.id);
    game.online.add(b.id);
  });
  it("TC-041 B returns before own deadline after A expired", async () => {
    let m = await start();
    await game.connection(a.id, false);
    now += 20000;
    await game.connection(b.id, false);
    now += 45000;
    await game.connection(b.id, true);
    m = await game.match(m.id, b.id);
    expect(m.result).toEqual({ winner: "black", reason: "DISCONNECT_LOSS" });
    await game.roomAction(a, m.roomId, "leave");
    game.online.add(a.id);
  });
  it("TC-042 repeated disconnect consumes 180s budget", async () => {
    let m = await start();
    for (let i = 0; i < 3; i++) {
      await game.connection(a.id, false);
      now += 59000;
      await game.connection(a.id, true);
    }
    await game.connection(a.id, false);
    m = await game.match(m.id, b.id);
    expect(m.windows[a.id].deadline - now).toBe(3000);
    now += 3001;
    await game.tick();
    expect((await game.match(m.id, b.id)).result?.reason).toBe(
      "DISCONNECT_LOSS",
    );
    await game.roomAction(a, m.roomId, "leave");
    game.online.add(a.id);
  });
  it("TC-059/060 video consent; TC-062 terminal closes; TC-063 third party chat denied", async () => {
    let m = await start(),
      requestId = randomUUID();
    m = await game.request(a, m.id, "VIDEO", requestId);
    expect(m.video).toBe(false);
    m = await game.respond(b, m.id, requestId, false);
    expect(m.video).toBe(false);
    requestId = randomUUID();
    m = await game.request(a, m.id, "VIDEO", requestId);
    m = await game.respond(b, m.id, requestId, true);
    expect(m.video).toBe(true);
    await expect(game.chat(c, m.id, randomUUID(), "spoof")).rejects.toThrow(
      "FORBIDDEN",
    );
    m = await game.resign(a, m.id);
    expect(m.video).toBe(false);
    await game.roomAction(a, m.roomId, "leave");
  });
  it("TC-047 crossed saves merge; duplicate approval ACK recovery; two resume requests create one room", async () => {
    let m = await start();
    const oldRoom = m.roomId;
    await Promise.all([
      game.request(a, m.id, "SAVE", randomUUID()),
      game.request(b, m.id, "SAVE", randomUUID()),
    ]);
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("SAVED");
    expect(m.requests.filter((r) => r.kind === "SAVE")).toHaveLength(1);
    await Promise.all([
      game.request(a, m.id, "RESUME", randomUUID()),
      game.request(b, m.id, "RESUME", randomUUID()),
    ]);
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("RESUMING");
    expect(m.requests.filter((r) => r.kind === "RESUME")).toHaveLength(1);
    expect(m.roomId).not.toBe(oldRoom);
    expect((await game.room(oldRoom)).status).toBe("CLOSED");
    await Promise.all([game.resumeReady(a, m.id), game.resumeReady(b, m.id)]);
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("ACTIVE");
    expect(await db.match.count({ where: { id: m.id } })).toBe(1);
    await cancel(m);
  });
  it("Save DB commit survives lost Socket broadcast ACK", async () => {
    let m = await start();
    const requestId = randomUUID();
    m = await game.request(a, m.id, "SAVE", requestId);
    const old = game.publish;
    game.publish = () => {
      throw Error("SOCKET_DELIVERY_FAILED");
    };
    try {
      await expect(game.respond(b, m.id, requestId, true)).rejects.toThrow(
        "SOCKET_DELIVERY_FAILED",
      );
    } finally {
      game.publish = old;
    }
    expect((await game.match(m.id, a.id)).status).toBe("SAVED");
    m = await game.respond(b, m.id, requestId, true);
    expect(m.status).toBe("SAVED");
    await cancel(m);
  });
  it("TC-048 Guest cannot save; TC-010 conversion preserves room and original board", async () => {
    const g: Actor = {
      id: randomUUID(),
      sessionId: randomUUID(),
      guest: true,
      name: "Guest",
      role: "GUEST",
    };
    await db.session.create({
      data: {
        id: g.sessionId,
        guestId: g.id,
        refreshHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    game.online.add(g.id);
    const r = await game.create(a, {
      minutes: 10,
      visibility: "private",
      ownerSide: "red",
      undo: true,
    });
    roomIds.push(r.id);
    await game.roomAction(g, r.id, "join");
    await game.roomAction(a, r.id, "ready", {
      version: (await game.room(r.id)).version,
    });
    await game.roomAction(g, r.id, "ready", {
      version: (await game.room(r.id)).version,
    });
    now += 3001;
    await game.tick();
    let m = await game.match((await game.room(r.id)).matchId!, a.id);
    await expect(game.request(a, m.id, "SAVE", randomUUID())).rejects.toThrow(
      "GUEST_CANNOT_SAVE",
    );
    const pos = structuredClone(m.position);
    await game.convertGuest(g, c);
    m = await game.match(m.id, c.id);
    expect(m.guests).toBe(false);
    expect(m.black).toBe(c.id);
    expect(m.position).toEqual(pos);
    expect((await game.room(r.id)).seats.map((s) => s.id)).toEqual([
      a.id,
      c.id,
    ]);
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: g.sessionId } }))
        .revokedAt,
    ).not.toBeNull();
    await expect(game.match(m.id, g.id)).rejects.toThrow("FORBIDDEN");
    await cancel(m);
    await db.session.delete({ where: { id: g.sessionId } });
    game.online.delete(g.id);
  });
  it("TC-011 saved match locked after player soft delete without fabricated win", async () => {
    let m = await start();
    const requestId = randomUUID();
    m = await game.request(a, m.id, "SAVE", requestId);
    m = await game.respond(b, m.id, requestId, true);
    await db.user.update({
      where: { id: b.id },
      data: { deletedAt: new Date(), status: "DELETED" },
    });
    await expect(game.request(a, m.id, "RESUME", randomUUID())).rejects.toThrow(
      "ACCOUNT_UNAVAILABLE",
    );
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("SAVED");
    expect(m.result).toBeUndefined();
    await db.user.update({
      where: { id: b.id },
      data: { deletedAt: null, status: "ACTIVE" },
    });
    await cancel(m);
  });
  it("Chat spam limited independently from moves; retry same message remains one row", async () => {
    let m = await start();
    const messageId = randomUUID();
    await game.chat(a, m.id, messageId, "hello");
    await game.chat(a, m.id, messageId, "hello");
    for (let i = 0; i < 4; i++) await game.chat(a, m.id, randomUUID(), "hello");
    await expect(game.chat(a, m.id, randomUUID(), "spam")).rejects.toThrow(
      "RATE_LIMITED",
    );
    m = await game.match(m.id, a.id);
    expect(m.messages).toHaveLength(5);
    m = await game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 45 });
    expect(m.position.turn).toBe("black");
    await cancel(m);
  });
  it("late reconnection cannot win after both deadlines, but global presence remains valid for a new match", async () => {
    let m = await start();
    await game.connection(a.id, false);
    now += 20000;
    await game.connection(b.id, false);
    now += 60001;
    await game.connection(a.id, true);
    m = await game.match(m.id, a.id);
    expect(m.status).toBe("CANCELED");
    expect(m.result?.winner).toBeNull();
    expect(game.online.has(a.id)).toBe(true);
    await game.connection(b.id, true);
    await game.roomAction(a, m.roomId, "leave");
  });
  it("database incident recovery never charges outage as timeout and preserves saved games", async () => {
    let saved = await start();
    const requestId = randomUUID();
    saved = await game.request(a, saved.id, "SAVE", requestId);
    saved = await game.respond(b, saved.id, requestId, true);
    const active = await start();
    game.incident = true;
    now += 9999999;
    await expect(
      game.move(a, active.id, randomUUID(), active.version, {
        from: 54,
        to: 45,
      }),
    ).rejects.toThrow("SERVICE_RECOVERY");
    await game.tick();
    const recovered = await game.match(active.id, a.id);
    expect(recovered.result).toEqual({
      winner: null,
      reason: "SERVER_RECOVERY",
    });
    expect(recovered.remaining).toEqual(active.remaining);
    expect((await game.match(saved.id, a.id)).status).toBe("SAVED");
    expect(game.incident).toBe(false);
  });
  it("owner disconnect during countdown closes room after 30s without any match result", async () => {
    const room = await game.create(a, {
      minutes: 5,
      visibility: "public",
      ownerSide: "red",
      undo: true,
    });
    roomIds.push(room.id);
    await game.roomAction(b, room.id, "join");
    await game.roomAction(a, room.id, "ready", {
      version: (await game.room(room.id)).version,
    });
    await game.roomAction(b, room.id, "ready", {
      version: (await game.room(room.id)).version,
    });
    await game.connection(a.id, false);
    expect((await game.room(room.id)).status).toBe("WAITING");
    now += 30001;
    await game.tick();
    expect((await game.room(room.id)).status).toBe("CLOSED");
    expect((await game.room(room.id)).matchId).toBeUndefined();
    await game.connection(a.id, true);
  });
  it("TC-044 restart preserves move record and safely cancels uncertainty", async () => {
    let m = await start();
    m = await game.move(a, m.id, randomUUID(), m.version, { from: 54, to: 45 });
    await game.recover();
    const after = await game.match(m.id, a.id);
    expect(after.position).toEqual(m.position);
    expect(after.result).toEqual({ winner: null, reason: "SERVER_RECOVERY" });
    expect(await db.move.count({ where: { matchId: m.id } })).toBe(1);
  });
});
