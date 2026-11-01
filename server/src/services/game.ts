import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../database/db";
import { assert } from "../common/errors";
import {
  initial,
  fen,
  legal,
  outcome,
  play,
  type Move,
  type Side,
} from "../../../shared/chess";
import type {
  Actor,
  MatchState,
  RequestKind,
  RoomState,
} from "../../../shared/domain";
export class GameService {
  private tail: Promise<unknown> = Promise.resolve();
  private pendingTick?: Promise<void>;
  online = new Set<string>();
  incident = false;
  recovered: () => void = () => {};
  notify: (actorId: string) => void = () => {};
  authorizeActor: (
    actor: Actor,
    tx: Prisma.TransactionClient,
  ) => Promise<void> = async () => {};
  publish: (type: string, state: RoomState | MatchState) => void = () => {};
  constructor(
    public now = () => Math.round(performance.timeOrigin + performance.now()),
  ) {}
  serial<T>(f: () => Promise<T>, recovery = false): Promise<T> {
    const guarded = () => {
      assert(recovery || !this.incident, "SERVICE_RECOVERY", 503);
      return f();
    };
    const next = this.tail.then(guarded, guarded);
    this.tail = next.catch(() => {});
    return next;
  }
  async blocked(a: string, b: string, tx: Prisma.TransactionClient = db) {
    const f = await tx.friend.findUnique({
      where: { pair: [a, b].sort().join(":") },
    });
    return !!f?.blockedBy.length;
  }
  async busy(actor: string, tx: Prisma.TransactionClient = db) {
    return !!(await tx.match.findFirst({
      where: {
        OR: [{ red: actor }, { black: actor }],
        status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] },
      },
    }));
  }
  async room(id: string, tx: Prisma.TransactionClient = db) {
    const r = await tx.room.findUnique({ where: { id } });
    assert(r, "ROOM_CLOSED", 404);
    return { ...(r.state as unknown as RoomState), serverTime: this.now() };
  }
  async match(id: string, actor: string, tx: Prisma.TransactionClient = db) {
    const m = await tx.match.findUnique({ where: { id } });
    assert(m, "NOT_FOUND", 404);
    assert(m.red === actor || m.black === actor, "FORBIDDEN", 403);
    return { ...(m.state as unknown as MatchState), serverTime: this.now() };
  }
  async writeMatch(tx: Prisma.TransactionClient, m: MatchState) {
    m.serverTime = this.now();
    await tx.match.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        mode: m.mode ?? "UNKNOWN",
        red: m.red,
        black: m.black,
        status: m.status,
        version: m.version,
        state: m as unknown as Prisma.InputJsonValue,
      },
      update: {
        mode: m.mode ?? "UNKNOWN",
        status: m.status,
        version: m.version,
        state: m as unknown as Prisma.InputJsonValue,
      },
    });
  }
  async writeRoom(tx: Prisma.TransactionClient, r: RoomState) {
    r.serverTime = this.now();
    await tx.room.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        code: r.code,
        state: r as unknown as Prisma.InputJsonValue,
      },
      update: { state: r as unknown as Prisma.InputJsonValue },
    });
  }
  async create(
    a: Actor,
    config: {
      mode?: "PUBLIC" | "PRIVATE" | "RANDOM" | "UNKNOWN";
      visibility: "public" | "private";
      minutes: number;
      ownerSide: Side | "random";
      undo: boolean;
    },
  ) {
    return this.serial(async () => {
      assert(!(await this.busy(a.id)), "ALREADY_PLAYING");
      const rooms = await db.room.findMany();
      assert(
        !rooms.some(
          (r) =>
            (r.state as unknown as RoomState).status !== "CLOSED" &&
            (r.state as unknown as RoomState).seats.some((s) => s.id === a.id),
        ),
        "ALREADY_IN_ROOM",
      );
      let code: string;
      do {
        code = String(randomInt(100000, 1000000));
      } while (rooms.some((r) => r.code === code));
      const r: RoomState = {
        id: randomUUID(),
        code,
        owner: a.id,
        status: "WAITING",
        version: 1,
        seats: [{ id: a.id, name: a.name, ready: false }],
        ...config,
        mode:
          config.mode ??
          (config.visibility === "public" ? "PUBLIC" : "PRIVATE"),
      };
      await db.$transaction(async (tx) => {
        await this.authorizeActor(a, tx);
        await this.writeRoom(tx, r);
      });
      return r;
    });
  }
  async list(a: Actor) {
    const rs = await db.room.findMany();
    const out: RoomState[] = [];
    for (const row of rs) {
      const r = row.state as unknown as RoomState;
      if (
        r.visibility === "public" &&
        r.status !== "CLOSED" &&
        !(await this.blocked(a.id, r.owner))
      )
        out.push(r);
    }
    return out;
  }
  async roomAction(
    a: Actor,
    id: string,
    action: "join" | "ready" | "leave" | "config" | "rematch",
    data: Record<string, unknown> = {},
  ) {
    return this.serial(async () => {
      const r = await db.$transaction(async (tx) => {
        await this.authorizeActor(a, tx);
        const r = await this.room(id, tx);
        assert(r.status !== "CLOSED", "ROOM_CLOSED");
        if (action === "join") {
          assert(!(await this.busy(a.id, tx)), "ALREADY_PLAYING");
          if (!r.seats.some((s) => s.id === a.id)) {
            assert(r.status === "WAITING" && r.seats.length < 2, "ROOM_FULL");
            assert(!(await this.blocked(a.id, r.owner, tx)), "FORBIDDEN", 403);
            const all = await tx.room.findMany();
            assert(
              !all.some((row) => {
                const rr = row.state as unknown as RoomState;
                return (
                  rr.id !== r.id &&
                  rr.status !== "CLOSED" &&
                  rr.seats.some((s) => s.id === a.id)
                );
              }),
              "ALREADY_IN_ROOM",
            );
            r.seats.push({ id: a.id, name: a.name, ready: false });
          }
        } else {
          const seat = r.seats.find((s) => s.id === a.id);
          assert(seat, "FORBIDDEN", 403);
          if (action === "leave") {
            assert(!["IN_MATCH"].includes(r.status), "RESIGN_REQUIRED");
            if (a.id === r.owner) r.status = "CLOSED";
            else {
              r.seats = r.seats.filter((s) => s.id !== a.id);
              r.status = "WAITING";
            }
            delete r.startAt;
            r.seats.forEach((s) => (s.ready = false));
          }
          if (action === "config") {
            assert(
              a.id === r.owner && r.status === "WAITING",
              "FORBIDDEN",
              403,
            );
            Object.assign(r, data);
            r.seats.forEach((s) => (s.ready = false));
          }
          if (action === "rematch") {
            assert(r.status === "POST_MATCH", "INVALID_STATE");
            r.status = "WAITING";
            delete r.matchId;
            r.seats.forEach((s) => (s.ready = false));
          }
          if (action === "ready") {
            assert(r.status === "WAITING", "INVALID_STATE");
            assert(data.version === r.version, "STALE_VERSION");
            assert(!(await this.busy(a.id, tx)), "ALREADY_PLAYING");
            if (r.seats.length === 2)
              assert(
                !(await this.blocked(r.seats[0].id, r.seats[1].id, tx)),
                "FORBIDDEN",
                403,
              );
            seat.ready = true;
            if (r.seats.length === 2 && r.seats.every((s) => s.ready)) {
              r.status = "COUNTDOWN";
              r.startAt = this.now() + 3000;
            }
          }
        }
        r.version++;
        await this.writeRoom(tx, r);
        return r;
      });
      this.publish("room:state", r);
      return r;
    });
  }
  settle(m: MatchState) {
    if (m.status !== "ACTIVE") return;
    const elapsed = Math.max(0, this.now() - m.lastTick),
      s = m.position.turn;
    if (m.remaining[s] !== null) {
      m.remaining[s] = Math.max(0, m.remaining[s]! - elapsed);
      if (m.remaining[s] === 0)
        this.finish(m, s === "red" ? "black" : "red", "TIMEOUT");
    }
    m.lastTick = this.now();
  }
  finish(m: MatchState, winner: Side | null, reason: string, canceled = false) {
    m.status = canceled ? "CANCELED" : "FINISHED";
    m.result = { winner, reason };
    m.video = false;
    m.messages = [];
    m.chatVersion = (m.chatVersion ?? 0) + 1;
    m.requests.forEach((r) => {
      if (r.status === "PENDING") r.status = "CANCELED";
    });
  }
  async mutate(
    a: Actor,
    id: string,
    f: (m: MatchState, tx: Prisma.TransactionClient) => Promise<void> | void,
    advanceVersion = true,
  ) {
    return this.serial(async () => {
      const m = await db.$transaction(async (tx) => {
        await this.authorizeActor(a, tx);
        const m = await this.match(id, a.id, tx);
        const before = JSON.stringify(m);
        this.settle(m);
        await f(m, tx);
        if (JSON.stringify(m) === before) return m;
        if (advanceVersion) m.version++;
        await this.writeMatch(tx, m);
        if (["FINISHED", "CANCELED", "SAVED"].includes(m.status)) {
          const r = await this.room(m.roomId, tx);
          r.status = m.status === "SAVED" ? "CLOSED" : "POST_MATCH";
          await this.writeRoom(tx, r);
        }
        return m;
      });
      this.publish(
        m.status === "FINISHED" || m.status === "CANCELED"
          ? "match:ended"
          : "match:state",
        m,
      );
      return m;
    });
  }
  async move(
    a: Actor,
    id: string,
    moveId: string,
    expectedVersion: number,
    move: Move,
  ) {
    return this.mutate(a, id, async (m, tx) => {
      if (m.receipts[moveId]) {
        assert(m.receipts[moveId] === a.id, "FORBIDDEN", 403);
        return;
      }
      assert(m.status === "ACTIVE", "MATCH_NOT_ACTIVE");
      assert(expectedVersion === m.version, "STALE_VERSION");
      assert(
        (m.position.turn === "red" ? m.red : m.black) === a.id,
        "NOT_YOUR_TURN",
      );
      assert(legal(m.position, move), "ILLEGAL_MOVE");
      const before = { ...structuredClone(m.position), history: [] },
        clocks = { ...m.remaining };
      m.position = play(m.position, move);
      m.log.push({ id: moveId, move, before, clocks });
      m.receipts[moveId] = a.id;
      await tx.move.create({
        data: {
          id: moveId,
          matchId: m.id,
          sequence: (await tx.move.count({ where: { matchId: m.id } })) + 1,
          data: {
            move,
            clocks,
            check: m.position.history.at(-1)!.check,
            actorId: a.id,
            fen: fen(m.position),
            piece: m.position.history.at(-1)!.piece,
            captured: m.position.history.at(-1)!.captured,
          },
        },
      });
      const end = outcome(m.position);
      if (end) this.finish(m, end.winner, end.reason);
    });
  }
  async request(a: Actor, id: string, kind: RequestKind, requestId: string) {
    const state = await this.mutate(a, id, async (m, tx) => {
      assert(!(await this.blocked(m.red, m.black, tx)), "FORBIDDEN", 403);
      if (m.requests.some((r) => r.id === requestId)) return;
      assert(
        kind === "RESUME" ? m.status === "SAVED" : m.status === "ACTIVE",
        "INVALID_STATE",
      );
      if (kind === "SAVE" || kind === "RESUME") {
        assert(!m.guests, "GUEST_CANNOT_SAVE");
        const users = await tx.user.count({
          where: {
            id: { in: [m.red, m.black] },
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        assert(users === 2, "ACCOUNT_UNAVAILABLE");
      }
      if (kind === "UNDO")
        assert(m.undo && m.log.length > 0, "UNDO_UNAVAILABLE");
      const pending = m.requests.find(
        (r) =>
          r.kind === kind && r.status === "PENDING" && r.expiresAt > this.now(),
      );
      if (
        pending &&
        pending.sender !== a.id &&
        (kind === "SAVE" || kind === "RESUME")
      ) {
        assert(pending.version === m.version, "STALE_VERSION");
        if (kind === "RESUME") {
          assert(
            !(await this.busy(m.red, tx)) && !(await this.busy(m.black, tx)),
            "ALREADY_PLAYING",
          );
          await this.prepareResume(tx, m, a.id);
        } else {
          m.status = "SAVED";
          m.video = false;
          m.messages = [];
          m.chatVersion = (m.chatVersion ?? 0) + 1;
        }
        pending.status = "APPROVED";
        return;
      }
      if (pending && pending.sender === a.id && pending.version !== m.version)
        pending.status = "CANCELED";
      else assert(!pending, "REQUEST_PENDING");
      const request = {
        id: requestId,
        kind,
        sender: a.id,
        status: "PENDING" as const,
        version: m.version + 1,
        expiresAt: this.now() + (kind === "RESUME" ? 7 * 86400000 : 30000),
      };
      m.requests.push(request);
      await tx.notification.create({
        data: {
          receiver: a.id === m.red ? m.black : m.red,
          data: { matchId: id, request },
        },
      });
    });
    this.notify(a.id === state.red ? state.black : state.red);
    return state;
  }
  async respond(a: Actor, id: string, requestId: string, accept: boolean) {
    return this.mutate(a, id, async (m, tx) => {
      const r = m.requests.find((r) => r.id === requestId);
      assert(r, "NOT_FOUND", 404);
      assert(r.sender !== a.id, "FORBIDDEN", 403);
      if (r.status !== "PENDING") {
        assert(
          r.status === (accept ? "APPROVED" : "REJECTED"),
          "INVALID_STATE",
        );
        return;
      }
      assert(r.expiresAt > this.now(), "REQUEST_EXPIRED");
      assert(!(await this.blocked(m.red, m.black, tx)), "FORBIDDEN", 403);
      assert(
        r.kind === "RESUME" ? m.status === "SAVED" : m.status === "ACTIVE",
        "INVALID_STATE",
      );
      if (accept && (r.kind === "SAVE" || r.kind === "UNDO"))
        assert(r.version === m.version, "STALE_VERSION");
      r.status = accept ? "APPROVED" : "REJECTED";
      if (!accept) return;
      if (r.kind === "SAVE") {
        assert(!m.guests, "GUEST_CANNOT_SAVE");
        m.status = "SAVED";
        m.video = false;
        m.messages = [];
        m.chatVersion = (m.chatVersion ?? 0) + 1;
      }
      if (r.kind === "DRAW") this.finish(m, null, "AGREED_DRAW");
      if (r.kind === "VIDEO") {
        m.video = true;
        m.videoSessionId = r.id;
      }
      if (r.kind === "UNDO") {
        const last = m.log.pop();
        assert(last, "UNDO_UNAVAILABLE");
        m.position = {
          ...last.before,
          history: m.position.history.slice(0, -1),
        };
        m.remaining = last.clocks;
        m.lastTick = this.now();
        await tx.move.update({
          where: { id: last.id },
          data: { effective: false },
        });
        m.video = false;
      }
      if (r.kind === "RESUME") {
        assert(
          !(await this.busy(m.red, tx)) && !(await this.busy(m.black, tx)),
          "ALREADY_PLAYING",
        );
        const users = await tx.user.count({
          where: {
            id: { in: [m.red, m.black] },
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        assert(users === 2, "ACCOUNT_UNAVAILABLE");
        await this.prepareResume(tx, m, a.id);
      }
    });
  }
  async resumeReady(a: Actor, id: string) {
    return this.mutate(a, id, async (m, tx) => {
      assert(m.status === "RESUMING", "INVALID_STATE");
      assert(!(await this.blocked(m.red, m.black, tx)), "FORBIDDEN", 403);
      assert(
        (await tx.user.count({
          where: {
            id: { in: [m.red, m.black] },
            deletedAt: null,
            status: "ACTIVE",
          },
        })) === 2,
        "ACCOUNT_UNAVAILABLE",
      );
      assert(this.online.has(a.id), "OFFLINE");
      const active = await tx.match.findFirst({
        where: {
          id: { not: id },
          status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] },
          OR: [{ red: a.id }, { black: a.id }],
        },
      });
      assert(!active, "ALREADY_PLAYING");
      if (!m.ready.includes(a.id)) m.ready.push(a.id);
      if (
        m.ready.length === 2 &&
        this.online.has(m.red) &&
        this.online.has(m.black)
      ) {
        m.status = "ACTIVE";
        m.lastTick = this.now();
        m.windows = {};
        const room = await this.room(m.roomId, tx);
        room.status = "IN_MATCH";
        room.seats.forEach((s) => (s.ready = true));
        room.version++;
        await this.writeRoom(tx, room);
      }
    });
  }
  async resign(a: Actor, id: string) {
    return this.mutate(a, id, (m) => {
      assert(
        ["ACTIVE", "PAUSED_RECONNECT"].includes(m.status),
        "MATCH_NOT_ACTIVE",
      );
      this.finish(m, a.id === m.red ? "black" : "red", "RESIGNATION");
    });
  }
  async prepareResume(
    tx: Prisma.TransactionClient,
    m: MatchState,
    owner: string,
  ) {
    const rows = await tx.room.findMany();
    assert(
      !rows.some((row) => {
        const r = row.state as unknown as RoomState;
        return (
          r.status !== "CLOSED" &&
          r.seats.some((s) => s.id === m.red || s.id === m.black)
        );
      }),
      "ALREADY_IN_ROOM",
    );
    let code: string;
    do {
      code = String(randomInt(100000, 1000000));
    } while (rows.some((r) => r.code === code));
    const room: RoomState = {
      id: randomUUID(),
      code,
      owner,
      visibility: "private",
      status: "WAITING",
      minutes: m.minutes,
      ownerSide: owner === m.red ? "red" : "black",
      undo: m.undo,
      version: 1,
      seats: [
        { id: m.red, name: m.names.red, ready: false },
        { id: m.black, name: m.names.black, ready: false },
      ],
      matchId: m.id,
    };
    m.roomId = room.id;
    m.status = "RESUMING";
    m.ready = [];
    await this.writeRoom(tx, room);
  }
  async chat(a: Actor, id: string, messageId: string, text: string) {
    return this.mutate(
      a,
      id,
      async (m, tx) => {
        assert(
          ["ACTIVE", "PAUSED_RECONNECT"].includes(m.status),
          "MATCH_NOT_ACTIVE",
        );
        assert(!(await this.blocked(m.red, m.black, tx)), "FORBIDDEN", 403);
        if (!m.messages.some((x) => x.id === messageId)) {
          m.chatVersion = (m.chatVersion ?? 0) + 1;
          assert(
            m.messages.filter(
              (x) => x.sender === a.id && this.now() - x.at < 10000,
            ).length < 5,
            "RATE_LIMITED",
            429,
          );
          m.messages.push({
            id: messageId,
            sender: a.id,
            name: a.name,
            text,
            at: this.now(),
          });
          m.messages = m.messages.slice(-100);
        }
      },
      false,
    );
  }
  async connection(actor: string, connected: boolean) {
    if (connected) this.online.add(actor);
    else this.online.delete(actor);
    return this.serial(async () => {
      const roomRows = await db.room.findMany();
      for (const row of roomRows) {
        const r = row.state as unknown as RoomState;
        if (
          !["WAITING", "COUNTDOWN"].includes(r.status) ||
          !r.seats.some((s) => s.id === actor)
        )
          continue;
        if (connected) {
          if (actor === r.owner) delete r.ownerDeadline;
        } else if (!this.online.has(actor)) {
          r.status = "WAITING";
          delete r.startAt;
          r.seats.forEach((s) => (s.ready = false));
          if (actor === r.owner) r.ownerDeadline = this.now() + 30000;
          else r.seats = r.seats.filter((s) => s.id !== actor);
        }
        r.version++;
        await this.writeRoom(db, r);
        this.publish("room:state", r);
      }
      const rows = await db.match.findMany({
        where: {
          OR: [{ red: actor }, { black: actor }],
          status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] },
        },
      });
      for (const row of rows) {
        const m = row.state as unknown as MatchState;
        if (m.status === "RESUMING") {
          if (!connected) {
            m.status = "SAVED";
            m.ready = [];
            m.version++;
            await db.$transaction(async (tx) => {
              await this.writeMatch(tx, m);
              const r = await this.room(m.roomId, tx);
              r.status = "CLOSED";
              await this.writeRoom(tx, r);
            });
            this.publish("match:state", m);
          }
          continue;
        }
        this.settle(m);
        if (!["ACTIVE", "PAUSED_RECONNECT"].includes(m.status)) {
          m.version++;
          await db.$transaction(async (tx) => {
            await this.writeMatch(tx, m);
            const r = await this.room(m.roomId, tx);
            r.status = "POST_MATCH";
            await this.writeRoom(tx, r);
          });
          this.publish("match:ended", m);
          continue;
        }
        const old = m.windows[actor];
        if (!connected) {
          if (!old || old.online)
            m.windows[actor] = {
              at: this.now(),
              deadline:
                this.now() +
                Math.min(60000, Math.max(0, 180000 - (old?.used ?? 0))),
              used: old?.used ?? 0,
              online: false,
            };
          m.status = "PAUSED_RECONNECT";
          m.video = false;
          m.requests.forEach((r) => {
            if (r.kind !== "RESUME" && r.status === "PENDING")
              r.status = "CANCELED";
          });
        } else if (old && !old.online) {
          if (this.now() < old.deadline) {
            old.used += this.now() - old.at;
            old.online = true;
          } else {
            const opp = actor === m.red ? m.black : m.red;
            if (
              this.online.has(opp) &&
              (!m.windows[opp] || m.windows[opp].online)
            )
              this.finish(
                m,
                actor === m.red ? "black" : "red",
                "DISCONNECT_LOSS",
              );
          }
        }
        this.adjudicate(m);
        m.version++;
        await db.$transaction(async (tx) => {
          await this.writeMatch(tx, m);
          if (["FINISHED", "CANCELED"].includes(m.status)) {
            const r = await this.room(m.roomId, tx);
            r.status = "POST_MATCH";
            await this.writeRoom(tx, r);
          }
        });
        this.publish("match:state", m);
      }
    });
  }
  adjudicate(m: MatchState) {
    if (m.status !== "PAUSED_RECONNECT") return;
    const r = m.windows[m.red],
      b = m.windows[m.black],
      expired = (w: typeof r) => w && !w.online && this.now() >= w.deadline;
    if (expired(r) && this.online.has(m.black) && (!b || b.online))
      this.finish(m, "black", "DISCONNECT_LOSS");
    else if (expired(b) && this.online.has(m.red) && (!r || r.online))
      this.finish(m, "red", "DISCONNECT_LOSS");
    else if (expired(r) && expired(b))
      this.finish(m, null, "BOTH_DISCONNECTED", true);
    else if (
      this.online.has(m.red) &&
      this.online.has(m.black) &&
      (!r || r.online) &&
      (!b || b.online)
    ) {
      m.status = "ACTIVE";
      m.lastTick = this.now();
    }
  }
  tick(): Promise<void> {
    // Share an outstanding tick so slow cloud queries cannot flood the action queue.
    if (this.pendingTick) return this.pendingTick;
    this.pendingTick = this.serial(async () => {
      if (this.incident) {
        await this.recover();
        this.incident = false;
        this.recovered();
        return;
      }
      const rooms = await db.room.findMany();
      for (const row of rooms) {
        const r = row.state as unknown as RoomState;
        if (
          r.ownerDeadline &&
          r.ownerDeadline <= this.now() &&
          !this.online.has(r.owner) &&
          r.status === "WAITING"
        ) {
          r.status = "CLOSED";
          r.version++;
          await this.writeRoom(db, r);
          this.publish("room:state", r);
          continue;
        }
        if (r.status === "COUNTDOWN" && r.startAt! <= this.now()) {
          if (!r.seats.every((s) => this.online.has(s.id))) {
            r.status = "WAITING";
            r.seats.forEach((s) => (s.ready = false));
            await this.writeRoom(db, r);
            this.publish("room:state", r);
            continue;
          }
          const redIndex =
              r.ownerSide === "random"
                ? randomInt(2)
                : r.ownerSide === "red"
                  ? 0
                  : 1,
            red = r.seats[redIndex],
            black = r.seats[1 - redIndex];
          const userCount = await db.user.count({
            where: { id: { in: [red.id, black.id] } },
          });
          const identities = await db.user.findMany({
            where: { id: { in: [red.id, black.id] } },
            select: {
              id: true,
              publicCode: true,
              status: true,
              deletedAt: true,
            },
          });
          if (identities.some((u) => u.status !== "ACTIVE" || u.deletedAt)) {
            r.status = "CLOSED";
            r.version++;
            await this.writeRoom(db, r);
            this.publish("room:state", r);
            continue;
          }
          const m: MatchState = {
            id: randomUUID(),
            roomId: r.id,
            mode: r.mode ?? "UNKNOWN",
            red: red.id,
            black: black.id,
            names: { red: red.name, black: black.name },
            publicCodes: {
              red:
                identities.find((u) => u.id === red.id)?.publicCode ?? red.id,
              black:
                identities.find((u) => u.id === black.id)?.publicCode ??
                black.id,
            },
            guests: userCount !== 2,
            status: "ACTIVE",
            version: 1,
            position: initial(),
            minutes: r.minutes,
            remaining: {
              red: r.minutes ? r.minutes * 60000 : null,
              black: r.minutes ? r.minutes * 60000 : null,
            },
            lastTick: this.now(),
            undo: r.undo,
            log: [],
            requests: [],
            ready: [],
            windows: {},
            video: false,
            messages: [],
            receipts: {},
          };
          r.status = "IN_MATCH";
          r.matchId = m.id;
          await db.$transaction(async (tx) => {
            assert(
              !(await this.busy(red.id, tx)) &&
                !(await this.busy(black.id, tx)),
              "ALREADY_PLAYING",
            );
            await this.writeMatch(tx, m);
            await this.writeRoom(tx, r);
          });
          this.publish("room:state", r);
          this.publish("match:state", m);
        }
      }
      const matches = await db.match.findMany({
        where: { status: { in: ["ACTIVE", "PAUSED_RECONNECT"] } },
      });
      for (const row of matches) {
        const m = row.state as unknown as MatchState;
        const controls = JSON.stringify([m.status, m.result, m.requests]);
        this.settle(m);
        this.adjudicate(m);
        m.requests.forEach((r) => {
          if (r.status === "PENDING" && r.expiresAt <= this.now())
            r.status = "EXPIRED";
        });
        if (JSON.stringify([m.status, m.result, m.requests]) !== controls)
          m.version++;
        await db.$transaction(async (tx) => {
          await this.writeMatch(tx, m);
          if (["FINISHED", "CANCELED"].includes(m.status)) {
            const r = await this.room(m.roomId, tx);
            r.status = "POST_MATCH";
            await this.writeRoom(tx, r);
          }
        });
        this.publish("match:state", m);
      }
    }, true).finally(() => {
      this.pendingTick = undefined;
    });
    return this.pendingTick;
  }
  async recover() {
    const changed = await db.$transaction(async (tx) => {
      const changedMatches: MatchState[] = [],
        changedRooms: RoomState[] = [];
      const ms = await tx.match.findMany({
        where: { status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] } },
      });
      for (const row of ms) {
        const m = row.state as unknown as MatchState;
        if (m.status === "RESUMING") {
          m.status = "SAVED";
          m.ready = [];
          m.video = false;
          m.requests.forEach((r) => {
            if (
              r.kind === "RESUME" &&
              ["PENDING", "APPROVED"].includes(r.status)
            )
              r.status = "CANCELED";
          });
        } else this.finish(m, null, "SERVER_RECOVERY", true);
        m.version++;
        await this.writeMatch(tx, m);
        changedMatches.push(m);
        await tx.audit.create({
          data: {
            actor: "system",
            action: "SAFE_CANCEL_RESTART",
            entityId: m.id,
          },
        });
      }
      const rooms = await tx.room.findMany();
      for (const row of rooms) {
        const r = row.state as unknown as RoomState;
        if (r.status !== "CLOSED") {
          r.status = "CLOSED";
          r.version++;
          await this.writeRoom(tx, r);
          changedRooms.push(r);
        }
      }
      return { matches: changedMatches, rooms: changedRooms };
    });
    for (const r of changed.rooms) this.publish("room:state", r);
    for (const m of changed.matches)
      this.publish(m.status === "SAVED" ? "match:state" : "match:ended", m);
  }
  async convertGuest(guest: Actor, user: Actor) {
    return this.serial(async () => {
      assert(guest.guest && !user.guest, "FORBIDDEN", 403);
      assert(!(await this.busy(user.id)), "ALREADY_PLAYING");
      const changed = await db.$transaction(async (tx) => {
        const profile = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        const rooms = await tx.room.findMany();
        assert(
          !rooms.some((row) => {
            const r = row.state as unknown as RoomState;
            return (
              r.status !== "CLOSED" && r.seats.some((s) => s.id === user.id)
            );
          }),
          "ALREADY_IN_ROOM",
        );
        const changedRooms: RoomState[] = [];
        const changedMatches: MatchState[] = [];
        for (const row of rooms) {
          const r = row.state as unknown as RoomState;
          if (r.status === "CLOSED" || !r.seats.some((s) => s.id === guest.id))
            continue;
          if (r.owner === guest.id) r.owner = user.id;
          r.seats = r.seats.map((s) =>
            s.id === guest.id
              ? { ...s, id: user.id, name: user.name, ready: false }
              : s,
          );
          if (r.status === "COUNTDOWN") {
            r.status = "WAITING";
            delete r.startAt;
            r.seats.forEach((s) => (s.ready = false));
          }
          r.version++;
          await this.writeRoom(tx, r);
          changedRooms.push(r);
        }
        const matches = await tx.match.findMany({
          where: {
            OR: [{ red: guest.id }, { black: guest.id }],
            status: { in: ["ACTIVE", "PAUSED_RECONNECT"] },
          },
        });
        for (const row of matches) {
          const m = row.state as unknown as MatchState;
          this.settle(m);
          if (m.red === guest.id) {
            m.red = user.id;
            m.names.red = user.name;
            if (m.publicCodes) m.publicCodes.red = profile.publicCode;
          } else {
            m.black = user.id;
            m.names.black = user.name;
            if (m.publicCodes) m.publicCodes.black = profile.publicCode;
          }
          if (m.windows[guest.id]) {
            m.windows[user.id] = m.windows[guest.id];
            delete m.windows[guest.id];
          }
          m.guests =
            (await tx.user.count({
              where: { id: { in: [m.red, m.black] } },
            })) !== 2;
          m.requests.forEach((r) => {
            if (r.status === "PENDING") r.status = "CANCELED";
          });
          m.video = false;
          m.version++;
          await tx.match.update({
            where: { id: m.id },
            data: {
              red: m.red,
              black: m.black,
              status: m.status,
              version: m.version,
              state: m as unknown as Prisma.InputJsonValue,
            },
          });
          changedMatches.push(m);
        }
        await tx.session.update({
          where: { id: guest.sessionId },
          data: { revokedAt: new Date() },
        });
        await tx.audit.create({
          data: {
            actor: user.id,
            action: "GUEST_CONVERSION",
            entityId: guest.id,
          },
        });
        return { rooms: changedRooms, matches: changedMatches };
      });
      for (const r of changed.rooms) this.publish("room:state", r);
      for (const m of changed.matches) this.publish("match:state", m);
      return changed;
    });
  }
  async anonymize(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.match.findMany({
      where: { OR: [{ red: id }, { black: id }] },
    });
    for (const row of rows) {
      const m = row.state as unknown as MatchState;
      m.names[m.red === id ? "red" : "black"] = "Tài khoản đã xóa";
      m.messages = m.messages.filter((x) => x.sender !== id);
      m.version++;
      await this.writeMatch(tx, m);
    }
    const rooms = await tx.room.findMany();
    for (const row of rooms) {
      const r = row.state as unknown as RoomState;
      if (r.seats.some((s) => s.id === id)) {
        r.seats = r.seats.map((s) =>
          s.id === id ? { ...s, name: "Tài khoản đã xóa" } : s,
        );
        r.version++;
        await this.writeRoom(tx, r);
      }
    }
  }
}
