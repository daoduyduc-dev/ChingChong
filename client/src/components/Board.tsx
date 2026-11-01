import { useMemo, useRef, useState } from "react";
import {
  labels,
  legal,
  names,
  inCheck,
  type Move,
  type Position,
  type Side,
} from "../../../shared/chess";
export function Board({
  position,
  side = "red",
  enabled = false,
  onMove,
  lastMove,
}: {
  position: Position;
  side?: Side;
  enabled?: boolean;
  onMove?: (m: Move) => void;
  lastMove?: Move;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [focused, setFocused] = useState(side === "red" ? 85 : 4);
  const [zoom, setZoom] = useState(false);
  const squares = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = useMemo(
    () => inCheck(position.board, position.turn),
    [position.board, position.turn],
  );
  const targets = useMemo(
    () =>
      selected === null
        ? []
        : Array.from({ length: 90 }, (_, to) => to).filter((to) =>
            legal(position, { from: selected, to }),
          ),
    [selected, position],
  );
  const click = (index: number) => {
    if (!enabled) return;
    if (selected !== null && targets.includes(index)) {
      onMove?.({ from: selected, to: index });
      setSelected(null);
    } else
      setSelected(position.board[index]?.side === position.turn ? index : null);
  };
  return (
    <>
      <div className="board-zoom-controls">
        <button
          type="button"
          aria-pressed={zoom}
          onClick={() => setZoom(!zoom)}
        >
          {zoom ? "Thu gọn bàn cờ" : "Phóng to bàn cờ"}
        </button>
        <small>
          Phím mũi tên: di chuyển · Enter/Space: chọn · Esc: bỏ chọn.
        </small>
      </div>
      <div
        className={`board-scroll ${zoom ? "board-zoomed" : ""}`}
        role="region"
        aria-label="Bàn cờ tướng, có thể cuộn khi phóng to"
      >
        <div
          className="board"
          data-testid="board"
          style={zoom ? { minWidth: 520 } : undefined}
        >
          <svg viewBox="0 0 900 1000" aria-hidden="true">
            <rect
              x="44"
              y="44"
              width="812"
              height="912"
              fill="none"
              stroke="#6e6148"
              strokeWidth="3"
            />
            {Array.from({ length: 10 }, (_, y) => (
              <line
                key={"r" + y}
                x1="50"
                y1={50 + y * 100}
                x2="850"
                y2={50 + y * 100}
                stroke="#8e7c58"
                strokeWidth="2"
              />
            ))}
            {Array.from({ length: 9 }, (_, x) => (
              <g key={"c" + x}>
                <line
                  x1={50 + x * 100}
                  y1="50"
                  x2={50 + x * 100}
                  y2="450"
                  stroke="#8e7c58"
                  strokeWidth="2"
                />
                <line
                  x1={50 + x * 100}
                  y1="550"
                  x2={50 + x * 100}
                  y2="950"
                  stroke="#8e7c58"
                  strokeWidth="2"
                />
              </g>
            ))}
            {[0, 700].map((y) => (
              <g key={y}>
                <line
                  x1="350"
                  y1={50 + y}
                  x2="550"
                  y2={250 + y}
                  stroke="#8e7c58"
                  strokeWidth="2"
                />
                <line
                  x1="550"
                  y1={50 + y}
                  x2="350"
                  y2={250 + y}
                  stroke="#8e7c58"
                  strokeWidth="2"
                />
              </g>
            ))}
            <text
              x="220"
              y="517"
              fontSize="42"
              fill="#8c7a55"
              fontFamily="serif"
              letterSpacing="10"
            >
              楚 河
            </text>
            <text
              x="570"
              y="517"
              fontSize="42"
              fill="#8c7a55"
              fontFamily="serif"
              letterSpacing="10"
            >
              漢 界
            </text>
          </svg>
          {position.board.map((piece, i) => {
            const display =
                side === "red"
                  ? Math.floor(i / 9) * 9 + 8 - (i % 9)
                  : (9 - Math.floor(i / 9)) * 9 + (i % 9),
              x = display % 9,
              y = Math.floor(display / 9),
              target = targets.includes(i),
              last = lastMove?.from === i || lastMove?.to === i;
            const isChecked =
              checked && piece?.kind === "K" && piece.side === position.turn;
            return (
              <button
                type="button"
                key={i}
                ref={(element) => {
                  squares.current[i] = element;
                }}
                tabIndex={focused === i ? 0 : -1}
                onFocus={() => setFocused(i)}
                aria-pressed={selected === i}
                data-testid={"square-" + i}
                aria-label={`${piece ? `${names[piece.kind]} ${piece.side === "red" ? "Đỏ" : "Đen"}` : "Ô trống"}, cột ${(i % 9) + 1}, hàng ${Math.floor(i / 9) + 1}${target ? (piece ? ", có thể ăn quân" : ", có thể đi") : ""}${isChecked ? ", đang bị chiếu" : ""}`}
                className={`square ${piece ? "piece " + piece.side : ""} ${selected === i ? "selected" : ""} ${target ? "target" : ""} ${target && piece ? "capture-target" : ""} ${last ? "last" : ""} ${lastMove?.from === i ? "last-from" : ""} ${lastMove?.to === i ? "last-to" : ""} ${isChecked ? "checked-king" : ""}`}
                style={{
                  left: `${((x + 0.5) / 9) * 100}%`,
                  top: `${((y + 0.5) / 10) * 100}%`,
                }}
                onClick={() => click(i)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSelected(null);
                    event.preventDefault();
                    return;
                  }
                  const directions: Record<string, [number, number]> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  };
                  const direction = directions[event.key];
                  if (!direction) return;
                  event.preventDefault();
                  const nextX = Math.max(0, Math.min(8, x + direction[0])),
                    nextY = Math.max(0, Math.min(9, y + direction[1]));
                  const next =
                    side === "red"
                      ? nextY * 9 + 8 - nextX
                      : (9 - nextY) * 9 + nextX;
                  setFocused(next);
                  squares.current[next]?.focus();
                }}
              >
                <span aria-hidden="true">
                  {piece ? labels[piece.side][piece.kind] : target ? "•" : ""}
                </span>
                {target && piece && (
                  <span className="capture-marker" aria-hidden="true">
                    ×
                  </span>
                )}
                {isChecked && (
                  <span className="check-marker" aria-hidden="true">
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
