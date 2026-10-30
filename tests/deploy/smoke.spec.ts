import { test, expect } from "@playwright/test";

test("deployed frontend, API proxy, responsive keyboard board and offline AI", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect((await health.json()).status).toBe("ok");
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await page.getByRole("button", { name: "Chơi với máy", exact: true }).click();
  await expect(page.locator(".offline-state")).toContainText("đã cache", {
    timeout: 20000,
  });
  await page
    .getByRole("combobox", { name: "Độ khó", exact: true })
    .selectOption("easy");
  await page
    .getByRole("button", { name: "Bắt đầu ván mới", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const piece = page.getByTestId("square-54");
  await piece.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("square-45")).toBeFocused();
  await piece.click();
  await page.getByTestId("square-45").click();
  await expect(page.locator(".moves li")).toHaveCount(2);
  const backend: string[] = [];
  await context.setOffline(true);
  page.on("request", (request) => {
    if (/\/api\/|\/socket.io/.test(request.url())) backend.push(request.url());
  });
  await page.reload();
  await page.getByRole("button", { name: "Chơi với máy", exact: true }).click();
  await page
    .getByRole("button", { name: "Tiếp tục ván cục bộ", exact: true })
    .click();
  await expect(page.locator(".moves li")).toHaveCount(2);
  await page.getByTestId("square-56").click();
  await page.getByTestId("square-47").click();
  await expect(page.locator(".moves li")).toHaveCount(4);
  expect(backend).toEqual([]);
  expect(errors).toEqual([]);
});
