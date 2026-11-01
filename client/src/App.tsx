import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import QRCode from "qrcode";
import { Toaster, toast } from "sonner";
import { confirmAction, requestReport, notify } from "./notifications";
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
import { HistoryView, PublicProfile } from "./DataViews";
import { AuthDialog } from "./AuthDialog";
import { Navigation, type Page } from "./Navigation";
import { NotificationPanel } from "./NotificationPanel";
import {
  Bell,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Bookmark,
  Inbox,
} from "lucide-react";
import { LobbyPage } from "./LobbyPage";
import { FriendsPage } from "./FriendsPage";
import { ProfilePage } from "./ProfilePage";
import { PlayerClock } from "./PlayerClock";
import { PwaUpdate } from "./PwaUpdate";
import { useAiWorker } from "./useAiWorker";
const AdminView = lazy(() =>
  import("./AdminView").then((module) => ({ default: module.AdminView })),
);
const Video = lazy(() =>
  import("./Video").then((module) => ({ default: module.Video })),
);

import {
  initial,
  inCheck,
  legal,
  outcome,
  play,
  restore,
  type Move,
  type Side,
} from "../../shared/chess";
import type {
  Actor,
  MatchState,
  RequestKind,
  RoomState,
} from "../../shared/domain";
import { loadLocal, saveLocal, type LocalGame } from "./local";
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
      <Inbox size={32} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function App() {
  const [registeredIdentifier, setRegisteredIdentifier] = useState("");
  const [actor, setActor] = useState<Actor | null>(null),
    [page, setPage] = useState<Page>("lobby"),
    [room, setRoomRaw] = useState<RoomState | null>(null),
    [searchMinutes, setSearchMinutes] = useState(10),
    [match, setMatchRaw] = useState<MatchState | null>(null),
    [rooms, setRooms] = useState<RoomState[]>([]),
    [busy, setBusy] = useState(false),
    [sessionRestoring, setSessionRestoring] = useState(navigator.onLine),
    [connected, setConnected] = useState(false),
    [serviceUnavailable, setServiceUnavailable] = useState(false),
    [authMode, setAuthMode] = useState<
      "login" | "register" | "forgot" | "reset" | null
    >(new URLSearchParams(location.search).has("reset") ? "reset" : null),
    [config, setConfig] = useState<any>({ oauth: {}, smtp: false }),
    [notifications, setNotifications] = useState<any[]>([]),
    [notificationOpen, setNotificationOpen] = useState(false),
    [authError, setAuthError] = useState(""),
    [records, setRecords] = useState<MatchState[]>([]),
    [replay, setReplay] = useState<{
      match: MatchState;
      index: number;
      side: Side;
      playing: boolean;
    } | null>(null),
    [friends, setFriends] = useState<any[]>([]),
    [searchResults, setSearchResults] = useState<any[]>([]),
    [publicProfileId, setPublicProfileId] = useState<string | null>(null),
    [profile, setProfile] = useState<any>(null);

  const [local, setLocal] = useState<LocalGame>({
      position: initial(),
      human: "red",
      level: "medium",
    }),
    [hint, setHint] = useState<Move | undefined>(),
    [offlineReady, setOfflineReady] = useState(false),
    [hasLocal, setHasLocal] = useState(false),
    [aiStarted, setAiStarted] = useState(false),
    [chatVisible, setChatVisible] = useState(true),
    [clockNow, setClockNow] = useState(performance.now());
  const roomReceived = useRef(performance.now()),
    matchReceived = useRef(performance.now()),
    hintWorker = useRef<Worker | null>(null),
    localRef = useRef(local),
    actorRef = useRef(actor),
    matchRef = useRef(match);
  localRef.current = local;
  actorRef.current = actor;
  matchRef.current = match;
  useEffect(() => {
    if (busy || sessionRestoring)
      toast.loading(
        sessionRestoring ? "Đang khôi phục phiên…" : "Đang xử lý…",
        { id: "app-loading", closeButton: false },
      );
    else toast.dismiss("app-loading");
    return () => {
      toast.dismiss("app-loading");
    };
  }, [busy, sessionRestoring]);
  const notificationPanel = useRef<HTMLElement>(null);
  const notificationButton = useRef<HTMLButtonElement>(null);
  const movesList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    setAuthError("");
  }, [authMode]);
  useEffect(() => {
    if (!notificationOpen) return;
    function close(event: PointerEvent | KeyboardEvent) {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !notificationPanel.current?.contains(event.target as Node) &&
            !notificationButton.current?.contains(event.target as Node)
      ) {
        setNotificationOpen(false);
        if (event instanceof KeyboardEvent) notificationButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [notificationOpen]);
  useEffect(() => {
    if (!replay) return;
    function key(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input, textarea, select, button, [contenteditable='true'], [role='dialog']",
        )
      )
        return;
      if (!["ArrowLeft", "ArrowRight", " "].includes(event.key)) return;
      event.preventDefault();
      setReplay((current) =>
        current
          ? event.key === " "
            ? { ...current, playing: !current.playing }
            : {
                ...current,
                playing: false,
                index: Math.max(
                  0,
                  Math.min(
                    current.match.log.length,
                    current.index + (event.key === "ArrowLeft" ? -1 : 1),
                  ),
                ),
              }
          : current,
      );
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [!!replay]);
  useEffect(() => {
    const list = movesList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [match?.log.length, local.position.history.length, replay?.index]);
  const setRoom = useCallback((incoming: RoomState | null) => {
    roomReceived.current = performance.now();
    if (incoming && !incoming.matchId) {
      matchRef.current = null;
      setMatchRaw(null);
    }
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
    cancelAi();
    hintWorker.current?.terminate();
    setHint(undefined);
    setAiStarted(false);
    setLocal({ position: initial(), human: "red", level: "medium" });
    setHasLocal(false);
    setRecords([]);
    setReplay(null);
    setFriends([]);
    setSearchResults([]);
    setProfile(null);
    setPublicProfileId(null);
    setNotifications([]);
    setNotificationOpen(false);
    setRooms([]);
    setRoom(null);
    setMatch(null);
    setPage("lobby");
    setServiceUnavailable(false);
  }, [setMatch]);
  const showError = useCallback(
    (e: unknown) => notify(message(e), "error"),
    [],
  );
  const { thinking, cancel: cancelAi } = useAiWorker({
    enabled: page === "ai" && aiStarted,
    game: local,
    actor,
    onGame: setLocal,
    onSaved: setHasLocal,
    onUnavailable: setOfflineReady,
    onError: showError,
  });
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
  const sync = useCallback(async (restoreView = false) => {
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
      if (restoreView) setPage("game");
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
        notify("Không kết nối được máy chủ. Bạn vẫn có thể chơi với máy.");
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
        notify("Tài khoản đã đăng nhập ở thiết bị khác.");
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
        notify("Quyền điều khiển đã chuyển sang tab khác.");
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
        notify("Máy chủ đang phục hồi dữ liệu. Tạm ngừng thao tác PvP.");
      });
      s.on("service:recovered", () => {
        setServiceUnavailable(false);
        notify("Dữ liệu đã phục hồi. Hãy xem trạng thái ván hiện tại.");
      });
      s.on("notification:new", () => {
        void api<any[]>("/notifications")
          .then(setNotifications)
          .catch(showError);
      });
      void sync(true).catch(showError);
      setAuthMode((mode) => (mode === "reset" ? mode : null));
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
      setSessionRestoring(false);
      try {
        const saved = localStorage.getItem("lastActor");
        if (saved) setActor(JSON.parse(saved));
      } catch {
        /* Offline identity is only for local save selection. */
      }
      return;
    }
    let cancelled = false;
    void api("/config")
      .then(setConfig)
      .catch(() => {});
    void refresh()
      .then((session) => {
        if (!cancelled) attach(session);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionRestoring(false);
      });
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [attach]);
  useEffect(() => {
    if (
      room?.status !== "COUNTDOWN" &&
      match?.status !== "PAUSED_RECONNECT" &&
      !match?.requests.some((request) => request.status === "PENDING")
    )
      return;
    const timer = setInterval(() => setClockNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [room?.status, match?.status, match?.requests]);
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
    if (p === "saved") {
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
  }
  function openPublicProfile(id: string) {
    setPublicProfileId(id);
    setReplay(null);
    setPage("publicProfile");
  }
  async function openHistoryReplay(id: string) {
    await run(async () => {
      const value = await api<MatchState>("/matches/" + id + "/replay");
      setReplay({ match: value, index: 0, side: "red", playing: false });
    });
  }
  async function authSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setAuthError("");
    try {
      await (async () => {
        if (authMode === "forgot") {
          const result = await api("/auth/forgot-password", "POST", {
            email: f.get("email"),
          });
          notify(result.message);
          return;
        }
        if (authMode === "reset") {
          const result = await api("/auth/reset-password", "POST", {
            token: new URLSearchParams(location.search).get("reset"),
            password: f.get("password"),
          });
          notify(result.message);
          disconnect();
          setActor(null);
          setAuthMode("login");
          history.replaceState({}, "", location.pathname);
          return;
        }
        if (authMode === "register") {
          await api("/auth/register", "POST", {
            username: f.get("username"),
            email: f.get("email"),
            password: f.get("password"),
          });
          setRegisteredIdentifier(String(f.get("username") ?? ""));
          setAuthMode("login");
          notify(
            "Đăng ký thành công. Vui lòng đăng nhập để sử dụng dịch vụ.",
            "success",
          );
          return;
        }
        const mergeGuest =
          actor?.guest &&
          (await confirmAction(
            "Gộp phòng/ván đang chơi của khách và ván AI cục bộ vào tài khoản? Ván cục bộ có sẵn của tài khoản sẽ được giữ.",
          ));
        const oldLocal = mergeGuest ? await loadLocal(actor) : null;
        const result = await api("/auth/" + authMode, "POST", {
          identifier: f.get("identifier"),
          password: f.get("password"),
          mergeGuest: !!mergeGuest,
        });
        attach(result);
        if (result.mergeWarning) notify(result.mergeWarning);
        if (oldLocal && !(await loadLocal(result.actor))) {
          await saveLocal(result.actor, oldLocal);
          setLocal(oldLocal);
          setHasLocal(true);
        }
      })();
    } catch (error) {
      setAuthError(message(error));
    } finally {
      setBusy(false);
    }
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
    replay?.side ??
    (page === "ai"
      ? local.human
      : actor && match?.black === actor.id
        ? "black"
        : "red");
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
          Math.max(0, (match.serverTime ?? match.lastTick) - match.lastTick)
      : value;
  };
  const end = page === "ai" ? outcome(local.position) : null;
  const shownMatch = replay?.match ?? (page === "ai" ? null : match);
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
      <Toaster
        position="top-right"
        theme="light"
        richColors
        closeButton
        visibleToasts={3}
        toastOptions={{
          className: "kv-toast",
          closeButtonAriaLabel: "Đóng thông báo",
        }}
        containerAriaLabel="Thông báo hệ thống"
        mobileOffset={{ top: 16, right: 16, left: 16 }}
      />
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <aside className="sidebar" inert={!!authMode}>
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
        <Navigation
          page={page}
          admin={actor?.role === "ADMIN"}
          restoring={sessionRestoring}
          onNavigate={(p) => {
            if (!actor && !["lobby", "ai", "game"].includes(p)) {
              setAuthMode("login");
              return;
            }
            if (
              actor?.guest &&
              ["saved", "history", "friends", "profile"].includes(p)
            ) {
              setAuthMode("register");
              return;
            }
            void run(() => navigate(p));
          }}
        />
        <div className="sidebar-bottom">
          <p>
            “Cờ hay không ở một nước,
            <br />
            mà ở cả một hành trình.”
          </p>
          <small>Cờ tướng • Giao hữu • Không xếp hạng</small>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} inert={!!authMode}>
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
                publicProfile: "Hồ sơ kỳ thủ",
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
                  ref={notificationButton}
                  aria-expanded={notificationOpen}
                  aria-controls="notification-panel"
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  aria-label="Thông báo"
                >
                  <Bell aria-hidden="true" size={21} />
                  <b
                    aria-label={`${notifications.filter((n) => !n.read).length} thông báo chưa đọc`}
                  >
                    {notifications.filter((n) => !n.read).length || ""}
                  </b>
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
                    <img
                      src={actor.avatar}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                    />
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
              <button
                disabled={sessionRestoring}
                onClick={() => setAuthMode("login")}
              >
                Đăng nhập
              </button>
            )}
          </div>
        </header>
        {notificationOpen && (
          <NotificationPanel
            ref={notificationPanel}
            notifications={notifications}
            onOpen={(n) =>
              void run(async () => {
                await api("/notifications/" + n.id + "/read", "POST", {});
                if (n.data.type === "FRIEND_UPDATE") await navigate("friends");
                else if (n.data.roomId) {
                  setRoom(
                    await api("/rooms/" + n.data.roomId + "/join", "POST", {}),
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
          />
        )}
        <div className="content">
          {page === "lobby" && (
            <LobbyPage
              actor={actor}
              busy={busy}
              rooms={rooms}
              searchMinutes={searchMinutes}
              setSearchMinutes={setSearchMinutes}
              setPage={setPage}
              setRoom={setRoom}
              setMatch={setMatch}
              run={run}
              attach={attach}
              sync={sync}
              createRoom={createRoom}
            />
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
                  {replay
                    ? statusNames[replay.match.status]
                    : page === "ai"
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
                  <div
                    className="player-strip"
                    data-active={displayPosition.turn !== side}
                  >
                    <span
                      className={"avatar " + (side === "red" ? "dark" : "red")}
                      aria-label={side === "red" ? "Quân Đen" : "Quân Đỏ"}
                    >
                      {side === "red" ? "將" : "帥"}
                    </span>
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
                    <PlayerClock
                      remaining={
                        page === "ai"
                          ? null
                          : remaining(side === "red" ? "black" : "red")
                      }
                      active={displayPosition.turn !== side}
                      running={
                        !replay &&
                        page !== "ai" &&
                        !serviceUnavailable &&
                        match?.status === "ACTIVE" &&
                        match.position.turn !== side
                      }
                      receivedAt={matchReceived.current}
                      label={
                        side === "red" ? "Đồng hồ quân Đen" : "Đồng hồ quân Đỏ"
                      }
                    />
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
                    lastMove={
                      page === "ai" && !replay ? (hint ?? lastMove) : lastMove
                    }
                  />
                  <div
                    className="player-strip"
                    data-active={displayPosition.turn === side}
                  >
                    <span
                      className={"avatar " + (side === "red" ? "red" : "dark")}
                      aria-label={side === "red" ? "Quân Đỏ" : "Quân Đen"}
                    >
                      {side === "red" ? "帥" : "將"}
                    </span>
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
                    <PlayerClock
                      remaining={page === "ai" ? null : remaining(side)}
                      active={displayPosition.turn === side}
                      running={
                        !replay &&
                        page !== "ai" &&
                        !serviceUnavailable &&
                        match?.status === "ACTIVE" &&
                        match.position.turn === side
                      }
                      receivedAt={matchReceived.current}
                      label={
                        side === "red" ? "Đồng hồ quân Đỏ" : "Đồng hồ quân Đen"
                      }
                    />
                  </div>
                  <div
                    className="board-caption"
                    role="status"
                    aria-live="polite"
                  >
                    {page === "ai" && !replay && thinking
                      ? "Máy đang suy nghĩ…"
                      : end
                        ? `${end.winner === local.human ? "Bạn thắng" : "Máy thắng"} · ${reasonNames[end.reason]}`
                        : shownMatch?.result
                          ? `${shownMatch.result.winner ? shownMatch.names[shownMatch.result.winner] + " thắng" : shownMatch.status === "CANCELED" ? "Ván đã hủy" : "Hòa"} · ${reasonNames[shownMatch.result.reason] ?? shownMatch.result.reason}`
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
                          aria-label="Về nước đầu"
                          onClick={() => setReplay({ ...replay, index: 0 })}
                        >
                          <SkipBack size={20} aria-hidden="true" />
                        </button>
                        <button
                          aria-label="Lùi một nước"
                          onClick={() =>
                            setReplay({
                              ...replay,
                              index: Math.max(0, replay.index - 1),
                            })
                          }
                        >
                          <ChevronLeft size={20} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() =>
                            setReplay({ ...replay, playing: !replay.playing })
                          }
                        >
                          {replay.playing ? "Dừng" : "Phát"}
                        </button>
                        <button
                          aria-label="Tiến một nước"
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
                          <ChevronRight size={20} aria-hidden="true" />
                        </button>
                        <button
                          aria-label="Đến nước cuối"
                          onClick={() =>
                            setReplay({
                              ...replay,
                              index: replay.match.log.length,
                            })
                          }
                        >
                          <SkipForward size={20} aria-hidden="true" />
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
                        onClick={async () => {
                          if (
                            aiStarted &&
                            !(await confirmAction(
                              "Tạo ván mới? Ván cục bộ hiện tại sẽ được thay thế.",
                            ))
                          )
                            return;
                          cancelAi();
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
                            cancelAi();
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
                          <Undo2 size={20} aria-hidden="true" /> Hoàn tác
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
                              notify("Gợi ý quá thời gian. Thử lại.");
                            }, 5000);
                            w.onmessage = (e) => {
                              clearTimeout(timer);
                              if (
                                e.data.move &&
                                legal(localRef.current.position, e.data.move)
                              ) {
                                setHint(e.data.move);
                                notify(
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
                                    notify(
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
                                      notify("Đã gửi lời mời.", "success");
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
                                    <Bookmark size={20} aria-hidden="true" />{" "}
                                    Lưu ván
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
                                    <Undo2 size={20} aria-hidden="true" /> Hoàn
                                    tác
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
                                  onClick={async () => {
                                    if (
                                      await confirmAction(
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
                                  <>
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
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        void run(async () => {
                                          await api(
                                            "/rooms/" + room.id + "/leave",
                                            "POST",
                                            {},
                                          );
                                          setRoom(null);
                                          setMatch(null);
                                          setPage("lobby");
                                          await sync();
                                        })
                                      }
                                    >
                                      Rời phòng
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {match.video && actor && (
                              <Suspense
                                fallback={<p role="status">Đang tải video…</p>}
                              >
                                <Video
                                  match={match}
                                  actor={actor}
                                  onClose={() =>
                                    void run(async () =>
                                      setMatch(
                                        await api(
                                          "/matches/" +
                                            match.id +
                                            "/video-close",
                                          "POST",
                                          {},
                                        ),
                                      ),
                                    )
                                  }
                                />
                              </Suspense>
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
                                  onClick={async () => {
                                    const text = await requestReport(
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
                                        notify(
                                          "Đã gửi báo cáo cho quản trị.",
                                          "success",
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
                      <ol ref={movesList}>
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
          {page === "history" && !replay && actor && (
            <>
              <div className="page-heading">
                <h1>Lịch sử & kỳ phổ</h1>
              </div>
              <HistoryView
                key={actor.id + ":" + actor.sessionId}
                subject={actor.id}
                onReplay={(id) => void openHistoryReplay(id)}
                onProfile={openPublicProfile}
              />
            </>
          )}
          {page === "publicProfile" && !replay && publicProfileId && actor && (
            <PublicProfile
              key={actor.id + ":" + actor.sessionId + ":" + publicProfileId}
              id={publicProfileId}
              onBack={() => void run(() => navigate("friends"))}
              onReplay={(id) => void openHistoryReplay(id)}
              onProfile={openPublicProfile}
            />
          )}
          {page === "saved" && !replay && (
            <>
              <div className="page-heading">
                <h1>Ván đang lưu</h1>
                <button onClick={() => void run(() => navigate("saved"))}>
                  Làm mới
                </button>
              </div>
              {records.length === 0 ? (
                <section className="card">
                  <Empty>Chưa có ván lưu theo đồng thuận.</Empty>
                </section>
              ) : (
                <div className="record-grid">
                  {records.map((m) => (
                    <section className="card" key={m.id}>
                      <span className="pill">{statusNames[m.status]}</span>
                      <h3>
                        {m.names.red} — {m.names.black}
                      </h3>
                      <p>
                        {m.log.length} nước ·{" "}
                        {m.minutes ? m.minutes + " phút" : "Không giới hạn"}
                      </p>
                      <p>
                        {time(m.remaining.red)} / {time(m.remaining.black)}
                      </p>
                      <div className="actions">
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
            <FriendsPage
              actor={actor}
              busy={busy}
              friends={friends}
              searchResults={searchResults}
              setFriends={setFriends}
              setSearchResults={setSearchResults}
              openPublicProfile={openPublicProfile}
              run={run}
            />
          )}
          {page === "profile" && profile && (
            <ProfilePage
              profile={profile}
              setProfile={setProfile}
              setActor={setActor}
              config={config}

              run={run}
              onDeleted={() => {
                disconnect();
                setActor(null);
                actorRef.current = null;
                localStorage.removeItem("lastActor");
                clearViews();
                setPage("lobby");
                notify("Tài khoản đã được vô hiệu hóa.");
              }}
            />
          )}
          {page === "admin" && actor?.role === "ADMIN" && (
            <Suspense fallback={<p role="status">Đang tải quản trị…</p>}>
              <AdminView key={actor.id + ":" + actor.sessionId} actor={actor} />
            </Suspense>
          )}
        </div>
        <footer>
          <span>KỲ VIỆN</span>
          <small>Chơi bằng trí tuệ. Kết nối bằng niềm vui.</small>
          <button
            className="text-btn"
            onClick={() =>
              notify(
                "Chọn quân rồi chọn ô đích. Đỏ đi trước. Sĩ/Tướng ở trong cung; Tượng không qua sông; Mã có chân; Pháo ăn qua một ngòi. Hòa, lưu và hoàn tác PvP cần đối thủ đồng ý.",
              )
            }
          >
            Hướng dẫn chơi
          </button>
        </footer>
      </main>
      {authMode && (
        <AuthDialog
          mode={authMode}
          busy={busy}
          error={authError}
          identifier={registeredIdentifier}
          oauth={config.oauth}
          onMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          onSubmit={authSubmit}
        />
      )}
      <PwaUpdate
        busyMatch={Boolean(
          (match &&
            ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"].includes(
              match.status,
            )) ||
          (aiStarted && !outcome(local.position)),
        )}
      />
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
