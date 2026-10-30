# Rà soát chức năng và UX — 29/10/2026

> Bảng thiếu chức năng bên dưới là checkpoint trước triển khai. Đợt bổ sung hồ sơ/lịch sử/quản trị được ghi riêng tại [profile-history-admin-results.md](profile-history-admin-results.md); xem tài liệu đó để biết trạng thái mới và bằng chứng kiểm thử.

## Phạm vi và bằng chứng

Đối chiếu SRS v3.0 trong `srs-extracted.txt`, các quyết định phạm vi trong `decisions.md`, mã nguồn workspace hiện tại và các test được chạy thực tế. Rà soát cả Guest/User/Admin: xác thực, hồ sơ, bạn bè, lời mời, phòng Public/Private, ghép cặp, PvP/đồng hồ/reconnect, đồng thuận lưu/tiếp tục/hòa/Undo, chat/video, AI offline, lịch sử/replay và quản trị.

Mọi kiểm thử có ghi dữ liệu trong lượt rà soát này chạy trên PostgreSQL local UTF-8 dành riêng cho test. Không reset hoặc migrate database Supabase của ứng dụng. Cấu hình OAuth/SMTP/TURN chỉ được kiểm tra có/không, không xuất giá trị bí mật. Kết quả local không thay thế nghiệm thu mạng/thiết bị hoặc triển khai public.

## Chức năng còn thiếu hoặc chưa đầy đủ

| Ưu tiên | Chức năng | Bằng chứng và phần cần làm |
|---|---|---|
| P1 | Xem hồ sơ công khai và lịch sử của người khác từ giao diện | AUTH-10 quy định hồ sơ cơ bản công khai; SRS §10.1 quy định quyền xem lịch sử. FE hiện có hồ sơ của chính mình; hàng tìm bạn/bạn bè chưa có luồng mở hồ sơ/lịch sử người đó. BE đã có `/api/users/:id/history` với kiểm tra block/ẩn lịch sử, nhưng chưa được nối vào UI này. Cần bổ sung màn hình/đường vào và bảo toàn quyền riêng tư. |
| P1 | Admin xem trạng thái kỹ thuật của trận | SRS §10.2 yêu cầu đọc log/trạng thái trận khi cần. Hiện Admin có tài khoản, báo cáo và audit; chưa có API/UI đọc danh sách/chi tiết trạng thái trận cho quản trị viên. Chức năng bổ sung phải chỉ đọc, không sửa nước/kết quả. |
| P2 | Duyệt toàn bộ dữ liệu lịch sử và quản trị | Các API lịch sử/tài khoản/báo cáo/audit đang `take: 100`, chưa có phân trang hoặc tìm kiếm server đầy đủ. Người dùng không thể truy cập các bản ghi cũ hơn giới hạn này. Đã bổ sung ghi chú rõ giới hạn 100 ván và phạm vi thống kê trên UI lịch sử; phân trang và tổng thống kê toàn bộ vẫn chưa triển khai. |
| P2 | Lọc lịch sử theo chế độ | SRS §10.1 yêu cầu lọc ngày/đối thủ/kết quả/chế độ. UI có ba bộ lọc đầu; chưa có bộ lọc chế độ. Lịch sử server hiện chỉ lưu PvP, trong khi AI lưu cục bộ, nên cần xác định rõ loại dữ liệu trước khi mở rộng UI/API. |

Đây là danh sách chức năng còn thiếu để phát triển tiếp; lượt này sửa lỗi trên các luồng đã có, chưa tự bổ sung các phân hệ mới ở bảng trên.

## Đã có mã nhưng chưa dùng được đầy đủ do cấu hình/nghiệm thu

- **Google/Facebook:** có luồng OAuth/link tài khoản, nhưng `CLIENT_ID`/`CLIENT_SECRET` đang trống. Chưa thể đăng nhập provider thật.
- **Quên mật khẩu qua email:** có token một lần, hash và luồng reset; SMTP host/user/pass/from chưa được cấu hình nên chưa chứng minh gửi/nhận thư thật.
- **Video qua Internet:** có consent và signaling/WebRTC, test hai peer bằng media giả lập. Chưa có TURN URL/credentials; chưa nghiệm thu NAT, camera/mic và hai mạng khác nhau.
- **Vận hành:** trình duyệt/điện thoại thật, sức mạnh AI Khó với người chơi có kinh nghiệm, backup/restore production và p95 mạng thật vẫn cần nghiệm thu. Các mục này không được gộp vào “đã hoàn tất” chỉ vì test local đạt.

## Lỗi đã sửa và test bảo vệ

