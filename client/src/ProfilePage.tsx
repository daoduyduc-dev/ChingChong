import type { Dispatch, SetStateAction } from "react";
import type { Actor } from "../../shared/domain";
import { api } from "./api";
import { notify, confirmAction } from "./notifications";
import { compressAvatar } from "./avatar";
export function ProfilePage({
  profile,
  setProfile,
  setActor,
  config,
  attach,
  onDeleted,
  run,
}: {
  profile: any;
  setProfile: Dispatch<SetStateAction<any>>;
  setActor: Dispatch<SetStateAction<Actor | null>>;
  config: any;
  attach: (session: any) => void;
  onDeleted: () => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
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
                notify("Đã cập nhật hồ sơ.", "success");
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
            <small>Đổi tên tối đa mỗi 7 ngày. Tên hiển thị có thể trùng.</small>
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
                  void run(async () => {
                    const avatar = await compressAvatar(file);
                    await api("/users/me", "PATCH", { avatar });
                    setProfile((previous: any) =>
                      previous ? { ...previous, avatar } : previous,
                    );
                    setActor((previous) =>
                      previous ? { ...previous, avatar } : previous,
                    );
                    notify("Đã cập nhật ảnh.", "success");
                  });
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
                notify("Đã đổi mật khẩu và thu hồi phiên cũ.");
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
            onClick={async () => {
              if (
                await confirmAction(
                  "Xóa mềm tài khoản và thu hồi quyền truy cập? Biên bản chung vẫn được giữ.",
                )
              )
                void run(async () => {
                  await api("/users/me", "DELETE");
                  onDeleted();
                });
            }}
          >
            Xóa tài khoản
          </button>
        </section>
      </div>
    </>
  );
}
