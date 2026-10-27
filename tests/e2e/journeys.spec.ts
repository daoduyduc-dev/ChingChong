import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { moves } from "../../shared/chess";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(name + "@e2e.invalid");
  await page.getByLabel(/^Mật khẩu/).fill("Chess12345");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".connection")).toContainText("Trực tuyến");
}
test("Admin browser manages only its new QA account target; profile privacy settings persist", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = "qa" + randomUUID().slice(0, 8);
  await register(page, name);
  await page.getByRole("button", { name: /Hồ sơ/, exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Ẩn lịch sử với người khác" })
    .check();
  await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Đã cập nhật hồ sơ.");
  await page.reload();
  await page.getByRole("button", { name: /Hồ sơ/, exact: false }).click();
  await expect(
    page.getByRole("checkbox", { name: "Ẩn lịch sử với người khác" }),
  ).toBeChecked();
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({
      where: { username: name },
      data: { role: "ADMIN" },
    });
    const target = await prisma.user.create({
      data: {
        username: name + "target",
        email: name + "target@e2e.invalid",
        displayName: "QA target",
      },
    });
    await page.reload();
    await page.getByRole("button", { name: /Quản trị/ }).click();
    await expect(
      page.getByRole("heading", { name: "Quản trị tối thiểu" }),
    ).toBeVisible();
    const row = page
      .locator(".friend-row")
      .filter({ hasText: new RegExp("^" + name + " ·") });
    await expect(row).toContainText("ACTIVE");
    const targetRow = page
      .locator(".friend-row")
      .filter({ hasText: target.username });
    page.once("dialog", (dialog) => dialog.accept());
    await targetRow
      .getByRole("button", { name: "BANNED", exact: true })
      .click();
    await expect(targetRow.locator("span").first()).toContainText("BANNED");
    page.once("dialog", (dialog) => dialog.accept());
    await targetRow
      .getByRole("button", { name: "ACTIVE", exact: true })
      .click();
    await expect(targetRow.locator("span").first()).toContainText("ACTIVE");
    await expect(
      page.getByRole("heading", { name: "Báo cáo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Audit log" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/implementation/admin-mobile.png",
      fullPage: true,
    });
  } finally {
    await prisma.user.update({
      where: { username: name },
      data: { role: "USER" },
    });
    await prisma.$disconnect();
    await context.close();
  }
});
test("two independent browsers: register, private room, move, chat, WebRTC consent, save/resume, replay", async ({
  browser,
}) => {
  const ca = await browser.newContext({
      permissions: ["camera", "microphone"],
    }),
    cb = await browser.newContext({ permissions: ["camera", "microphone"] });
  const a = await ca.newPage(),
    b = await cb.newPage();
  for (const page of [a, b])
    await page.addInitScript(() => {
      const Native = RTCPeerConnection;
      (window as any).qaPeers = [];
      window.RTCPeerConnection = class extends Native {
        constructor(config?: RTCConfiguration) {
          super(config);
          (window as any).qaPeers.push(this);
        }
      };
    });
  const prefix = "e" + randomUUID().slice(0, 8);
  await register(a, prefix + "a");
  await register(b, prefix + "b");
  await a
    .locator("#create-room select[name=visibility]")
    .selectOption("private");
  await a.locator("#create-room select[name=side]").selectOption("red");
  await a
    .locator("#create-room")
    .getByRole("button", { name: "Tạo phòng ↗", exact: true })
    .click();
  await expect(
    a.getByRole("heading", { name: /Phòng #/, level: 1 }),
  ).toBeVisible();
  const heading = await a
      .getByRole("heading", { name: /Phòng #/, level: 1 })
      .textContent(),
    code = heading!.match(/\d{6}/)![0];
  await b.getByPlaceholder("Mã phòng 6 số").fill(code);
  await b.getByRole("button", { name: "Tham gia", exact: true }).click();
  await a.getByRole("button", { name: "Xác nhận cấu hình & sẵn sàng" }).click();
  await b.getByRole("button", { name: "Xác nhận cấu hình & sẵn sàng" }).click();
  await expect(
    a.getByRole("heading", { name: "Ván cờ của bạn" }),
  ).toBeVisible();
  await expect(
    b.getByRole("heading", { name: "Ván cờ của bạn" }),
  ).toBeVisible();
  await a.getByTestId("square-54").click();
  await a.getByTestId("square-45").click();
  await expect(b.locator(".moves li")).toHaveCount(1);
  await b.getByTestId("square-27").click();
  await b.getByTestId("square-36").click();
  await expect(a.locator(".moves li")).toHaveCount(2);
  await a
    .getByLabel("Tin nhắn", { exact: true })
    .fill("<img onerror=alert(1)> Chào bạn ♟");
  await a.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(b.locator(".messages")).toContainText("<img onerror=alert(1)>");
  await expect(b.locator(".messages img")).toHaveCount(0);
  await a.getByRole("button", { name: "◉ Gọi video", exact: true }).click();
  await expect(b.locator("video")).toHaveCount(0);
  await b
    .locator(".request")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect(
    a.getByRole("button", { name: "Bật camera", exact: true }),
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Bật camera", exact: true }),
  ).toBeVisible();
  await a.getByRole("button", { name: "Bật camera", exact: true }).click();
  await b.getByRole("button", { name: "Bật camera", exact: true }).click();
  await a.getByRole("button", { name: "Bật micro", exact: true }).click();
  await b.getByRole("button", { name: "Bật micro", exact: true }).click();
  await expect
    .poll(
      () =>
        a
          .getByLabel("Video đối phương")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(2)
    .catch(async (error) => {
      for (const page of [a, b])
        console.log(
          "RTC diagnostic",
          await page.evaluate(() =>
            (window as any).qaPeers.map((p: RTCPeerConnection) => ({
              signaling: p.signalingState,
              connection: p.connectionState,
              ice: p.iceConnectionState,
              local: p.localDescription?.type,
              remote: p.remoteDescription?.type,
              senders: p.getSenders().map((s) => ({
                kind: s.track?.kind,
                state: s.track?.readyState,
              })),
              receivers: p.getReceivers().map((r) => ({
                kind: r.track.kind,
                state: r.track.readyState,
                muted: r.track.muted,
              })),
            })),
          ),
        );
      throw error;
    });
  await expect
    .poll(
      () =>
        b
          .getByLabel("Video đối phương")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(2);
  await a.getByRole("button", { name: "Kết thúc gọi", exact: true }).click();
  await expect(b.locator("video")).toHaveCount(0);
  // Delayed device permission must not leave a live camera after call teardown.
  await a.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const state = window as unknown as {
      releaseMedia?: () => void;
      lateTracks?: MediaStreamTrack[];
      restoreMedia?: () => void;
    };
    state.restoreMedia = () => {
      navigator.mediaDevices.getUserMedia = original;
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const media = await original(constraints);
      state.lateTracks = media.getTracks();
      await new Promise<void>((resolve) => {
        state.releaseMedia = resolve;
      });
      return media;
    };
  });
  await a.getByRole("button", { name: "◉ Gọi video", exact: true }).click();
  await b
    .locator(".request")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect(a.locator(".video small")).toContainText(/connected|Đã kết nối/);
  await a.getByRole("button", { name: "Bật camera", exact: true }).click();
  await expect
    .poll(() =>
      a.evaluate(
        () =>
          !!(window as unknown as { releaseMedia?: () => void }).releaseMedia,
      ),
    )
    .toBe(true);
  await a.getByRole("button", { name: "Kết thúc gọi", exact: true }).click();
  await expect(a.locator("video")).toHaveCount(0);
  await a.evaluate(() => {
    const state = window as unknown as {
      releaseMedia: () => void;
      restoreMedia: () => void;
    };
    state.releaseMedia();
    state.restoreMedia();
  });
  await expect
    .poll(() =>
      a.evaluate(() =>
        (
          window as unknown as { lateTracks: MediaStreamTrack[] }
        ).lateTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
  await a.route("**/api/matches/*/rtc-config", (route) => route.abort());
  await a.getByRole("button", { name: "◉ Gọi video", exact: true }).click();
  await b
    .locator(".request")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect(a.locator(".video small")).toContainText(
    /fetch|kết nối|Network/i,
  );
  await a.getByTestId("square-56").click();
  await a.getByTestId("square-47").click();
  await expect(b.locator(".moves li")).toHaveCount(3);
  await a.getByRole("button", { name: "Kết thúc gọi", exact: true }).click();
  await a.unroute("**/api/matches/*/rtc-config");
  await a.getByRole("button", { name: "▣ Lưu ván", exact: true }).click();
  await b
    .locator(".request")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect(
    a.getByRole("button", { name: "Mời tiếp tục ván", exact: true }),
  ).toBeVisible();
  await a
    .getByRole("button", { name: "Mời tiếp tục ván", exact: true })
    .click();
  await b
    .locator(".request")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await a
    .getByRole("button", { name: "Sẵn sàng tiếp tục", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Sẵn sàng tiếp tục", exact: true })
    .click();
  await expect(
    a.getByRole("button", { name: "▣ Lưu ván", exact: true }),
  ).toBeVisible();
  await expect(a.locator(".moves li")).toHaveCount(3);
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "Đầu hàng", exact: true }).click();
  await expect(
    b.getByRole("button", { name: "Xem kỳ phổ", exact: true }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Xem kỳ phổ", exact: true }).click();
  await expect(
    b.getByRole("heading", { name: "Phát lại kỳ phổ" }),
  ).toBeVisible();
  await b.getByRole("button", { name: "→|", exact: true }).click();
  await expect(b.locator(".moves li")).toHaveCount(3);
  await a.screenshot({
    path: "docs/implementation/pvp-desktop.png",
    fullPage: true,
  });
  await a.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(a.locator(".hero")).toBeVisible();
  expect(await a.evaluate(() => localStorage.getItem("lastActor"))).toBeNull();
  await expect(a.locator(".moves")).toHaveCount(0);
  await ca.close();
  await cb.close();
});
test("TC-064/067/068 offline reload and 10 human plies, no Backend calls, local recovery and Guest clear", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await expect(page.locator(".offline-state")).toContainText("đã cache", {
    timeout: 15000,
  });
  await context.setOffline(true);
  const backendRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/") || r.url().includes("/socket.io"))
      backendRequests.push(r.url());
  });
  await page.reload();
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Độ khó", exact: true })
    .selectOption("easy");
  await page
    .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
    .click();
  for (let i = 0; i < 10; i++) {
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(sessionStorage.getItem("ai:guest")!).position.turn,
        ),
      )
      .toBe("red");
    const position = await page.evaluate(
        () => JSON.parse(sessionStorage.getItem("ai:guest")!).position,
      ),
      move = moves(position)[0];
    expect(move).toBeTruthy();
    await page.getByTestId("square-" + move.from).click();
    await page.getByTestId("square-" + move.to).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem("ai:guest")!).position.history
              .length,
        ),
      )
      .toBe((i + 1) * 2);
  }
  expect(backendRequests).toEqual([]);
  await page.reload();
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tiếp tục ván cục bộ", exact: true })
    .click();
  await expect(page.locator(".moves li")).toHaveCount(20);
  await page.getByRole("button", { name: "↶ Hoàn tác", exact: true }).click();
  await expect(page.locator(".moves li")).toHaveCount(18);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tiếp tục ván cục bộ", exact: true }),
  ).toHaveCount(0);
  expect(backendRequests).toEqual([]);
  await context.close();
});
test("TC-067 authenticated User recovers IndexedDB game after offline reload with no Backend requests", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, "local" + randomUUID().slice(0, 8));
  await page.getByRole("button", { name: /Luyện tập với máy/ }).click();
  await expect(page.locator(".offline-state")).toContainText("đã cache");
  await page
    .getByRole("combobox", { name: "Độ khó", exact: true })
    .selectOption("easy");
  await page
    .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
    .click();
  await page.getByTestId("square-54").click();
  await page.getByTestId("square-45").click();
  await expect(page.locator(".moves li")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const actor = JSON.parse(localStorage.getItem("lastActor")!);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open("keyval-store");
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const r = db
              .transaction("keyval", "readonly")
              .objectStore("keyval")
              .get("ai:" + actor.id);
            r.onsuccess = () => resolve(r.result?.position.history.length ?? 0);
            r.onerror = () => reject(r.error);
          });
        } finally {
          db.close();
        }
      }),
    )
    .toBe(2);
  expect(
    await page.evaluate(() => sessionStorage.getItem("ai:guest")),
  ).toBeNull();
  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/|\/socket.io/.test(r.url())) requests.push(r.url());
  });
  await page.reload();
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tiếp tục ván cục bộ", exact: true })
    .click();
  await expect(page.locator(".moves li")).toHaveCount(2);
  expect(requests).toEqual([]);
  await context.close();
});
test("responsive 390px, local AI and screenshots", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({
    path: "docs/implementation/lobby-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "docs/implementation/lobby-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await expect(page.getByTestId("board")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/implementation/ai-mobile.png",
    fullPage: true,
  });
});
test("TC-016/019 two browser guests open invitation URL and race for the last seat; QR is real", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext(),
    bContext = await browser.newContext(),
    cContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    b = await bContext.newPage(),
    c = await cContext.newPage();
  await owner.goto("/");
  await owner
    .getByRole("button", { name: "♜ Vào sảnh với tư cách khách", exact: true })
    .click();
  await expect(owner.locator(".connection")).toContainText("Trực tuyến");
  const response = owner.waitForResponse(
    (r) => r.url().endsWith("/api/rooms") && r.request().method() === "POST",
  );
  await owner
    .locator("#create-room")
    .getByRole("button", { name: "Tạo phòng ↗", exact: true })
    .click();
  const room = await (await response).json();
  await owner.getByRole("button", { name: "QR Code", exact: true }).click();
  await expect(owner.getByAltText("QR tham gia phòng")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await b.goto("/?room=" + room.id);
  await c.goto("/?room=" + room.id);
  await Promise.all([
    b
      .getByRole("button", {
        name: "♜ Vào sảnh với tư cách khách",
        exact: true,
      })
      .click(),
    c
      .getByRole("button", {
        name: "♜ Vào sảnh với tư cách khách",
        exact: true,
      })
      .click(),
  ]);
  await expect(owner.locator(".seat")).toHaveCount(2);
  await expect
    .poll(async () => ({
      b: await b.locator("h1").textContent(),
      c: await c.locator("h1").textContent(),
    }))
    .toMatchObject({ b: expect.any(String), c: expect.any(String) });
  const losers = [b, c];
  await expect
    .poll(async () =>
      Promise.all(
        losers.map(async (p) =>
          (await p.locator(".notice").allTextContents()).join(""),
        ),
      ),
    )
    .toContainEqual(expect.stringContaining("Phòng đã đủ hai người"));
  await owner.getByRole("button", { name: "Rời phòng", exact: true }).click();
  await ownerContext.close();
  await bContext.close();
  await cContext.close();
});
test("TC-066 Undo terminates a real thinking Worker; hint and corrupted local snapshot handling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = Worker.prototype.terminate;
    Worker.prototype.terminate = function () {
      (window as any).workerStops = ((window as any).workerStops ?? 0) + 1;
      native.call(this);
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Độ khó", exact: true })
    .selectOption("hard");
  await page
    .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
    .click();
  const baseline = await page.evaluate(() => (window as any).workerStops ?? 0);
  await page.getByTestId("square-54").click();
  await page.getByTestId("square-45").click();
  await expect(page.locator(".board-caption")).toContainText(
    "Máy đang suy nghĩ",
  );
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const start = performance.now();
        const frame = () => {
          count++;
          if (performance.now() - start < 200) requestAnimationFrame(frame);
          else resolve(count);
        };
        requestAnimationFrame(frame);
      }),
  );
  expect(frames).toBeGreaterThan(2);
  await page.getByRole("button", { name: "↶ Hoàn tác", exact: true }).click();
  await expect(page.locator(".moves li")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).workerStops),
  ).toBeGreaterThan(baseline);
  await page.waitForTimeout(1600);
  await expect(page.locator(".moves li")).toHaveCount(0);
  await page.getByRole("button", { name: "✧ Gợi ý", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Gợi ý:", {
    timeout: 6000,
  });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "ai:guest",
      JSON.stringify({
        position: { board: [], turn: "red", history: [{ from: 0, to: 89 }] },
        human: "red",
        level: "easy",
      }),
    ),
  );
  await page.reload();
  await expect(page.locator(".notice")).toContainText("không hợp lệ");
});
test("TC-065 missing Worker cache asset produces explicit failure while offline", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByRole("button", { name: "◇ Chơi với máy", exact: true })
    .click();
  await expect(page.locator(".offline-state")).toContainText("đã cache");
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const key of await cache.keys())
        if (key.url.includes("ai.worker-")) await cache.delete(key);
    }
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
    .click();
  await page.getByTestId("square-54").click();
  await page.getByTestId("square-45").click();
  await expect(page.locator(".notice")).toContainText(/Worker AI|quá lâu/, {
    timeout: 6000,
  });
  await expect(page.locator(".moves li")).toHaveCount(1);
  await context.close();
});
