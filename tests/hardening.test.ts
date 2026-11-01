import { it, expect, afterEach, afterAll, vi } from "vitest";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { AuthService, hash } from "../server/src/services/auth";
import { db } from "../server/src/database/db";

const auth = new AuthService();
const ids: string[] = [];
function response() {
  const cookies: Record<string, string> = {};
  const res = {
    cookie: vi.fn((k: string, v: string) => {
      cookies[k] = v;
    }),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
    json: vi.fn(),
  };
  return { cookies, res: res as unknown as Response };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db.resetToken.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.identity.deleteMany({ where: { userId: { in: ids } } });
  await db.audit.deleteMany({ where: { entityId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
it("Facebook code flow uses state and server secret, creates provider identity with mocked endpoints only", async () => {
  vi.stubEnv("FACEBOOK_CLIENT_ID", "local-test-client");
  vi.stubEnv("FACEBOOK_CLIENT_SECRET", "local-test-secret");
  const name = "fb_" + randomUUID().slice(0, 8);
  const start = response();
  await auth.oauthStart("facebook", start.res);
  const url = new URL(
    (start.res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0],
  );
  expect(url.searchParams.get("state")).toBe(start.cookies.oauth_state);
  expect(url.searchParams.has("client_secret")).toBe(false);
  const fetcher = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("access_token")
              ? { access_token: "mock-fb-token" }
              : { id: name, email: name + "@tests.invalid", name },
          ),
          { status: 200 },
        ),
    );
  vi.stubGlobal("fetch", fetcher);
  await auth.oauthCallback(
    "facebook",
    {
      query: { code: "mock-code", state: start.cookies.oauth_state },
      cookies: start.cookies,
    } as unknown as Request,
    response().res,
  );
  const identity = await db.identity.findUniqueOrThrow({
    where: { provider_subject: { provider: "facebook", subject: name } },
  });
  ids.push(identity.userId);
  expect(fetcher.mock.calls[0][1].body.get("client_secret")).toBe(
    "local-test-secret",
  );
  expect(fetcher.mock.calls[0][1].body.has("code_verifier")).toBe(false);
});
it("OAuth rejects absent, array, mismatched and cross-provider state before any provider request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const [query, cookies] of [
    [{ code: "code" }, {}],
    [{ code: "code", state: ["a"] }, { oauth_state: ["a"] }],
    [
      { code: "code", state: "a".repeat(64) },
      {
        oauth_state: "b".repeat(64),
        oauth_verifier: "v".repeat(43),
        oauth_provider: "google",
      },
    ],
    [
      { code: "code", state: "a".repeat(64) },
      {
        oauth_state: "a".repeat(64),
        oauth_verifier: "v".repeat(43),
        oauth_provider: "facebook",
      },
    ],
  ]) {
    await expect(
      auth.oauthCallback(
        "google",
        { query, cookies } as unknown as Request,
        response().res,
      ),
    ).rejects.toThrow("OAUTH_STATE_INVALID");
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("OAuth Google PKCE and explicit linking reject email takeover and foreign identity (mock provider only)", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "local-test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "local-test-secret");
  const name = "hard_" + randomUUID().slice(0, 8);
  await auth.register(
    { username: name, email: name + "@tests.invalid", password: "Chess12345" },
    response().res,
  );
  const account = await auth.login(
    { identifier: name, password: "Chess12345" },
    response().res,
  );
  ids.push(account.actor.id);
  const start = response();
  await auth.oauthStart("google", start.res);
  const url = new URL(
    (start.res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0],
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBe(
    Buffer.from(hash(start.cookies.oauth_verifier), "hex").toString(
      "base64url",
    ),
  );
  const fetcher = vi.fn().mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/token")
            ? { access_token: "test-provider-token" }
            : {
                sub: name,
                email: name + "@tests.invalid",
                email_verified: true,
              },
        ),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const req = () =>
    ({
      query: { code: "mock-code", state: start.cookies.oauth_state },
      cookies: start.cookies,
    }) as unknown as Request;
  await expect(
    auth.oauthCallback("google", req(), response().res),
  ).rejects.toThrow("OAUTH_LINK_REQUIRES_EXISTING_LOGIN");
  await auth.oauthStart("google", start.res, account.actor);
  await auth.oauthCallback("google", req(), response().res);
  expect(await db.identity.count({ where: { userId: account.actor.id } })).toBe(
    1,
  );
  expect(fetcher.mock.calls[0][1].body.get("code_verifier")).toBeTruthy();
  const otherName = "hard_" + randomUUID().slice(0, 8);
  await auth.register(
    {
      username: otherName,
      email: otherName + "@tests.invalid",
      password: "Chess12345",
    },
    response().res,
  );
  const other = await auth.login(
    { identifier: otherName, password: "Chess12345" },
    response().res,
  );
  ids.push(other.actor.id);
  await auth.oauthStart("google", start.res, other.actor);
  await expect(
    auth.oauthCallback("google", req(), response().res),
  ).rejects.toThrow("OAUTH_ALREADY_LINKED");
});
it("Reset mail crosses a real local SMTP socket, stores only hash, and delivery failure audits without leaking account", async () => {
  let mail = "";
  const smtp = createServer((socket) => {
    socket.write("220 local acceptance SMTP\r\n");
    let buffer = "",
      data = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let index: number;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === ".") {
            data = false;
            socket.write("250 accepted\r\n");
          } else mail += line + "\n";
        } else if (/^EHLO/.test(line)) socket.write("250 local\r\n");
        else if (/^DATA/.test(line)) {
          data = true;
          socket.write("354 send\r\n");
        } else if (/^QUIT/.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.address() as { port: number };
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(address.port));
  vi.stubEnv("SMTP_FROM", "local@tests.invalid");
  vi.stubEnv("SMTP_USER", "");
  const name = "smtp_" + randomUUID().slice(0, 8),
    email = name + "@tests.invalid";
  await auth.register(
    { username: name, email, password: "Chess12345" },
    response().res,
  );
  const account = await auth.login(
    { identifier: name, password: "Chess12345" },
    response().res,
  );
  ids.push(account.actor.id);
  try {
    const result = await auth.forgot({ email });
    expect(JSON.stringify(result)).not.toContain(email);
    const decoded = mail.replace(/=\n/g, "").replace(/=3D/gi, "=");
    const token = decoded.match(/reset=([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    expect(
      await db.resetToken.findUnique({ where: { hash: hash(token!) } }),
    ).not.toBeNull();
    expect(
      JSON.stringify(
        await db.resetToken.findMany({ where: { userId: account.actor.id } }),
      ),
    ).not.toContain(token);
    await auth.reset({ token, password: "ResetChess123" });
    await expect(auth.authenticate(account.token)).rejects.toThrow(
      "SESSION_REVOKED",
    );
    await expect(
      auth.reset({ token, password: "ResetChess123" }),
    ).rejects.toThrow("RESET_INVALID");
  } finally {
    await new Promise<void>((resolve, reject) =>
      smtp.close((e) => (e ? reject(e) : resolve())),
    );
  }
  const known = await auth.forgot({ email });
  const unknown = await auth.forgot({ email: "missing@tests.invalid" });
  expect(known).toEqual(unknown);
  expect(
    await db.audit.count({
      where: {
        action: "RESET_EMAIL_DELIVERY_FAILED",
        entityId: account.actor.id,
      },
    }),
  ).toBe(1);
});

it("Brevo sends a confirmation link for password changes and invalidates all older links", async () => {
  vi.stubEnv("BREVO_API_KEY", "test-api-key");
  vi.stubEnv("MAIL_FROM", "sender@tests.invalid");
  vi.stubEnv("APP_URL", "https://chess.example.com");
  const deliveries: Array<{ to: { email: string }[]; textContent: string }> =
    [];
  const send = vi.fn(async (_url: string, init: RequestInit) => {
    deliveries.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ messageId: "test" }), { status: 201 });
  });
  vi.stubGlobal("fetch", send);
  const name = "email_" + randomUUID().slice(0, 8);
  const email = name + "@tests.invalid";
  await auth.register(
    { username: name, email, password: "Chess12345" },
    response().res,
  );
  const session = await auth.login(
    { identifier: name, password: "Chess12345" },
    response().res,
  );
  ids.push(session.actor.id);
  await auth.change(session.actor);
  await auth.forgot({ email });
  expect(deliveries).toHaveLength(2);
  expect(deliveries[0].to[0].email).toBe(email);
  const token = (message: string) =>
    new URL(message.split(" ").at(-1)!).searchParams.get("reset")!;
  const old = token(deliveries[0].textContent);
  const latest = token(deliveries[1].textContent);
  expect(old).toBeTruthy();
  await auth.reset({ token: latest, password: "NewChess123" });
  await expect(
    auth.reset({ token: old, password: "OtherChess123" }),
  ).rejects.toThrow("RESET_INVALID");
  await expect(auth.authenticate(session.token)).rejects.toThrow(
    "SESSION_REVOKED",
  );
  await expect(
    auth.login({ identifier: name, password: "NewChess123" }, response().res),
  ).resolves.toBeTruthy();
});
