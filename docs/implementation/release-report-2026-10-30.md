# Kỳ Viện — kết quả hoàn thiện, deploy và nghiệm thu 30/10/2026

**Kết luận: bản local đã triển khai và kiểm thử đạt; toàn hệ thống vẫn PARTIALLY COMPLETE.** Không tuyên bố 100% hoặc public deployment khi chưa có Supabase connection string, host/domain và các dịch vụ/thiết bị cần nghiệm thu. Đã hoàn thành các việc khả thi trong môi trường này; các đầu vào còn thiếu được tổng hợp ở cuối, không hỏi rải rác trong quá trình làm.

## Bản đã bàn giao

- Đã fast-forward `main` từ `7060312` lên GitHub `cc0e5b9`, working tree ban đầu sạch. Giữ cấu trúc mới client/server và nghiệp vụ đăng ký rồi đăng nhập. Thay đổi của lượt này nằm local, chưa push GitHub.
- **URL chạy được: http://127.0.0.1:5180.** FE production build phục vụ qua Nginx, Express/Socket.IO ở container Backend, PostgreSQL có persistent volume riêng. Cả ba container healthy. Đây là deploy local, không phải URL public.
- Giữ nguyên hỗ trợ **Supabase PostgreSQL qua Prisma**. Auth do Backend quản lý, không dùng Supabase Auth. File `compose.external-db.yaml` triển khai FE/BE với database ngoài; không tạo DB local thay cho Supabase. Đã validate Compose config, **chưa chạy Supabase thật**.
- Trên máy này `server/.env` không có khi pull vì là secrets ignored. Đã chuyển cấu hình PostgreSQL local cũ ở root vào đó, không ghi đè secrets Supabase có sẵn. Hiện không có Supabase URL/hosting credentials; không có truy cập hoặc migrate cloud DB trong lượt này.
- Test data chỉ ở `kyvien_utf8_test` (54329) và release rehearsal riêng (54330). DB local cũ được backup rồi áp dụng hai migration mới, không reset hoặc xóa dữ liệu người dùng.

## Kết quả chạy thực tế

| Kiểm tra | Trạng thái | Evidence / phạm vi |
|---|---|---|
| Clean dependency install | PASS | `npm ci`; lần đầu bị DLL của PG giữ, đã dừng PG và cài lại thành công |
| Prisma generate | PASS | Client 6.19.0, schema tại server/prisma |
| Migrations | PASS | 4 migrations; 2 mới đã apply local sau backup, container DB mới apply đủ 4 |
| Typecheck / lint / build | PASS | FE/BE/tests strict; production build 48 precache entries, khoảng 1071KiB |
| Logic/API/DB/Socket tests | PASS | **76/76**, 0 FAIL; `release-unit-results.json` |
| UI/flows/accessibility | PASS | **23/23**, 0 FAIL; `release-ui-results.json`; bao gồm wrapper chạy **8/8 E2E**, không cộng wrapper như 8 test UI độc lập |
| Nginx + container acceptance | PASS | **8/8** hành trình cũ trên bản deploy; `deployment-e2e-results.json`, gồm hai batch 7+1 |
| Chromium / Firefox / WebKit smoke | PASS | **3/3**, responsive 390px, bàn phím, API proxy, Worker, reload offline và tiếp tục đi quân không Backend; `deployment-browser-results.json` |
| Docker images / Compose deployment | PASS | Build FE/BE Linux, PostgreSQL volume, Nginx config `nginx -t`, cả ba healthy |
| Cold restart/persistence | PASS | Stop/start toàn stack; User 15/15, Move 9/9, Match terminal 3/3, digest nguyên vẹn; Identity 0/0 không suy ra coverage identity restore; `release-operations-results.json` |
| WebSocket upgrade qua Nginx | PASS | Socket.IO bắt buộc `transports:[websocket]`, không dùng polling fallback; health 200 sau restart |
| Backup/restore DB local cũ | PASS | Dump và restore vào DB mới, 12 bảng khớp count + content digest; `backup-restore.json`; không ghi đè nguồn |
| Runtime dependency audit | PASS | **0 vulnerabilities**, `release-production-audit.json` |
| Toàn dependency tree | FAIL | Còn **4 low**, 0 moderate/high/critical; tất cả cùng nguồn deepmerge trong tooling build PWA; `release-audit.json` |
| AI benchmark | PASS | 9/9 legal opening samples và 12/12 tactical/opening samples; `ai-benchmark.json`, `ai-acceptance.json` |
| Socket latency loopback | PASS | 20 ACK, p95 **35.53ms**, clock giả lập; không nghiệm thu mạng thật |
| GitHub Actions | NOT RUN | Đã thêm workflow kiểm chứng; chưa push/chạy trên GitHub runner |
| Public HTTPS / Supabase / provider thật | BLOCKED | Thiếu đầu vào được liệt kê bên dưới |

