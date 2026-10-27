import { get, set } from "idb-keyval";
import { initial, play, type Position } from "../shared/chess";
import type { Actor } from "../shared/domain";
export type LocalGame = {
  position: Position;
  human: "red" | "black";
  level: "easy" | "medium" | "hard";
};
export async function loadLocal(
  actor: Actor | null,
): Promise<LocalGame | null> {
  let value: LocalGame | undefined;
  try {
    value =
      actor && !actor.guest
        ? await get("ai:" + actor.id)
        : JSON.parse(sessionStorage.getItem("ai:guest") ?? "null");
    if (!value) return null;
    if (
      !["red", "black"].includes(value.human) ||
      !["easy", "medium", "hard"].includes(value.level) ||
      !Array.isArray(value.position?.history)
    )
      throw Error("LOCAL_SNAPSHOT_INVALID");
    const rebuilt = value.position.history.reduce(
      (p, m) => play(p, m),
      initial(),
    );
    if (
      JSON.stringify(rebuilt.board) !== JSON.stringify(value.position.board) ||
      rebuilt.turn !== value.position.turn
    )
      throw Error("LOCAL_SNAPSHOT_INVALID");
    return { ...value, position: rebuilt };
  } catch {
    throw Error("Dữ liệu ván cục bộ không hợp lệ hoặc bộ nhớ không khả dụng.");
  }
}
export async function saveLocal(actor: Actor | null, value: LocalGame) {
  if (actor && !actor.guest) await set("ai:" + actor.id, value);
  else sessionStorage.setItem("ai:guest", JSON.stringify(value));
}
