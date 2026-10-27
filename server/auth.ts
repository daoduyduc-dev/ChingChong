import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "./db";
import { assert } from "./errors";
import type { Actor } from "../shared/domain";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const password = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/)
  .refine((s) => Buffer.byteLength(s, "utf8") <= 72);
export const registration = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .transform((s) => s.toLowerCase()),
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((s) => s.toLowerCase()),
  password,
  mergeGuest: z.boolean().optional(),
});
export const secret = () => {
  assert(
    process.env.JWT_SECRET &&
      process.env.JWT_SECRET.length >= 32 &&
      process.env.JWT_SECRET !== "replace-with-random-at-least-32-characters",
    "JWT_CONFIGURATION_MISSING",
    503,
  );
  return process.env.JWT_SECRET!;
};
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.APP_URL?.startsWith("https:") ?? false,
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 30 * 86400000,
};
export class AuthService {
  onRevoke: (id: string) => Promise<void> = async () => {};
  private tail: Promise<unknown> = Promise.resolve();
  serial<T>(f: () => Promise<T>): Promise<T> {
    const next = this.tail.then(f, f);
    this.tail = next.catch(() => {});
    return next;
  }
  async issue(userId: string | null, guestId: string | null, res: Response) {
    const raw = randomBytes(48).toString("hex");
    const old = await db.session.findMany({
      where: userId
        ? { userId, revokedAt: null }
        : { guestId, revokedAt: null },
    });
    const session = await db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: userId
          ? { userId, revokedAt: null }
          : { guestId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.session.create({
        data: {
          userId,
          guestId,
          refreshHash: hash(raw),
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
    });
    for (const s of old) await this.onRevoke(s.id);
    res.cookie("refresh", raw, cookieOptions);
    return {
      token: jwt.sign({ sid: session.id }, secret(), { expiresIn: "15m" }),
      actor: await this.actorForSession(session.id),
    };
  }
  async actorForSession(id: string): Promise<Actor> {
    const s = await db.session.findUnique({
      where: { id },
      include: { user: true },
    });
    assert(
      s && !s.revokedAt && s.expiresAt.getTime() > Date.now(),
      "SESSION_REVOKED",
      401,
    );
    assert(
      !s.user || (s.user.status === "ACTIVE" && !s.user.deletedAt),
      "SESSION_REVOKED",
      401,
    );
    return {
      id: s.userId ?? s.guestId!,
      sessionId: s.id,
      guest: !s.userId,
      name: s.user?.displayName ?? "Khách " + s.guestId!.slice(0, 6),
      role: s.user?.role ?? "GUEST",
      avatar: s.user?.avatar,
    };
  }
  async authenticate(token: string) {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    } catch {
      assert(false, "UNAUTHENTICATED", 401);
    }
    return this.actorForSession(String(payload.sid));
  }
  middleware = (req: Request, res: Response, next: NextFunction) => {
    this.authenticate(req.headers.authorization?.replace(/^Bearer /, "") ?? "")
      .then((a) => {
        res.locals.actor = a;
        next();
      })
      .catch(next);
  };
  async register(input: unknown, res: Response) {
    const d = registration.parse(input),
      passwordHash = await bcrypt.hash(d.password, 12);
    return this.serial(async () => {
      const user = await db.user.create({
        data: {
          username: d.username,
          email: d.email,
          passwordHash,
          displayName: d.username,
        },
      });
      return this.issue(user.id, null, res);
    });
  }
  async login(input: unknown, res: Response) {
    const d = z
      .object({ identifier: z.string().min(1), password: z.string().max(128) })
      .parse(input);
    const id = d.identifier.trim().toLowerCase();
    const user = await db.user.findFirst({
      where: {
        OR: [{ username: id }, { email: id }],
        deletedAt: null,
        status: "ACTIVE",
      },
    });
    assert(
      user?.passwordHash &&
        (await bcrypt.compare(d.password, user.passwordHash)),
      "INVALID_CREDENTIALS",
      401,
    );
    return this.serial(() => this.issue(user.id, null, res));
  }
  async guest(res: Response) {
    return this.issue(null, randomUUID(), res);
  }
  async refresh(raw: string | undefined, res: Response) {
    assert(raw, "UNAUTHENTICATED", 401);
    return this.serial(async () => {
      const s = await db.session.findUnique({
        where: { refreshHash: hash(raw) },
      });
      assert(
        s && !s.revokedAt && s.expiresAt.getTime() > Date.now(),
        "SESSION_REVOKED",
        401,
      );
      const actor = await this.actorForSession(s.id);
      const next = randomBytes(48).toString("hex");
      await db.session.update({
        where: { id: s.id },
        data: { refreshHash: hash(next) },
      });
      res.cookie("refresh", next, cookieOptions);
      return {
        token: jwt.sign({ sid: s.id }, secret(), { expiresIn: "15m" }),
        actor,
      };
    });
  }
  async logout(a: Actor, res: Response) {
    await db.session.update({
      where: { id: a.sessionId },
      data: { revokedAt: new Date() },
    });
    await this.onRevoke(a.sessionId);
    res.clearCookie("refresh", cookieOptions);
  }
  async forgot(input: unknown) {
    const { email } = z.object({ email: z.email() }).parse(input);
    assert(
      process.env.SMTP_HOST && process.env.SMTP_FROM,
      "SMTP_NOT_CONFIGURED",
      503,
    );
    const u = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (u?.passwordHash && u.status === "ACTIVE" && !u.deletedAt) {
      const token = randomBytes(32).toString("hex");
      await db.resetToken.create({
        data: {
          hash: hash(token),
          userId: u.id,
          expiresAt: new Date(Date.now() + 1800000),
        },
      });
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_PORT === "465",
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: u.email,
          subject: "Kỳ Viện — đặt lại mật khẩu",
          text: `Mở liên kết trong 30 phút: ${process.env.APP_URL}/?reset=${token}`,
        });
      } catch {
        await db.audit.create({
          data: {
            actor: "system",
            action: "RESET_EMAIL_DELIVERY_FAILED",
            entityId: u.id,
          },
        });
      }
    }
    return {
      message: "Nếu email phù hợp, liên kết đặt lại mật khẩu sẽ được gửi.",
    };
  }
  async reset(input: unknown) {
    const d = z.object({ token: z.string(), password }).parse(input);
    const passwordHash = await bcrypt.hash(d.password, 12);
    await this.serial(async () => {
      await db
        .$transaction(async (tx) => {
          const r = await tx.resetToken.findUnique({
            where: { hash: hash(d.token) },
          });
          assert(
            r && !r.usedAt && r.expiresAt.getTime() > Date.now(),
            "RESET_INVALID",
          );
          await tx.resetToken.update({
            where: { hash: r.hash },
            data: { usedAt: new Date() },
          });
          await tx.user.update({
            where: { id: r.userId },
            data: { passwordHash },
          });
          const sessions = await tx.session.findMany({
            where: { userId: r.userId, revokedAt: null },
          });
          await tx.session.updateMany({
            where: { userId: r.userId },
            data: { revokedAt: new Date() },
          });
          return sessions;
        })
        .then(async (sessions) => {
          for (const s of sessions) await this.onRevoke(s.id);
        });
    });
    return { message: "Mật khẩu đã thay đổi. Hãy đăng nhập lại." };
  }
  async change(a: Actor, input: unknown, res: Response) {
    assert(!a.guest, "FORBIDDEN", 403);
    const d = z.object({ current: z.string(), password }).parse(input),
      u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    assert(
      u.passwordHash && (await bcrypt.compare(d.current, u.passwordHash)),
      "INVALID_CREDENTIALS",
      401,
    );
    const passwordHash = await bcrypt.hash(d.password, 12);
    return this.serial(async () => {
      await db.user.update({ where: { id: a.id }, data: { passwordHash } });
      return this.issue(a.id, null, res);
    });
  }
  async setPassword(a: Actor, input: unknown, res: Response) {
    assert(!a.guest, "FORBIDDEN", 403);
    const d = z.object({ password }).parse(input);
    const u = await db.user.findUniqueOrThrow({ where: { id: a.id } }),
      session = await db.session.findUniqueOrThrow({
        where: { id: a.sessionId },
      });
    assert(
      !u.passwordHash &&
        (await db.identity.count({ where: { userId: a.id } })) > 0 &&
        Date.now() - session.createdAt.getTime() < 300000,
      "OAUTH_REAUTHENTICATION_REQUIRED",
      403,
    );
    const passwordHash = await bcrypt.hash(d.password, 12);
    return this.serial(async () => {
      await db.user.update({ where: { id: a.id }, data: { passwordHash } });
      return this.issue(a.id, null, res);
    });
  }
  async oauthStart(
    provider: "google" | "facebook",
    res: Response,
    link?: Actor,
  ) {
    const prefix = provider.toUpperCase(),
      client = process.env[prefix + "_CLIENT_ID"];
    assert(
      client && process.env[prefix + "_CLIENT_SECRET"],
      "OAUTH_NOT_CONFIGURED",
      503,
    );
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    res.cookie(
      "oauth_link",
      link
        ? jwt.sign({ sid: link.sessionId, state }, secret(), {
            expiresIn: "10m",
          })
        : "",
      {
        ...cookieOptions,
        sameSite: "lax",
        path: "/api/auth/oauth",
        maxAge: 600000,
      },
    );
    res.cookie("oauth_state", state, {
      ...cookieOptions,
      sameSite: "lax",
      path: "/api/auth/oauth",
      maxAge: 600000,
    });
    res.cookie("oauth_verifier", verifier, {
      ...cookieOptions,
      sameSite: "lax",
      path: "/api/auth/oauth",
      maxAge: 600000,
    });
    res.cookie("oauth_provider", provider, {
      ...cookieOptions,
      sameSite: "lax",
      path: "/api/auth/oauth",
      maxAge: 600000,
    });
    const redirect =
      process.env.APP_URL + "/api/auth/oauth/" + provider + "/callback";
    const params = new URLSearchParams({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      state,
      scope:
        provider === "google" ? "openid email profile" : "email,public_profile",
    });
    if (provider === "google") {
      params.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      params.set("code_challenge_method", "S256");
    }
    const url =
      (provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth?"
        : "https://www.facebook.com/v23.0/dialog/oauth?") + params;
    if (link) res.json({ url });
    else res.redirect(url);
  }
  async oauthCallback(
    provider: "google" | "facebook",
    req: Request,
    res: Response,
  ) {
    assert(
      typeof req.query.code === "string" &&
        req.query.code.length > 0 &&
        typeof req.query.state === "string" &&
        /^[a-f0-9]{64}$/.test(req.query.state) &&
        typeof req.cookies.oauth_state === "string" &&
        req.cookies.oauth_provider === provider &&
        typeof req.cookies.oauth_verifier === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(req.cookies.oauth_verifier) &&
        req.query.state === req.cookies.oauth_state,
      "OAUTH_STATE_INVALID",
    );
    const prefix = provider.toUpperCase();
    const params = new URLSearchParams({
      client_id: process.env[prefix + "_CLIENT_ID"]!,
      client_secret: process.env[prefix + "_CLIENT_SECRET"]!,
      redirect_uri:
        process.env.APP_URL + "/api/auth/oauth/" + provider + "/callback",
      code: req.query.code,
    });
    if (provider === "google") {
      params.set("grant_type", "authorization_code");
      params.set("code_verifier", req.cookies.oauth_verifier);
    }
    const tokenResponse = await fetch(
      provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://graph.facebook.com/v23.0/oauth/access_token",
      { method: "POST", body: params, signal: AbortSignal.timeout(15000) },
    );
    assert(tokenResponse.ok, "OAUTH_FAILED", 401);
    const tokenData = (await tokenResponse.json()) as { access_token: string };
    assert(
      typeof tokenData.access_token === "string" &&
        tokenData.access_token.length > 0,
      "OAUTH_FAILED",
      401,
    );
    const profileResponse = await fetch(
      provider === "google"
        ? "https://openidconnect.googleapis.com/v1/userinfo"
        : "https://graph.facebook.com/me?fields=id,name,email",
      {
        headers: { Authorization: "Bearer " + tokenData.access_token },
        signal: AbortSignal.timeout(15000),
      },
    );
    assert(profileResponse.ok, "OAUTH_FAILED", 401);
    const profile = (await profileResponse.json()) as {
      sub?: string;
      id?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    assert(profile.sub ?? profile.id, "OAUTH_FAILED", 401);
    let linked: Actor | undefined;
    if (req.cookies.oauth_link) {
      let ctx: jwt.JwtPayload;
      try {
        ctx = jwt.verify(req.cookies.oauth_link, secret()) as jwt.JwtPayload;
      } catch {
        assert(false, "OAUTH_STATE_INVALID");
      }
      assert(ctx.state === req.query.state, "OAUTH_STATE_INVALID");
      linked = await this.actorForSession(String(ctx.sid));
      assert(!linked.guest, "FORBIDDEN", 403);
    }
    const result = await this.serial(async () => {
      const identity = await db.identity.findUnique({
        where: {
          provider_subject: { provider, subject: (profile.sub ?? profile.id)! },
        },
      });
      if (linked) {
        assert(
          !identity || identity.userId === linked.id,
          "OAUTH_ALREADY_LINKED",
          409,
        );
        if (!identity)
          await db.identity.create({
            data: {
              provider,
              subject: (profile.sub ?? profile.id)!,
              userId: linked.id,
            },
          });
        return this.issue(linked.id, null, res);
      }
      if (identity) return this.issue(identity.userId, null, res);
      assert(
        profile.email && (provider !== "google" || profile.email_verified),
        "OAUTH_EMAIL_REQUIRED",
      );
      const existing = await db.user.findUnique({
        where: { email: profile.email.toLowerCase() },
      });
      assert(!existing, "OAUTH_LINK_REQUIRES_EXISTING_LOGIN", 409);
      const user = await db.user.create({
        data: {
          username: "u_" + randomBytes(8).toString("hex"),
          email: profile.email.toLowerCase(),
          displayName: profile.name ?? "Kỳ thủ",
          identities: {
            create: { provider, subject: (profile.sub ?? profile.id)! },
          },
        },
      });
      return this.issue(user.id, null, res);
    });
    res.clearCookie("oauth_state", {
      ...cookieOptions,
      path: "/api/auth/oauth",
    });
    res.clearCookie("oauth_verifier", {
      ...cookieOptions,
      path: "/api/auth/oauth",
    });
    res.clearCookie("oauth_link", {
      ...cookieOptions,
      sameSite: "lax",
      path: "/api/auth/oauth",
    });
    res.clearCookie("oauth_provider", {
      ...cookieOptions,
      sameSite: "lax",
      path: "/api/auth/oauth",
    });
    void result;
    res.redirect(process.env.APP_URL! + "/?oauth=success");
  }
}
