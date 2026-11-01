import { forwardRef } from "react";
type Notification = {
  id: string;
  read: boolean;
  data: {
    type: string;
    sender?: string;
    code?: string;
    status?: string;
    roomId?: string;
    matchId?: string;
    request?: { kind: string };
  };
};
const names: Record<string, string> = {
  SAVE: "lưu ván",
  RESUME: "tiếp tục ván",
  DRAW: "hòa",
  UNDO: "hoàn tác",
  VIDEO: "gọi video",
};
export const NotificationPanel = forwardRef<
  HTMLElement,
  {
    notifications: Notification[];
    onOpen: (notification: Notification) => void;
  }
>(({ notifications, onOpen }, ref) => (
  <section
    id="notification-panel"
    ref={ref}
    className="notification-panel card"
    aria-label="Danh sách thông báo"
  >
    <h3>Thông báo</h3>
    {notifications.length === 0 ? (
      <div className="empty">
        <p>Chưa có thông báo.</p>
      </div>
    ) : (
      notifications.map((notification) => (
        <div
          className={"notification " + (!notification.read ? "unread" : "")}
          key={notification.id}
        >
          <p>
            {notification.data.type === "ROOM_INVITE"
              ? `${notification.data.sender} mời bạn vào phòng ${notification.data.code}`
              : notification.data.type === "FRIEND_UPDATE"
                ? `Bạn bè: ${notification.data.sender} · ${notification.data.status === "ACCEPTED" ? "Đã kết bạn" : notification.data.status === "PENDING" ? "Lời mời mới" : "Đã xử lý lời mời"}`
                : `Đề nghị ${names[notification.data.request?.kind ?? ""] ?? "trong ván"}`}
          </p>
          <button onClick={() => onOpen(notification)}>Mở</button>
        </div>
      ))
    )}
  </section>
));
NotificationPanel.displayName = "NotificationPanel";
