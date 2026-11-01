import { afterAll, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/src/app";
import { db } from "../server/src/database/db";
const runtime = makeApp();
const usernames: string[] = [];
const guestIds: string[] = [];
afterAll(async () => {
  const users = await db.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  await db.session.deleteMany({
    where: {
      OR: [
        { userId: { in: users.map((u) => u.id) } },
        { guestId: { in: guestIds } },
      ],
    },
  });
  await db.user.deleteMany({ where: { username: { in: usernames } } });
  runtime.io.close();
  runtime.http.close();
  await db.$disconnect();
});
it("registration creates no authentication until explicit login", async () => {
  const username = "reg_" + randomUUID().slice(0, 8);
  usernames.push(username);
  const credentials = {
    username,
    email: username + "@tests.invalid",
    password: "Chess12345",
  };
  const agent = request.agent(runtime.app);
  const registered = await agent.post("/api/auth/register").send(credentials);
  expect(registered.status).toBe(200);
  expect(registered.body).toEqual({ ok: true, message: expect.any(String) });
  expect(registered.headers["set-cookie"]).toBeUndefined();
  const user = await db.user.findUniqueOrThrow({ where: { username } });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  expect((await agent.post("/api/auth/refresh")).status).toBe(401);
  expect((await agent.get("/api/auth/me")).status).toBe(401);
  const duplicate = await agent.post("/api/auth/register").send(credentials);
  expect(duplicate.status).toBe(409);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  const login = await agent
    .post("/api/auth/login")
    .send({ identifier: username, password: credentials.password });
  expect(login.status).toBe(200);
  expect(login.body.actor.id).toBe(user.id);
  expect(
    (
      await agent
        .get("/api/auth/me")
        .set("Authorization", "Bearer " + login.body.token)
    ).status,
  ).toBe(200);
});
it("registration preserves an existing guest session even when mergeGuest is supplied", async () => {
  const agent = request.agent(runtime.app),
    guest = await agent.post("/api/auth/guest");
  guestIds.push(guest.body.actor.id);
  const username = "reg_" + randomUUID().slice(0, 8);
  usernames.push(username);
  const result = await agent
    .post("/api/auth/register")
    .send({
      username,
      email: username + "@tests.invalid",
      password: "Chess12345",
      mergeGuest: true,
    });
  expect(result.status).toBe(200);
  expect(result.headers["set-cookie"]).toBeUndefined();
  const refreshed = await agent.post("/api/auth/refresh");
  expect(refreshed.body.actor.id).toBe(guest.body.actor.id);
  expect(refreshed.body.actor.guest).toBe(true);
  const u = await db.user.findUniqueOrThrow({ where: { username } });
  expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
});
