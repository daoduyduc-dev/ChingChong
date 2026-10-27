# Kỳ Viện — Final readiness report

Ngày kiểm tra: **16/10/2026, Asia/Saigon**. Kết luận: **PARTIALLY COMPLETE**. Regression local đạt; chưa đủ điều kiện tuyên bố PROJECT COMPLETE hoặc nghiệm thu public. Không deploy, push GitHub, đổi DNS hay tạo cloud resource.

## 1. Hiện trạng và từng module

Đã đối chiếu README, requirements matrix, progress, decisions, test-results, blockers, JSON evidence và source liên quan. `git status` báo không có Git repository: không có commit baseline để xác định diff/uncommitted changes. Không tự khởi tạo hoặc push repository. Không reset PostgreSQL hoặc xóa dữ liệu người dùng. DB ứng dụng được giữ nguyên; E2E thêm tài khoản QA riêng. Vitest sử dụng `kyvien_test` riêng.

Dependency thực tế được ghi trong `dependency-versions.json`: Node 24.14.0, React 19.3.0, Vite 7.3.7, Express 5.3.0, Prisma/client 6.19.0, Vitest 5.0.4, Playwright 1.64.1, Socket.IO 4.8.4, Nodemailer 10.1.1. Không tự nâng major version. PostgreSQL local 18.4; hai migration hiện có không có migration pending.

| Module / phạm vi | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Register/login, refresh, revoke, singleton control, profile | PASS | REST/DB/Socket regression; profile privacy UI persist sau reload |
| Reset token và SMTP local | PASS | Nhận MIME qua TCP SMTP local, hash-only DB, dùng một lần, revoke session, lỗi delivery audit và phản hồi trung tính |
| SMTP tới mailbox thật | BLOCKED | Chưa có sender/credentials/mailbox; không suy ra deliverability từ local SMTP |
| Google/Facebook adapter | PASS | Mock provider kiểm tra state, Google S256, Facebook code+secret, email collision và explicit identity linking; không phải provider acceptance |
| Google/Facebook thật | BLOCKED | Credentials, callback/domain/permissions và account test |
| Phòng, luật, PvP, clocks, save/resume/reconnect | PASS | Unit/integration/Socket + hai browser độc lập; scope single instance |
| Chat, replay/history, soft-delete và privacy | PASS | XSS text, ACL, shared-history preservation, replay sau resume/finish |
| WebRTC loopback Chromium fake capture | PASS | Remote frames hai peer, consent, late permission cleanup, config failure không hủy ván |
| Camera/mic thật, đổi thiết bị OS, NAT/TURN/mạng yếu | BLOCKED | Chưa có hai thiết bị/mạng và TURN/HTTPS; không có UI chọn deviceId |
| AI legal/offline/save/undo/hint | PASS | Worker thật, offline zero Backend calls, tactical fixtures; không chứng nhận sức mạnh |
| AI Khó so với người có kinh nghiệm / mobile | NOT RUN | Chưa có đấu người/hardware benchmark |
| UI desktop/mobile Chromium, hồ sơ/Admin | PASS | Responsive 390px, profile privacy persist, Admin ban/unban target QA, audit; screenshot đã xem |
| Browser/hardware ngoài Chromium | NOT RUN | Firefox/Safari/Edge/mobile thật |
| Build, migrations, dependency audit | PASS | Chi tiết bên dưới |
| Docker image/Compose | BLOCKED | Docker CLI có nhưng daemon không hoạt động |
| HTTPS/proxy/public WebSocket/rollback thực | NOT RUN | Có runbook và Nginx template; chưa staging/public |
| Backup/restore rehearsal | BLOCKED | Embedded package không chứa pg_dump/pg_restore; script preflight dừng trước khi sửa DB |

## 2. Test đã chạy lại

| Kiểm tra | Kết quả cuối | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | 0 lỗi; build cũng chạy strict TypeScript |
| `npm run lint` | PASS | 0 lỗi; không lint mã JS generated trong trace |
| `npm run db:generate` | PASS | Client 6.19.0; chạy lại sau dừng process giữ DLL |
| `npm run db:migrate` | PASS | 2 migrations, không pending; không reset |
| `npm test -- --reporter=json --outputFile=docs/implementation/unit-results.json` | PASS | **63/63**, 0 FAIL, `unit-results.json` |
| `npm run test:e2e` | PASS | **8/8**, 0 FAIL, 25.4s, `e2e-results.json`; Chromium fake capture |
| `npm run build` | PASS | 38 precache entries, khoảng 781.57 KiB |
| `npm audit` | PASS | 0 vulnerabilities tại thời điểm chạy, `npm-audit.json` |
| `npx tsx scripts/benchmark.ts` | PASS | 9/9 legal; `ai-benchmark.json` |
| `npx tsx scripts/ai-acceptance.ts` | PASS | 12/12 legal trên 4 vị trí × 3 mức; `ai-acceptance.json` |
| `/api/health` với DB local | PASS | HTTP 200, status ok |
| Socket ACK loopback | PASS | 20 ACK, p95 33.21ms; clock giả lập, không nghiệm thu mạng thật |
| `node scripts/backup-check.mjs` | BLOCKED | `backup-restore.json`: thiếu client binaries, restore chưa thực hiện |
| `docker info` | BLOCKED | Không kết nối được Docker Desktop Linux daemon |

