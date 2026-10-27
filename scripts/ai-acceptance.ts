import { choose, evaluate, type Level } from "../shared/ai";
import {
  initial,
  play,
  legal,
  inCheck,
  positionKey,
  type Piece,
  type Position,
} from "../shared/chess";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
function fixture(pieces: Record<number, Piece>): Position {
  const board: Position["board"] = Array(90).fill(null);
  for (const [square, piece] of Object.entries(pieces))
    board[Number(square)] = piece;
  return {
    board,
    turn: "red",
    history: [],
    initialKey: positionKey(board, "red"),
  };
}
const base = {
  85: { side: "red", kind: "K" },
  4: { side: "black", kind: "K" },
  49: { side: "red", kind: "P" },
} as const;
const cases = [
  { name: "opening", p: initial() },
  {
    name: "free-rook",
    p: fixture({
      ...base,
      81: { side: "red", kind: "R" },
      63: { side: "black", kind: "R" },
    }),
  },
  {
    name: "poisoned-pawn",
    p: fixture({
      ...base,
      81: { side: "red", kind: "R" },
      63: { side: "black", kind: "P" },
      54: { side: "black", kind: "R" },
    }),
  },
  {
    name: "escape-check",
    p: fixture({
      ...base,
      76: { side: "black", kind: "R" },
      67: { side: "black", kind: "R" },
      81: { side: "red", kind: "R" },
    }),
  },
];
const samples = [];
for (const c of cases)
  for (const level of ["easy", "medium", "hard"] as Level[]) {
    const cpu = process.cpuUsage(),
      before = process.memoryUsage();
    const result = choose(c.p, level),
      used = process.cpuUsage(cpu),
      after = process.memoryUsage();
    const valid = !!result.move && legal(c.p, result.move),
      next = valid ? play(c.p, result.move!) : null;
    samples.push({
      case: c.name,
      level,
      ...result,
      legal: valid,
      startedInCheck: inCheck(c.p.board, "red"),
      endedInCheck: next ? inCheck(next.board, "red") : null,
      capturesFreeRook: c.name === "free-rook" ? result.move?.to === 63 : null,
      avoidsPoisonedPawn:
        c.name === "poisoned-pawn" ? result.move?.to !== 63 : null,
      immediateMaterialDelta: next
        ? evaluate(next, "red") - evaluate(c.p, "red")
        : null,
      processCPUms: (used.user + used.system) / 1000,
      rssBeforeMB: before.rss / 1048576,
      rssAfterMB: after.rss / 1048576,
    });
  }
const report = {
  date: new Date().toISOString(),
  environment: {
    cpu: cpus()[0]?.model,
    memoryGB: totalmem() / 1024 ** 3,
    node: process.version,
  },
  scope:
    "Synthetic tactical fixtures in Node, endpoint process RSS (not peak/Worker RAM); no Elo or human strength inference",
  samples,
};
writeFileSync(
  "docs/implementation/ai-acceptance.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
