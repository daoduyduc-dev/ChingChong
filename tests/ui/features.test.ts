import { afterAll, beforeAll, it } from "vitest";
import { chromium, expect, type Browser } from "@playwright/test";
import { preview, type PreviewServer } from "vite";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { makeApp } from "../../server/src/app";
import { db } from "../../server/src/database/db";
import { initial } from "../../shared/chess";
import type { MatchState } from "../../shared/domain";

const runtime = makeApp();
let browser: Browser, frontend: PreviewServer, origin: string;
const users: string[] = [],
  matches: string[] = [];
beforeAll(async () => {
  await new Promise<void>((resolve) =>
    runtime.http.listen(0, "127.0.0.1", resolve),
  );
  const target =
    "http://127.0.0.1:" + (runtime.http.address() as AddressInfo).port;
  frontend = await preview({
    root: fileURLToPath(new URL("../../client", import.meta.url)),
    configFile: fileURLToPath(
      new URL("../../client/vite.config.ts", import.meta.url),
    ),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": target, "/socket.io": { target, ws: true } },
    },
  });
  origin =
    "http://127.0.0.1:" + (frontend.httpServer.address() as AddressInfo).port;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => runtime.io.close(() => resolve()));
  await runtime.game.serial(async () => {});
  if (frontend)
    await new Promise<void>((resolve) =>
      frontend.httpServer.close(() => resolve()),
    );
  await db.move.deleteMany({ where: { matchId: { in: matches } } });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.friend.deleteMany({
    where: { OR: [{ a: { in: users } }, { b: { in: users } }] },
  });
  await db.audit.deleteMany({
    where: { OR: [{ actor: { in: users } }, { entityId: { in: matches } }] },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
async function user() {
  const context = await browser.newContext();
  const name = "feature" + randomUUID().slice(0, 8);
  const response = await context.request.post(origin + "/api/auth/register", {
    data: {
      username: name,
      email: name + "@ui.invalid",
      password: "Chess12345",
    },
  });
  expect(response.status()).toBe(200);
  const registered = await response.json();
  expect(registered.token).toBeUndefined();
  expect(registered.actor).toBeUndefined();
  const login = await context.request.post(origin + "/api/auth/login", {
    data: { identifier: name, password: "Chess12345" },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  users.push(session.actor.id);
  const page = await context.newPage();
  return { context, page, name, id: session.actor.id as string };
}
async function seed(
  red: { id: string; name: string },
  black: { id: string; name: string },
  count = 25,
) {
  const rows = Array.from({ length: count }, (_, i) => {
    const id = randomUUID();
    matches.push(id);
    const mode = i % 2 ? "PRIVATE" : "PUBLIC";
    const state: MatchState = {
      id,
      roomId: randomUUID(),
      red: red.id,
      black: black.id,
      names: { red: red.name, black: black.name },
      guests: false,
      status: "FINISHED",
      version: 1,
      position: initial(),
      minutes: 10,
      remaining: { red: 600000, black: 600000 },
      lastTick: 0,
      undo: true,
      log: [],
      requests: [],
      ready: [],
      windows: {},
      video: false,
      messages: [
        {
          id: randomUUID(),
          sender: red.id,
          name: red.name,
          text: "PRIVATE_CHAT_SENTINEL",
          at: 0,
        },
      ],
      receipts: {},
      result: { winner: "red", reason: "RESIGNATION" },
    };
    return {
      id,
      red: red.id,
      black: black.id,
      mode,
      status: "FINISHED",
      version: 1,
      createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      state: JSON.parse(JSON.stringify({ ...state, mode })),
    };
  });
  await db.match.createMany({ data: rows });
  return rows;
}

it("history loads older records without duplicates and filters the complete history by mode", async () => {
  const a = await user(),
    b = await user();
  await seed(a, b);
  try {
    await a.page.goto(origin);
    await a.page.getByRole("button", { name: /Lịch sử & kỳ phổ/ }).click();
    const cards = a.page.locator(".history-record");
    await expect(cards).toHaveCount(20);
    await a.page.getByRole("button", { name: "Tải thêm", exact: true }).click();
    await expect(cards).toHaveCount(25);
    expect(
      new Set(
        await cards.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-match-id")),
        ),
      ).size,
    ).toBe(25);
    await a.page.getByLabel("Lọc theo chế độ chơi").selectOption("PRIVATE");
    await a.page
      .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
      .click();
    await expect(cards).toHaveCount(12);
    await expect(cards.first()).toContainText("Phòng riêng");
    await a.page.getByLabel("Lọc theo chế độ chơi").selectOption("RANDOM");
    await a.page
      .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
      .click();
    await expect(cards).toHaveCount(0);
    await expect(
      a.page.getByText("Chưa có dữ liệu phù hợp.", { exact: true }),
    ).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

it("a public profile opens from friend search and private history exposes only the viewer's shared games", async () => {
  const viewer = await user(),
    target = await user(),
    third = await user();
  await seed(target, viewer, 1);
  await seed(target, third, 1);
  await db.user.update({
    where: { id: target.id },
    data: { hideHistory: true },
  });
  try {
    await viewer.page.goto(origin);
    await viewer.page.getByRole("button", { name: /Bạn bè/ }).click();
    await viewer.page
      .getByLabel("Tìm bạn theo username, mã công khai hoặc email")
      .fill(target.name);
    await viewer.page
      .getByRole("button", { name: "Tìm bạn", exact: true })
      .click();
    await viewer.page
      .getByRole("button", { name: "Xem hồ sơ", exact: true })
      .click();
    await expect(
      viewer.page.getByRole("heading", { name: target.name, exact: true }),
    ).toBeVisible();
    await expect(viewer.page.locator(".history-record")).toHaveCount(1);
    await expect(viewer.page.locator(".history-record")).toContainText(
      viewer.name,
    );
    await expect(viewer.page.locator("body")).not.toContainText(
      target.name + "@ui.invalid",
    );
    await viewer.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await viewer.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await viewer.page.screenshot({
      path: "docs/implementation/public-profile-mobile.png",
      fullPage: true,
    });
  } finally {
    await viewer.context.close();
    await target.context.close();
    await third.context.close();
  }
});

it("admin can inspect technical match state without exposing stored chat or result mutation controls", async () => {
  const admin = await user(),
    opponent = await user();
  const rows = await seed(admin, opponent, 1);
  await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  try {
    await admin.page.goto(origin);
    await admin.page.getByRole("button", { name: /Quản trị/ }).click();
    await admin.page
      .getByRole("button", { name: "Trận đấu", exact: true })
      .click();
    await admin.page.getByLabel("Tìm kiếm quản trị").fill(rows[0].id);
    await admin.page
      .getByRole("button", { name: "Tìm kiếm", exact: true })
      .click();
    await expect(admin.page.locator(".admin-data-row")).toHaveCount(1);
    await admin.page
      .locator(".admin-data-row")
      .filter({ hasText: rows[0].id })
      .getByRole("button", { name: "Xem kỹ thuật", exact: true })
      .click();
    await expect(
      admin.page.getByText(rows[0].id, { exact: true }).first(),
    ).toBeVisible();
    await expect(admin.page.getByLabel("Chi tiết kỹ thuật trận")).toContainText(
      "Phiên bản",
    );
    await expect(admin.page.locator("body")).not.toContainText(
      "PRIVATE_CHAT_SENTINEL",
    );
    await expect(
      admin.page.getByRole("button", { name: /Sửa kết quả|Thay kết quả/ }),
    ).toHaveCount(0);
    await admin.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await admin.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await admin.page.screenshot({
      path: "docs/implementation/admin-match-mobile.png",
      fullPage: true,
    });
  } finally {
    await admin.context.close();
    await opponent.context.close();
  }
});
