import { afterAll, it, expect } from "vitest";
import request from "supertest";
import { registerAndLogin } from "./helpers/auth";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/src/app";
import { db } from "../server/src/database/db";
import { initial } from "../shared/chess";
import type { MatchState } from "../shared/domain";
const { app, io, http } = makeApp();
const ids: string[] = [],
  matches: string[] = [];
afterAll(async () => {
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.audit.deleteMany({ where: { actor: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  io.close();
  http.close();
  await db.$disconnect();
});
it("TC-069 canceled is distinct; TC-071 hidden history visible only to original opponent; soft-delete anonymizes shared record", async () => {
  const accounts = [];
  for (let i = 0; i < 3; i++) {
    const username = "privacy_" + randomUUID().slice(0, 8);
    const r = await registerAndLogin(app, {
      username,
      email: username + "@tests.invalid",
      password: "Chess12345",
    });
    accounts.push(r.body);
    ids.push(r.body.actor.id);
  }
  const [a, b, c] = accounts;
  const id = randomUUID();
  matches.push(id);
  const state: MatchState = {
    id,
    roomId: randomUUID(),
    red: a.actor.id,
    black: b.actor.id,
    names: { red: "A", black: "B" },
    guests: false,
    status: "CANCELED",
    version: 1,
    position: initial(),
    minutes: 0,
    remaining: { red: null, black: null },
    lastTick: 0,
    undo: true,
    log: [],
    requests: [],
    ready: [],
    windows: {},
    video: false,
    messages: [],
    receipts: {},
    result: { winner: null, reason: "BOTH_DISCONNECTED" },
  };
  await db.match.create({
    data: {
      id,
      red: state.red,
      black: state.black,
      status: "CANCELED",
      version: 1,
      state: JSON.parse(JSON.stringify(state)),
    },
  });
  await request(app)
    .patch("/api/users/me")
    .set("Authorization", "Bearer " + a.token)
    .send({ hideHistory: true });
  expect(
    (
      await request(app)
        .get("/api/users/" + a.actor.id + "/history")
        .set("Authorization", "Bearer " + c.token)
    ).body,
  ).toHaveLength(0);
  const shared = await request(app)
    .get("/api/users/" + a.actor.id + "/history")
    .set("Authorization", "Bearer " + b.token);
  expect(shared.body).toHaveLength(1);
  expect(shared.body[0].status).toBe("CANCELED");
  expect(shared.body[0].result.reason).toBe("BOTH_DISCONNECTED");
  expect(
    (
      await request(app)
        .get("/api/matches/" + id + "/replay")
        .set("Authorization", "Bearer " + c.token)
    ).status,
  ).toBe(403);
  await request(app)
    .delete("/api/users/me")
    .set("Authorization", "Bearer " + a.token);
  const preserved = await request(app)
    .get("/api/matches/" + id + "/replay")
    .set("Authorization", "Bearer " + b.token);
  expect(preserved.status).toBe(200);
  expect(preserved.body.names.red).toBe("Tài khoản đã xóa");
  expect(preserved.body.result.reason).toBe("BOTH_DISCONNECTED");
});
