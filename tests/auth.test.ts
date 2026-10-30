import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { registerAndLogin } from "./helpers/auth";
import { randomUUID } from "node:crypto";
import { db } from "../server/src/db";
import { makeApp } from "../server/src/app";
import { hash } from "../server/src/auth";
import jwt from "jsonwebtoken";
import { secret } from "../server/src/auth";
const { app, io, http } = makeApp();
// Fixture creation is a separate loopback client; behavioral scenarios keep the real auth budget.
app.set("trust proxy", "loopback");
const prefix = "auth_" + randomUUID().slice(0, 8);
let a: any, b: any;
const users: string[] = [];
beforeAll(async () => {
  a = (
    await registerAndLogin(
      app,
      {
        username: prefix + "a",
        email: prefix + "a@tests.invalid",
        password: "Chess12345",
      },
      "127.0.2.1",
    )
  ).body;
  b = (
    await registerAndLogin(
      app,
      {
        username: prefix + "b",
        email: prefix + "b@tests.invalid",
        password: "Chess12345",
      },
      "127.0.2.1",
    )
  ).body;
  users.push(a.actor.id, b.actor.id);
});
afterAll(async () => {
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.resetToken.deleteMany({ where: { userId: { in: users } } });
  await db.friend.deleteMany({
    where: { OR: [{ a: { in: users } }, { b: { in: users } }] },
  });
  await db.audit.deleteMany({ where: { actor: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  io.close();
  http.close();
  await db.$disconnect();
});
const authed = (token: string) =>
  request(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer " + token);
describe("real REST and PostgreSQL authentication", () => {
  it("TC-001 register without OTP; TC-002/003 canonical duplicates; malformed password refused", async () => {
    expect(a.actor.guest).toBe(false);
    expect(await db.user.count({ where: { id: a.actor.id } })).toBe(1);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({
            username: (prefix + "a").toUpperCase(),
            email: prefix + "other@tests.invalid",
            password: "Chess12345",
          })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({
            username: prefix + "other",
            email: prefix + "a@tests.invalid",
            password: "Chess12345",
          })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app).post("/api/auth/register").send({
          username: "short",
          email: "x@tests.invalid",
          password: "12345678",
        })
      ).status,
    ).toBe(400);
  });
  it("TC-004 username/email same account; TC-005 second login revokes A; wrong password refused", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ identifier: prefix + "a", password: "wrong" })
      ).status,
    ).toBe(401);
    const previous = a.token;
    a = (
      await request(app)
        .post("/api/auth/login")
        .send({ identifier: prefix + "a", password: "Chess12345" })
    ).body;
    expect(a.actor.id).toBe(users[0]);
    expect((await authed(previous)).status).toBe(401);
    a = (
      await request(app)
        .post("/api/auth/login")
        .send({
          identifier: prefix + "a@tests.invalid",
          password: "Chess12345",
        })
    ).body;
    expect(a.actor.id).toBe(users[0]);
    expect(
      await db.session.count({
        where: { userId: a.actor.id, revokedAt: null },
      }),
    ).toBe(1);
  });
  it("TC-007 rotating refresh; prior token cookie rejected; logout revokes", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ identifier: prefix + "a", password: "Chess12345" });
    const old = login.headers["set-cookie"][0].split(";")[0];
    const expired = jwt.sign({ sid: login.body.actor.sessionId }, secret(), {
      expiresIn: -1,
    });
    expect((await authed(expired)).status).toBe(401);
    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.actor.id).toBe(users[0]);
    expect(
      (await request(app).post("/api/auth/refresh").set("Cookie", old)).status,
    ).toBe(401);
    await agent
      .post("/api/auth/logout")
      .set("Authorization", "Bearer " + refreshed.body.token);
    expect((await authed(refreshed.body.token)).status).toBe(401);
    a = (
      await request(app)
        .post("/api/auth/login")
        .send({ identifier: prefix + "a", password: "Chess12345" })
    ).body;
  });
  it("TC-008 reset one-use token", async () => {
    const token = randomUUID();
    await db.resetToken.create({
      data: {
        hash: hash(token),
        userId: b.actor.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token, password: "NewChess123" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token, password: "OtherChess123" })
      ).status,
    ).toBe(400);
    b = (
      await request(app)
        .post("/api/auth/login")
        .send({ identifier: prefix + "b", password: "NewChess123" })
    ).body;
  });
  it("TC-012 name cooldown and public email privacy", async () => {
    expect(
      (
        await request(app)
          .patch("/api/users/me")
          .set("Authorization", "Bearer " + a.token)
          .send({ displayName: "Cùng tên" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch("/api/users/me")
          .set("Authorization", "Bearer " + a.token)
          .send({ displayName: "Tên mới" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/users/me")
          .set("Authorization", "Bearer " + b.token)
          .send({ displayName: "Cùng tên" })
      ).status,
    ).toBe(200);
    const found = await request(app)
      .get("/api/users/search")
      .query({ q: prefix + "b@tests.invalid" })
      .set("Authorization", "Bearer " + a.token);
    expect(found.body[0].email).toBeUndefined();
    expect(found.body[0].displayName).toBe("Cùng tên");
  });
  it("TC-013 crossed friend invitations; TC-014 rejection permits retry; TC-015 block forbids interactions", async () => {
    const action = (token: string, target: string, action: string) =>
      request(app)
        .post("/api/friends/action")
        .set("Authorization", "Bearer " + token)
        .send({ target, action });
    await action(a.token, b.actor.id, "request");
    expect((await action(b.token, a.actor.id, "request")).body.status).toBe(
      "ACCEPTED",
    );
    await action(a.token, b.actor.id, "remove");
    await action(a.token, b.actor.id, "request");
    await action(b.token, a.actor.id, "reject");
    expect((await action(a.token, b.actor.id, "request")).body.status).toBe(
      "PENDING",
    );
    await action(b.token, a.actor.id, "block");
    expect((await action(a.token, b.actor.id, "request")).status).toBe(403);
    await action(b.token, a.actor.id, "unblock");
  });
  it("Guest cannot friends or profile; no fingerprint required", async () => {
    const g = await request(app).post("/api/auth/guest");
    expect(g.status).toBe(200);
    expect(g.body.actor.guest).toBe(true);
    expect(
      (
        await request(app)
          .get("/api/friends")
          .set("Authorization", "Bearer " + g.body.token)
      ).status,
    ).toBe(403);
    await db.session.deleteMany({ where: { id: g.body.actor.sessionId } });
  });
  it("TC-009 SMTP blocked has explicit error, both known/unknown same when unconfigured", async () => {
    const original = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    for (const email of [prefix + "a@tests.invalid", "missing@tests.invalid"]) {
      const r = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email });
      expect(r.status).toBe(503);
      expect(r.body.error).toBe("SMTP_NOT_CONFIGURED");
    }
    process.env.SMTP_HOST = original;
  });
  it("Admin denied to regular user; TC-011 soft delete revokes and preserves other account", async () => {
    expect(
      (
        await request(app)
          .get("/api/admin/users")
          .set("Authorization", "Bearer " + b.token)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete("/api/users/me")
          .set("Authorization", "Bearer " + b.token)
      ).status,
    ).toBe(200);
    expect((await authed(b.token)).status).toBe(401);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: b.actor.id } }))
        .deletedAt,
    ).not.toBeNull();
    expect((await authed(a.token)).status).toBe(200);
  });
});