| Lỗi trước khi sửa | Hành vi sau sửa | Bằng chứng |
|---|---|---|
| Timeout trong lúc disconnect ghi Match terminal nhưng để Room ở IN_MATCH, không rời/tái đấu được | Match và Room POST_MATCH được ghi trong cùng transaction | `tests/flow-audit.test.ts` |
| Lời mời vào phòng chỉ được lưu DB, không phát sự kiện tức thời | Phát `notification:new` sau khi lưu thành công | `tests/flow-audit.test.ts` |
| Ghép cặp chọn người đã vào phòng/bận hoặc còn lượt tìm cũ của chính mình | Loại lượt tìm cũ, bỏ qua ứng viên không hợp lệ và tiếp tục khi ứng viên hết phiên/đổi phòng trong lúc ghép | `tests/flow-audit.test.ts`, gồm hai race riêng |
| HTTP 429 trả text/HTML trong khi FE luôn đọc JSON | Hai rate limiter trả `{error: "RATE_LIMITED"}`; FE có thông báo tiếng Việt | `tests/flow-audit.test.ts` |
| Mobile ẩn hoàn toàn Bạn bè/Hồ sơ/Admin | Menu cuộn ngang, giữ mọi điểm đến, không tràn chiều ngang trang | `tests/ui/flows.test.ts`, ảnh `flow-audit-mobile.png` |
| Bấm menu bảo vệ lúc refresh phiên đang chạy mở login sai và bị đưa về sảnh | Chờ khôi phục phiên, hiện trạng thái chờ, rồi cho thao tác | `tests/ui/flows.test.ts`, có chặn refresh để tái hiện |
| Liên kết đặt lại mật khẩu bị đóng khi người đang đăng nhập khôi phục phiên | Giữ biểu mẫu reset đến lúc gửi hoặc chủ động đóng | `tests/ui/flows.test.ts` |
| Người nhận tái đấu giữ Match FINISHED cũ, không thấy nút sẵn sàng | Snapshot phòng không còn matchId xóa liên kết trận cũ ở FE | `tests/ui/flows.test.ts` |
| Hết ván không có nút rời phòng | Có luồng rời phòng ở màn hình terminal, trở lại sảnh | `tests/ui/flows.test.ts` |
| Mở sảnh/thông báo bị sync ép quay lại bàn cờ đang chơi | Chỉ khôi phục màn hình game khi sync được yêu cầu rõ ràng | `tests/ui/flows.test.ts` |
| Replay dùng kết quả của trận hiện tại; gợi ý AI có thể hiển thị trên bàn khác | Caption/status theo trận replay; gợi ý chỉ áp dụng bàn AI | `tests/ui/flows.test.ts` có hai kết quả lịch sử khác nhau |
| Dialog đăng nhập không đặt/giữ/trả focus và không hỗ trợ Escape | Focus vào ô nhập, Tab giữ trong dialog, Escape đóng và trả focus; nền inert | `tests/ui/flows.test.ts` |

Ngoài ra đã thêm tên truy cập cho ô tìm bạn, thông báo lượt/kết quả bằng vùng trạng thái và ghi chú giới hạn thống kê lịch sử.

## Giao diện thông báo theo yêu cầu bổ sung

- **Sonner:** toast thành công/lỗi/cảnh báo/thông tin, loading khi thao tác, nút đóng tiếng Việt và giới hạn số toast. Thông báo cập nhật tại cùng vị trí để tránh chồng hàng loạt. Màu sắc/font theo giao diện Kỳ Viện.
- **SweetAlert2:** thay toàn bộ `window.confirm`/`window.prompt` trong FE: gộp Guest, tạo lại ván AI, đầu hàng, xóa tài khoản, quản trị tài khoản và nhập báo cáo. Thao tác chỉ chạy khi xác nhận; Hủy không gửi thay đổi. Nội dung báo cáo kiểm tra ít nhất 5 ký tự, tối đa 1000, trước khi gửi BE.
- Dùng API `text`, không đưa nội dung người dùng vào HTML của dialog. Có focus bàn phím, nền mờ và hỗ trợ giảm chuyển động. Toast và dialog dùng hai thư viện riêng để thông báo mới không thay thế hộp xác nhận đang mở.
- Test mới xác nhận Hủy/Xác nhận đầu hàng, không phát native browser dialog, toast đóng được và kiểm tra báo cáo trước submit. Các test E2E cũ được đổi sang thao tác trên dialog HTML thực.

Ảnh kiểm chứng: `notification-dialog.png`, `notification-toast.png`.

## Chạy lại kiểm thử

Kết quả sau sửa và thay giao diện thông báo: build/typecheck và ESLint đạt; `npm test` **72/72 đạt**. `npm run test:ui` **11/11 bài kiểm thử đạt**, gồm 10 regression UI và một bài điều phối chạy lại **8/8 hành trình E2E đạt**. Không cộng bài điều phối thành một chức năng độc lập. Bộ UI dùng IP riêng cho từng browser context qua proxy loopback tạm, mô phỏng nhiều người dùng và giữ nguyên rate limiter production; thao tác sẵn sàng chờ snapshot của đối thủ thay vì bấm trước khi phiên bản phòng được đồng bộ.

```powershell
# PostgreSQL local cần đang chạy; nếu chưa chạy, mở terminal riêng:
npm run db:local

# Tại terminal kiểm thử, từ gốc dự án:
npm run build
npm run lint
npm test
npx playwright install chromium
npm run test:ui
```

`npm test` dùng DB local `_test`. `npm run test:ui` cũng dùng DB này, tự mở BE/preview bằng cổng tạm rồi đóng khi xong; không cần dừng dev server hiện có. Nó chạy regression UI mới và chạy lại 8 hành trình E2E cũ qua test server local. Cấu hình UI từ chối URL DB cloud ngay cả khi gọi trực tiếp Vitest. Báo cáo Playwright mới: `flow-audit-e2e.json`.

## Ngoài phạm vi bản đầu theo SRS

ELO/xếp hạng/mùa giải, khán giả/livestream, native app, giải đấu, anti-cheat nâng cao, giải thích nước AI bằng LLM, thế cờ học tập tùy chỉnh và nhập/xuất kỳ phổ ngoài website là hạng mục giai đoạn sau. Đặt cược/đổi thưởng bị loại khỏi phạm vi. Không tính các mục này là lỗi thiếu của bản đầu.
