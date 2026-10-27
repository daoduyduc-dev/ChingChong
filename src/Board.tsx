import { useState } from "react";
import {
  labels,
  legal,
  names,
  type Move,
  type Position,
  type Side,
} from "../shared/chess";
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
  const targets =
    selected === null
      ? []
      : Array.from({ length: 90 }, (_, to) => to).filter((to) =>
          legal(position, { from: selected, to }),
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
    <div className="board" data-testid="board">
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
        return (
          <button
            key={i}
            data-testid={"square-" + i}
            aria-label={
              piece
                ? `${piece.side === "red" ? "Đỏ" : "Đen"} ${names[piece.kind]} ${i % 9},${Math.floor(i / 9)}`
                : `Ô ${i % 9},${Math.floor(i / 9)}`
            }
            className={`square ${piece ? "piece " + piece.side : ""} ${selected === i ? "selected" : ""} ${target ? "target" : ""} ${last ? "last" : ""}`}
            style={{
              left: `${((x + 0.5) / 9) * 100}%`,
              top: `${((y + 0.5) / 10) * 100}%`,
            }}
            onClick={() => click(i)}
          >
            {piece ? labels[piece.side][piece.kind] : target ? "•" : ""}
          </button>
        );
      })}
    </div>
  );
}
