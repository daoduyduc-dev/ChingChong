/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdate({ busyMatch }: { busyMatch: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <aside
      className="pwa-update card"
      aria-label="Cập nhật ứng dụng"
      role="region"
    >
      <p role="status">Có phiên bản Kỳ Viện mới.</p>
      <p>
        {busyMatch
          ? "Bạn có thể cập nhật sau khi ván hiện tại kết thúc."
          : "Cập nhật sẽ tải lại trang để dùng phiên bản mới."}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={busyMatch}
          onClick={() => void updateServiceWorker(true)}
        >
          Cập nhật ngay
        </button>
        <button onClick={() => setNeedRefresh(false)}>Để sau</button>
      </div>
    </aside>
  );
}
