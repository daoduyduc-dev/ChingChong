import { describe, it, expect } from "vitest";
import {
  initial,
  inCheck,
  legal,
  moves,
  play,
  pseudo,
  outcome,
  positionKey,
  fen,
  type Position,
  type Piece,
} from "../shared/chess";
import { choose } from "../shared/ai";
function fixture(
  pieces: Record<number, Piece>,
  turn: "red" | "black" = "red",
): Position {
  const board = Array(90).fill(null);
  for (const [i, p] of Object.entries(pieces)) board[Number(i)] = p;
  return { board, turn, history: [], initialKey: positionKey(board, turn) };
}
const rk = { side: "red", kind: "K" } as const,
  bk = { side: "black", kind: "K" } as const;
describe("Xiangqi independent rule fixtures", () => {
  it("initial 32 pieces, red starts, FEN, 44 legal moves", () => {
    const p = initial();
    expect(p.board.filter(Boolean)).toHaveLength(32);
    expect(p.turn).toBe("red");
    expect(moves(p)).toHaveLength(44);
    expect(fen(p)).toBe(
      "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
    );
  });
  it("TC-026 horse leg", () => {
    const p = initial();
    expect(pseudo(p.board, 82, 65)).toBe(true);
    p.board[73] = { side: "red", kind: "P" };
    expect(pseudo(p.board, 82, 65)).toBe(false);
  });
  it("TC-026 elephant eye and river", () => {
    const p = initial();
    expect(pseudo(p.board, 83, 67)).toBe(true);
    p.board[75] = { side: "red", kind: "P" };
    expect(pseudo(p.board, 83, 67)).toBe(false);
    const b = Array(90).fill(null);
    b[47] = { side: "red", kind: "E" };
    expect(pseudo(b, 47, 31)).toBe(false);
  });
  it("TC-027 cannon capture needs exactly one screen", () => {
    const b = Array(90).fill(null);
    b[81] = { side: "red", kind: "C" };
    b[0] = { side: "black", kind: "R" };
    expect(pseudo(b, 81, 0)).toBe(false);
    b[45] = { side: "red", kind: "P" };
    expect(pseudo(b, 81, 0)).toBe(true);
    b[27] = { side: "black", kind: "P" };
    expect(pseudo(b, 81, 0)).toBe(false);
  });
  it("TC-028 pawn river and backward restriction", () => {
    const b = Array(90).fill(null);
    b[54] = { side: "red", kind: "P" };
    expect(pseudo(b, 54, 55)).toBe(false);
    expect(pseudo(b, 54, 45)).toBe(true);
    b[36] = b[54];
    expect(pseudo(b, 36, 37)).toBe(true);
    expect(pseudo(b, 36, 45)).toBe(false);
  });
  it("king/advisor palace", () => {
    const b = Array(90).fill(null);
    b[66] = rk;
    b[67] = { side: "red", kind: "A" };
    expect(pseudo(b, 66, 65)).toBe(false);
    expect(pseudo(b, 67, 57)).toBe(false);
    expect(pseudo(b, 67, 75)).toBe(true);
  });
  it("rook line blocker", () => {
    const p = initial();
    expect(pseudo(p.board, 81, 45)).toBe(false);
    expect(pseudo(p.board, 81, 72)).toBe(true);
  });
  it("TC-029 exposing facing generals", () => {
    const p = fixture({ 85: rk, 4: bk, 49: { side: "red", kind: "R" } });
    expect(legal(p, { from: 49, to: 48 })).toBe(false);
    expect(inCheck(p.board, "red")).toBe(false);
  });
  it("TC-030 self check and check evasions", () => {
    const p = fixture({
      85: rk,
      3: bk,
      4: { side: "black", kind: "R" },
      49: { side: "red", kind: "R" },
    });
    expect(legal(p, { from: 49, to: 48 })).toBe(false);
    expect(legal(p, { from: 49, to: 4 })).toBe(true);
  });
  it("TC-031 checkmate fixture", () => {
    const p = fixture({
      85: rk,
      3: bk,
      67: { side: "black", kind: "R" },
      75: { side: "black", kind: "R" },
      77: { side: "black", kind: "R" },
    });
    expect(inCheck(p.board, "red")).toBe(true);
    expect(outcome(p)).toEqual({ winner: "black", reason: "CHECKMATE" });
  });
  it("TC-031 stalemate fixture", () => {
    const p = fixture({
      85: rk,
      3: bk,
      75: { side: "black", kind: "R" },
      77: { side: "black", kind: "R" },
      58: { side: "black", kind: "P" },
    });
    expect(inCheck(p.board, "red")).toBe(false);
    expect(outcome(p)).toEqual({ winner: "black", reason: "STALEMATE" });
  });
  it("TC-032 third repeated continuous checking cycle blocked", () => {
    let p = fixture({
      85: rk,
      4: bk,
      49: { side: "red", kind: "P" },
      12: { side: "red", kind: "R" },
    });
    const cycle = [
      { from: 12, to: 13 },
      { from: 4, to: 3 },
      { from: 13, to: 12 },
      { from: 3, to: 4 },
    ];
    for (const m of [...cycle, ...cycle]) p = play(p, m);
    expect(legal(p, cycle[0])).toBe(false);
    expect(legal(p, { from: 12, to: 21 })).toBe(true);
  });
  it("TC-033 nonchecking repetitions never automatically draw", () => {
    let p = initial();
    const cycle = [
      { from: 82, to: 65 },
      { from: 1, to: 20 },
      { from: 65, to: 82 },
      { from: 20, to: 1 },
    ];
    for (let i = 0; i < 16; i++) for (const m of cycle) p = play(p, m);
    expect(p.history.length).toBe(64);
    expect(outcome(p)).toBeNull();
  });
  it("invalid coordinates, empty source, own target and wrong side rejected", () => {
    const p = initial();
    for (const move of [
      { from: -1, to: 2 },
      { from: 90, to: 4 },
      { from: 0, to: 9 },
      { from: 40, to: 31 },
      { from: 81, to: 82 },
    ])
      expect(legal(p, move)).toBe(false);
  });
  it.each(["easy", "medium", "hard"] as const)(
    "AI %s returns legal move within budget",
    (level) => {
      const p = initial(),
        r = choose(p, level);
      expect(r.move).not.toBeNull();
      expect(legal(p, r.move!)).toBe(true);
      expect(r.ms).toBeLessThan(2000);
    },
  );
});
