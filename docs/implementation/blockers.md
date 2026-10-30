# Phụ thuộc nghiệm thu

**Trạng thái hiện tại 30/10:** Render + Supabase là phương án đã chọn; chỉ dùng Google OAuth, Facebook không còn thuộc phạm vi triển khai. 87/87 unit/integration tests, lint và build PASS. Render public và Google thật chưa nghiệm thu. Các bảng phía dưới là lịch sử.

**Checkpoint trước đó 30/10:** Docker và backup/restore local đã PASS, không còn blocked bởi daemon/client tools. Supabase đã kết nối chỉ đọc thành công và có đủ 4 migrations; chưa có host/domain/deploy credentials, OAuth/SMTP/TURN thật hoặc hardware để nghiệm thu. Chromium/Firefox/WebKit smoke đã PASS, không thay cho thiết bị/browser thực. Full dependency audit còn 4 low từ upstream deepmerge. Danh sách đầu vào P0/P1/P2 đầy đủ tại `release-report-2026-10-30.md`; bảng cũ phía dưới giữ làm lịch sử.

Cập nhật 16/10: xem `final-readiness-report.md`. OAuth có mock-provider tests hai provider; SMTP đã nhận qua TCP local và kiểm tra hash/reset/failure. Đây không thay thế dịch vụ thật. Admin UI và User IndexedDB offline đã E2E PASS. Backup/restore local **BLOCKED** vì thiếu `pg_dump`/`pg_restore`; cần PostgreSQL 18+ client tools, `PG_TOOLS_BIN` rồi chạy `node scripts/backup-check.mjs`. Chưa có restore hoặc thay đổi DB từ script này.

| Phụ thuộc | Trạng thái | Cần cung cấp/kiểm chứng |
|---|---|---|
| Google OAuth | BLOCKED | CLIENT_ID/SECRET, callback domain đúng APP_URL, tài khoản provider để thử login/link/collision thực |
| Facebook OAuth | BLOCKED | App credentials/permissions và callback được duyệt, thử provider thật |
| SMTP thư thật | BLOCKED | SMTP_HOST/PORT/USER/PASS/FROM và mailbox để chứng minh nhận/reset link; hiện không gửi thư giả |
| TURN / NAT / mạng di động | BLOCKED | TURN credentials, HTTPS và hai mạng riêng; localhost WebRTC không chứng minh relay qua NAT |
| Camera/micro thật | BLOCKED | Thiết bị và permission thật; Chromium fake capture chỉ kiểm tra media pipeline 2 peer |
| Safari/Firefox/Edge và mobile thật | NOT RUN | Thiết bị/browser mục tiêu; responsive Chromium emulation đã kiểm tra, không thay thế hardware QA |
| AI cảm nhận mức Khó | NOT RUN | Đấu/benchmark với người có kinh nghiệm và desktop/mobile mục tiêu; giới hạn compute không tự chứng minh sức mạnh |
| Docker image/Compose | BLOCKED | Docker daemon chưa hoạt động. PostgreSQL embedded đã chạy/migrate/test thật |
| p95 mạng thật | NOT RUN | Chưa có môi trường mạng gần Server được kiểm soát để đo và công bố NFR-03 |

Không gửi credentials vào chat nếu không cần; cấu hình trong .env local (đã gitignore). Các phần độc lập đã tiếp tục triển khai. Không coi những hàng này là PASS hoặc PROJECT COMPLETE.
