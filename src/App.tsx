import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import QRCode from "qrcode";
import {
  api,
  connect,
  disconnect,
  emit,
  message,
  refresh,
  socket,
  onSessionChanged,
} from "./api";
import { Board } from "./Board";
import { Video } from "./Video";
import {
  initial,
  inCheck,
  legal,
  outcome,
  play,
  restore,
  type Move,
  type Side,
} from "../shared/chess";
import type {
  Actor,
  MatchState,
  RequestKind,
  RoomState,
} from "../shared/domain";
import { loadLocal, saveLocal, type LocalGame } from "./local";
type Page =
  | "lobby"
  | "game"
  | "ai"
  | "saved"
  | "history"
  | "friends"
  | "profile"
  | "admin";
const minutes = [0, 5, 10, 15, 30];
const levelNames = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
const kindNames = {
  SAVE: "lưu ván",
  RESUME: "tiếp tục ván",
  DRAW: "hòa",
  UNDO: "hoàn tác",
  VIDEO: "gọi video",
};
const statusNames: Record<string, string> = {
  ACTIVE: "Đang chơi",
  PAUSED_RECONNECT: "Chờ kết nối lại",
  SAVED: "Đã lưu",
  RESUMING: "Chờ sẵn sàng",
  FINISHED: "Đã kết thúc",
  CANCELED: "Đã hủy",
  WAITING: "Chờ kỳ thủ",
  COUNTDOWN: "Đếm ngược",
  IN_MATCH: "Đang thi đấu",
  POST_MATCH: "Chờ tái đấu",
  CLOSED: "Đã đóng",
};
const reasonNames: Record<string, string> = {
  CHECKMATE: "Chiếu bí",
  STALEMATE: "Hết nước hợp lệ",
  TIMEOUT: "Hết giờ",
  DISCONNECT_LOSS: "Quá hạn kết nối",
  AGREED_DRAW: "Hai bên đồng ý hòa",
  RESIGNATION: "Đầu hàng",
  BOTH_DISCONNECTED: "Cả hai mất kết nối quá hạn",
  SERVER_RECOVERY: "Hủy an toàn sau sự cố máy chủ",
};
function time(value: number | null | undefined) {
  if (value === null || value === undefined) return "∞";
  const s = Math.max(0, Math.ceil(value / 1000));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <span>♧</span>
      <p>{children}</p>
    </div>
  );
}
export function App() {
  const [actor, setActor] = useState<Actor | null>(null),
    [page, setPage] = useState<Page>("lobby"),
    [room, setRoomRaw] = useState<RoomState | null>(null),
    [searchMinutes, setSearchMinutes] = useState(10),
    [match, setMatchRaw] = useState<MatchState | null>(null),
    [rooms, setRooms] = useState<RoomState[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [serviceUnavailable, setServiceUnavailable] = useState(false),
    [authMode, setAuthMode] = useState<
      "login" | "register" | "forgot" | "reset" | null
    >(new URLSearchParams(location.search).has("reset") ? "reset" : null),
    [config, setConfig] = useState<any>({ oauth: {}, smtp: false }),
    [notifications, setNotifications] = useState<any[]>([]),
    [notificationOpen, setNotificationOpen] = useState(false),
    [records, setRecords] = useState<MatchState[]>([]),
    [recordFilter, setRecordFilter] = useState({
      opponent: "",
      date: "",
      result: "all",
    }),
    [replay, setReplay] = useState<{
      match: MatchState;
      index: number;
      side: Side;
      playing: boolean;
    } | null>(null),
    [friends, setFriends] = useState<any[]>([]),
    [searchResults, setSearchResults] = useState<any[]>([]),
    [profile, setProfile] = useState<any>(null),
    [admin, setAdmin] = useState<{
      users: any[];
      reports: any[];
      audit: any[];
    }>({ users: [], reports: [], audit: [] });
  const [local, setLocal] = useState<LocalGame>({
      position: initial(),
      human: "red",
      level: "medium",
    }),
    [thinking, setThinking] = useState(false),
    [hint, setHint] = useState<Move | undefined>(),
    [offlineReady, setOfflineReady] = useState(false),
    [hasLocal, setHasLocal] = useState(false),
    [aiStarted, setAiStarted] = useState(false),
    [chatVisible, setChatVisible] = useState(true),
    [clockNow, setClockNow] = useState(performance.now());
  const worker = useRef<Worker | null>(null),
    roomReceived = useRef(performance.now()),
    matchReceived = useRef(performance.now()),
    hintWorker = useRef<Worker | null>(null),
    workerGeneration = useRef(0),
    localRef = useRef(local),
    actorRef = useRef(actor),
    matchRef = useRef(match);
  localRef.current = local;
  actorRef.current = actor;
  matchRef.current = match;
  const setRoom = useCallback((incoming: RoomState | null) => {
    roomReceived.current = performance.now();
    setRoomRaw(incoming);
  }, []);
  const setMatch = useCallback(
    (incoming: MatchState | null) =>
      setMatchRaw((prev) => {
        if (incoming && prev) {
          if (
            incoming.id === prev.id &&
            (incoming.version < prev.version ||
              (incoming.version === prev.version &&
                incoming.lastTick < prev.lastTick))
          )
            return prev;
          if (
            incoming.id !== prev.id &&
            ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"].includes(prev.status) &&
            incoming.lastTick < prev.lastTick
          )
            return prev;
          if (
            incoming.id === prev.id &&
            incoming.version === prev.version &&
            (incoming.chatVersion ?? 0) < (prev.chatVersion ?? 0)
          )
            incoming = {
              ...incoming,
              messages: prev.messages,
              chatVersion: prev.chatVersion,
            };
        }
        matchReceived.current = performance.now();
        return incoming;
      }),
    [],
  );
  const clearViews = useCallback(() => {
    worker.current?.terminate();
    hintWorker.current?.terminate();
    workerGeneration.current++;
    setThinking(false);
    setHint(undefined);
    setAiStarted(false);
    setLocal({ position: initial(), human: "red", level: "medium" });
    setHasLocal(false);
    setRecords([]);
    setReplay(null);
    setFriends([]);
    setSearchResults([]);
    setProfile(null);
    setAdmin({ users: [], reports: [], audit: [] });
    setNotifications([]);
    setRooms([]);
    setRoom(null);
    setMatch(null);
    setPage("lobby");
    setServiceUnavailable(false);
  }, [setMatch]);
  const showError = useCallback((e: unknown) => setNotice(message(e)), []);
  const run = useCallback(
    async (f: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await f();
      } catch (e) {
        showError(e);
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );
  const sync = useCallback(async () => {
    if (!actorRef.current) return;
    const subject = actorRef.current.id;
    const [rs, ns, ms, currentRoom] = await Promise.all([
      api<RoomState[]>("/rooms"),
      api<any[]>("/notifications"),
      api<MatchState | null>("/matches/current"),
      api<RoomState | null>("/rooms/current"),
    ]);
    if (actorRef.current?.id !== subject) return;
    setRooms(rs);
    setNotifications(ns);
    if (currentRoom) setRoom(currentRoom);
    if (ms) {
      setMatch(ms);
      setPage("game");
    }
  }, []);
  const attach = useCallback(
    (session: { token: string; actor: Actor }) => {
      if (actorRef.current?.id !== session.actor.id) clearViews();
      setActor(session.actor);
      localStorage.setItem(
        "lastActor",
        JSON.stringify({ ...session.actor, sessionId: "" }),
      );
      actorRef.current = session.actor;
      const s = connect(session.token, session.actor);
      let retried = false;
      s.on("connect", () => {
        if (socket !== s) return;
        retried = false;
        setConnected(true);
      });
      s.on("disconnect", () => {
        if (socket === s) setConnected(false);
      });
      s.on("connect_error", () => {
        if (socket !== s) return;
        setNotice("Không kết nối được máy chủ. Bạn vẫn có thể chơi với máy.");
        if (retried) return;
        retried = true;
        void refresh()
          .then((data) => {
            if (socket !== s) return;
            if (
              actorRef.current?.id !== data.actor.id ||
              actorRef.current?.sessionId !== data.actor.sessionId
            )
              attach(data);
            else s.connect();
          })
          .catch(showError);
      });
      s.on("session:revoked", () => {
        if (socket !== s) return;
        setNotice("Tài khoản đã đăng nhập ở thiết bị khác.");
        setActor(null);
        setMatch(null);
        setRoom(null);
        actorRef.current = null;
        localStorage.removeItem("lastActor");
        clearViews();
        disconnect();
      });
      s.on("control:replaced", () => {
        if (socket !== s) return;
        setNotice("Quyền điều khiển đã chuyển sang tab khác.");
        setConnected(false);
        clearViews();
      });
      s.on("room:state", (r: RoomState) => {
        if (socket !== s) return;
        setRoom(r.status === "CLOSED" ? null : r);
        if (r.status !== "CLOSED") setPage("game");
        if (r.matchId)
          void api<MatchState>("/matches/" + r.matchId)
            .then(setMatch)
            .catch(showError);
      });
      const update = (m: MatchState) => {
        if (socket !== s) return;
        const entering =
          !matchRef.current ||
          matchRef.current.id !== m.id ||
          (["SAVED", "RESUMING"].includes(matchRef.current.status) &&
            m.status === "ACTIVE");
        setMatch(m);
        if (m.status === "RESUMING")
          void api<RoomState>("/rooms/" + m.roomId)
            .then(setRoom)
            .catch(showError);
        if (entering && !["SAVED", "FINISHED", "CANCELED"].includes(m.status))
          setPage("game");
      };
      s.on("match:state", update);
      s.on("match:ended", update);
      s.on("service:unavailable", () => {
        setServiceUnavailable(true);
        setNotice("Máy chủ đang phục hồi dữ liệu. Tạm ngừng thao tác PvP.");
      });
      s.on("service:recovered", () => {
        setServiceUnavailable(false);
        setNotice("Dữ liệu đã phục hồi. Hãy xem trạng thái ván hiện tại.");
      });
      s.on("notification:new", () => {
        void api<any[]>("/notifications")
          .then(setNotifications)
          .catch(showError);
      });
      void sync().catch(showError);
      setAuthMode(null);
    },
    [sync, showError, clearViews],
  );
  useEffect(() => {
    onSessionChanged((session) => {
      if (actorRef.current) attach(session);
    });
    const online = () => {
      void refresh().then(attach).catch(showError);
    };
    window.addEventListener("online", online);
    return () => {
      onSessionChanged(null);
      window.removeEventListener("online", online);
    };
  }, [attach, showError]);
  useEffect(() => {
    return () => {
      hintWorker.current?.terminate();
      hintWorker.current = null;
    };
  }, [page, local.position]);
  useEffect(() => {
    if (!navigator.onLine) {
      try {
        const saved = localStorage.getItem("lastActor");
        if (saved) setActor(JSON.parse(saved));
      } catch {
        /* Offline identity is only for local save selection. */
      }
      return;
    }
    void api("/config")
      .then(setConfig)
      .catch(() => {});
    void refresh()
      .then(attach)
      .catch(() => {});
    return () => disconnect();
  }, [attach]);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!actor) return;
    const timer = setInterval(() => {
      if (!navigator.onLine) return;
      void api<any[]>("/notifications")
        .then((data) => {
          if (actorRef.current?.id === actor.id) setNotifications(data);
        })
        .catch(() => {});
      if (page === "lobby")
        void api<RoomState[]>("/rooms")
          .then((data) => {
            if (actorRef.current?.id === actor.id) setRooms(data);
          })
          .catch(() => {});
      if (page === "friends")
        void api<any[]>("/friends")
          .then((data) => {
            if (actorRef.current?.id === actor.id) setFriends(data);
          })
          .catch(() => {});
    }, 5000);
    const refreshTimer = setInterval(() => {
      if (!navigator.onLine) return;
      void refresh().catch(showError);
    }, 10 * 60000);
    return () => {
      clearInterval(timer);
      clearInterval(refreshTimer);
    };
  }, [actor, page, showError]);
  useEffect(() => {
    if (!actor || !connected || !navigator.onLine) return;
    const q = new URLSearchParams(location.search),
      roomId = q.get("room"),
      code = q.get("code");
    if (roomId || code) {
      void run(async () => {
        const r = roomId
          ? await api<RoomState>("/rooms/" + roomId + "/join", "POST", {})
          : await api<RoomState>("/rooms/join-code", "POST", { code });
        setRoom(r);
        setPage("game");
        history.replaceState({}, "", location.pathname);
      });
    }
  }, [actor, run, connected]);
  useEffect(() => {
    let valid = true;
    void loadLocal(actor)
      .then((g) => {
        if (!valid) return;
        setHasLocal(!!g);
        if (g) setLocal(g);
      })
      .catch(showError);
    return () => {
      valid = false;
    };
  }, [actor, showError]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then(async (reg) => {
        if (reg.active) {
          const keys = await caches.keys();
          if (!keys.some((k) => k.startsWith("workbox-precache"))) return;
          const w = new Worker(new URL("./ai.worker.ts", import.meta.url), {
            type: "module",
          });
          const timer = setTimeout(() => w.terminate(), 3000);
          w.onmessage = (e) => {
            clearTimeout(timer);
            setOfflineReady(!!e.data.move && !e.data.error);
            w.terminate();
          };
          w.postMessage({ id: 0, position: initial(), level: "easy" });
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (
      page !== "ai" ||
      !aiStarted ||
      local.position.turn === local.human ||
      outcome(local.position)
    )
      return;
    const id = ++workerGeneration.current;
    let w: Worker;
    try {
      w = new Worker(new URL("./ai.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      setOfflineReady(false);
      setNotice(
        "Trình duyệt không khởi chạy được AI. Hãy dùng trình duyệt hỗ trợ Web Worker.",
      );
      return;
    }
    worker.current = w;
    setThinking(true);
    const timer = setTimeout(() => {
      w.terminate();
      setThinking(false);
      setNotice("AI tính quá lâu. Hãy thử mức Dễ hoặc tiếp tục ván sau.");
    }, 5000);
    w.onmessage = (e) => {
      if (e.data.id !== workerGeneration.current) return;
      clearTimeout(timer);
      setThinking(false);
      if (e.data.error) {
        setNotice(e.data.error);
        return;
      }
      const p = localRef.current;
      if (e.data.move && legal(p.position, e.data.move)) {
        const next = { ...p, position: play(p.position, e.data.move) };
        setLocal(next);
        void saveLocal(actorRef.current, next).catch(showError);
        setHasLocal(true);
      }
    };
    w.onerror = () => {
      clearTimeout(timer);
      setThinking(false);
      setOfflineReady(false);
      setNotice("Không tải được Worker AI. Kiểm tra tài nguyên offline.");
    };
    w.postMessage({ id, position: local.position, level: local.level });
    return () => {
      clearTimeout(timer);
      w.terminate();
      worker.current = null;
      workerGeneration.current++;
    };
  }, [page, aiStarted, local.position, local.human, local.level, showError]);
  useEffect(() => {
    if (!replay?.playing) return;
    const timer = setInterval(
      () =>
        setReplay((r) =>
          r
            ? {
                ...r,
                index: Math.min(r.index + 1, r.match.log.length),
                playing: r.index + 1 < r.match.log.length,
              }
            : null,
        ),
      900,
    );
    return () => clearInterval(timer);
  }, [replay?.playing]);
  async function navigate(p: Page) {
    const subject = actorRef.current?.id;
    setPage(p);
    setReplay(null);
    if (p === "lobby" && actor) await sync();
    if (p === "history" || p === "saved") {
      const value = await api("/matches/" + p);
      if (actorRef.current?.id === subject) setRecords(value);
    }
    if (p === "friends") {
      const value = await api("/friends");
      if (actorRef.current?.id === subject) setFriends(value);
    }
    if (p === "profile") {
      const value = await api("/users/me");
      if (actorRef.current?.id === subject) setProfile(value);
    }
    if (p === "admin") {
      const value = {
        users: await api("/admin/users"),
        reports: await api("/admin/reports"),
        audit: await api("/admin/audit"),
      };
      if (actorRef.current?.id === subject) setAdmin(value);
    }
  }
  async function authSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      if (authMode === "forgot") {
        const result = await api("/auth/forgot-password", "POST", {
          email: f.get("email"),
        });
        setNotice(result.message);
        return;
      }
      if (authMode === "reset") {
        const result = await api("/auth/reset-password", "POST", {
          token: new URLSearchParams(location.search).get("reset"),
          password: f.get("password"),
        });
        setNotice(result.message);
        setAuthMode("login");
        history.replaceState({}, "", location.pathname);
        return;
      }
      const mergeGuest =
        actor?.guest &&
        window.confirm(
          "Gộp phòng/ván đang chơi của khách và ván AI cục bộ vào tài khoản? Ván cục bộ có sẵn của tài khoản sẽ được giữ.",
        );
      const oldLocal = mergeGuest ? await loadLocal(actor) : null;
      const result = await api(
        "/auth/" + authMode,
        "POST",
        authMode === "register"
          ? {
              username: f.get("username"),
              email: f.get("email"),
              password: f.get("password"),
              mergeGuest: !!mergeGuest,
            }
          : {
              identifier: f.get("identifier"),
              password: f.get("password"),
              mergeGuest: !!mergeGuest,
            },
      );
      attach(result);
      if (result.mergeWarning) setNotice(result.mergeWarning);
      if (oldLocal && !(await loadLocal(result.actor))) {
        await saveLocal(result.actor, oldLocal);
        setLocal(oldLocal);
        setHasLocal(true);
      }
    });
  }
  async function createRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const r = await api<RoomState>("/rooms", "POST", {
        visibility: f.get("visibility"),
        minutes: Number(f.get("minutes")),
        ownerSide: f.get("side"),
        undo: f.get("undo") === "on",
      });
      setMatch(null);
      setRoom(r);
      setPage("game");
    });
  }
  async function move(m: Move) {
    if (page === "ai") {
      if (local.position.turn !== local.human || !legal(local.position, m))
        return;
      const next = { ...local, position: play(local.position, m) };
      setLocal(next);
      setHint(undefined);
      await saveLocal(actor, next);
      setHasLocal(true);
      return;
    }
    if (!match) return;
    try {
      const next = await emit<MatchState>("match:move", {
        matchId: match.id,
        moveId: crypto.randomUUID(),
        expectedVersion: match.version,
        ...m,
      });
      setMatch(next);
    } catch (e) {
      showError(e);
      setMatch(await api("/matches/" + match.id));
    }
  }
  async function request(kind: RequestKind, m = match) {
    if (!m) return;
    setMatch(
      await api("/matches/" + m.id + "/request", "POST", {
        kind,
        requestId: crypto.randomUUID(),
      }),
    );
  }
  const side: Side =
    replay?.side ?? (actor && match?.black === actor.id ? "black" : "red");
  const displayPosition = replay
    ? restore(replay.match.log.slice(0, replay.index).map((l) => l.move))
    : page === "ai"
      ? local.position
      : (match?.position ?? initial());
  const lastMove = replay
    ? replay.match.log[replay.index - 1]?.move
    : page === "ai"
      ? local.position.history.at(-1)
      : match?.log.at(-1)?.move;
  const remaining = (s: Side) => {
    if (replay)
      return replay.index
        ? replay.match.log[replay.index - 1].clocks[s]
        : replay.match.minutes
          ? replay.match.minutes * 60000
          : null;
    if (!match) return room?.minutes ? room.minutes * 60000 : null;
    if (serviceUnavailable) return match.remaining[s];
    const value = match.remaining[s];
    return value !== null &&
      match.status === "ACTIVE" &&
      match.position.turn === s
      ? value -
          Math.max(0, (match.serverTime ?? match.lastTick) - match.lastTick) -
          Math.max(0, clockNow - matchReceived.current)
      : value;
  };
  const end = page === "ai" ? outcome(local.position) : null;
  const serverClock = match
    ? (match.serverTime ?? match.lastTick) +
      Math.max(0, clockNow - matchReceived.current)
    : Date.now();
  const roomClock = room
    ? (room.serverTime ?? Date.now()) +
      Math.max(0, clockNow - roomReceived.current)
    : Date.now();
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            void run(() => navigate("lobby"));
          }}
        >
          <span className="brand-mark">將</span>
          <span>
            KỲ VIỆN<small>Nơi mỗi nước cờ có ý nghĩa</small>
          </span>
        </a>
        <div className="nav-label">KHÔNG GIAN CỦA BẠN</div>
        <nav>
          {(
            [
              { p: "lobby", i: "◫", t: "Sảnh cờ" },
              { p: "game", i: "♜", t: "Bàn cờ" },
              { p: "ai", i: "◇", t: "Luyện tập với máy" },
              { p: "saved", i: "▣", t: "Ván đã lưu" },
              { p: "history", i: "◷", t: "Lịch sử & kỳ phổ" },
              { p: "friends", i: "♧", t: "Bạn bè" },
              { p: "profile", i: "○", t: "Hồ sơ" },
            ] as { p: Page; i: string; t: string }[]
          ).map((n) => (
            <button
              key={n.p}
              className={page === n.p ? "active" : ""}
              onClick={() => {
                if (!actor && !["lobby", "ai", "game"].includes(n.p)) {
                  setAuthMode("login");
                  return;
                }
                if (
                  actor?.guest &&
                  ["saved", "history", "friends", "profile"].includes(n.p)
                ) {
                  setAuthMode("register");
                  return;
                }
                void run(() => navigate(n.p));
              }}
            >
              <span>{n.i}</span>
              {n.t}
            </button>
          ))}
          {actor?.role === "ADMIN" && (
            <button onClick={() => void run(() => navigate("admin"))}>
              ⚙ Quản trị
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <p>
            “Cờ hay không ở một nước,
            <br />
            mà ở cả một hành trình.”
          </p>
          <small>Cờ tướng • Giao hữu • Không xếp hạng</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Kỳ Viện <span>/</span>{" "}
            {
              {
                lobby: "Sảnh cờ",
                game: "Bàn cờ",
                ai: "Luyện tập",
                saved: "Ván đã lưu",
                history: "Kỳ phổ",
                friends: "Bạn bè",
                profile: "Hồ sơ",
                admin: "Quản trị",
              }[page]
            }
          </div>
          <div className="top-actions">
            <span className={"connection " + (connected ? "online" : "")}>
              {connected
                ? "● Trực tuyến"
                : navigator.onLine
                  ? "○ Chưa kết nối"
                  : "○ Offline"}
            </span>
            {actor ? (
              <>
                <button
                  className="icon-btn"
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  aria-label="Thông báo"
                >
                  ♧<b>{notifications.filter((n) => !n.read).length || ""}</b>
                </button>
                <span
                  className={
                    "avatar " +
                    (["red", "gold"].includes(actor.avatar ?? "")
                      ? actor.avatar
                      : "jade")
                  }
                >
                  {actor.avatar?.startsWith("data:image/") ? (
                    <img src={actor.avatar} alt="Avatar" />
                  ) : (
                    actor.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="user-name">
                  {actor.name}
                  <small>{actor.guest ? "Khách" : "Kỳ thủ"}</small>
                </span>
                <button
                  className="text-btn"
                  onClick={() =>
                    void run(async () => {
                      await api("/auth/logout", "POST", {});
                      disconnect();
                      setActor(null);
                      actorRef.current = null;
                      localStorage.removeItem("lastActor");
                      clearViews();
                      setMatch(null);
                      setRoom(null);
                    })
                  }
                >
                  Đăng xuất
                </button>
                {actor.guest && (
                  <button onClick={() => setAuthMode("register")}>
                    Tạo tài khoản
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => setAuthMode("login")}>Đăng nhập</button>
            )}
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {busy && (
          <div className="loading" role="status">
            Đang xử lý…
          </div>
        )}
        {notificationOpen && (
          <section className="notification-panel card">
            <h3>Thông báo</h3>
            {notifications.length === 0 ? (
              <Empty>Chưa có thông báo.</Empty>
            ) : (
              notifications.map((n) => (
                <div className="notification" key={n.id}>
                  <p>
                    {n.data.type === "ROOM_INVITE"
                      ? `${n.data.sender} mời bạn vào phòng ${n.data.code}`
                      : n.data.type === "FRIEND_UPDATE"
                        ? `Bạn bè: ${n.data.sender} · ${n.data.status === "ACCEPTED" ? "Đã kết bạn" : n.data.status === "PENDING" ? "Lời mời mới" : "Đã xử lý lời mời"}`
                        : `Đề nghị ${kindNames[n.data.request?.kind as RequestKind] ?? "trong ván"}`}
                  </p>
                  <button
                    onClick={() =>
                      void run(async () => {
                        await api(
                          "/notifications/" + n.id + "/read",
                          "POST",
                          {},
                        );
                        if (n.data.type === "FRIEND_UPDATE")
                          await navigate("friends");
                        else if (n.data.roomId) {
                          setRoom(
                            await api(
                              "/rooms/" + n.data.roomId + "/join",
                              "POST",
                              {},
                            ),
                          );
                          setPage("game");
                        } else if (n.data.matchId) {
                          setMatch(await api("/matches/" + n.data.matchId));
                          setPage("game");
                        }
                        setNotificationOpen(false);
                        await sync();
                      })
                    }
                  >
                    Mở
                  </button>
                </div>
              ))
            )}
          </section>
        )}
        <div className="content">
          {page === "lobby" && (
            <>
              <section className="hero">
                <div>
                  <div className="eyebrow">MỘT BÀN CỜ. VẠN KHẢ NĂNG.</div>
                  <h1>
                    Gặp bạn cờ.
                    <br />
                    <em>Khơi trí tuệ.</em>
                  </h1>
                  <p>
                    Một nước đi để bắt đầu. Một ván cờ để kết nối.
                    <br />
                    Chơi cùng bạn bè hoặc rèn luyện theo nhịp của riêng bạn.
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => {
                        if (!actor) {
                          void run(async () =>
                            attach(await api("/auth/guest", "POST", {})),
                          );
                          return;
                        }
                        document
                          .getElementById("create-room")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      ♜{" "}
                      {actor ? "Tạo phòng chơi" : "Vào sảnh với tư cách khách"}
                    </button>
                    <button
                      className="hero-secondary"
                      onClick={() => {
                        setPage("ai");
                      }}
                    >
                      ◇ Chơi với máy
                    </button>
                  </div>
                  <div className="hero-tags">
                    <span>✓ Luật cờ chuẩn theo SRS</span>
                    <span>✓ Chơi giao hữu</span>
                    <span>✓ AI trên trình duyệt</span>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-board" />
                  <span className="art-piece p1">帥</span>
                  <span className="art-piece p2">馬</span>
                  <span className="art-piece p3">車</span>
                  <div className="art-caption">ĐỎ ĐI TRƯỚC · BẠN ĐI XA</div>
                </div>
              </section>
              <div className="lobby-grid">
                <section className="card rooms-card">
                  <div className="section-head">
                    <div>
                      <div className="eyebrow">CÙNG NHAU SO TÀI</div>
                      <h2>Phòng đang mở</h2>
                    </div>
                    <button className="text-btn" onClick={() => void run(sync)}>
                      ↻ Làm mới
                    </button>
                  </div>
                  {!actor ? (
                    <Empty>
                      Đăng nhập hoặc vào với tư cách khách để xem phòng.
                    </Empty>
                  ) : rooms.length === 0 ? (
                    <Empty>
                      Chưa có phòng Public. Tạo phòng đầu tiên và mời bạn cùng
                      chơi.
                    </Empty>
                  ) : (
                    <div className="room-list">
                      {rooms.map((r) => (
                        <div className="room-row" key={r.id}>
                          <span className="room-icon">將</span>
                          <div>
                            <strong>{r.seats[0]?.name}</strong>
                            <small>
                              #{r.code} ·{" "}
                              {r.minutes
                                ? r.minutes + " phút"
                                : "Không giới hạn"}
                            </small>
                          </div>
                          <span className="room-status">
                            {statusNames[r.status]} · {r.seats.length}/2
                          </span>
                          <button
                            disabled={
                              r.status !== "WAITING" || r.seats.length >= 2
                            }
                            onClick={() =>
                              void run(async () => {
                                setRoom(
                                  await api(
                                    "/rooms/" + r.id + "/join",
                                    "POST",
                                    {},
                                  ),
                                );
                                setMatch(null);
                                setPage("game");
                              })
                            }
                          >
                            Vào phòng ↗
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form
                    className="join-code"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        setRoom(
                          await api("/rooms/join-code", "POST", {
                            code: f.get("code"),
                          }),
                        );
                        setMatch(null);
                        setPage("game");
                      });
                    }}
                  >
                    <label htmlFor="room-code">Có lời mời từ bạn?</label>
                    <input
                      id="room-code"
                      name="code"
                      placeholder="Mã phòng 6 số"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      required
                    />
                    <button disabled={!actor}>Tham gia</button>
                  </form>
                </section>
                <section className="card" id="create-room">
                  <div className="eyebrow">MỞ MỘT VÁN MỚI</div>
                  <h2>Tạo phòng của bạn</h2>
                  <form onSubmit={createRoom}>
                    <label>
                      Loại phòng
                      <select name="visibility">
                        <option value="public">
                          Public — mọi người có thể tìm thấy
                        </option>
                        <option value="private">
                          Private — tham gia qua lời mời
                        </option>
                      </select>
                    </label>
                    <label>
                      Thời gian mỗi bên
                      <select name="minutes" defaultValue="10">
                        {minutes.map((m) => (
                          <option key={m} value={m}>
                            {m ? m + " phút" : "Không giới hạn"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Màu quân của chủ phòng
                      <select name="side">
                        <option value="random">Ngẫu nhiên</option>
                        <option value="red">Đỏ</option>
                        <option value="black">Đen</option>
                      </select>
                    </label>
                    <label className="check">
                      <input name="undo" type="checkbox" defaultChecked /> Cho
                      phép hoàn tác theo đồng thuận
                    </label>
                    <button className="primary full" disabled={!actor || busy}>
                      Tạo phòng ↗
                    </button>
                  </form>
                  <div className="divider" />
                  <label>
                    Thời gian tìm trận
                    <select
                      value={searchMinutes}
                      onChange={(e) => setSearchMinutes(Number(e.target.value))}
                    >
                      {minutes.map((m) => (
                        <option key={m} value={m}>
                          {m ? m + " phút" : "Không giới hạn"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="full"
                    disabled={!actor}
                    onClick={() =>
                      void run(async () => {
                        const r = await api("/matchmaking/join", "POST", {
                          minutes: searchMinutes,
                        });
                        if (r.searching)
                          setNotice(
                            "Đang tìm đối thủ cho cấu hình đã chọn. Bạn có thể hủy tìm.",
                          );
                        else {
                          setRoom(r);
                          setMatch(null);
                          setPage("game");
                        }
                      })
                    }
                  >
                    ⚡ Tìm trận ngẫu nhiên ·{" "}
                    {searchMinutes ? searchMinutes + " phút" : "Không giới hạn"}
                  </button>
                  <button
                    className="text-btn full"
                    disabled={!actor}
                    onClick={() =>
                      void run(async () => {
                        await api("/matchmaking/cancel", "POST", {});
                        setNotice("Đã hủy tìm trận.");
                      })
                    }
                  >
                    Hủy tìm trận
                  </button>
                </section>
              </div>
              <section className="practice-banner">
                <span className="practice-icon">馬</span>
                <div>
                  <h3>Mỗi ngày, một nước cờ tốt hơn.</h3>
                  <p>Ba mức độ. Gợi ý nước đi. Tự lưu trong trình duyệt.</p>
                </div>
                <button onClick={() => setPage("ai")}>
                  Bắt đầu luyện tập →
                </button>
              </section>
            </>
          )}
          {(page === "game" || page === "ai" || !!replay) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {replay
                      ? "ĐỌC LẠI HÀNH TRÌNH"
                      : page === "ai"
                        ? "RÈN LUYỆN THEO NHỊP RIÊNG"
                        : "HAI KỲ THỦ · MỘT BÀN CỜ"}
                  </div>
                  <h1>
                    {replay
                      ? "Kỳ phổ"
                      : page === "ai"
                        ? "Luyện tập với máy"
                        : match
                          ? "Ván cờ của bạn"
                          : room
                            ? "Phòng #" + room.code
                            : "Bàn cờ đang chờ"}
                  </h1>
                </div>
                <span className="pill">
                  {page === "ai"
                    ? levelNames[local.level]
                    : match
                      ? statusNames[match.status]
                      : room
                        ? statusNames[room.status]
                        : "Chưa có phòng"}
                </span>
              </div>
              <div className="game-layout">
                <section className="board-panel card">
                  <div className="player-strip">
                    <span className="avatar dark">將</span>
                    <div>
                      <strong>
                        {page === "ai"
                          ? "Máy · " + levelNames[local.level]
                          : ((replay?.match ?? match)?.names[
                              side === "red" ? "black" : "red"
                            ] ??
                            room?.seats[1]?.name ??
                            "Đang chờ đối thủ")}
                      </strong>
                      <small>
                        {page === "ai"
                          ? "AI chạy trong trình duyệt"
                          : match
                            ? "Kỳ thủ " + (side === "red" ? "Đen" : "Đỏ")
                            : "Chưa sẵn sàng"}
                      </small>
                    </div>
                    <span className="clock">
                      {page === "ai"
                        ? "∞"
                        : time(remaining(side === "red" ? "black" : "red"))}
                    </span>
                  </div>
                  <Board
                    position={displayPosition}
                    side={replay?.side ?? (page === "ai" ? local.human : side)}
                    enabled={
                      !replay &&
                      (page === "ai"
                        ? aiStarted &&
                          !end &&
                          local.position.turn === local.human
                        : !!match &&
                          match.status === "ACTIVE" &&
                          connected &&
                          !serviceUnavailable &&
                          (side === "red" ? match.red : match.black) ===
                            actor?.id &&
                          match.position.turn === side)
                    }
                    onMove={(m) => void run(() => move(m))}
                    lastMove={hint ?? lastMove}
                  />
                  <div className="player-strip">
                    <span className="avatar red">帥</span>
                    <div>
                      <strong>
                        {replay
                          ? replay.match.names[side]
                          : (actor?.name ?? "Bạn")}
                      </strong>
                      <small>
                        {page === "ai"
                          ? "Quân " + (local.human === "red" ? "Đỏ" : "Đen")
                          : "Kỳ thủ " + (side === "red" ? "Đỏ" : "Đen")}
                      </small>
                    </div>
                    <span className="clock">
                      {page === "ai" ? "∞" : time(remaining(side))}
                    </span>
                  </div>
                  <div className="board-caption">
                    {thinking
                      ? "Máy đang suy nghĩ…"
                      : end
                        ? `${end.winner === local.human ? "Bạn thắng" : "Máy thắng"} · ${reasonNames[end.reason]}`
                        : match?.result
                          ? `${match.result.winner ? match.names[match.result.winner] + " thắng" : match.status === "CANCELED" ? "Ván đã hủy" : "Hòa"} · ${reasonNames[match.result.reason] ?? match.result.reason}`
                          : inCheck(displayPosition.board, displayPosition.turn)
                            ? "Chiếu! Bạn cần giải chiếu."
                            : `Lượt quân ${displayPosition.turn === "red" ? "Đỏ" : "Đen"} · Chọn quân rồi chọn ô đích`}
                  </div>
                </section>
                <aside className="game-side">
                  {replay ? (
                    <section className="card">
                      <h2>Phát lại kỳ phổ</h2>
                      <p>
                        Nước {replay.index}/{replay.match.log.length}
                      </p>
                      <div className="actions">
                        <button
                          onClick={() => setReplay({ ...replay, index: 0 })}
                        >
                          |←
                        </button>
                        <button
                          onClick={() =>
                            setReplay({
                              ...replay,
                              index: Math.max(0, replay.index - 1),
                            })
                          }
                        >
                          ←
                        </button>
                        <button
                          onClick={() =>
                            setReplay({ ...replay, playing: !replay.playing })
                          }
                        >
                          {replay.playing ? "Dừng" : "Phát"}
                        </button>
                        <button
                          onClick={() =>
                            setReplay({
                              ...replay,
                              index: Math.min(
                                replay.index + 1,
                                replay.match.log.length,
                              ),
                            })
                          }
                        >
                          →
                        </button>
                        <button
                          onClick={() =>
                            setReplay({
                              ...replay,
                              index: replay.match.log.length,
                            })
                          }
                        >
                          →|
                        </button>
                        <button
                          onClick={() =>
                            setReplay({
                              ...replay,
                              side: replay.side === "red" ? "black" : "red",
                            })
                          }
                        >
                          Xoay bàn
                        </button>
                      </div>
                      <input
                        aria-label="Nước replay"
                        type="range"
                        min="0"
                        max={replay.match.log.length}
                        value={replay.index}
                        onChange={(e) =>
                          setReplay({
                            ...replay,
                            index: Number(e.target.value),
                          })
                        }
                      />
                      <button onClick={() => setReplay(null)}>
                        Đóng kỳ phổ
                      </button>
                    </section>
                  ) : page === "ai" ? (
                    <section className="card">
                      <div className="eyebrow">ĐỐI THỦ CỦA BẠN</div>
                      <h2>Máy luyện tập</h2>
                      <div
                        className={
                          "offline-state " + (offlineReady ? "ready" : "")
                        }
                      >
                        {offlineReady
                          ? "✓ Tài nguyên đã cache cho offline"
                          : "○ Chưa sẵn sàng offline — kết nối mạng và tải lại trang để chuẩn bị"}
                      </div>
                      <label>
                        Độ khó
                        <select
                          value={local.level}
                          onChange={(e) =>
                            setLocal({
                              ...local,
                              level: e.target.value as LocalGame["level"],
                            })
                          }
                        >
                          {Object.entries(levelNames).map(([v, n]) => (
                            <option key={v} value={v}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Chọn quân
                        <select
                          value={local.human}
                          disabled={aiStarted}
                          onChange={(e) =>
                            setLocal({
                              ...local,
                              human: e.target.value as Side,
                            })
                          }
                        >
                          <option value="red">Đỏ · đi trước</option>
                          <option value="black">Đen · đi sau</option>
                        </select>
                      </label>
                      <button
                        className="primary full"
                        onClick={() => {
                          if (
                            aiStarted &&
                            !window.confirm(
                              "Tạo ván mới? Ván cục bộ hiện tại sẽ được thay thế.",
                            )
                          )
                            return;
                          worker.current?.terminate();
                          workerGeneration.current++;
                          const next = { ...local, position: initial() };
                          setLocal(next);
                          setAiStarted(true);
                          setHint(undefined);
                          void saveLocal(actor, next).catch(showError);
                        }}
                      >
                        Bắt đầu ván mới
                      </button>
                      {hasLocal && !aiStarted && (
                        <button
                          className="full"
                          onClick={() => setAiStarted(true)}
                        >
                          Tiếp tục ván cục bộ
                        </button>
                      )}
                      <div className="actions">
                        <button
                          disabled={
                            !aiStarted || !local.position.history.length
                          }
                          onClick={() => {
                            worker.current?.terminate();
                            workerGeneration.current++;
                            setThinking(false);
                            const n = local.position.history.length,
                              count =
                                local.position.turn === local.human && n >= 2
                                  ? 2
                                  : 1;
                            const next = {
                              ...local,
                              position: restore(
                                local.position.history.slice(0, n - count),
                              ),
                            };
                            setLocal(next);
                            setHint(undefined);
                            void saveLocal(actor, next).catch(showError);
                          }}
                        >
                          ↶ Hoàn tác
                        </button>
                        <button
                          disabled={
                            !aiStarted ||
                            thinking ||
                            local.position.turn !== local.human ||
                            !!end
                          }
                          onClick={() => {
                            const w = new Worker(
                              new URL("./ai.worker.ts", import.meta.url),
                              { type: "module" },
                            );
                            hintWorker.current = w;
                            const timer = setTimeout(() => {
                              w.terminate();
                              setNotice("Gợi ý quá thời gian. Thử lại.");
                            }, 5000);
                            w.onmessage = (e) => {
                              clearTimeout(timer);
                              if (
                                e.data.move &&
                                legal(localRef.current.position, e.data.move)
                              ) {
                                setHint(e.data.move);
                                setNotice(
                                  `Gợi ý: ô ${e.data.move.from} → ${e.data.move.to}`,
                                );
                              }
                              w.terminate();
                            };
                            w.postMessage({
                              id: 0,
                              position: local.position,
                              level: "hard",
                            });
                          }}
                        >
                          ✧ Gợi ý
                        </button>
                      </div>
                      <small>
                        {actor && !actor.guest
                          ? "Ván tự lưu trong bộ nhớ trình duyệt của tài khoản."
                          : "Khách: ván chỉ lưu trong phiên trình duyệt."}{" "}
                        Xóa dữ liệu trình duyệt có thể làm mất ván và cache.
                      </small>
                    </section>
                  ) : (
                    <>
                      <section className="card">
                        <h2>
                          {room ? "Phòng #" + room.code : "Điều khiển ván"}
                        </h2>
                        {room && !match && (
                          <>
                            <p>
                              {room.minutes
                                ? room.minutes + " phút mỗi bên"
                                : "Không giới hạn"}{" "}
                              · {room.undo ? "Có" : "Không"} hoàn tác
                            </p>
                            <p>
                              Quân chủ phòng:{" "}
                              {room.ownerSide === "random"
                                ? "Ngẫu nhiên"
                                : room.ownerSide === "red"
                                  ? "Đỏ"
                                  : "Đen"}
                            </p>
                            {room.owner === actor?.id &&
                              room.status === "WAITING" && (
                                <details>
                                  <summary>Điều chỉnh cấu hình</summary>
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const f = new FormData(e.currentTarget);
                                      void run(async () =>
                                        setRoom(
                                          await api(
                                            "/rooms/" + room.id + "/config",
                                            "POST",
                                            {
                                              visibility: f.get("visibility"),
                                              minutes: Number(f.get("minutes")),
                                              ownerSide: f.get("side"),
                                              undo: f.get("undo") === "on",
                                            },
                                          ),
                                        ),
                                      );
                                    }}
                                  >
                                    <label>
                                      Loại phòng
                                      <select
                                        name="visibility"
                                        defaultValue={room.visibility}
                                      >
                                        <option value="public">Public</option>
                                        <option value="private">Private</option>
                                      </select>
                                    </label>
                                    <label>
                                      Thời gian mỗi bên
                                      <select
                                        name="minutes"
                                        defaultValue={room.minutes}
                                      >
                                        {minutes.map((m) => (
                                          <option key={m} value={m}>
                                            {m ? m + " phút" : "Không giới hạn"}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Quân chủ phòng
                                      <select
                                        name="side"
                                        defaultValue={room.ownerSide}
                                      >
                                        <option value="red">Đỏ</option>
                                        <option value="black">Đen</option>
                                        <option value="random">
                                          Ngẫu nhiên
                                        </option>
                                      </select>
                                    </label>
                                    <label className="check">
                                      <input
                                        type="checkbox"
                                        name="undo"
                                        defaultChecked={room.undo}
                                      />{" "}
                                      Cho phép hoàn tác
                                    </label>
                                    <button>Cập nhật và xác nhận lại</button>
                                  </form>
                                </details>
                              )}
                            {room.seats.map((s) => (
                              <div className="seat" key={s.id}>
                                <span>{s.name}</span>
                                <b>
                                  {s.ready ? "✓ Sẵn sàng" : "Chưa sẵn sàng"}
                                </b>
                              </div>
                            ))}
                            {room.status === "COUNTDOWN" ? (
                              <div className="countdown">
                                {Math.max(
                                  1,
                                  Math.ceil((room.startAt! - roomClock) / 1000),
                                )}
                              </div>
                            ) : (
                              <button
                                className="primary full"
                                disabled={
                                  busy ||
                                  !connected ||
                                  room.seats.find((s) => s.id === actor?.id)
                                    ?.ready
                                }
                                onClick={() =>
                                  void run(async () =>
                                    setRoom(
                                      await api(
                                        "/rooms/" + room.id + "/ready",
                                        "POST",
                                        { version: room.version },
                                      ),
                                    ),
                                  )
                                }
                              >
                                Xác nhận cấu hình & sẵn sàng
                              </button>
                            )}
                            <button
                              className="text-btn full"
                              onClick={() =>
                                void run(async () => {
                                  await api(
                                    "/rooms/" + room.id + "/leave",
                                    "POST",
                                    {},
                                  );
                                  setRoom(null);
                                  setPage("lobby");
                                })
                              }
                            >
                              Rời phòng
                            </button>
                            <ShareRoom room={room} showError={showError} />
                            {actor && !actor.guest && (
                              <button
                                className="full"
                                onClick={() =>
                                  void run(async () => {
                                    setFriends(await api("/friends"));
                                    setNotice(
                                      "Chọn bạn trong danh sách bên dưới để gửi lời mời.",
                                    );
                                  })
                                }
                              >
                                Mời bạn trong game
                              </button>
                            )}
                            {friends
                              .filter((f) => f.status === "ACCEPTED")
                              .map((f) => (
                                <button
                                  className="full"
                                  key={f.pair}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(
                                        "/rooms/" + room.id + "/invite",
                                        "POST",
                                        { target: f.user.id },
                                      );
                                      setNotice("Đã gửi lời mời.");
                                    })
                                  }
                                >
                                  Mời {f.user.displayName}
                                </button>
                              ))}
                          </>
                        )}
                        {!room && !match && (
                          <Empty>Tạo hoặc tham gia phòng từ sảnh cờ.</Empty>
                        )}
                        {match && (
                          <>
                            <p>
                              {statusNames[match.status]} · Nước{" "}
                              {match.position.history.length}
                            </p>
                            {match.status === "PAUSED_RECONNECT" && (
                              <div className="notice">
                                Đồng hồ đã dừng.
                                {Object.entries(match.windows)
                                  .filter(([, w]) => !w.online)
                                  .map(([id, w]) => (
                                    <p key={id}>
                                      {id === match.red
                                        ? match.names.red
                                        : match.names.black}
                                      : còn{" "}
                                      {Math.max(
                                        0,
                                        Math.ceil(
                                          (w.deadline - serverClock) / 1000,
                                        ),
                                      )}{" "}
                                      giây
                                    </p>
                                  ))}
                              </div>
                            )}
                            {match.status === "RESUMING" && (
                              <button
                                className="primary full"
                                onClick={() =>
                                  void run(async () =>
                                    setMatch(
                                      await api(
                                        "/matches/" + match.id + "/ready",
                                        "POST",
                                        {},
                                      ),
                                    ),
                                  )
                                }
                              >
                                Sẵn sàng tiếp tục
                              </button>
                            )}
                            {match.status === "SAVED" && (
                              <button
                                className="primary full"
                                onClick={() =>
                                  void run(() => request("RESUME"))
                                }
                              >
                                Mời tiếp tục ván
                              </button>
                            )}
                            {match.status === "ACTIVE" && (
                              <>
                                <div className="actions">
                                  <button
                                    onClick={() =>
                                      void run(() => request("SAVE"))
                                    }
                                    disabled={match.guests}
                                  >
                                    ▣ Lưu ván
                                  </button>
                                  <button
                                    onClick={() =>
                                      void run(() => request("DRAW"))
                                    }
                                  >
                                    Đề nghị hòa
                                  </button>
                                  <button
                                    onClick={() =>
                                      void run(() => request("UNDO"))
                                    }
                                    disabled={!match.undo || !match.log.length}
                                  >
                                    ↶ Hoàn tác
                                  </button>
                                  <button
                                    onClick={() =>
                                      void run(() => request("VIDEO"))
                                    }
                                    disabled={match.video}
                                  >
                                    ◉ Gọi video
                                  </button>
                                </div>
                                <button
                                  className="danger text-btn"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Đầu hàng ván này? Đối thủ sẽ được ghi nhận thắng.",
                                      )
                                    )
                                      void run(async () =>
                                        setMatch(
                                          await api(
                                            "/matches/" + match.id + "/resign",
                                            "POST",
                                            {},
                                          ),
                                        ),
                                      );
                                  }}
                                >
                                  Đầu hàng
                                </button>
                              </>
                            )}
                            {match.requests
                              .filter(
                                (r) =>
                                  r.status === "PENDING" &&
                                  r.expiresAt > serverClock,
                              )
                              .map((r) => (
                                <div className="request" key={r.id}>
                                  <strong>
                                    {r.sender === actor?.id
                                      ? "Bạn đã đề nghị"
                                      : "Đối thủ đề nghị"}{" "}
                                    {kindNames[r.kind]}
                                  </strong>
                                  {r.sender !== actor?.id && (
                                    <div className="actions">
                                      <button
                                        className="primary"
                                        onClick={() =>
                                          void run(async () =>
                                            setMatch(
                                              await api(
                                                "/matches/" +
                                                  match.id +
                                                  "/respond",
                                                "POST",
                                                {
                                                  requestId: r.id,
                                                  accept: true,
                                                },
                                              ),
                                            ),
                                          )
                                        }
                                      >
                                        Đồng ý
                                      </button>
                                      <button
                                        onClick={() =>
                                          void run(async () =>
                                            setMatch(
                                              await api(
                                                "/matches/" +
                                                  match.id +
                                                  "/respond",
                                                "POST",
                                                {
                                                  requestId: r.id,
                                                  accept: false,
                                                },
                                              ),
                                            ),
                                          )
                                        }
                                      >
                                        Từ chối
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            {["FINISHED", "CANCELED"].includes(
                              match.status,
                            ) && (
                              <div className="actions">
                                <button
                                  onClick={() =>
                                    setReplay({
                                      match,
                                      index: 0,
                                      side,
                                      playing: false,
                                    })
                                  }
                                >
                                  Xem kỳ phổ
                                </button>
                                {room && (
                                  <button
                                    onClick={() =>
                                      void run(async () => {
                                        setRoom(
                                          await api(
                                            "/rooms/" + room.id + "/rematch",
                                            "POST",
                                            {},
                                          ),
                                        );
                                        setMatch(null);
                                      })
                                    }
                                  >
                                    Chuẩn bị tái đấu
                                  </button>
                                )}
                              </div>
                            )}
                            {match.video && actor && (
                              <Video
                                match={match}
                                actor={actor}
                                onClose={() =>
                                  void run(async () =>
                                    setMatch(
                                      await api(
                                        "/matches/" + match.id + "/video-close",
                                        "POST",
                                        {},
                                      ),
                                    ),
                                  )
                                }
                              />
                            )}
                          </>
                        )}
                      </section>
                      {match && (
                        <section className="card chat">
                          <div className="section-head">
                            <h3>Trò chuyện</h3>
                            <button
                              className="text-btn"
                              onClick={() => setChatVisible(!chatVisible)}
                            >
                              {chatVisible ? "Ẩn" : "Hiện"}
                            </button>
                          </div>
                          {chatVisible && (
                            <>
                              {actor && !actor.guest && (
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    const text = window.prompt(
                                      "Mô tả nội dung cần báo cáo (ít nhất 5 ký tự):",
                                    );
                                    if (text)
                                      void run(async () => {
                                        await api("/reports", "POST", {
                                          target:
                                            actor.id === match.red
                                              ? match.black
                                              : match.red,
                                          text,
                                        });
                                        setNotice(
                                          "Đã gửi báo cáo cho quản trị.",
                                        );
                                      });
                                  }}
                                >
                                  Báo cáo người chơi / nội dung chat
                                </button>
                              )}
                              <>
                                <div className="messages">
                                  {match.messages.length === 0 ? (
                                    <p className="muted">
                                      Gửi lời chào đến bạn cờ của bạn.
                                    </p>
                                  ) : (
                                    match.messages.map((m) => (
                                      <div
                                        key={m.id}
                                        className={
                                          m.sender === actor?.id ? "mine" : ""
                                        }
                                      >
                                        <small>{m.name}</small>
                                        <p>{m.text}</p>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.currentTarget,
                                      f = new FormData(form);
                                    void run(async () => {
                                      setMatch(
                                        await emit("chat:send", {
                                          matchId: match.id,
                                          messageId: crypto.randomUUID(),
                                          text: f.get("text"),
                                        }),
                                      );
                                      form.reset();
                                    });
                                  }}
                                >
                                  <input
                                    aria-label="Tin nhắn"
                                    name="text"
                                    maxLength={500}
                                    required
                                    placeholder="Nhắn một lời…"
                                  />
                                  <button
                                    disabled={
                                      !connected ||
                                      !["ACTIVE", "PAUSED_RECONNECT"].includes(
                                        match.status,
                                      )
                                    }
                                  >
                                    Gửi
                                  </button>
                                </form>
                              </>
                            </>
                          )}
                        </section>
                      )}
                    </>
                  )}
                  <section className="card moves">
                    <h3>Nước đi</h3>
                    {displayPosition.history.length === 0 ? (
                      <p className="muted">Kỳ phổ sẽ hiện sau nước đầu tiên.</p>
                    ) : (
                      <ol>
                        {displayPosition.history.map((m, i) => (
                          <li key={i}>
                            <span>{m.side === "red" ? "Đỏ" : "Đen"}</span>
                            <strong>
                              {m.notation ??
                                `${m.from % 9},${Math.floor(m.from / 9)} → ${m.to % 9},${Math.floor(m.to / 9)}`}
                            </strong>
                            {m.check && <b>Chiếu</b>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
          {(page === "saved" || page === "history") && !replay && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">HÀNH TRÌNH CỦA BẠN</div>
                  <h1>
                    {page === "saved" ? "Ván đang lưu" : "Lịch sử & kỳ phổ"}
                  </h1>
                </div>
                <button onClick={() => void run(() => navigate(page))}>
                  Làm mới
                </button>
              </div>
              {page === "history" && (
                <section className="card">
                  <div className="stats">
                    <span>
                      Thắng{" "}
                      <b>
                        {
                          records.filter(
                            (m) =>
                              m.result?.winner &&
                              (m.result.winner === "red" ? m.red : m.black) ===
                                actor?.id,
                          ).length
                        }
                      </b>
                    </span>
                    <span>
                      Thua{" "}
                      <b>
                        {
                          records.filter(
                            (m) =>
                              m.result?.winner &&
                              (m.result.winner === "red" ? m.red : m.black) !==
                                actor?.id,
                          ).length
                        }
                      </b>
                    </span>
                    <span>
                      Hòa{" "}
                      <b>
                        {
                          records.filter(
                            (m) =>
                              m.status === "FINISHED" &&
                              m.result?.winner === null,
                          ).length
                        }
                      </b>
                    </span>
                    <span>
                      Hủy{" "}
                      <b>
                        {records.filter((m) => m.status === "CANCELED").length}
                      </b>
                    </span>
                  </div>
                  <div className="actions">
                    <input
                      aria-label="Lọc theo đối thủ"
                      placeholder="Tên đối thủ"
                      value={recordFilter.opponent}
                      onChange={(e) =>
                        setRecordFilter({
                          ...recordFilter,
                          opponent: e.target.value,
                        })
                      }
                    />
                    <input
                      aria-label="Lọc theo ngày"
                      type="date"
                      value={recordFilter.date}
                      onChange={(e) =>
                        setRecordFilter({
                          ...recordFilter,
                          date: e.target.value,
                        })
                      }
                    />
                    <select
                      aria-label="Lọc theo kết quả"
                      value={recordFilter.result}
                      onChange={(e) =>
                        setRecordFilter({
                          ...recordFilter,
                          result: e.target.value,
                        })
                      }
                    >
                      <option value="all">Tất cả kết quả</option>
                      <option value="win">Thắng</option>
                      <option value="loss">Thua</option>
                      <option value="draw">Hòa</option>
                      <option value="canceled">Hủy</option>
                    </select>
                  </div>
                </section>
              )}
              {records.length === 0 ? (
                <section className="card">
                  <Empty>
                    {page === "saved"
                      ? "Chưa có ván lưu theo đồng thuận."
                      : "Chưa có ván kết thúc hoặc bị hủy."}
                  </Empty>
                </section>
              ) : (
                <div className="record-grid">
                  {records
                    .filter(
                      (m) =>
                        page === "saved" ||
                        ((m.red === actor?.id ? m.names.black : m.names.red)
                          .toLowerCase()
                          .includes(recordFilter.opponent.toLowerCase()) &&
                          (!recordFilter.date ||
                            m.createdAt?.slice(0, 10) === recordFilter.date) &&
                          (recordFilter.result === "all" ||
                            (recordFilter.result === "canceled" &&
                              m.status === "CANCELED") ||
                            (recordFilter.result === "draw" &&
                              m.status === "FINISHED" &&
                              !m.result?.winner) ||
                            (recordFilter.result === "win" &&
                              !!m.result?.winner &&
                              (m.result.winner === "red" ? m.red : m.black) ===
                                actor?.id) ||
                            (recordFilter.result === "loss" &&
                              !!m.result?.winner &&
                              (m.result.winner === "red" ? m.red : m.black) !==
                                actor?.id))),
                    )
                    .map((m) => (
                      <section className="card" key={m.id}>
                        <span className="pill">{statusNames[m.status]}</span>
                        <h3>
                          {m.names.red} — {m.names.black}
                        </h3>
                        <small>
                          Đối thủ:{" "}
                          {m.publicCodes?.[
                            m.red === actor?.id ? "black" : "red"
                          ] ?? (m.red === actor?.id ? m.black : m.red)}
                        </small>
                        <p>
                          {m.log.length} nước ·{" "}
                          {m.minutes ? m.minutes + " phút" : "Không giới hạn"} ·
                          Lượt {m.position.turn === "red" ? "Đỏ" : "Đen"}
                        </p>
                        <p>
                          {time(m.remaining.red)} / {time(m.remaining.black)}
                        </p>
                        {m.result && (
                          <p>
                            {reasonNames[m.result.reason] ?? m.result.reason}
                          </p>
                        )}
                        <div className="actions">
                          {page === "saved" && (
                            <button
                              className="primary"
                              onClick={() =>
                                void run(async () => {
                                  setMatch(m);
                                  setPage("game");
                                  if (m.status === "SAVED")
                                    await request("RESUME", m);
                                })
                              }
                            >
                              Mời tiếp tục
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setReplay({
                                match: m,
                                index: 0,
                                side: "red",
                                playing: false,
                              })
                            }
                          >
                            Xem kỳ phổ
                          </button>
                        </div>
                      </section>
                    ))}
                </div>
              )}
            </>
          )}
          {page === "friends" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">KẾT NỐI BẠN CỜ</div>
                  <h1>Bạn bè</h1>
                </div>
              </div>
              <section className="card">
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () =>
                      setSearchResults(
                        await api(
                          "/users/search?q=" +
                            encodeURIComponent(String(f.get("q"))),
                        ),
                      ),
                    );
                  }}
                >
                  <input
                    name="q"
                    minLength={2}
                    required
                    placeholder="Username, mã công khai hoặc email chính xác"
                  />
                  <button>Tìm bạn</button>
                </form>
                {searchResults.map((u) => (
                  <div className="friend-row" key={u.id}>
                    <div>
                      <strong>{u.displayName}</strong>
                      <small>
                        @{u.username} · {u.publicCode.slice(0, 8)}
                      </small>
                    </div>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await api("/friends/action", "POST", {
                            target: u.id,
                            action: "request",
                          });
                          setFriends(await api("/friends"));
                          setNotice("Đã xử lý lời mời kết bạn.");
                        })
                      }
                    >
                      Kết bạn
                    </button>
                  </div>
                ))}
              </section>
              <section className="card">
                <h2>Các mối kết nối</h2>
                {friends.length === 0 ? (
                  <Empty>Chưa có bạn hoặc lời mời.</Empty>
                ) : (
                  friends.map((f) => (
                    <div className="friend-row" key={f.pair}>
                      <div>
                        <strong>
                          {f.user?.displayName ?? "Tài khoản đã xóa"}
                        </strong>
                        <small>
                          {f.blockedBy.length
                            ? "Đã chặn"
                            : f.status === "ACCEPTED"
                              ? f.presence
                              : f.status === "PENDING"
                                ? "Lời mời đang chờ"
                                : "Chưa kết bạn"}
                          {" · @" +
                            f.user?.username +
                            " · " +
                            f.user?.publicCode}
                        </small>
                      </div>
                      <div className="actions">
                        {(f.blockedBy.includes(actor?.id)
                          ? ["unblock"]
                          : f.status === "PENDING"
                            ? f.initiatedBy === actor?.id
                              ? ["cancel", "block"]
                              : ["accept", "reject", "block"]
                            : f.status === "ACCEPTED"
                              ? ["remove", "block"]
                              : ["request", "block"]
                        ).map((action) => (
                          <button
                            key={action}
                            onClick={() =>
                              void run(async () => {
                                await api("/friends/action", "POST", {
                                  target: f.user.id,
                                  action,
                                });
                                setFriends(await api("/friends"));
                              })
                            }
                          >
                            {
                              {
                                unblock: "Bỏ chặn",
                                cancel: "Hủy mời",
                                block: "Chặn",
                                accept: "Chấp nhận",
                                reject: "Từ chối",
                                remove: "Hủy kết bạn",
                                request: "Gửi lời mời",
                              }[action]
                            }
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
          {page === "profile" && profile && (
            <>
              <div className="page-heading">
                <h1>Hồ sơ của bạn</h1>
              </div>
              <div className="lobby-grid">
                <section className="card">
                  <h2>{profile.displayName}</h2>
                  <p>
                    @{profile.username} · {profile.publicCode}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        await api("/users/me", "PATCH", {
                          displayName: f.get("displayName"),
                          hideHistory: f.get("hideHistory") === "on",
                          avatar:
                            f.get("avatar") === "custom"
                              ? profile.avatar
                              : f.get("avatar"),
                        });
                        setProfile(await api("/users/me"));
                        setActor((prev) =>
                          prev
                            ? {
                                ...prev,
                                name: String(f.get("displayName")),
                                avatar:
                                  f.get("avatar") === "custom"
                                    ? profile.avatar
                                    : String(f.get("avatar")),
                              }
                            : prev,
                        );
                        setNotice("Đã cập nhật hồ sơ.");
                      });
                    }}
                  >
                    <label>
                      Tên hiển thị
                      <input
                        name="displayName"
                        defaultValue={profile.displayName}
                        required
                        maxLength={40}
                      />
                    </label>
                    <small>
                      Đổi tên tối đa mỗi 7 ngày. Tên hiển thị có thể trùng.
                    </small>
                    <label>
                      Avatar mặc định
                      <select
                        name="avatar"
                        value={
                          ["jade", "red", "gold"].includes(profile.avatar)
                            ? profile.avatar
                            : "custom"
                        }
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            avatar:
                              e.target.value === "custom"
                                ? profile.avatar
                                : e.target.value,
                          })
                        }
                      >
                        {profile.avatar.startsWith("data:image/") && (
                          <option value="custom">Ảnh đã tải lên</option>
                        )}
                        <option value="jade">Ngọc</option>
                        <option value="red">Đỏ</option>
                        <option value="gold">Vàng</option>
                      </select>
                    </label>
                    <label>
                      Hoặc tải ảnh PNG/JPEG/WebP
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 400000) {
                            setNotice("Ảnh tối đa 400KB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () =>
                            void run(async () => {
                              await api("/users/me", "PATCH", {
                                avatar: reader.result,
                              });
                              setNotice("Đã cập nhật ảnh.");
                              setProfile((prev: any) =>
                                prev
                                  ? { ...prev, avatar: String(reader.result) }
                                  : prev,
                              );
                              setActor((prev) =>
                                prev
                                  ? { ...prev, avatar: String(reader.result) }
                                  : prev,
                              );
                            });
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        name="hideHistory"
                        defaultChecked={profile.hideHistory}
                      />{" "}
                      Ẩn lịch sử với người khác
                    </label>
                    <button className="primary">Lưu hồ sơ</button>
                  </form>
                </section>
                <section className="card">
                  <h2>Bảo mật tài khoản</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        attach(
                          await api(
                            profile.hasPassword
                              ? "/auth/change-password"
                              : "/auth/set-password",
                            "POST",
                            {
                              current: f.get("current"),
                              password: f.get("password"),
                            },
                          ),
                        );
                        setNotice("Đã đổi mật khẩu và thu hồi phiên cũ.");
                      });
                    }}
                  >
                    {profile.hasPassword && (
                      <label>
                        Mật khẩu hiện tại
                        <input
                          name="current"
                          type="password"
                          autoComplete="current-password"
                          required
                        />
                      </label>
                    )}
                    <label>
                      Mật khẩu mới
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </label>
                    <button>
                      {profile.hasPassword
                        ? "Đổi mật khẩu"
                        : "Thiết lập mật khẩu sau đăng nhập OAuth"}
                    </button>
                  </form>
                  <div className="actions">
                    {(["google", "facebook"] as const).map((provider) => (
                      <button
                        key={provider}
                        disabled={!config.oauth[provider]}
                        onClick={() =>
                          void run(async () => {
                            const result = await api(
                              "/auth/oauth/" + provider + "/link",
                              "POST",
                              {},
                            );
                            location.href = result.url;
                          })
                        }
                      >
                        Liên kết {provider === "google" ? "Google" : "Facebook"}
                      </button>
                    ))}
                  </div>
                  <div className="divider" />
                  <button
                    className="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Xóa mềm tài khoản và thu hồi quyền truy cập? Biên bản chung vẫn được giữ.",
                        )
                      )
                        void run(async () => {
                          await api("/users/me", "DELETE");
                          disconnect();
                          setActor(null);
                          actorRef.current = null;
                          localStorage.removeItem("lastActor");
                          clearViews();
                          setPage("lobby");
                          setNotice("Tài khoản đã được vô hiệu hóa.");
                        });
                    }}
                  >
                    Xóa tài khoản
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "admin" && actor?.role === "ADMIN" && (
            <>
              <h1>Quản trị tối thiểu</h1>
              <section className="card">
                <h2>Tài khoản</h2>
                {admin.users.map((u) => (
                  <div className="friend-row" key={u.id}>
                    <span>
                      {u.username} · {u.status}
                    </span>
                    <div className="actions">
                      {["ACTIVE", "BANNED", "DELETED"].map((status) => (
                        <button
                          key={status}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Xác nhận đổi trạng thái tài khoản: " + status,
                              )
                            )
                              void run(async () => {
                                await api(
                                  "/admin/users/" + u.id + "/status",
                                  "PATCH",
                                  { status },
                                );
                                await navigate("admin");
                              });
                          }}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
              <section className="card">
                <h2>Báo cáo</h2>
                {admin.reports.length === 0 ? (
                  <Empty>Chưa có báo cáo.</Empty>
                ) : (
                  admin.reports.map((r) => (
                    <div key={r.id}>
                      <p>
                        {r.text} · {r.status}
                      </p>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await api("/admin/reports/" + r.id, "PATCH", {
                              status: "RESOLVED",
                            });
                            await navigate("admin");
                          })
                        }
                      >
                        Đã xử lý
                      </button>
                    </div>
                  ))
                )}
              </section>
              <section className="card">
                <h2>Audit log</h2>
                {admin.audit.map((a) => (
                  <p key={a.id}>
                    {a.action} · {new Date(a.createdAt).toLocaleString("vi-VN")}
                  </p>
                ))}
              </section>
            </>
          )}
        </div>
        <footer>
          <span>KỲ VIỆN</span>
          <small>Chơi bằng trí tuệ. Kết nối bằng niềm vui.</small>
          <button
            className="text-btn"
            onClick={() =>
              setNotice(
                "Chọn quân rồi chọn ô đích. Đỏ đi trước. Sĩ/Tướng ở trong cung; Tượng không qua sông; Mã có chân; Pháo ăn qua một ngòi. Hòa, lưu và hoàn tác PvP cần đối thủ đồng ý.",
              )
            }
          >
            Hướng dẫn chơi
          </button>
        </footer>
      </main>
      {authMode && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Xác thực"
          >
            <button
              className="modal-close"
              onClick={() => setAuthMode(null)}
              aria-label="Đóng"
            >
              ×
            </button>
            <span className="brand-mark">將</span>
            <h2>
              {
                {
                  login: "Chào mừng trở lại",
                  register: "Gia nhập Kỳ Viện",
                  forgot: "Quên mật khẩu",
                  reset: "Đặt lại mật khẩu",
                }[authMode]
              }
            </h2>
            <form onSubmit={authSubmit}>
              {authMode === "register" && (
                <label>
                  Username
                  <input
                    name="username"
                    autoComplete="username"
                    pattern="[a-zA-Z0-9_]{3,32}"
                    required
                  />
                </label>
              )}
              {["register", "forgot"].includes(authMode) && (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {authMode === "login" && (
                <label>
                  Email hoặc username
                  <input name="identifier" autoComplete="username" required />
                </label>
              )}
              {authMode !== "forgot" && (
                <label>
                  Mật khẩu
                  <input
                    name="password"
                    type="password"
                    minLength={authMode === "login" ? 1 : 8}
                    maxLength={72}
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    required
                  />
                  {authMode !== "login" && (
                    <small>Ít nhất 8 ký tự, có chữ và số.</small>
                  )}
                </label>
              )}
              <button className="primary full" disabled={busy}>
                {authMode === "login"
                  ? "Đăng nhập"
                  : authMode === "register"
                    ? "Tạo tài khoản"
                    : authMode === "forgot"
                      ? "Gửi liên kết"
                      : "Đổi mật khẩu"}
              </button>
            </form>
            {["login", "register"].includes(authMode) && (
              <>
                <div className="actions">
                  <button
                    disabled={!config.oauth.google}
                    onClick={() => {
                      location.href = "/api/auth/oauth/google";
                    }}
                  >
                    Google
                  </button>
                  <button
                    disabled={!config.oauth.facebook}
                    onClick={() => {
                      location.href = "/api/auth/oauth/facebook";
                    }}
                  >
                    Facebook
                  </button>
                </div>
                {!config.oauth.google && !config.oauth.facebook && (
                  <small>
                    Đăng nhập mạng xã hội chưa được cấu hình trên máy chủ này.
                  </small>
                )}
                <button
                  className="text-btn full"
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "register" : "login")
                  }
                >
                  {authMode === "login"
                    ? "Chưa có tài khoản? Đăng ký"
                    : "Đã có tài khoản? Đăng nhập"}
                </button>
                <button
                  className="text-btn full"
                  onClick={() => setAuthMode("forgot")}
                >
                  Quên mật khẩu
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function ShareRoom({
  room,
  showError,
}: {
  room: RoomState;
  showError: (e: unknown) => void;
}) {
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false);
  const url = location.origin + "/?room=" + room.id;
  return (
    <div className="share">
      <small>Chia sẻ phòng với bạn</small>
      <div className="actions">
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(url)
              .then(() => setCopied(true), showError)
          }
        >
          {copied ? "Đã sao chép" : "Sao chép link"}
        </button>
        <button
          onClick={() =>
            void QRCode.toDataURL(url, { width: 180, margin: 1 })
              .then(setQr)
              .catch(showError)
          }
        >
          QR Code
        </button>
        {"share" in navigator && (
          <button
            onClick={() =>
              void navigator
                .share({ title: "Mời chơi cờ tại Kỳ Viện", url })
                .catch(showError)
            }
          >
            Chia sẻ
          </button>
        )}
      </div>
      <strong>Mã phòng: {room.code}</strong>
      {qr && <img src={qr} alt="QR tham gia phòng" width="180" height="180" />}
    </div>
  );
}
