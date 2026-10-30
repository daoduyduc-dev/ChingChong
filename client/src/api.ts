import { io, type Socket } from "socket.io-client";
import type { Actor } from "../../shared/domain";
let token = "";
let sessionKey = "";
let sessionChanged:
  ((session: { token: string; actor: Actor }) => void) | null = null;
export function onSessionChanged(listener: typeof sessionChanged) {
  sessionChanged = listener;
}
const controlId = crypto.randomUUID();
let refreshPromise: Promise<{ token: string; actor: Actor }> | null = null;
export let socket: Socket | null = null;
export function connect(value: string, actor: Actor) {
  sessionKey = actor.id + ":" + actor.sessionId;
  token = value;
  socket?.disconnect();
  socket = io({ auth: { token: value, controlId }, autoConnect: true });
  return socket;
}
export function disconnect() {
  sessionKey = "";
  token = "";
  socket?.disconnect();
  socket = null;
}
export async function refresh() {
  if (!refreshPromise)
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        token = d.token;
        const key = d.actor.id + ":" + d.actor.sessionId;
        if (sessionKey && sessionKey !== key) {
          sessionKey = key;
          sessionChanged?.(d);
        }
        if (socket) socket.auth = { token: d.token, controlId };
        return d;
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}
export const errors: Record<string, string> = {
  UNAUTHENTICATED: "Hãy đăng nhập để tiếp tục.",
  SESSION_REVOKED:
    "Phiên đã kết thúc hoặc tài khoản đang đăng nhập ở thiết bị khác.",
  INVALID_CREDENTIALS: "Tên đăng nhập hoặc mật khẩu không đúng.",
  ALREADY_EXISTS: "Username hoặc email đã được sử dụng.",
  ROOM_FULL: "Phòng đã đủ hai người.",
  ROOM_CLOSED: "Phòng không tồn tại hoặc đã đóng.",
  STALE_VERSION: "Trạng thái đã thay đổi. Hãy kiểm tra và xác nhận lại.",
  ILLEGAL_MOVE: "Nước đi không hợp lệ.",
  NOT_YOUR_TURN: "Chưa đến lượt của bạn.",
  GUEST_CANNOT_SAVE: "Cả hai kỳ thủ cần tài khoản để lưu ván.",
  REQUEST_PENDING: "Đã có đề nghị đang chờ. Hãy xử lý đề nghị trước.",
  NAME_CHANGE_COOLDOWN: "Bạn chỉ có thể đổi tên mỗi 7 ngày.",
  SMTP_NOT_CONFIGURED: "Chưa cấu hình dịch vụ gửi email.",
  OAUTH_NOT_CONFIGURED: "Chưa cấu hình nhà cung cấp đăng nhập.",
  ALREADY_PLAYING: "Bạn đang tham gia một ván khác.",
  ALREADY_IN_ROOM: "Bạn đang ở phòng khác. Hãy rời phòng trước.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  VALIDATION_ERROR: "Dữ liệu chưa đúng định dạng.",
  MATCH_NOT_ACTIVE: "Ván chưa ở trạng thái đang chơi.",
  RESET_INVALID: "Liên kết đã hết hạn hoặc đã được sử dụng.",
  INTERNAL_ERROR: "Dịch vụ gặp lỗi. Hãy thử lại.",
  ACCOUNT_UNAVAILABLE: "Tài khoản không còn đủ điều kiện tiếp tục ván.",
  SERVICE_RECOVERY:
    "Máy chủ đang phục hồi dữ liệu. Vui lòng chờ đồng bộ trạng thái.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng chờ một phút rồi thử lại.",
};
export function message(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  return errors[s] ?? s;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  const subject = sessionKey;
  let r = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Control-ID": controlId,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.status === 401 && token && retry && !path.startsWith("/auth/")) {
    await refresh();
    r = await fetch("/api" + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Control-ID": controlId,
        Authorization: "Bearer " + token,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const d = await r.json();
  if (!path.startsWith("/auth/") && subject !== sessionKey)
    throw Error("SESSION_REVOKED");
  if (!r.ok) throw Error(d.error ?? "INTERNAL_ERROR");
  return d;
}
export function emit<T = any>(event: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(Error("Mất kết nối với máy chủ."));
      return;
    }
    socket
      .timeout(8000)
      .emit(
        event,
        data,
        (
          err: Error | null,
          result: { ok: boolean; data: T; error: string },
        ) => {
          if (err)
            reject(
              Error("Không nhận được xác nhận. Đang đồng bộ lại trạng thái."),
            );
          else if (!result.ok) reject(Error(result.error));
          else resolve(result.data);
        },
      );
  });
}