Các invariant đã chạy lại: singleton Session/control; tranh ghế không quá hai người; terminal result không ghi lần hai; Save cần đồng ý; Resume chỉ hai người gốc; reconnect không reset budget; AI offline không Backend; media lỗi không hủy trận; soft-delete giữ lịch sử chung; API không trả password hash/email riêng tư và lỗi không lộ SQL/DSN. Không diễn giải các test này thành một chứng nhận không có mọi lỗ hổng.

Lượt trước có FAIL thật và đã xử lý: test SMTP ban đầu chưa decode quoted-printable; test hồ sơ dùng exact text bao gồm nút đóng; locator Admin khớp cả username và username-target. Những lỗi test được sửa đúng assertion/decoder, không bỏ test. WebRTC có lỗi rate budget và negotiation thật, mô tả ở mục 3. Lượt kiểm tra bổ sung lặp hành trình có một PASS và một FAIL ở **register do auth rate-limit cộng dồn**, không phải lỗi media; không nới/tắt auth limiter. Bộ cuối chạy trên Backend khởi động mới để tránh nhiễm trạng thái limiter giữa các lượt QA. Prisma generate khi Backend giữ DLL từng FAIL EPERM; chạy lại sau dừng process đạt. ESLint từng quét JS minified trong trace; đã loại đúng generated artifacts, giữ lint source/tests.

Ma trận vẫn có 137 mã và 71 scenario; các runner group nhiều scenario. Các PASS chỉ có phạm vi ghi trong evidence, không chuyển SMTP/provider/TURN/hardware thành PASS toàn môi trường.

## 3. Lỗi phát hiện và đã sửa

1. **OAuth thiếu state có thể đi qua điều kiện `undefined === undefined`.** Callback giờ yêu cầu code/state/verifier đúng kiểu và định dạng, cookie state khớp, provider khớp; Google có S256; từ chối trước khi fetch provider. Test missing/array/mismatch/cross-provider, không tự merge bằng email, không chiếm identity đã link. Token response thiếu access_token bị từ chối. Fetch provider có timeout 15s.
2. **Camera trả về muộn sau đóng call có thể còn sống.** Generation/peer guard dừng tracks mới nếu call đã đổi/đóng; khóa thao tác mở trùng; loại track đã ended để có thể mở lại. E2E trì hoãn getUserMedia, đóng call, thả kết quả và kiểm tra mọi track ended.
3. **ICE burst dùng chung rate budget với thao tác cờ.** Tách media tối đa 120 events/s khỏi game 20/s; vẫn kiểm tra session, membership, consent, sessionId và payload size. Không để signaling chiếm budget đi quân.
4. **Offer glare / transceiver dư làm kết nối có ICE nhưng không có hình.** Bên Đỏ tạo hai kênh và offer; bên Đen trả lời trên đúng kênh nhận từ offer, không thêm kênh dư. Thiết bị chỉ bật khi kênh sẵn sàng. Diagnostic xác nhận lỗi trước sửa có 4 sender phía trả lời; E2E sau sửa nhận remote frames cả hai phía.
5. SMTP thêm connection/greeting/socket timeout để dịch vụ ngoài không treo request vô hạn. Delivery failure giữ phản hồi trung tính và audit không chứa token.
6. Compose thêm restart policy, Backend healthcheck và truyền TRUST_PROXY; Nginx template có HTTPS/upgrade/static cache phù hợp. Đây là **source/config hardening**, chưa nghiệm thu container/proxy thật.

## 4. BLOCKED / NOT RUN và đầu vào cần cung cấp

