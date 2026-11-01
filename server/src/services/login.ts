import type { Response } from "express";
import { AuthService, hash } from "./auth";
import { GameService } from "./game";
import { DomainError } from "../common/errors";
import {
  findSessionByRefreshHash,
  revokeSession,
} from "../repositories/session";

export async function loginWithGuest(
  auth: AuthService,
  game: GameService,
  refresh: string | undefined,
  input: unknown,
  res: Response,
) {
  const old = refresh ? await findSessionByRefreshHash(hash(refresh)) : null;
  const guest =
    old?.guestId && !old.revokedAt ? await auth.actorForSession(old.id) : null;
  const result = await auth.login(input, res);
  let mergeWarning: string | undefined;
  if (
    typeof input === "object" &&
    input !== null &&
    "mergeGuest" in input &&
    input.mergeGuest === true &&
    guest
  ) {
    try {
      await game.convertGuest(guest, result.actor);
    } catch (e) {
      if (
        e instanceof DomainError &&
        ["ALREADY_PLAYING", "ALREADY_IN_ROOM"].includes(e.code)
      ) {
        mergeWarning =
          "Không thể gộp Guest vì tài khoản đang bận. Dữ liệu User được giữ nguyên.";
        await revokeSession(guest.sessionId);
      } else throw e;
    }
    await auth.onRevoke(guest.sessionId);
  }
  return { ...result, ...(mergeWarning ? { mergeWarning } : {}) };
}
