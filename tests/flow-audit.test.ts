import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { registerAndLogin } from "./helpers/auth";
import { io as connect, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/src/app";
import { GameService } from "../server/src/services/game";
import { db } from "../server/src/database/db";
import { DomainError } from "../server/src/common/errors";
import type { Actor, RoomState } from "../shared/domain";

describe("database flows", () => {
  let now = 1_000_000;
  let runtime: ReturnType<typeof makeApp>;
  const accounts: { actor: Actor; token: string; controlId: string }[] = [];
  const sockets: Socket[] = [];

  afterAll(() => db.$disconnect());

  beforeEach(async () => {
    runtime = makeApp(new GameService(() => now));
    await new Promise<void>((resolve) =>
      runtime.http.listen(0, "127.0.0.1", resolve),
    );
    const address = runtime.http.address();
    if (!address || typeof address === "string") throw Error("LISTEN_FAILED");
    for (let i = 0; i < 3; i++) {
      const username = "flow_" + randomUUID().slice(0, 8);
      const response = await registerAndLogin(runtime.app, {
        username,
        email: username + "@tests.invalid",
        password: "Chess12345",
      });
      expect(response.status).toBe(200);
      const account = { ...response.body, controlId: randomUUID() };
      accounts.push(account);
      const socket = connect(`http://127.0.0.1:${address.port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        auth: { token: account.token, controlId: account.controlId },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
    }
    await runtime.game.serial(async () => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.disconnect();
    await new Promise<void>((resolve) => runtime.io.close(() => resolve()));
    await runtime.game.serial(async () => {});
    const ids = accounts.splice(0).map((a) => a.actor.id);
    await db.match.deleteMany({
      where: { OR: [{ red: { in: ids } }, { black: { in: ids } }] },
    });
    const rooms = await db.room.findMany();
    await db.room.deleteMany({
      where: {
        id: {
          in: rooms
            .filter((r) =>
              ids.includes((r.state as unknown as RoomState).owner),
            )
            .map((r) => r.id),
        },
      },
    });
    await db.friend.deleteMany({ where: { a: { in: ids } } });
    await db.notification.deleteMany({ where: { receiver: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  function post(index: number, path: string, body: object) {
    const a = accounts[index];
    return request(runtime.app)
      .post("/api" + path)
      .set("Authorization", "Bearer " + a.token)
      .set("X-Control-ID", a.controlId)
      .send(body);
  }
  const config = {
    minutes: 5,
    visibility: "private",
    ownerSide: "red",
    undo: true,
  } as const;

  it("clock timeout during disconnect releases the room for rematch", async () => {
    const [a, b] = accounts;
    const room = await runtime.game.create(a.actor, config);
    await runtime.game.roomAction(b.actor, room.id, "join");
    for (const account of [a, b]) {
      await runtime.game.roomAction(account.actor, room.id, "ready", {
        version: (await runtime.game.room(room.id)).version,
      });
    }
    now += 3001;
    await runtime.game.tick();
    now += 300001;
    await runtime.game.connection(a.actor.id, false);
    const ended = await runtime.game.room(room.id);
    expect(
      (await runtime.game.match(ended.matchId!, a.actor.id)).result?.reason,
    ).toBe("TIMEOUT");
    expect(ended.status).toBe("POST_MATCH");
    expect(
      (await runtime.game.roomAction(b.actor, room.id, "rematch")).status,
    ).toBe("WAITING");
  });

  it("room invitation wakes an online friend's notification inbox", async () => {
    const [a, b] = accounts;
    const [first, second] = [a.actor.id, b.actor.id].sort();
    await db.friend.create({
      data: {
        pair: first + ":" + second,
        a: first,
        b: second,
        initiatedBy: a.actor.id,
        status: "ACCEPTED",
        blockedBy: [],
      },
    });
    const room = await runtime.game.create(a.actor, config);
    let notified = false;
    sockets[1].once("notification:new", () => {
      notified = true;
    });
    const response = await post(0, "/rooms/" + room.id + "/invite", {
      target: b.actor.id,
    });
    expect(response.status).toBe(200);
    await expect.poll(() => notified, { timeout: 500 }).toBe(true);
    expect(
      await db.notification.count({ where: { receiver: b.actor.id } }),
    ).toBe(1);
  });

  it("matchmaking skips a queued player who entered another room", async () => {
    expect(
      (await post(0, "/matchmaking/join", { minutes: 5 })).body.searching,
    ).toBe(true);
    expect((await post(0, "/rooms", config)).status).toBe(200);
    const waiting = await post(1, "/matchmaking/join", { minutes: 5 });
    expect(waiting.status).toBe(200);
    expect(waiting.body.searching).toBe(true);
    const matched = await post(2, "/matchmaking/join", { minutes: 5 });
    expect(matched.status).toBe(200);
    expect(matched.body.seats.map((s: { id: string }) => s.id).sort()).toEqual(
      [accounts[1].actor.id, accounts[2].actor.id].sort(),
    );
  });

  it("changing matchmaking time removes the requester's previous queue entry", async () => {
    await post(0, "/matchmaking/join", { minutes: 5 });
    await post(1, "/matchmaking/join", { minutes: 10 });
    const matched = await post(0, "/matchmaking/join", { minutes: 10 });
    expect(matched.body.seats).toHaveLength(2);
    await runtime.game.roomAction(accounts[0].actor, matched.body.id, "leave");
    // Close the paired room so an accidentally retained 5-minute entry becomes observable.
    await runtime.game.roomAction(accounts[1].actor, matched.body.id, "leave");
    const result = await post(2, "/matchmaking/join", { minutes: 5 });
    expect(result.status).toBe(200);
    expect(result.body.searching).toBe(true);
  });

  it.each(["SESSION_REVOKED", "ALREADY_IN_ROOM"] as const)(
    "matchmaking continues to a valid candidate after a racing %s",
    async (code) => {
      const [stale, valid, matcher] = accounts;
      const [first, second] = [stale.actor.id, valid.actor.id].sort();
      const pair = first + ":" + second;
      // Keep both candidates queued until the third player starts matching.
      await db.friend.create({
        data: {
          pair,
          a: first,
          b: second,
          initiatedBy: stale.actor.id,
          status: "NONE",
          blockedBy: [stale.actor.id],
        },
      });
      for (const index of [0, 1]) {
        const response = await post(index, "/matchmaking/join", { minutes: 5 });
        expect(response.status).toBe(200);
        expect(response.body.searching).toBe(true);
      }
      await db.friend.update({ where: { pair }, data: { blockedBy: [] } });

      const create = runtime.game.create.bind(runtime.game);
      const failures: string[] = [];
      vi.spyOn(runtime.game, "create").mockImplementation(
        async (actor, settings) => {
          if (actor.id === stale.actor.id) {
            // Invalidate after the matchmaking occupancy snapshot, immediately before
            // the real creation check, to exercise catch-and-continue rather than pruning.
            if (code === "SESSION_REVOKED") {
              await db.session.update({
                where: { id: actor.sessionId },
                data: { revokedAt: new Date() },
              });
            } else {
              await create(actor, config);
            }
          }
          try {
            return await create(actor, settings);
          } catch (error) {
            if (error instanceof DomainError) failures.push(error.code);
            throw error;
          }
        },
      );

      const matched = await post(2, "/matchmaking/join", { minutes: 5 });
      expect(failures).toEqual([code]);
      expect(matched.status).toBe(200);
      expect(
        matched.body.seats.map((seat: { id: string }) => seat.id).sort(),
      ).toEqual([valid.actor.id, matcher.actor.id].sort());
      expect(matched.body.owner).toBe(valid.actor.id);
    },
  );
});

it("auth rate limits return the API JSON error contract", async () => {
  const fresh = makeApp();
  try {
    for (let i = 0; i < 25; i++) {
      const response = await request(fresh.app)
        .post("/api/auth/login")
        .send({});
      expect(response.status).toBe(400);
    }
    const limited = await request(fresh.app).post("/api/auth/login").send({});
    expect(limited.status).toBe(429);
    expect(limited.headers["content-type"]).toContain("application/json");
    expect(limited.body).toEqual({ error: "RATE_LIMITED" });
  } finally {
    fresh.io.close();
    fresh.http.close();
  }
});
