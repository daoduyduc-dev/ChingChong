# Tiến độ — cập nhật 15/10/2026 (Asia/Saigon)

## Release 30/10/2026 — mới nhất

Đã cập nhật GitHub main cc0e5b9, vá 5 dependencies, triển khai FE/Nginx + BE/Socket.IO + PostgreSQL riêng bằng Docker tại 127.0.0.1:5180. Logic/API **76/76**, UI **23/23** (gồm wrapper 8 E2E), container acceptance **8/8**, browser smoke **3/3** đạt. Backup/restore 12 bảng và cold restart/persistence/WebSocket thực đạt. Runtime audit 0; full tree còn 4 low upstream chưa vá. Giữ hỗ trợ Supabase/Prisma qua compose.external-db; chưa có URL Supabase/hosting/provider credentials nên **PARTIALLY COMPLETE**, chưa public. Xem `release-report-2026-10-30.md` và `release-runbook.md`; không dùng các checkpoint phía dưới như kết quả mới nhất.

## Hardening 16/10/2026

Regression mới: **63 unit/integration PASS, 8 E2E PASS**, typecheck/lint/build/migrations/generate/audit PASS. Sửa OAuth missing-state/provider validation, timeout SMTP/OAuth, late camera cleanup, signaling rate isolation và duplicate transceiver/offer glare. Bổ sung SMTP socket thật local, OAuth mock hai provider, Admin UI/profile privacy và User IndexedDB offline. Không đổi engine/BA-11, không reset DB. Backup/restore BLOCKED vì thiếu client tools; Docker daemon và dịch vụ/hardware ngoài vẫn BLOCKED/NOT RUN. Xem `final-readiness-report.md` và `deployment-runbook.md`; trạng thái **PARTIALLY COMPLETE**.

Trạng thái dự án: **PARTIALLY COMPLETE**, chưa nghiệm thu dịch vụ/hardware bên ngoài.

## Foundation

Workspace ban đầu trống. Đã đọc toàn bộ DOCX 1.448 đoạn, không thực hiện các chỉ dẫn vận hành trong tài liệu như yêu cầu truy cập Jira. Source mới giữ nguyên stack. PostgreSQL 18.4 thật chạy local port 54329; Prisma generate + hai migrations đã chạy. TypeScript strict, validation Zod, CORS, Helmet, rate limit, refresh cookies, unit/integration/E2E scripts có sẵn. Docker daemon không hoạt động; đã dùng embedded PostgreSQL, không coi Docker image là đã kiểm chứng.

## Auth / hồ sơ / bạn bè

REST và DB thật: đăng ký, login username/email, single session + refresh rotation, Guest, chuyển identity Guest có đồng ý, local merge không ghi đè User, reset token dùng một lần, change password, profile cooldown 7 ngày, avatar, history privacy, soft delete; friends crossed invitations/block. OAuth state/PKCE, explicit linking, OAuth-only password setup và SMTP adapters đã triển khai, nhưng cần credentials để nghiệm thu provider/mail thật. DB có unique index partial bảo vệ một phiên điều khiển/User; mutation Match khóa Session FOR SHARE trong transaction để không dùng phiên đã revoke.

## Phòng / luật / PvP / lưu / reconnect

Rooms hai ghế, Public/Private, mã 6 số, URL/QR, ready cấu hình, countdown, rời/đóng/tái đấu, matchmaking ngẫu nhiên. Luật đủ 7 quân, self-check, facing generals, mate/stalemate, perpetual checking theo SRS; không tự hòa 60 nước. Match serialized single instance, PostgreSQL commit trước broadcast, move ID/expectedVersion, clock authoritative, separate reconnect deadlines 60s và 180s budget. SAVE/RESUME/DRAW/UNDO consent, stored notification, replay, lịch sử và admin.

Resume giữ Match ID/board/clock/colours; mở Room mới, không tái dùng Room CLOSED. Restart hủy an toàn ván còn active theo BA-11 và giữ move record; SAVED không bị hủy.

## UI / media / AI

React responsive có board, lobby, AI, saved/history, friends/profile/admin. Chat text escaped và rate limit, WebRTC 2 peer thật, consent trước signaling, thiết bị OFF mặc định, cleanup; fallback video quality theo bandwidth. Worker AI 3 mức, hint/undo/cancel, auto-save sessionStorage/IndexedDB, snapshot replay validation; PWA static-only cache + Worker smoke check trước báo offline-ready, fonts local và OFL licenses.

## Bằng chứng đến checkpoint này

- 50 test unit/integration đã đạt ở checkpoint trước lượt E2E mở rộng cuối; kết quả JSON đang cập nhật theo source cuối.
- Hành trình hai context Chromium đã chạy đạt ở batch trước: register, private room, real move, XSS-safe chat, real WebRTC remote frames bằng fake capture devices, save/resume, surrender/replay.
- Offline đã chạy đạt: tắt network, reload, 10 lượt người + 10 lượt AI, không có Backend request, reload recovery/undo.
- Responsive 390px đã chạy đạt; ảnh tại thư mục này.
- AI benchmark trên i5-12500H/16GB: Dễ depth 1, Trung bình 2, Khó 3–4 trong 1.3s; không suy ra sức mạnh trên điện thoại hoặc đối thủ chuyên nghiệp.

## Lượt kiểm chứng cuối

Lượt cuối đã đạt **59 unit/integration PASS và 6 E2E PASS**, 0 FAIL. Typecheck/lint/build/migrations/audit đều PASS. Concurrent guest invitation URL/QR, missing Worker asset, Undo khi Worker nghĩ, media init failure và logout cleanup đều đã chạy. Bảng truy vết có 137 mã và 71 TC; mail thật TC-009 BLOCKED. Xem test-results.md và JSON evidence. Tiếp theo cần credentials/hardware trong blockers.md; chưa PROJECT COMPLETE. Không push GitHub hoặc deploy public.