| Đầu vào chủ dự án | Trạng thái hiện tại | Kiểm chứng cuối cần thực hiện |
|---|---|---|
| Google/Facebook app credentials, callback domain, tài khoản thử | BLOCKED | Login/link/collision/cancel qua provider thật |
| SMTP sender credentials và mailbox | BLOCKED | Thư nhận thật, spam, URL HTTPS và reset thực |
| HTTPS staging + TURN credentials + hai mạng khác nhau | BLOCKED | Selected relay candidate, UDP/TCP/TLS và lỗi mạng |
| Camera/mic và thiết bị desktop/mobile | BLOCKED | Quyền thật, tháo/đổi device, cleanup và autoplay |
| Browser matrix mục tiêu | NOT RUN | Firefox/Safari/Edge/mobile thật |
| PostgreSQL 18+ client tools, PG_TOOLS_BIN | BLOCKED | Chạy dump/restore DB mới và đối chiếu integrity |
| Docker daemon / host triển khai | BLOCKED | Image build, container health/persistence, staging smoke |
| Người chơi có kinh nghiệm, thiết bị AI mục tiêu | NOT RUN | Đánh giá Khó và CPU/RAM/frame-time trên hardware |
| Môi trường mạng gần Server | NOT RUN | p95 thật; loopback không thay thế |

Không yêu cầu gửi secrets vào chat; cấu hình chúng ngoài source theo `deployment-runbook.md`.

## 5. Rủi ro bảo mật và dữ liệu còn lại

Không thấy secret/JWT/reset-token được đưa vào báo cáo hoặc public config; reset DB lưu hash, refresh cookie HttpOnly, HTTPS bật Secure; private APIs không vào SW cache. Token trong thao tác đăng nhập của browser và trace QA là dữ liệu nhạy cảm; trace nằm trong thư mục ignored, không upload. Audit dependency sạch không thay penetration test.

TURN credentials hiện static và được gửi tới kỳ thủ đã consent: cần quota/rotation ở dịch vụ TURN. Thiếu giám sát/alert vận hành, chính sách retention, backup mã hóa off-host và diễn tập restore. Password/DB secret mẫu local chỉ cho loopback; không dùng ở production. Endpoint forgot có phản hồi trung tính nhưng thời gian xử lý email tồn tại có thể khác unknown email; cần đánh giá timing enumeration/rate protection trên hạ tầng thật. Chưa có pentest độc lập. Admin UI tối thiểu hiển thị tối đa 100 accounts/reports/audit; phạm vi vận hành lớn hơn cần quyết định paging/search trước khi nhận dữ liệu vượt ngưỡng.

PostgreSQL khi khởi động ghi nhận lần trước shutdown không sạch và tự WAL recovery thành công. Không reset cluster; không kết luận không mất dữ liệu chỉ từ dòng log ready. Backup tool hiện BLOCKED nên không chứng nhận disaster recovery. E2E chỉ thay trạng thái tài khoản QA tự tạo; không sửa tài khoản người dùng có sẵn.

## 6. AI hiện tại và lựa chọn tiếp theo

Giữ nguyên engine JS alpha-beta/material/pawn progress; không tích hợp engine/net bên thứ ba và không thay thuật toán trong lượt này.

| Mức | Bằng chứng thực tế | Giới hạn |
|---|---|---|
| Dễ | Depth 1; khoảng 0.04–5ms ở các mẫu; ăn Xe trống, thoát chiếu, mắc bẫy ăn Tốt có Xe bảo vệ | Yếu trước nước đáp trả là hành vi đo được |
| Trung bình | Depth 2; opening khoảng 33ms; tránh bẫy Tốt; hợp lệ/thoát chiếu | Chưa có bộ chiến thuật rộng hoặc Elo |
| Khó | Opening hoàn tất depth 3 trong khoảng 1300ms; vị trí ít quân depth 4; tránh bẫy, ăn Xe, thoát chiếu | Chưa chứng minh mạnh hơn Trung bình trong mọi nhóm thế hoặc đạt kỳ vọng người chơi |

12 mẫu chiến thuật/opening đều legal. Process CPU của mẫu Khó opening khoảng 1359ms CPU /1300ms wall; RSS process Node trước/sau khoảng 74–81MiB. Đây là toàn process, không peak RAM và không đo RAM Worker trên mobile; CPU Windows có độ phân giải thô nên mẫu 0ms không nghĩa là không dùng CPU. Chạy trong Worker không khóa main thread; E2E kiểm tra animation frames vẫn tiến trong 200ms khi Worker đang nghĩ và Undo hủy Worker, Hint trả nước hợp lệ. Không suy ra FPS ổn định hoặc mobile mượt từ assertion này. Guest sessionStorage và User IndexedDB được kiểm tra riêng qua offline reload; không Backend fallback.

Đánh giá sức mạnh Khó: **NOT RUN**. Chưa đủ bằng chứng để tuyên bố đạt; cần bộ mate/tactical/endgame rộng và người chơi mục tiêu. Báo cáo so sánh:

