import { memo, useEffect, useState } from "react";
export const PlayerClock = memo(function PlayerClock({
  remaining,
  active,
  running,
  receivedAt,
  label = "Đồng hồ",
}: {
  remaining: number | null | undefined;
  active: boolean;
  running: boolean;
  receivedAt: number;
  label?: string;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running || remaining == null) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [running, remaining]);
  const value =
    remaining == null
      ? null
      : Math.max(
          0,
          remaining -
            (running ? Math.max(0, Math.max(now, receivedAt) - receivedAt) : 0),
        );
  const seconds = value == null ? null : Math.ceil(value / 1000),
    minutes = seconds == null ? 0 : Math.floor(seconds / 60),
    rest = seconds == null ? 0 : seconds % 60;
  const low = seconds !== null && seconds <= 30,
    critical = seconds !== null && seconds <= 10;
  return (
    <div
      className={`clock player-clock ${active ? "active" : ""} ${low ? "low-time" : ""} ${critical ? "critical-time" : ""}`}
      role="timer"
      aria-live="off"
      aria-label={`${label}: ${seconds === null ? "Không giới hạn" : `Còn ${minutes} phút ${rest} giây`}${active ? ", đang tới lượt" : ""}`}
    >
      <span aria-hidden="true">
        {seconds === null
          ? "∞"
          : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`}
      </span>
      {low && (
        <small aria-hidden="true">
          {critical ? "Sắp hết giờ" : "Còn ít thời gian"}
        </small>
      )}
    </div>
  );
});