Không cộng các test trùng hành trình giữa local và container thành một con số coverage riêng. Browser smoke WebKit không thay cho Safari trên iPhone; Firefox của Playwright trên Windows không thay cho toàn bộ browser/hardware matrix. WebRTC E2E nhận media qua hai peer thật với fake capture của Chromium, không thay cho camera/mic hay TURN qua hai mạng.

## Đã làm và lỗi đã xử lý

1. **Vá dependencies:** body-parser 2.3.0 → 2.4.0, Nodemailer 10.1.1 → 10.3.1, fast-uri 3.1.8 → 3.1.9, qs 6.16.0 → 6.17.1, serialize-javascript 7.1.2 → 7.1.4. Cập nhật trong semver tương thích và lockfile; regression chạy sau cập nhật. Không dùng audit force để hạ PWA xuống bản 0.2.1 phá API.
2. **Deploy đầy đủ:** thêm frontend Dockerfile multistage, Nginx static/API/WebSocket proxy, frontend service và port variables. Secrets vẫn backend-only; cache API no-store, SW/index không cache dài, assets hash immutable. Dùng 5180 vì 8080 thuộc dịch vụ khác; không dừng dịch vụ đó.
3. **Supabase:** thêm Compose dành database ngoài, không đổi DB abstraction hoặc đưa URL vào FE. README phân biệt Supabase, local app DB, test DB và container rehearsal. Secret không xuất hiện trong image build context, source archive hoặc báo cáo.
4. **Backup thiếu binaries:** client Docker postgres:18 thay cho client Windows chưa cài; credentials qua env, restore DB mới, thêm digest ngoài row counts. Native client vẫn được hỗ trợ qua PG_TOOLS_BIN. Đã chạy PASS thực tế trước migration.
5. **UI test Admin có race:** sau tìm kiếm, chờ danh sách chỉ còn đúng một bản ghi rồi bấm trong hàng có ID mục tiêu. Không bấm `.first()` vào bản ghi không xác định; không tắt test.
6. **Test infra:** các runner ban đầu ghi/xóa chung trace folder làm E2E lỗi ENOENT, đã tách outputDir. Nhiều context qua Nginx cùng IP chạm auth limiter 25/min; chia batch cách nhau 61s, không tắt/nới limiter hoặc tin XFF giả. Đã chạy lại toàn bộ 8 hành trình qua proxy đạt. Reporter ở config con cần absolute output path; đã sửa và xuất evidence đúng thư mục.
7. **Vận hành:** thêm helper deploy giữ secrets và volume, acceptance runner, cross-browser smoke, cold restart/persistence/WebSocket check và workflow CI tuần tự. Helper từ chối tạo password mới nếu đã có volume nhưng mất env. Giữ chính sách BA-11, không thêm Redis/ELO/spectator/engine khác.

## Bảo mật còn lại và AI

Audit ban đầu có 9 findings (1 high, 3 moderate, 5 low). Sau bản vá còn 4 low từ deepmerge → rollup resolver → workbox → PWA; không có bản vá upstream được công bố tại lúc kiểm tra. Đây là dependency tooling; Backend image hiện vẫn cài cả tooling, nên không nói toàn image không có finding chỉ vì runtime audit sạch. Không có dữ liệu người dùng đi vào cấu hình build trong luồng hiện tại. Theo dõi upstream; không tự thay thư viện merge/API hoặc gỡ PWA để làm con số audit về 0. Nguồn: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

AI giữ nguyên JavaScript alpha-beta, chưa tích hợp Pikafish/net. Ba mức hoàn tất depth 1/2/3–4 trên mẫu đã đo; Khó opening khoảng 1302ms trên i5-12500H khi máy cũng chạy tác vụ kiểm thử, không phải benchmark mobile. Mọi mẫu hợp lệ; Trung bình/Khó tránh bẫy Tốt được Xe bảo vệ trong fixture, Dễ mắc bẫy; cả ba thoát chiếu/ăn Xe trống. Undo/Hint, Guest sessionStorage, User IndexedDB, thiếu Worker asset và không Backend offline đã chạy E2E. **Sức mạnh Khó với người có kinh nghiệm, peak RAM/FPS trên điện thoại thật: NOT RUN.** Không có thay thuật toán không được đo hoặc tuyên bố tương đương Pikafish.

