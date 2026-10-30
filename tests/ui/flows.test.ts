import { afterAll, beforeAll, it } from "vitest";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { preview, type PreviewServer } from "vite";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { makeApp } from "../../server/src/app";
import { db } from "../../server/src/db";

let browser: Browser, frontend: PreviewServer, origin: string;
const backend = makeApp();
// Separate browser users behind our temporary loopback proxy must have separate IP buckets.
backend.app.set("trust proxy", "loopback");
let clientNumber = 0;
function newContext() {
  return browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": `127.0.1.${++clientNumber}` },
  });
}
const usernames: string[] = [];
let timer: ReturnType<typeof setInterval>;
beforeAll(async () => {
  await new Promise<void>((resolve) =>
    backend.http.listen(0, "127.0.0.1", resolve),
  );
  const target =
    "http://127.0.0.1:" + (backend.http.address() as AddressInfo).port;
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
  timer = setInterval(() => {
    void backend.game.tick().catch(() => {});
  }, 100);
});
afterAll(async () => {
  clearInterval(timer);
  await browser?.close();
  await new Promise<void>((resolve) => backend.io.close(() => resolve()));
  await backend.game.serial(async () => {});
  await new Promise<void>((resolve) =>
    frontend.httpServer.close(() => resolve()),
  );
  const users = await db.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  const matches = await db.match.findMany({
    where: { OR: [{ red: { in: ids } }, { black: { in: ids } }] },
    select: { id: true },
  });
  const matchIds = matches.map((match) => match.id);
  const rooms = await db.room.findMany();
  const roomIds = rooms
    .filter((row) => {
      const state = row.state as unknown as { seats: { id: string }[] };
      return state.seats.some((seat) => ids.includes(seat.id));
    })
    .map((row) => row.id);
  await db.move.deleteMany({ where: { matchId: { in: matchIds } } });
  await db.match.deleteMany({ where: { id: { in: matchIds } } });
  await db.room.deleteMany({ where: { id: { in: roomIds } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { receiver: { in: ids } } });
  await db.report.deleteMany({
    where: { OR: [{ sender: { in: ids } }, { target: { in: ids } }] },
  });
  await db.audit.deleteMany({
    where: { OR: [{ actor: { in: ids } }, { entityId: { in: matchIds } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
async function user() {
  const context = await newContext();
  const page = await context.newPage();
  const name = "flow" + randomUUID().slice(0, 8);
  usernames.push(name);
  await page.goto(origin);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(name + "@ui.invalid");
  await page.getByLabel(/^Mật khẩu/).fill("Chess12345");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Email hoặc username")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Email hoặc username").fill(name);
  await page.getByLabel(/^Mật khẩu/).fill("Chess12345");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".connection")).toContainText("Trực tuyến");
  return { context, page, name };
}
it("registration survives reload without a session and protected services require manual login", async () => {
  const context = await newContext(),
    page = await context.newPage();
  const name = "flow" + randomUUID().slice(0, 8);
  usernames.push(name);
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
      .click();
    await page.getByLabel("Username", { exact: true }).fill(name);
    await page.getByLabel("Email", { exact: true }).fill(name + "@ui.invalid");
    await page.getByLabel(/^Mật khẩu/).fill("Chess12345");
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await expect(page.getByLabel("Email hoặc username")).toHaveValue(name);
    await expect(page.getByLabel(/^Mật khẩu/)).toHaveValue("");
    expect(
      (await context.request.post(origin + "/api/auth/refresh")).status(),
    ).toBe(401);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Hồ sơ/ }).click();
    await expect(
      page.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toHaveCount(0);
    await page.getByLabel("Email hoặc username").fill(name);
    await page.getByLabel(/^Mật khẩu/).fill("Chess12345");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Hồ sơ/ }).click();
    await expect(
      page.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
it("protected navigation waits for session restoration instead of opening a login dialog", async () => {
  const { context, page } = await user();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/refresh", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Hồ sơ/ })).toBeDisabled();
    release();
    await page.getByRole("button", { name: /Hồ sơ/ }).click();
    await expect(
      page.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    release();
    await context.close();
  }
});
it("a reset-password link remains open when an existing session is restored", async () => {
  const { context, page } = await user();
  try {
    await page.goto(origin + "/?reset=invalid-regression-token");
    await expect(page.locator(".connection")).toContainText("Trực tuyến");
    await expect(
      page.getByRole("heading", { name: "Đặt lại mật khẩu", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
it("mobile navigation keeps friends, profile and admin accessible without overflowing the page", async () => {
  const { context, page, name } = await user();
  try {
    await db.user.update({
      where: { username: name },
      data: { role: "ADMIN" },
    });
    await page.reload();
    await expect(page.getByRole("button", { name: /Quản trị/ })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const label of [/Bạn bè/, /Hồ sơ/, /Quản trị/]) {
      await page
        .getByRole("button", { name: "Thêm mục điều hướng", exact: true })
        .click();
      const button = page.getByRole("button", { name: label });
      await expect(button).toBeVisible();
      await button.scrollIntoViewIfNeeded();
      await button.click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/implementation/flow-audit-mobile.png",
      fullPage: true,
    });
  } finally {
    await db.user.update({ where: { username: name }, data: { role: "USER" } });
    await context.close();
  }
});
async function match(a: Page, b: Page) {
  await a.locator("#create-room select[name=side]").selectOption("red");
  await a
    .locator("#create-room")
    .getByRole("button", { name: "Tạo phòng ↗", exact: true })
    .click();
  const heading = a.getByRole("heading", { name: /Phòng #/, level: 1 });
  await expect(heading).toBeVisible();
  const code = (await heading.textContent())!.match(/\d{6}/)![0];
  await b.getByPlaceholder("Mã phòng 6 số").fill(code);
  await b.getByRole("button", { name: "Tham gia", exact: true }).click();
  await expect(a.locator(".seat")).toHaveCount(2);
  await a.getByRole("button", { name: "Xác nhận cấu hình & sẵn sàng" }).click();
  await expect(b.locator(".seat b").first()).toHaveText("✓ Sẵn sàng");
  await b.getByRole("button", { name: "Xác nhận cấu hình & sẵn sàng" }).click();
  await expect(
    a.getByRole("heading", { name: "Ván cờ của bạn" }),
  ).toBeVisible();
  await expect(
    b.getByRole("heading", { name: "Ván cờ của bạn" }),
  ).toBeVisible();
}
it("both players can ready a rematch, and a finished game exposes room exit", async () => {
  const a = await user(),
    b = await user();
  try {
    await match(a.page, b.page);
    await a.page.getByRole("button", { name: "Đầu hàng", exact: true }).click();
    await a.page.locator(".swal2-confirm").click();
    await expect(
      b.page.getByRole("button", { name: "Xem kỳ phổ", exact: true }),
    ).toBeVisible();
    await expect(
      b.page.getByRole("button", { name: "Rời phòng", exact: true }),
    ).toBeVisible();
    await a.page
      .getByRole("button", { name: "Chuẩn bị tái đấu", exact: true })
      .click();
    await expect(
      b.page.getByRole("button", { name: "Xác nhận cấu hình & sẵn sàng" }),
    ).toBeVisible();
    await b.page
      .getByRole("button", { name: "Rời phòng", exact: true })
      .click();
    await expect(b.page.locator(".hero")).toBeVisible();
    await a.page
      .getByRole("button", { name: "Rời phòng", exact: true })
      .click();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
it("opening the lobby during a live match does not force navigation back to the board", async () => {
  const a = await user(),
    b = await user();
  try {
    await match(a.page, b.page);
    await a.page.getByRole("button", { name: /Sảnh cờ/, exact: false }).click();
    await expect(a.page.locator(".hero")).toBeVisible();
    await expect(a.page.locator(".loading")).toHaveCount(0);
    await expect(a.page.locator(".hero")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
it("authentication dialog receives keyboard focus, traps Tab and closes on Escape", async () => {
  const context = await newContext(),
    page = await context.newPage();
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.getByLabel("Email hoặc username")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("button", { name: "Đóng", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("button", { name: "Quên mật khẩu", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeFocused();
  } finally {
    await context.close();
  }
});
it("replay captions use the selected historical game rather than the current result", async () => {
  const a = await user(),
    b = await user();
  try {
    await match(a.page, b.page);
    await a.page.getByRole("button", { name: "Đầu hàng", exact: true }).click();
    await a.page.locator(".swal2-confirm").click();
    await expect(
      b.page.getByRole("button", { name: "Xem kỳ phổ", exact: true }),
    ).toBeVisible();
    const player = await db.user.findUniqueOrThrow({
      where: { username: b.name },
    });
    const row = await db.match.findFirstOrThrow({
      where: { OR: [{ red: player.id }, { black: player.id }] },
    });
    const historical = {
      ...(row.state as object),
      id: randomUUID(),
      result: { winner: null, reason: "AGREED_DRAW" },
    };
    await db.match.create({
      data: {
        id: historical.id,
        red: row.red,
        black: row.black,
        status: "FINISHED",
        version: row.version,
        state: historical,
      },
    });
    await b.page.getByRole("button", { name: /Lịch sử & kỳ phổ/ }).click();
    await b.page
      .getByRole("button", { name: "Xem kỳ phổ", exact: true })
      .first()
      .click();
    await expect(b.page.locator(".board-caption")).toContainText(
      "Hòa · Hai bên đồng ý hòa",
    );
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
it("custom confirmation can cancel or confirm resignation without browser dialogs", async () => {
  const a = await user(),
    b = await user();
  const native: string[] = [];
  a.page.on("dialog", async (dialog) => {
    native.push(dialog.type());
    await dialog.dismiss();
  });
  try {
    await match(a.page, b.page);
    await a.page.getByRole("button", { name: "Đầu hàng", exact: true }).click();
    await expect(a.page.locator(".swal2-popup")).toBeVisible();
    await a.page.locator(".swal2-cancel").click();
    await expect(
      a.page.getByRole("button", { name: "Đầu hàng", exact: true }),
    ).toBeVisible();
    await a.page.getByRole("button", { name: "Đầu hàng", exact: true }).click();
    await a.page.screenshot({
      path: "docs/implementation/notification-dialog.png",
      fullPage: true,
      animations: "disabled",
    });
    await a.page.locator(".swal2-confirm").click();
    await expect(
      b.page.getByRole("button", { name: "Xem kỳ phổ", exact: true }),
    ).toBeVisible();
    expect(native).toEqual([]);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
it("toast notifications announce profile success and remain dismissible", async () => {
  const { context, page } = await user();
  try {
    await page.getByRole("button", { name: /Hồ sơ/ }).click();
    await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
    const toast = page.locator(
      '[data-sonner-toast]:not([data-type="loading"])',
    );
    await expect(toast).toContainText("Đã cập nhật hồ sơ.");
    await expect(toast).toHaveAttribute("data-mounted", "true");
    await expect(toast).toHaveCSS("border-radius", "16px");
    // Sonner scales the toast during entry; measure the target after it settles.
    await expect
      .poll(async () => {
        const target = await toast.locator("[data-close-button]").boundingBox();
        return Math.min(target?.width ?? 0, target?.height ?? 0);
      })
      .toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: "docs/implementation/notification-toast.png",
      fullPage: true,
      animations: "disabled",
    });
    await toast.locator("[data-close-button]").click();
    await expect(toast).toHaveCount(0);
  } finally {
    await context.close();
  }
});
it("report dialog validates input before submission and uses a success toast", async () => {
  const a = await user(),
    b = await user();
  a.page.on("dialog", (dialog) => dialog.dismiss());
  try {
    await match(a.page, b.page);
    await a.page
      .getByRole("button", {
        name: "Báo cáo người chơi / nội dung chat",
        exact: true,
      })
      .click();
    await expect(a.page.locator(".swal2-textarea")).toBeVisible();
    await a.page.locator(".swal2-textarea").fill("abc");
    await a.page.locator(".swal2-confirm").click();
    await expect(a.page.locator(".swal2-validation-message")).toContainText(
      "ít nhất 5",
    );
    await a.page.locator(".swal2-textarea").fill("Nội dung kiểm thử báo cáo.");
    await a.page.locator(".swal2-confirm").click();
    await expect(
      a.page.locator('[data-sonner-toast]:not([data-type="loading"])'),
    ).toContainText("Đã gửi báo cáo");
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