| Phương án | Lợi ích dự kiến / việc phải làm | Trạng thái |
|---|---|---|
| Tối ưu JS hiện có | Quiescence, terminal scoring tại leaf, ordering/TT có giới hạn; giữ Worker/offline. Chỉ nhận thay đổi khi tactical score tăng trong cùng thời gian/RAM và regression đầy đủ | NOT RUN; chưa tối ưu chỉ theo phỏng đoán |
| Pikafish WASM | Cần xác minh bản port, build toolchain, UCI Worker adapter, net/cache budget và mobile memory; không suy ra repo C++ là bản WASM sẵn dùng | NOT RUN; chưa tải/phân phối binary hoặc NNUE |
| Engine khác | Chọn artifact cụ thể có license/provenance rõ, chạy cùng bộ đo trước quyết định | NOT RUN; chưa chọn engine |

Repository chính thức công bố GPLv3 cho engine và mô tả NNUE trong distribution. Trang NNUE license có điều kiện riêng. Phải xác minh **đúng artifact/net/version** trước phân phối; không kết luận mọi bản NNUE có cùng giấy phép. Nguồn kiểm tra ngày 16/10/2026: [Pikafish repository](https://github.com/official-pikafish/Pikafish), [NNUE licensing](https://www.pikafish.com/en/list.html). Chưa có quyết định thay engine.

## 7. Khả năng public và BA-11

Public readiness: **BLOCKED** bởi dịch vụ ngoài, backup/restore và hạ tầng chưa nghiệm thu. Local build không phải release approval. `deployment-runbook.md` cung cấp các bước deploy, proxy/HTTPS, secrets, health, backup, rollback và SW cache; `deploy/nginx.conf.example` chưa chạy nginx -t trên host thật.

Giữ BA-11: restart giữ committed move log, hủy an toàn ACTIVE/RECONNECTING bằng SERVER_RECOVERY; SAVED được giữ, RESUMING trả SAVED. Test recovery local đạt; không đổi thành seamless recovery. Tác động: maintenance/deploy/restart có thể hủy ván đang chơi; chủ dự án phải chấp nhận chính sách và maintenance window trước public. Không scale nhiều Backend instance khi chưa có cơ chế coordination được phê duyệt.

## 8. Công việc cuối theo mức ưu tiên

- **P0:** cấu hình/nghiệm thu provider và mailbox thật; TURN/HTTPS/two-network nếu phát hành video; có backup restore vào DB mới, secrets production và staging HTTPS/WebSocket; chấp nhận BA-11 và maintenance/rollback; định danh release bằng repository/archive checksum. Hiện BLOCKED/NOT RUN.
- **P1:** nghiệm thu browser/mobile/camera/mic, p95 mạng thật, AI Khó với người chơi, alert DB/mail/health, backup retention/off-host, TURN quota/rotation, kiểm tra timing privacy; xử lý giới hạn danh sách Admin nếu dữ liệu dự kiến vượt 100. Hiện BLOCKED/NOT RUN.
- **P2:** mở rộng tactical corpus/đo frame-time và peak Worker RAM, đánh giá tối ưu JS so với WASM sau quyết định giấy phép; rà soát accessibility với screen reader thật. Hiện NOT RUN; không tự mở rộng sản phẩm.

## 9. Điều kiện cụ thể cho PROJECT COMPLETE

Tất cả yêu cầu bắt buộc có evidence thực thi đúng môi trường; không còn FAIL/P0/P1 bắt buộc chưa xử lý. Regression chạy trên release định danh; provider/mailbox/camera/TURN/browser mục tiêu được nghiệm thu; Khó đạt tiêu chí sức mạnh do chủ dự án chốt; real-network latency đạt NFR; staging health/persistence/backup restore/rollback/SW update đạt; secrets, retention và BA-11 được chủ dự án chấp nhận. Chỉ miễn trừ một yêu cầu khi có quyết định scope rõ ràng, không tự chuyển BLOCKED thành PASS.

## 10. Tài liệu và artifact

`unit-results.json`, `e2e-results.json`, `npm-audit.json`, `dependency-versions.json`, `ai-benchmark.json`, `ai-acceptance.json`, `socket-latency.json`, `backup-restore.json`, `deployment-runbook.md`, `admin-mobile.png` và ảnh lobby/AI/PvP. Backup dump chứa dữ liệu riêng tư không thuộc artifact chia sẻ. Các báo cáo ngày 15/10 giữ giá trị checkpoint lịch sử; báo cáo này và JSON lượt cuối là nguồn kết luận mới.

Sau kiểm thử, Backend/preview đã dừng; PostgreSQL dừng sạch bằng pg_ctl fast shutdown và kiểm tra no server running. Dữ liệu persistent được giữ. Không có localhost preview đang phục vụ tại lúc bàn giao.
