import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ChessKnight,
  Bot,
  Bookmark,
  History,
  Users,
  CircleUserRound,
  Settings,
  Menu,
} from "lucide-react";
export type Page =
  | "lobby"
  | "game"
  | "ai"
  | "saved"
  | "history"
  | "friends"
  | "profile"
  | "publicProfile"
  | "admin";
const entries = [
  { page: "lobby", label: "Sảnh cờ", Icon: LayoutDashboard },
  { page: "game", label: "Bàn cờ", Icon: ChessKnight },
  { page: "ai", label: "Luyện tập với máy", Icon: Bot },
  { page: "history", label: "Lịch sử & kỳ phổ", Icon: History },
  { page: "saved", label: "Ván đã lưu", Icon: Bookmark },
  { page: "friends", label: "Bạn bè", Icon: Users },
  { page: "profile", label: "Hồ sơ", Icon: CircleUserRound },
  { page: "admin", label: "Quản trị", Icon: Settings },
] as const;
export function Navigation({
  page,
  admin,
  restoring,
  onNavigate,
}: {
  page: Page;
  admin: boolean;
  restoring: boolean;
  onNavigate: (page: Page) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      ) {
        setExpanded(false);
        if (
          event instanceof KeyboardEvent &&
          root.current?.classList.contains("more-expanded")
        )
          more.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <nav
      ref={root}
      id="primary-navigation"
      aria-label="Điều hướng chính"
      className={expanded ? "navigation more-expanded" : "navigation"}
    >
      {entries
        .filter((entry) => admin || entry.page !== "admin")
        .map((entry, index) => (
          <button
            key={entry.page}
            title={entry.label}
            aria-label={entry.label}
            aria-current={page === entry.page ? "page" : undefined}
            className={
              (page === entry.page ? "active " : "") +
              (index >= 4 ? "nav-extra" : "nav-main")
            }
            disabled={
              restoring && !["lobby", "game", "ai"].includes(entry.page)
            }
            onClick={() => {
              setExpanded(false);
              onNavigate(entry.page);
            }}
          >
            <span aria-hidden="true">
              <entry.Icon size={21} />
            </span>
            <span className="nav-text">{entry.label}</span>
          </button>
        ))}
      <button
        className="nav-more"
        ref={more}
        aria-controls="primary-navigation"
        aria-expanded={expanded}
        aria-label="Thêm mục điều hướng"
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">
          <Menu size={21} />
        </span>
        <span>Thêm</span>
      </button>
    </nav>
  );
}
