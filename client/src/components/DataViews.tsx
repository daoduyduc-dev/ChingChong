import { useCallback, useEffect, useRef, useState } from "react";
import { api, message } from "../services/api";
import { ListSkeleton } from "./Skeleton";

export const modeNames: Record<string, string> = {
  PUBLIC: "Phòng công khai",
  PRIVATE: "Phòng riêng",
  RANDOM: "Ghép ngẫu nhiên",
  UNKNOWN: "Chưa xác định",
};
export const statuses: Record<string, string> = {
  ACTIVE: "Đang chơi",
  PAUSED_RECONNECT: "Chờ kết nối",
  SAVED: "Đã lưu",
  RESUMING: "Chờ tiếp tục",
  FINISHED: "Kết thúc",
  CANCELED: "Đã hủy",
};
export type Row = Record<string, any>;
export function useListing(path: string) {
  const [items, setItems] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    loadingRef = useRef(false);
  const load = useCallback(
    async (next?: string) => {
      if (loadingRef.current && next) return;
      const request = ++generation.current;
      loadingRef.current = true;
      setLoading(true);
      setError("");
      if (!next) {
        setItems([]);
        setCursor(null);
      }
      try {
        const data = await api(
          path +
            (path.includes("?") ? "&" : "?") +
            "limit=20" +
            (next ? "&cursor=" + encodeURIComponent(next) : ""),
        );
        if (generation.current !== request) return;
        const rows = Array.isArray(data) ? data : data.items;
        setItems((old) =>
          next
            ? [
                ...old,
                ...rows.filter((r: Row) => !old.some((o) => o.id === r.id)),
              ]
            : rows,
        );
        setCursor(data.nextCursor ?? null);
      } catch (e) {
        if (generation.current === request) setError(message(e));
      } finally {
        if (generation.current === request) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [path],
  );
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      loadingRef.current = false;
    };
  }, [load]);
  return { items, cursor, loading, error, load };
}
export function ListingFooter({
  listing,
}: {
  listing: ReturnType<typeof useListing>;
}) {
  return (
    <div className="listing-footer" aria-live="polite">
      {listing.error && (
        <p role="alert">
          {listing.error}{" "}
          <button onClick={() => void listing.load()}>Thử lại</button>
        </p>
      )}
      {listing.loading ? (
        <ListSkeleton />
      ) : listing.cursor ? (
        <button onClick={() => void listing.load(listing.cursor!)}>
          Tải thêm
        </button>
      ) : (
        !listing.error && (
          <p>
            {listing.items.length
              ? "Đã tải hết danh sách."
              : "Chưa có dữ liệu phù hợp."}
          </p>
        )
      )}
    </div>
  );
}
export function ModeSelect({
  value,
  change,
}: {
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label>
      Chế độ chơi
      <select
        aria-label="Lọc theo chế độ chơi"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Tất cả chế độ PvP</option>
        {Object.entries(modeNames).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function HistoryView({
  subject,
  endpoint = "/matches/history",
  onReplay,
  onProfile,
}: {
  subject: string;
  endpoint?: string;
  onReplay: (id: string) => void;
  onProfile: (id: string) => void;
}) {
  const [filters, setFilters] = useState({
    opponent: "",
    date: "",
    result: "",
    mode: "",
  });
  const [query, setQuery] = useState("");
  const listing = useListing(endpoint + "?" + query);
  return (
    <section className="history-view" aria-label="Lịch sử trận đấu">
      <form
        className="card data-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            new URLSearchParams(
              Object.entries(filters).filter(([, value]) => value),
            ).toString(),
          );
        }}
      >
        <p className="filter-help">
          Lịch sử PvP được lưu trên hệ thống. Ván với máy được lưu riêng trên
          trình duyệt của bạn.
        </p>
        <label>
          Đối thủ
          <input
            aria-label="Lọc theo đối thủ"
            value={filters.opponent}
            placeholder="Tên đối thủ"
            onChange={(e) =>
              setFilters({ ...filters, opponent: e.target.value })
            }
          />
        </label>
        <label>
          Ngày chơi (giờ Việt Nam)
          <input
            aria-label="Lọc theo ngày"
            type="date"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          />
        </label>
        <label>
          Kết quả
          <select
            aria-label="Lọc theo kết quả"
            value={filters.result}
            onChange={(e) => setFilters({ ...filters, result: e.target.value })}
          >
            <option value="">Tất cả kết quả</option>
            <option value="win">Thắng</option>
            <option value="loss">Thua</option>
            <option value="draw">Hòa</option>
            <option value="canceled">Hủy</option>
          </select>
        </label>
        <ModeSelect
          value={filters.mode}
          change={(mode) => setFilters({ ...filters, mode })}
        />
        <div className="actions">
          <button className="primary">Áp dụng bộ lọc</button>
          <button
            type="button"
            onClick={() => {
              setFilters({ opponent: "", date: "", result: "", mode: "" });
              setQuery("");
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      </form>
      <div className="listing-toolbar">
        <p className="list-count">Đã tải {listing.items.length} ván</p>
        <button disabled={listing.loading} onClick={() => void listing.load()}>
          Làm mới lịch sử
        </button>
      </div>
      <div className="record-grid">
        {listing.items.map((m) => {
          const opponent = m.red === subject ? m.black : m.red;
          const winner = m.result?.winner;
          const result =
            m.status === "CANCELED"
              ? "Hủy"
              : !winner
                ? "Hòa"
                : (winner === "red" ? m.red : m.black) === subject
                  ? "Thắng"
                  : "Thua";
          return (
            <article
              className="card history-record"
              data-testid="history-record"
              data-match-id={m.id}
              key={m.id}
            >
              <div className="record-meta">
                <span className="pill">{result}</span>
                <span>{modeNames[m.mode] ?? "Chưa xác định"}</span>
              </div>
              <h3>
                {m.names?.red} — {m.names?.black}
              </h3>
              <p>
                {m.createdAt
                  ? new Date(m.createdAt).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })
                  : ""}{" "}
                · {m.minutes ? m.minutes + " phút" : "Không giới hạn"}
              </p>
              <p>
                {m.moveCount ?? m.log?.length ?? 0} nước ·{" "}
                {statuses[m.status] ?? m.status}
              </p>
              {m.result?.reason && (
                <small>
                  Lý do:{" "}
                  {(
                    {
                      RESIGNATION: "Đầu hàng",
                      TIMEOUT: "Hết giờ",
                      CHECKMATE: "Chiếu bí",
                      STALEMATE: "Hết nước hợp lệ",
                      AGREED_DRAW: "Đồng ý hòa",
                      BOTH_DISCONNECTED: "Cả hai mất kết nối",
                      DISCONNECT_LOSS: "Quá hạn kết nối",
                      SERVER_RECOVERY: "Phục hồi máy chủ",
                    } as Record<string, string>
                  )[m.result.reason] ?? m.result.reason}
                </small>
              )}
              <div className="actions">
                <button onClick={() => onReplay(m.id)}>Xem kỳ phổ</button>
                <button onClick={() => onProfile(opponent)}>
                  Hồ sơ đối thủ
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <ListingFooter listing={listing} />
    </section>
  );
}
export function PublicProfile({
  id,
  onBack,
  onReplay,
  onProfile,
}: {
  id: string;
  onBack: () => void;
  onReplay: (id: string) => void;
  onProfile: (id: string) => void;
}) {
  const [profile, setProfile] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setProfile(null);
    setError("");
    void api("/users/" + id + "/profile")
      .then((value) => {
        if (current) setProfile(value);
      })
      .catch((e) => {
        if (current) setError(message(e));
      });
    return () => {
      current = false;
    };
  }, [id]);
  return (
    <>
      <div className="page-heading">
        <h1>Hồ sơ kỳ thủ</h1>
        <button onClick={onBack}>Quay lại bạn bè</button>
      </div>
      {error && (
        <section className="card" role="alert">
          {error}
        </section>
      )}
      {!profile && !error && <p role="status">Đang tải hồ sơ…</p>}
      {profile && (
        <>
          <section className="card public-profile">
            <div className="profile-avatar" aria-hidden="true">
              {profile.avatar?.startsWith("data:image/") ? (
                <img
                  src={profile.avatar}
                  alt=""
                  width={84}
                  height={84}
                  loading="lazy"
                />
              ) : (
                "将"
              )}
            </div>
            <div>
              <div className="eyebrow">KỲ THỦ KỲ VIỆN</div>
              <h2>{profile.displayName}</h2>
              <p>
                @{profile.username} · {profile.publicCode}
              </p>
              <span className="pill">{profile.presence ?? "Offline"}</span>
            </div>
          </section>
          {profile.hideHistory && (
            <p className="privacy-note">
              Kỳ thủ đã ẩn lịch sử. Bạn chỉ xem được các ván hai người từng cùng
              tham gia.
            </p>
          )}
          <h2>Lịch sử thi đấu</h2>
          <HistoryView
            key={id}
            endpoint={"/users/" + id + "/history"}
            subject={id}
            onReplay={onReplay}
            onProfile={onProfile}
          />
        </>
      )}
    </>
  );
}
