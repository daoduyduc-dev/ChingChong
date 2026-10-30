# Cải thiện UI và accessibility — 29/10/2026

Cập nhật xác minh cuối: 30/10/2026 (giờ Việt Nam).

Nguồn: nhận xét giao diện người dùng cung cấp trong Pasted text.txt. Giữ phong cách xanh/kem và Be Vietnam Pro/Literata hiện có.

## Các nhóm sửa

| Yêu cầu | Thực hiện |
|---|---|
| Chữ nhỏ, tương phản | Root theo cỡ chữ trình duyệt, màu text/text-muted/accent dùng biến; tăng cỡ chữ phụ/nội dung, input mobile 16px; kiểm tra axe có contrast |
| Bàn cờ mobile | Giảm padding/viền, bỏ border !important; chế độ phóng to có cuộn để đạt ô 44px, không chồng các vùng bấm |
| Bàn phím bàn cờ | Roving tabindex một ô, phím mũi tên theo hướng nhìn, Enter/Space chọn, Escape bỏ chọn; tên quân/màu/tọa độ tiếng Việt và aria-pressed |
| Trạng thái bàn cờ | Đánh dấu đích bằng chấm, đích ăn quân bằng dấu × và viền; ô tướng bị chiếu và nước cuối nổi bật |
| Quân và đồng hồ | Avatar đổi theo màu quân thật cả AI/PvP/replay; viền bên tới lượt; PlayerClock tự cập nhật, nhãn thời gian/không giới hạn và trạng thái dưới 30/10 giây; không đọc lại mỗi giây |
| Điều hướng | SVG Lucide, aria-current, title/aria-label, Admin cùng kiểu; mobile có bốn mục chính và Thêm; skip link |
| Thông báo | Bell SVG, badge rõ, aria-expanded/controls; Escape/bấm ngoài đóng, panel giới hạn theo viewport |
| Form | AuthDialog tách riêng, lỗi cạnh trường với aria-invalid/describedby, lỗi máy chủ giữ trên form, hiện/ẩn mật khẩu, gợi ý độ mạnh; giữ luồng đăng ký rồi đăng nhập |
| Loading/empty | Skeleton danh sách, CTA tạo phòng đầu tiên; trạng thái gửi tại form/tạo phòng/tìm trận; loading/update tránh thanh nav mobile |
| Replay/video | Shortcut ←/→/Space, SVG có nhãn; lịch sử nước tự cuộn; media toggle có aria-pressed, nút lớn và PiP mobile |
| Cấu trúc | Tách LobbyPage, FriendsPage, ProfilePage, AuthDialog, Navigation, NotificationPanel, AdminView, useAiWorker, PlayerClock; Admin/Video tải riêng; App còn điều phối trận/socket |
| Avatar | Resize 512px, nén WebP trước gửi, giới hạn dữ liệu, kích thước ảnh và alt phù hợp |
| PWA/meta | Icon PNG 192/512, maskable/apple180, favicon/theme-color/OG; update có thông báo, người dùng chọn, chặn cập nhật giữa ván |
| Motion | Reduced-motion áp dụng toàn cục, tránh hiệu ứng rung/transition khi người dùng yêu cầu giảm chuyển động |

## Lựa chọn triển khai

- Bàn cờ 9 cột ở viewport 360px không thể có 90 vùng chạm 44px mà không chồng nhau. Chế độ vừa màn hình tối đa hóa diện tích; chế độ phóng to 520px cung cấp vùng chạm lớn và cuộn ngang cục bộ.
- Chưa thêm state library hoặc tái cấu trúc toàn bộ luồng điều phối trận. Các state/effect còn trong App gắn với cơ chế phiên, socket và đồng thuận; đã tách các phần UI độc lập và Worker/đồng hồ. App giảm từ khoảng 2.800 xuống khoảng 2.155 dòng.
- Giữ glyph quân cờ và font fallback hiện tại; chưa đưa cả bộ font CJK dung lượng lớn vào cache offline. CSS có hiệu ứng trạng thái; chưa viết lại hệ render quân thành các thực thể di chuyển giữa ô.
- Khai báo light color-scheme; chưa tạo theme tối mới. OG preview là ảnh chung; dữ liệu phòng riêng không được công khai trong metadata.

## Xác minh

Thêm axe-core/Playwright và kiểm tra ở 360/768/1280px. Chín lượt quét trên sảnh, form xác thực và AI không có lỗi serious/critical, có bật quy tắc color-contrast. Tám kiểm thử accessibility bao gồm bàn phím/màu quân, icon PWA, lỗi form/hiện mật khẩu, thông báo và cảnh báo đồng hồ đã đạt. Có kiểm tra riêng vùng chạm tối thiểu 44px trong chế độ phóng to 360px.

Lượt UI tổng có 22/23 đạt. E2E còn dùng selector cũ `.video small` và ký hiệu replay `→|`; đã chuyển sang `.video-status` và tên truy cập “Đến nước cuối”, giữ nguyên assertion nghiệp vụ. Chạy lại E2E cuối đạt 8/8, không retry/flaky (flow-audit-e2e.json, 30/10/2026 09:25 giờ Việt Nam). Build production, typecheck và lint đã đạt; Admin/Video thực sự có chunk riêng. Các fixture chỉ ghi vào PostgreSQL local riêng.

Lượt xác minh cuối `npm run test:ui -- tests/ui/journeys.test.ts tests/ui/accessibility.test.ts`: **9/9 PASS**, gồm 8 kiểm thử accessibility và wrapper chạy 8 E2E. Các file flows/features đã đạt ở lượt tổng trước. Ảnh mới: `accessibility-lobby-360/768/1280.png` và `accessibility-board-360/768/1280.png`. Kết quả axe chỉ xác nhận các màn và quy tắc đã quét; chưa thay thế kiểm thử trên thiết bị iOS/Android và trình đọc màn hình thật.
