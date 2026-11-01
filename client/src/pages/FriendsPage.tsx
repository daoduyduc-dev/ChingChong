import type { Dispatch, SetStateAction } from "react";
import type { Actor } from "../../../shared/domain";
import { api } from "../services/api";
import { notify } from "../services/notifications";
import { ListSkeleton } from "../components/Skeleton";
export function FriendsPage({
  actor,
  busy,
  friends,
  searchResults,
  setFriends,
  setSearchResults,
  openPublicProfile,
  run,
}: {
  actor: Actor | null;
  busy: boolean;
  friends: any[];
  searchResults: any[];
  setFriends: Dispatch<SetStateAction<any[]>>;
  setSearchResults: Dispatch<SetStateAction<any[]>>;
  openPublicProfile: (id: string) => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
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
                  "/users/search?q=" + encodeURIComponent(String(f.get("q"))),
                ),
              ),
            );
          }}
        >
          <input
            name="q"
            aria-label="Tìm bạn theo username, mã công khai hoặc email"
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
                  notify("Đã xử lý lời mời kết bạn.");
                })
              }
            >
              Kết bạn
            </button>
            <button onClick={() => openPublicProfile(u.id)}>Xem hồ sơ</button>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Các mối kết nối</h2>
        {busy ? (
          <ListSkeleton rows={3} />
        ) : friends.length === 0 ? (
          <div className="empty">
            <p>Chưa có bạn hoặc lời mời. Tìm bạn bằng username để bắt đầu.</p>
          </div>
        ) : (
          friends.map((f) => (
            <div className="friend-row" key={f.pair}>
              <div>
                <strong>{f.user?.displayName ?? "Tài khoản đã xóa"}</strong>
                <small>
                  {f.blockedBy.length
                    ? "Đã chặn"
                    : f.status === "ACCEPTED"
                      ? f.presence
                      : f.status === "PENDING"
                        ? "Lời mời đang chờ"
                        : "Chưa kết bạn"}
                  {" · @" + f.user?.username + " · " + f.user?.publicCode}
                </small>
              </div>
              <div className="actions">
                {f.user && !f.blockedBy.length && (
                  <button onClick={() => openPublicProfile(f.user.id)}>
                    Xem hồ sơ
                  </button>
                )}
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
  );
}
