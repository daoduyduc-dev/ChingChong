import { useEffect, useRef, useState } from "react";
import type { Actor } from "../../shared/domain";
import { api, message } from "./api";
import { notify, confirmAction } from "./notifications";
import {
  modeNames,
  statuses,
  useListing,
  ListingFooter,
  ModeSelect,
  type Row,
} from "./DataViews";
export function AdminView({ actor }: { actor: Actor }) {
  const [tab, setTab] = useState("users"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState("");
  const [detail, setDetail] = useState<Row | null>(null),
    [detailLoading, setDetailLoading] = useState(false);
  const detailVersion = useRef(0);
  useEffect(
    () => () => {
      detailVersion.current++;
    },
    [],
  );
  const listing = useListing("/admin/" + tab + "?" + query);
  const names: Record<string, string> = {
    users: "Tài khoản",
    reports: "Báo cáo",
    audit: "Audit log",
    matches: "Trận đấu",
  };
  async function action(path: string, body: Row) {
    try {
      await api(path, "PATCH", body);
      notify("Đã cập nhật.", "success");
      await listing.load();
    } catch (e) {
      notify(message(e), "error");
    }
  }
  async function openDetail(id: string) {
    const version = ++detailVersion.current;
    setDetail(null);
    setDetailLoading(true);
    try {
      const value = await api("/admin/matches/" + id);
      if (version === detailVersion.current) setDetail(value);
    } catch (e) {
      notify(message(e), "error");
    } finally {
      if (version === detailVersion.current) setDetailLoading(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VẬN HÀNH HỆ THỐNG</div>
          <h1>Quản trị</h1>
        </div>
        <button onClick={() => void listing.load()}>Làm mới danh sách</button>
      </div>
      <div className="admin-tabs" role="group" aria-label="Nhóm quản trị">
        {Object.entries(names).map(([key, label]) => (
          <button
            aria-pressed={tab === key}
            className={tab === key ? "primary" : ""}
            key={key}
            onClick={() => {
              setTab(key);
              setSearch("");
              setQuery("");
              setMode("");
              setStatus("");
              setDate("");
              setDetail(null);
              setDetailLoading(false);
              detailVersion.current++;
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="card data-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            new URLSearchParams({
              ...(search
                ? tab === "matches"
                  ? { player: search }
                  : { q: search }
                : {}),
              ...(mode ? { mode } : {}),
              ...(status ? { status } : {}),
              ...(date ? { date } : {}),
            }).toString(),
          );
        }}
      >
        <label>
          Tìm kiếm
          <input
            aria-label="Tìm kiếm quản trị"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "matches" ? "Tên hoặc ID kỳ thủ" : "Tìm trong danh sách"
            }
          />
        </label>
        {tab === "matches" && (
          <>
            <ModeSelect value={mode} change={setMode} />
            <label>
              Ngày tạo trận (giờ Việt Nam)
              <input
                type="date"
                aria-label="Ngày tạo trận"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Trạng thái trận
              <select
                aria-label="Trạng thái trận"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(statuses).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button className="primary">Tìm kiếm</button>
      </form>
      {(detailLoading || detail) && (
        <section
          className="card technical-detail"
          aria-label="Chi tiết kỹ thuật trận"
        >
          <div className="page-heading">
            <h2>Chi tiết kỹ thuật trận</h2>
            <button
              onClick={() => {
                detailVersion.current++;
                setDetail(null);
                setDetailLoading(false);
              }}
            >
              Đóng chi tiết
            </button>
          </div>
          {detailLoading ? (
            <p role="status">Đang tải trạng thái trận…</p>
          ) : (
            <>
              <p>Thông tin chỉ đọc tại thời điểm truy vấn.</p>
              <TechnicalDetail detail={detail!} />
            </>
          )}
        </section>
      )}
      <section className="card">
        <h2>{names[tab]}</h2>
        {listing.items.map((row) => (
          <article className="admin-data-row" key={row.id}>
            {tab === "users" && (
              <>
                <div>
                  <strong>{row.displayName}</strong>
                  <p>
                    @{row.username} · {row.status} · {row.role}
                  </p>
                </div>
                <div className="actions">
                  {["ACTIVE", "BANNED", "DELETED"].map((state) => (
                    <button
                      key={state}
                      className={state === "ACTIVE" ? "" : "danger"}
                      disabled={row.status === state || row.id === actor.id}
                      onClick={async () => {
                        if (
                          await confirmAction(
                            "Xác nhận đổi trạng thái tài khoản: " + state,
                          )
                        )
                          await action("/admin/users/" + row.id + "/status", {
                            status: state,
                          });
                      }}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "reports" && (
              <>
                <p>
                  {row.text} · {row.status}
                </p>
                <small>
                  {new Date(row.createdAt).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </small>
                <div className="actions">
                  {["RESOLVED", "DISMISSED"].map((state) => (
                    <button
                      disabled={row.status === state}
                      key={state}
                      onClick={() =>
                        void action("/admin/reports/" + row.id, {
                          status: state,
                        })
                      }
                    >
                      {state === "RESOLVED" ? "Đã xử lý" : "Bỏ qua"}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "audit" && (
              <>
                <strong>{row.action}</strong>
                <p>
                  {new Date(row.createdAt).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </p>
                <small>Đối tượng: {row.entityId}</small>
              </>
            )}
            {tab === "matches" && (
              <>
                <div className="record-meta">
                  <span className="pill">
                    {statuses[row.status] ?? row.status}
                  </span>
                  <span>{modeNames[row.mode] ?? "Chưa xác định"}</span>
                </div>
                <h3>
                  {row.names?.red ?? row.red} — {row.names?.black ?? row.black}
                </h3>
                <p>{row.id}</p>
                <small>
                  {new Date(row.createdAt).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}{" "}
                  · phiên bản {row.version}
                </small>
                <div className="actions">
                  <button onClick={() => void openDetail(row.id)}>
                    Xem kỹ thuật
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        <ListingFooter listing={listing} />
      </section>
    </>
  );
}
function TechnicalDetail({ detail }: { detail: Row }) {
  const labels: Record<string, string> = {
    id: "ID trận",
    status: "Trạng thái",
    mode: "Chế độ",
    version: "Phiên bản",
    createdAt: "Tạo lúc",
    updatedAt: "Cập nhật lúc",
    red: "Quân đỏ",
    black: "Quân đen",
    roomId: "ID phòng",
    turn: "Lượt đi",
    remaining: "Đồng hồ (ms)",
    windows: "Kết nối lại",
    requests: "Các đề nghị",
    pendingRequests: "Đề nghị đang chờ",
    moveCount: "Số nước",
    result: "Kết quả",
    lastTick: "Mốc đồng hồ",
    online: "Kết nối",
    players: "Kỳ thủ",
    names: "Tên kỳ thủ",
  };
  return (
    <dl className="technical-grid">
      {Object.entries(detail)
        .filter(
          ([key]) =>
            ![
              "messages",
              "receipts",
              "chat",
              "position",
              "state",
              "log",
            ].includes(key),
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key] ?? key}</dt>
            <dd>
              {typeof value === "object" ? (
                <pre>{JSON.stringify(value, null, 2)}</pre>
              ) : (
                String(value ?? "—")
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
