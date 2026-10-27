export type Side = "red" | "black";
export type Kind = "K" | "A" | "E" | "R" | "C" | "H" | "P";
export type Piece = { side: Side; kind: Kind };
export type Board = (Piece | null)[];
export type Move = { from: number; to: number };
export type Ply = Move & {
  side: Side;
  check: boolean;
  key: string;
  notation?: string;
  piece?: Kind;
  captured?: Piece | null;
};
export type Position = {
  board: Board;
  turn: Side;
  history: Ply[];
  initialKey: string;
};
export const other = (s: Side): Side => (s === "red" ? "black" : "red");
export const labels: Record<Side, Record<Kind, string>> = {
  red: { K: "帥", A: "仕", E: "相", R: "俥", C: "炮", H: "傌", P: "兵" },
  black: { K: "將", A: "士", E: "象", R: "車", C: "砲", H: "馬", P: "卒" },
};
export const names: Record<Kind, string> = {
  K: "Tướng",
  A: "Sĩ",
  E: "Tượng",
  R: "Xe",
  C: "Pháo",
  H: "Mã",
  P: "Tốt",
};
export function positionKey(b: Board, turn: Side) {
  return (
    b
      .map((p) =>
        p ? (p.side === "red" ? p.kind : p.kind.toLowerCase()) : ".",
      )
      .join("") + turn
  );
}
export function initial(): Position {
  const board: Board = Array(90).fill(null);
  const row: Kind[] = ["R", "H", "E", "A", "K", "A", "E", "H", "R"];
  for (const side of ["black", "red"] as const) {
    const y = side === "black" ? 0 : 9;
    row.forEach((kind, x) => (board[y * 9 + x] = { side, kind }));
    for (const x of [1, 7])
      board[(side === "black" ? 2 : 7) * 9 + x] = { side, kind: "C" };
    for (const x of [0, 2, 4, 6, 8])
      board[(side === "black" ? 3 : 6) * 9 + x] = { side, kind: "P" };
  }
  return {
    board,
    turn: "red",
    history: [],
    initialKey: positionKey(board, "red"),
  };
}
function palace(x: number, y: number, s: Side) {
  return (
    x >= 3 && x <= 5 && (s === "red" ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
  );
}
export function pseudo(board: Board, from: number, to: number): boolean {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= 90 ||
    to < 0 ||
    to >= 90 ||
    from === to
  )
    return false;
  const p = board[from],
    target = board[to];
  if (!p || target?.side === p.side) return false;
  const x = from % 9,
    y = Math.floor(from / 9),
    tx = to % 9,
    ty = Math.floor(to / 9),
    dx = tx - x,
    dy = ty - y,
    ax = Math.abs(dx),
    ay = Math.abs(dy);
  let screens = 0;
  if (dx === 0 || dy === 0) {
    const step = dx === 0 ? Math.sign(dy) * 9 : Math.sign(dx);
    for (let i = from + step; i !== to; i += step) if (board[i]) screens++;
  }
  switch (p.kind) {
    case "K":
      return palace(tx, ty, p.side) && ax + ay === 1;
    case "A":
      return palace(tx, ty, p.side) && ax === 1 && ay === 1;
    case "E":
      return (
        ax === 2 &&
        ay === 2 &&
        (p.side === "red" ? ty >= 5 : ty <= 4) &&
        !board[(y + dy / 2) * 9 + x + dx / 2]
      );
    case "H":
      return ax === 2 && ay === 1
        ? !board[y * 9 + x + Math.sign(dx)]
        : ax === 1 && ay === 2 && !board[(y + Math.sign(dy)) * 9 + x];
    case "R":
      return (dx === 0 || dy === 0) && screens === 0;
    case "C":
      return (dx === 0 || dy === 0) && screens === (target ? 1 : 0);
    case "P":
      return (
        (dx === 0 && dy === (p.side === "red" ? -1 : 1)) ||
        ((p.side === "red" ? y <= 4 : y >= 5) && ay === 0 && ax === 1)
      );
  }
}
export function inCheck(board: Board, side: Side): boolean {
  const k = board.findIndex((p) => p?.side === side && p.kind === "K");
  if (k < 0) return true;
  const opp = board.findIndex((p) => p?.side === other(side) && p.kind === "K");
  if (opp >= 0 && k % 9 === opp % 9) {
    let clear = true;
    for (let n = Math.min(k, opp) + 9; n < Math.max(k, opp); n += 9)
      if (board[n]) clear = false;
    if (clear) return true;
  }
  return board.some((p, i) => p?.side === other(side) && pseudo(board, i, k));
}
export function applyBoard(board: Board, m: Move): Board {
  const b = board.slice();
  b[m.to] = b[m.from];
  b[m.from] = null;
  return b;
}
export function legal(p: Position, m: Move): boolean {
  if (
    p.board[m.from]?.side !== p.turn ||
    p.board[m.to]?.kind === "K" ||
    !pseudo(p.board, m.from, m.to)
  )
    return false;
  const b = applyBoard(p.board, m);
  if (inCheck(b, p.turn)) return false;
  const key = positionKey(b, other(p.turn));
  const keys = [p.initialKey, ...p.history.map((h) => h.key)];
  const occurrences = keys
    .map((k, i) => (k === key ? i : -1))
    .filter((i) => i >= 0);
  if (occurrences.length >= 2 && inCheck(b, other(p.turn))) {
    const cycle = p.history.slice(occurrences.at(-1)!);
    const own = cycle.filter((h) => h.side === p.turn);
    if (own.length > 0 && own.every((h) => h.check)) return false;
  }
  return true;
}
export function moves(p: Position): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < 90; from++)
    if (p.board[from]?.side === p.turn)
      for (let to = 0; to < 90; to++)
        if (legal(p, { from, to })) out.push({ from, to });
  return out;
}
export function play(p: Position, m: Move): Position {
  if (!legal(p, m)) throw Error("ILLEGAL_MOVE");
  const board = applyBoard(p.board, m),
    turn = other(p.turn);
  return {
    board,
    turn,
    initialKey: p.initialKey,
    history: [
      ...p.history,
      {
        ...m,
        piece: p.board[m.from]!.kind,
        captured: p.board[m.to],
        notation: `${names[p.board[m.from]!.kind]} (${m.from % 9},${Math.floor(m.from / 9)}) → (${m.to % 9},${Math.floor(m.to / 9)})`,
        side: p.turn,
        check: inCheck(board, turn),
        key: positionKey(board, turn),
      },
    ],
  };
}
export function restore(log: Move[]): Position {
  return log.reduce((p, m) => play(p, m), initial());
}
export function outcome(p: Position) {
  return moves(p).length
    ? null
    : {
        winner: other(p.turn),
        reason: inCheck(p.board, p.turn) ? "CHECKMATE" : "STALEMATE",
      };
}
export function fen(p: Position) {
  let out = "";
  for (let y = 0; y < 10; y++) {
    let empty = 0;
    for (let x = 0; x < 9; x++) {
      const piece = p.board[y * 9 + x];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        out += empty;
        empty = 0;
      }
      const k =
        ({ H: "N", E: "B" } as Partial<Record<Kind, string>>)[piece.kind] ??
        piece.kind;
      out += piece.side === "red" ? k : k.toLowerCase();
    }
    if (empty) out += empty;
    if (y < 9) out += "/";
  }
  return out + " " + (p.turn === "red" ? "w" : "b");
}
