# Phụ thuộc nghiệm thu

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
