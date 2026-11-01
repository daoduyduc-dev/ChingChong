import { useState, type FormEvent, type ReactNode } from "react";
import type { Actor, MatchState, RoomState } from "../../../shared/domain";
import type { Page } from "../components/Navigation";
import { Bot, ChessKnight, Inbox } from "lucide-react";
import { api } from "../services/api";
import { notify } from "../services/notifications";
import { ListSkeleton } from "../components/Skeleton";
const minutes = [0, 5, 10, 15, 30];
const statusNames: Record<string, string> = {
  WAITING: "Chờ kỳ thủ",
  COUNTDOWN: "Đếm ngược",
  IN_MATCH: "Đang thi đấu",
  POST_MATCH: "Chờ tái đấu",
  CLOSED: "Đã đóng",
};
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={32} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function LobbyPage({
  actor,
  busy,
  rooms,
  searchMinutes,
  setSearchMinutes,
  setPage,
  setRoom,
  setMatch,
  run,
  attach,
  sync,
  createRoom,
}: {
  actor: Actor | null;
  busy: boolean;
  rooms: RoomState[];
  searchMinutes: number;
  setSearchMinutes: (minutes: number) => void;
  setPage: (page: Page) => void;
  setRoom: (room: RoomState | null) => void;
  setMatch: (match: MatchState | null) => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
  attach: (session: any) => void;
  sync: () => Promise<void>;
  createRoom: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [pending, setPending] = useState<"create" | "search" | null>(null);
  return (
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
            {actor
              ? "Tạo phòng để chơi cùng bạn bè, hoặc luyện tập với máy theo nhịp của riêng bạn."
              : "Chơi với máy để luyện tập. Vào sảnh với tư cách khách hoặc đăng nhập để tạo phòng, mời bạn cùng chơi."}
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
              <ChessKnight size={20} aria-hidden="true" />{" "}
              {actor ? "Tạo phòng chơi" : "Vào sảnh với tư cách khách"}
            </button>
            <button
              className="hero-secondary"
              onClick={() => {
                setPage("ai");
              }}
            >
              <Bot size={20} aria-hidden="true" /> Chơi với máy
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
            <Empty>Đăng nhập hoặc vào với tư cách khách để xem phòng.</Empty>
          ) : busy ? (
            <ListSkeleton rows={3} />
          ) : rooms.length === 0 ? (
            <Empty>
              Chưa có phòng Public. Tạo phòng đầu tiên và mời bạn cùng chơi.
              <button
                onClick={() => {
                  document
                    .getElementById("create-room")
                    ?.scrollIntoView({ block: "center" });
                  document
                    .querySelector<HTMLSelectElement>("#create-room select")
                    ?.focus();
                }}
              >
                Tạo phòng đầu tiên
              </button>
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
                      {r.minutes ? r.minutes + " phút" : "Không giới hạn"}
                    </small>
                  </div>
                  <span className="room-status">
                    {statusNames[r.status]} · {r.seats.length}/2
                  </span>
                  <button
                    disabled={r.status !== "WAITING" || r.seats.length >= 2}
                    onClick={() =>
                      void run(async () => {
                        setRoom(
                          await api("/rooms/" + r.id + "/join", "POST", {}),
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
          <form
            onSubmit={async (event) => {
              setPending("create");
              try {
                await createRoom(event);
              } finally {
                setPending(null);
              }
            }}
          >
            <label>
              Loại phòng
              <select name="visibility">
                <option value="public">
                  Public — mọi người có thể tìm thấy
                </option>
                <option value="private">Private — tham gia qua lời mời</option>
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
              <input name="undo" type="checkbox" defaultChecked /> Cho phép hoàn
              tác theo đồng thuận
            </label>
            <button
              className="primary full"
              disabled={!actor || busy}
              aria-busy={pending === "create"}
            >
              {pending === "create" ? "Đang tạo phòng…" : "Tạo phòng ↗"}
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
            disabled={!actor || busy}
            aria-busy={pending === "search"}
            onClick={async () => {
              setPending("search");
              await run(async () => {
                const r = await api("/matchmaking/join", "POST", {
                  minutes: searchMinutes,
                });
                if (r.searching)
                  notify(
                    "Đang tìm đối thủ cho cấu hình đã chọn. Bạn có thể hủy tìm.",
                  );
                else {
                  setRoom(r);
                  setMatch(null);
                  setPage("game");
                }
              });
              setPending(null);
            }}
          >
            {pending === "search"
              ? "Đang tìm trận…"
              : `Tìm trận ngẫu nhiên · ${searchMinutes ? searchMinutes + " phút" : "Không giới hạn"}`}
          </button>
          <button
            className="text-btn full"
            disabled={!actor}
            onClick={() =>
              void run(async () => {
                await api("/matchmaking/cancel", "POST", {});
                notify("Đã hủy tìm trận.");
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
        <button onClick={() => setPage("ai")}>Bắt đầu luyện tập →</button>
      </section>
    </>
  );
}
