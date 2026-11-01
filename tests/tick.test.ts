import { afterEach, expect, it, vi } from "vitest";
import { GameService } from "../server/src/services/game";
import { db } from "../server/src/database/db";

afterEach(() => vi.restoreAllMocks());

it("slow database ticks do not accumulate ahead of player actions", async () => {
  const game = new GameService();
  const events: string[] = [];
  let release!: () => void;
  const slowQuery = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(db.room, "findMany").mockImplementation(
    () =>
      slowQuery.then(() => {
        events.push("tick");
        return [];
      }) as ReturnType<typeof db.room.findMany>,
  );
  vi.spyOn(db.match, "findMany").mockResolvedValue([]);
  const ticks = [game.tick(), game.tick(), game.tick()];
  const action = game.serial(async () => {
    events.push("player action");
  });
  release();
  await Promise.all([...ticks, action]);
  expect(events).toEqual(["tick", "player action"]);
  await game.tick();
  expect(events).toEqual(["tick", "player action", "tick"]);
});

it("a failed tick can be retried for database recovery", async () => {
  const game = new GameService();
  vi.spyOn(db.room, "findMany")
    .mockRejectedValueOnce(new Error("database unavailable"))
    .mockResolvedValue([]);
  vi.spyOn(db.match, "findMany").mockResolvedValue([]);
  await expect(game.tick()).rejects.toThrow("database unavailable");
  await expect(game.tick()).resolves.toBeUndefined();
});
