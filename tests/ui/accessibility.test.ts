import { afterAll, beforeAll, it } from "vitest";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { preview, type PreviewServer } from "vite";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { makeApp } from "../../server/src/app";
import { db } from "../../server/src/database/db";
import { initial } from "../../shared/chess";
import { randomUUID } from "node:crypto";
import type { MatchState } from "../../shared/domain";

const runtime = makeApp();
let browser: Browser, frontend: PreviewServer, origin: string;
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
  if (frontend)
    await new Promise<void>((resolve) =>
      frontend.httpServer.close(() => resolve()),
    );
  await db.$disconnect();
});
async function accessibilityIssues(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  return violations.map((v) => ({
    id: v.id,
    description: v.description,
    nodes: v.nodes.map((node) => ({
      target: node.target,
      failure: node.failureSummary,
    })),
  }));
}
it("PWA manifest and touch icons serve decodable install assets", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#174a3c",
    );
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const response = await context.request.get(
      new URL(manifestHref!, origin).href,
    );
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    );
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (item: { sizes: string; purpose: string }) =>
          item.sizes === `${size}x${size}` && item.purpose === "any",
      );
      const dimensions = await page.evaluate(async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, icon.src);
      expect(dimensions).toEqual([size, size]);
    }
    const apple = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute("href");
    expect(
      (await context.request.get(new URL(apple!, origin).href)).status(),
    ).toBe(200);
  } finally {
    await context.close();
  }
});
it.each([360, 768, 1280])(
  "lobby, authentication and AI remain accessible without horizontal overflow at %ipx",
  async (width) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const issues = [];
    try {
      await page.goto(origin);
      await expect(
        page.getByRole("button", { name: "Đăng nhập", exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      issues.push({
        screen: "lobby",
        violations: await accessibilityIssues(page),
      });
      await page.screenshot({
        path: `docs/implementation/accessibility-lobby-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(page.getByLabel("Email hoặc username")).toBeFocused();
      issues.push({
        screen: "authentication",
        violations: await accessibilityIssues(page),
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Chơi với máy", exact: true })
        .click();
      await expect(page.getByTestId("board")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      issues.push({
        screen: "AI",
        violations: await accessibilityIssues(page),
      });
      await page.screenshot({
        path: `docs/implementation/accessibility-board-${width}.png`,
        fullPage: true,
      });
      if (width === 360) {
        await page
          .getByRole("button", { name: "Phóng to bàn cờ", exact: true })
          .click();
        const target = await page.getByTestId("square-0").boundingBox();
        expect(target!.width).toBeGreaterThanOrEqual(44);
        expect(target!.height).toBeGreaterThanOrEqual(44);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(issues.filter((issue) => issue.violations.length)).toEqual([]);
    } finally {
      await context.close();
    }
  },
);
it("board keyboard focus uses one tab stop, supports selection and arrows, and black-side avatars match their seats", async () => {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
  });
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Chơi với máy", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
      .click();
    const board = page.getByTestId("board");
    await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
    const pawn = page.getByTestId("square-54");
    await pawn.focus();
    await page.keyboard.press("Enter");
    await expect(pawn).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("square-45")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(board.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
    await context.close();
    const blackContext = await browser.newContext();
    const blackPage = await blackContext.newPage();
    try {
      await blackPage.goto(origin);
      await blackPage
        .getByRole("button", { name: "Chơi với máy", exact: true })
        .click();
      await blackPage
        .getByRole("combobox", { name: "Chọn quân", exact: true })
        .selectOption("black");
      await expect(
        blackPage.locator(".player-strip .avatar").first(),
      ).toHaveText("帥");
      await expect(
        blackPage.locator(".player-strip .avatar").last(),
      ).toHaveText("將");
    } finally {
      await blackContext.close();
    }
  } finally {
    await context.close();
  }
});
it("authentication links inline validation errors to fields and can reveal a password", async () => {
  const context = await browser.newContext(),
    page = await context.newPage();
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    const identifier = page.getByLabel(/^Email hoặc username/);
    await expect(identifier).toHaveAttribute("aria-invalid", "true");
    await expect(identifier).toBeFocused();
    const errorId = await identifier.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator("#" + errorId)).toContainText("Vui lòng nhập");
    const password = page.locator('input[name="password"]');
    await password.fill("LocalChess123");
    await page
      .getByRole("button", { name: "Hiện mật khẩu", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("LocalChess123");
    await page
      .getByRole("button", { name: "Ẩn mật khẩu", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "password");
    expect((await accessibilityIssues(page)).length).toBe(0);
  } finally {
    await context.close();
  }
});
it("notification panel announces its state and closes with Escape or an outside click", async () => {
  const context = await browser.newContext(),
    page = await context.newPage();
  const guest = await (
    await context.request.post(origin + "/api/auth/guest")
  ).json();
  try {
    await page.goto(origin);
    const bell = page.getByRole("button", { name: "Thông báo", exact: true });
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#notification-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bell).toHaveAttribute("aria-expanded", "false");
    await expect(bell).toBeFocused();
    await bell.click();
    await page.locator("h1").click();
    await expect(page.locator("#notification-panel")).toHaveCount(0);
    await expect(bell).toHaveAttribute("aria-expanded", "false");
  } finally {
    await context.close();
    await runtime.game.serial(async () => {});
    await db.session.deleteMany({ where: { id: guest.actor.sessionId } });
  }
});
it("match clocks warn below thirty and ten seconds without live announcements every second", async () => {
  const context = await browser.newContext(),
    page = await context.newPage();
  const guest = await (
    await context.request.post(origin + "/api/auth/guest")
  ).json();
  const state: MatchState = {
    id: randomUUID(),
    roomId: randomUUID(),
    red: guest.actor.id,
    black: randomUUID(),
    names: { red: "Bạn", black: "Đối thủ" },
    guests: true,
    status: "ACTIVE",
    version: 1,
    position: initial(),
    minutes: 5,
    remaining: { red: 25000, black: 9000 },
    lastTick: 0,
    undo: true,
    log: [],
    requests: [],
    ready: [],
    windows: {},
    video: false,
    messages: [],
    receipts: {},
  };
  try {
    // A current-match response snapshot reproduces clock warnings without real-time waiting.
    await page.route("**/api/matches/current", (route) =>
      route.fulfill({ json: state }),
    );
    await page.goto(origin);
    const red = page.getByRole("timer", { name: /^Đồng hồ quân Đỏ:/ });
    const black = page.getByRole("timer", { name: /^Đồng hồ quân Đen:/ });
    await expect(red).toContainText("Còn ít thời gian");
    await expect(red).toHaveClass(/low-time/);
    await expect(black).toContainText("Sắp hết giờ");
    await expect(black).toHaveClass(/critical-time/);
    await expect(red).toHaveAttribute("aria-live", "off");
    await expect(black).toHaveAttribute("aria-live", "off");
    await expect(red).toHaveAccessibleName(
      /Còn 0 phút (2[0-5]) giây, đang tới lượt/,
    );
  } finally {
    await context.close();
    await runtime.game.serial(async () => {});
    await db.session.deleteMany({ where: { id: guest.actor.sessionId } });
  }
});