TLS public, secret rotation, TURN credentials ngắn hạn/quota, backup off-host/retention và alert vận hành cần hạ tầng thật. Không dùng password/JWT local vào public. Logs/trace/dump cần bảo vệ; dump và trace không nằm trong archive chia sẻ. Không có pentest độc lập; audit sạch runtime không chứng nhận hết mọi lỗ hổng.

## BA-11 và rollback

Giữ chính sách restart hủy an toàn ACTIVE/PAUSED_RECONNECT, reason SERVER_RECOVERY, giữ biên bản và SAVED; regression recovery đạt. Cold restart thực của container chứng minh dữ liệu terminal còn nguyên, không chứng minh seamless active recovery. Không đổi nghiệp vụ khi thiếu ý kiến chủ dự án. Trước public cần chấp nhận maintenance window vì deploy/restart có thể hủy ván đang chơi. Rollback về một release production trước **NOT RUN** vì chưa có release/host đó; local source archive, file checksums và image IDs được lưu để có bản bàn giao xác định.

## Những phần bỏ qua do thiếu dữ liệu / cần quyết định của chủ dự án

| Ưu tiên | Đầu vào / quyết định còn thiếu | Trạng thái và bước sau |
|---|---|---|
| P0 | **Supabase DATABASE_URL/password** của đúng project; endpoint cho Prisma/migrations; quyền backup | BLOCKED — cấu hình tại server/.env/secret store, kiểm tra kết nối, migration status và backup; không suy ra từ README rằng credentials đang tồn tại trên máy này |
| P0 | **Host/container platform, domain, quyền deploy/DNS/TLS** và chi phí được duyệt | BLOCKED — chưa có URL public; chạy compose.external-db, proxy HTTPS và nghiệm thu ngoài Internet. Sites Workers không trực tiếp đáp ứng Backend hiện tại |
| P0 | **SMTP credentials + sender + mailbox** | BLOCKED — adapter/reset đã PASS local SMTP, chưa chứng minh nhận thư thật |
| P0 | **Google/Facebook credentials, callback/domain/permissions và account test** | BLOCKED — mock provider/state/PKCE/link đã regression PASS, chưa login provider thật |
| P0 nếu phát hành video | **TURN + HTTPS + hai mạng và camera/mic thật** | BLOCKED — kiểm tra relay candidate và từ chối/tháo/đổi thiết bị; không gọi loopback là TURN PASS |
| P1 | **Thiết bị/browser mục tiêu và người chơi nghiệm thu Khó** | NOT RUN — Playwright đã thử 3 engine nhưng chưa Safari/iOS/Android/Edge thực, chưa đấu người có kinh nghiệm |
| P1 | **Chấp nhận BA-11, maintenance, retention, RPO/RTO và backup off-host** | NOT RUN — cần lựa chọn vận hành của chủ dự án; không tự chọn chính sách phá lịch sử |
| P1 | **Môi trường mạng gần server, production monitoring và pentest** | NOT RUN — loopback p95 không thay nghiệm thu real-network/performance/security |
| P2 | Upstream deepmerge patch / quyết định thay tooling nếu cần | FAIL còn 4 low — không có bản vá để tự áp dụng; không hạ PWA phá tương thích |
| P2 | Push/CI/release production trên GitHub | NOT RUN — source thay đổi và workflow đã chuẩn bị local; chưa push hoặc tạo deployment cloud |

Không yêu cầu người dùng gửi secrets vào chat. Hướng dẫn từng bước ở [release-runbook.md](release-runbook.md). Sau khi có các đầu vào trên, chạy nghiệm thu đúng môi trường; chỉ PROJECT COMPLETE khi mọi yêu cầu bắt buộc đạt hoặc có quyết định miễn trừ scope rõ ràng. Hiện có thể mở và đánh giá bản deploy local, không thể trung thực ghi 100% toàn môi trường.

## Trạng thái bàn giao

Docker deployment giữ chạy để mở tại http://127.0.0.1:5180. PostgreSQL embedded dùng cho unit/UI đã dừng sạch; persistent data được giữ. Không có reset, xóa volume hoặc thay đổi DNS/cloud. [Release manifest](release-manifest.json) ghi checksums source/build và image IDs; source/static archives nằm ở `.local/releases`, không kèm secrets, DB, node_modules hoặc trace. Mọi kết luận phía trên dựa trên JSON lượt 30/10, các báo cáo 15/16/29 là checkpoint lịch sử.
