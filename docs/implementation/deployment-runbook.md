# Triển khai và nghiệm thu thực tế — 16/10/2026

Trạng thái hạ tầng public: **NOT RUN**. Không có DNS/cloud/public deployment nào được tạo trong lượt này. File `deploy/nginx.conf.example` là mẫu cần thay domain/chứng chỉ/path rồi kiểm tra `nginx -t` trên máy đích. Docker daemon local không có: **BLOCKED**.

## Chuẩn bị release

1. Chọn một host, một Backend instance, Node 24, PostgreSQL persistent, HTTPS reverse proxy. Workspace hiện chưa có `.git`; cần kho phiên bản hoặc release archive có checksum để rollback có định danh. Không dùng `.local/postgres` development làm production.
2. Chạy `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Test DB riêng, không trỏ test runner vào DB production. Lưu lockfile và kết quả kiểm thử cùng release. Kiểm tra `npm audit` tại thời điểm release.
3. Đặt secrets riêng ngoài release: DATABASE_URL có password URI-encoded, JWT_SECRET ngẫu nhiên, APP_URL HTTPS chính xác, API_HOST loopback, TRUST_PROXY=1 chỉ khi có đúng một proxy kiểm soát. Không ghi secrets vào log, source, ảnh hoặc chat. Chỉ mở cổng 443/80; không expose DB hoặc API bypass proxy.
4. Sao lưu DB bằng `pg_dump -Fc` với credentials qua secret store/PGPASSFILE; không để password trên command line. Kiểm tra restore vào DB mới trước migrate. `prisma migrate deploy` chỉ dùng migration đã review; không `reset`, không `db push --accept-data-loss`. Hai migration hiện có là additive. Snapshot/backup trước mọi migration vẫn bắt buộc.
5. Copy `dist/` vào thư mục release mới; trỏ Nginx tới release; proxy `/api/` và `/socket.io/` như mẫu. Backend chạy bằng supervisor với restart policy, graceful SIGTERM, log rotation, quyền không root. Compose có healthchecks; đây chưa là bằng chứng container đã chạy.
6. Chạy `/api/health` qua localhost và HTTPS: phải 200 khi DB sẵn sàng. Thử WebSocket upgrade qua HTTPS; không chấp nhận chỉ polling. Kiểm tra CORS đúng origin, secure/HttpOnly cookies, request rate-limit phân biệt IP qua proxy, không log query reset/OAuth. API health lỗi DB trả lỗi chung, không DSN/SQL.

## Credentials và nghiệm thu dịch vụ

- Google: GOOGLE_CLIENT_ID/SECRET, callback `https://DOMAIN/api/auth/oauth/google/callback`; khai báo domain/consent ở provider. Thử đăng nhập mới, đăng nhập lại, cancel, state sai/mất, email trùng cần đăng nhập tài khoản cũ rồi explicit link, identity đã liên kết tài khoản khác. Google dùng S256 PKCE. Không coi mock provider là PASS thực tế.
- Facebook: FACEBOOK_CLIENT_ID/SECRET, callback `/api/auth/oauth/facebook/callback`, app permissions/review và tài khoản được phép. Thử email thiếu, cancel và link/collision. Luồng hiện tại dùng authorization code + secret và state; không tuyên bố Facebook PKCE đã triển khai.
- SMTP: SMTP_HOST/PORT/USER/PASS/FROM và quyền sender/domain. Thử hộp thư thật, spam folder, URL đúng HTTPS, hết hạn 30 phút, dùng lại thất bại, logout phiên sau reset; thử unknown email trả trung tính và vận hành nhận biết delivery failure từ audit. Local SMTP socket đã thử riêng, không thay cho deliverability.
- TURN: TURN_URL/USERNAME/CREDENTIAL, HTTPS, hai thiết bị trên hai mạng khác nhau. Bật `iceTransportPolicy=relay` trong bản thử riêng hoặc dùng stats chứng minh selected candidate là relay; lưu bằng chứng đã che IP/credentials. Thử UDP và TCP/TLS khi firewall chặn UDP. Không đánh dấu TURN PASS chỉ vì STUN/loopback kết nối được. Credentials hiện là static, cần hạn chế quota và xoay vòng; không phát public.
- Camera/micro: consent trước media, từ chối quyền, quyền trả về muộn sau đóng call, tắt/bật thiết bị, tháo thiết bị, thay thiết bị mặc định của OS và gọi lại; chưa có UI chọn deviceId. Kiểm tra tracks ended khi save/finish/logout/disconnect. Không quay/ghi âm.

## Backup / restore / rollback

Cần PostgreSQL 18+ client tools và `PG_TOOLS_BIN` trỏ thư mục chứa `pg_dump.exe`/`pg_restore.exe`. Embedded package hiện không có các client này: rehearsal **BLOCKED**, chưa tạo database restore. Mô tả dưới đây là cách chạy sau khi cung cấp tools.

Local rehearsal: dừng hoạt động ghi rồi chạy `node scripts/backup-check.mjs`. Script chỉ cho loopback, dump vào `.local/backups` (gitignored), restore vào DB **mới** tên `kyvien_restoreqa_<timestamp>`, so số dòng từng bảng, không ghi/xóa DB nguồn. Bản dump chứa dữ liệu riêng tư/password hash: hạn chế quyền file, mã hóa và chuyển backup ra host theo chính sách vận hành; không upload artifact này. DB restore và dump được giữ để kiểm tra, không tự xóa.

Production: chọn RPO/RTO và retention cùng chủ dự án; backup mã hóa off-host theo lịch, theo dõi job fail và diễn tập restore. Restore vào DB mới bằng `pg_restore --no-owner --no-privileges --exit-on-error`, đối chiếu migration/version, integrity và mẫu lịch sử, sau đó mới chuyển DATABASE_URL trong maintenance window được duyệt. Không restore đè DB đang phục vụ. Local row-count rehearsal không nghiệm thu RPO/RTO, PITR hoặc mất host.

Rollback app: giữ release trước và tài nguyên static đã hash; dừng nhận trận mới/maintenance, dừng Backend, trỏ lại static release và Backend tương ứng, giữ migration additive nếu tương thích. Migration không tương thích phải có kế hoạch phục hồi riêng; không tự chạy down migration. Restart theo BA-11 **hủy an toàn ván đang active**, giữ biên bản committed/SAVED. Chủ dự án cần chấp nhận tác động này trước public; rolling deploy không seamless.

Service Worker: `sw.js`, `index.html`, `registerSW.js` không cache dài ở proxy; assets có hash cache immutable. Giữ assets release trước trong thời gian client cũ còn dùng; kiểm tra client cũ cập nhật, reload online/offline, thiếu Worker báo rõ. API không cache; không clear IndexedDB/sessionStorage để ép cập nhật vì có ván AI người dùng.

## Gate trước public

Nghiệm thu thực Google/Facebook/SMTP; camera/mic và TURN relay; Chrome/Firefox/Safari/Edge và mobile mục tiêu; p95 mạng thật; kiểm tra backup khôi phục và rollback trên staging; logs/monitor cảnh báo health/DB/mailer; chính sách retention/xóa tài khoản và credentials. Tất cả hiện **BLOCKED/NOT RUN** ở môi trường đích. Không kết luận PROJECT COMPLETE chỉ từ build hoặc source review.
