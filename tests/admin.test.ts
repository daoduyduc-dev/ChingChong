import { it, expect, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { makeApp } from "../server/app";
import { db } from "../server/db";
const { app, io, http } = makeApp();
const ids: string[] = [];
afterAll(async () => {
  await db.report.deleteMany({ where: { sender: { in: ids } } });
  await db.notification.deleteMany({ where: { receiver: { in: ids } } });
  await db.audit.deleteMany({ where: { actor: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  io.close();
  http.close();
  await db.$disconnect();
});
it("Admin handles accounts/reports with audit, never accepts arbitrary match result mutation", async () => {
  const users = [];
  for (let i = 0; i < 2; i++) {
    const username = "adminqa_" + randomUUID().slice(0, 8);
    const r = await request(app)
      .post("/api/auth/register")
      .send({
        username,
        email: username + "@tests.invalid",
        password: "Chess12345",
      });
    users.push(r.body);
    ids.push(r.body.actor.id);
  }
  const [admin, user] = users;
  await db.user.update({
    where: { id: admin.actor.id },
    data: { role: "ADMIN" },
  });
  const report = await request(app)
    .post("/api/reports")
    .set("Authorization", "Bearer " + user.token)
    .send({ target: admin.actor.id, text: "Nội dung báo cáo kiểm thử" });
  expect(report.status).toBe(200);
  const listed = await request(app)
    .get("/api/admin/users")
    .set("Authorization", "Bearer " + admin.token);
  expect(listed.status).toBe(200);
  expect(listed.body.some((u: any) => u.id === user.actor.id)).toBe(true);
  expect(listed.body[0].passwordHash).toBeUndefined();
  expect(
    (
      await request(app)
        .patch("/api/admin/reports/" + report.body.id)
        .set("Authorization", "Bearer " + admin.token)
        .send({ status: "RESOLVED" })
    ).body.status,
  ).toBe("RESOLVED");
  expect(
    (
      await request(app)
        .patch("/api/admin/users/" + user.actor.id + "/status")
        .set("Authorization", "Bearer " + admin.token)
        .send({ status: "BANNED" })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer " + user.token)
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .patch("/api/admin/users/" + user.actor.id + "/status")
        .set("Authorization", "Bearer " + admin.token)
        .send({ status: "ACTIVE" })
    ).status,
  ).toBe(200);
  expect(await db.audit.count({ where: { actor: admin.actor.id } })).toBe(3);
  expect(
    (
      await request(app)
        .patch("/api/admin/matches/" + randomUUID() + "/result")
        .set("Authorization", "Bearer " + admin.token)
        .send({ winner: "red" })
    ).status,
  ).toBe(404);
});
