import {
  applyBoard,
  inCheck,
  moves,
  other,
  play,
  type Move,
  type Position,
  type Side,
} from "./chess";
const values = { K: 100000, A: 120, E: 120, R: 900, C: 450, H: 400, P: 100 };
export type Level = "easy" | "medium" | "hard";
export function evaluate(p: Position, side: Side) {
  return p.board.reduce((sum, piece, i) => {
    if (!piece) return sum;
    const progress =
      piece.side === "red" ? 9 - Math.floor(i / 9) : Math.floor(i / 9);
    return (
      sum +
      (piece.side === side ? 1 : -1) *
        (values[piece.kind] + (piece.kind === "P" ? progress * 10 : 0))
    );
  }, 0);
}
export function choose(
  p: Position,
  level: Level,
  budgetOverride?: number,
): { move: Move | null; nodes: number; depth: number; ms: number } {
  const start = performance.now(),
    budget = budgetOverride ?? { easy: 60, medium: 350, hard: 1300 }[level],
    max = { easy: 1, medium: 2, hard: 4 }[level];
  let nodes = 0,
    best: Move | null = null,
    depth = 0;
  const ordered = (pos: Position) =>
    moves(pos).sort((a, b) => {
      const score = (m: Move) =>
        (pos.board[m.to] ? values[pos.board[m.to]!.kind] : 0) +
        (inCheck(applyBoard(pos.board, m), other(pos.turn)) ? 30 : 0);
      return score(b) - score(a);
    });
  function search(
    pos: Position,
    d: number,
    alpha: number,
    beta: number,
  ): number {
    nodes++;
    if (performance.now() - start > budget) throw Error("SEARCH_TIMEOUT");
    if (d === 0) return evaluate(pos, pos.turn);
    const ms = ordered(pos);
    if (!ms.length) return -100000 - d;
    let value = -Infinity;
    for (const m of ms) {
      value = Math.max(value, -search(play(pos, m), d - 1, -beta, -alpha));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  const ms = ordered(p);
  best = ms[0] ?? null;
  for (let d = 1; d <= max; d++) {
    let local: Move | null = best,
      score = -Infinity;
    try {
      for (const m of ms) {
        const s = -search(play(p, m), d - 1, -Infinity, -score);
        if (s > score) {
          score = s;
          local = m;
        }
      }
      best = local;
      depth = d;
    } catch {
      break;
    }
  }
  return { move: best, nodes, depth, ms: performance.now() - start };
}
