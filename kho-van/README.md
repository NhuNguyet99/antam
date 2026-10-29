# Kho vận An Tâm

Trang claude.ai gom dữ liệu của trang chung An Tâm (Đóng hàng · Kho · Giao hàng) và có **Trợ lý AI** hỏi đáp số liệu:
https://claude.ai/artifact/8iwBT1YGqiJ1vTwVQfmzed

- **Đăng nhập**: tài khoản `trolyai` (mật khẩu do chủ trang đặt; lưu dạng băm PBKDF2-SHA256 ở `auth/main`).
  Đây là khóa giao diện – quyền xem trang vẫn do nút *Share* của claude.ai quyết định.
- **Báo cáo tổng quan các bộ phận** ở đầu tab Tổng quan (mở trang luôn vào tab này, báo cáo mở sẵn): 📦 Đóng hàng (khách có đơn, số tuyến,
  Đơn hàng ngày / Tuyến 123, 4 sản phẩm nhiều nhất), 🏭 Kho (bảng TP / NVL: số mã, có nhập, có xuất, tồn âm, dưới tối thiểu, phiếu chờ duyệt),
  🚚 Giao hàng (đã giao / tổng, thanh tiến độ, không giao được, chưa có kết quả, người giao, ảnh).
  **Chi tiết →** sang tab của bộ phận; **Thu gọn** còn 1 dòng.
- **Tab**: Tổng quan (theo ngày: khách, tuyến, đã giao, tổng hàng; tồn kho cần chú ý) · Đơn hàng (lọc 📦 Đơn hàng ngày / 🥙 Tuyến kebab 123) · Tồn kho (TP / NVL) · Giao hàng · 🤖 Trợ lý AI.
- **Cửa sổ trợ lý ở góc**: nút **🤖 Hỏi trợ lý** ở góc dưới phải mọi tab mở cửa sổ chat nhỏ (điện thoại: nửa dưới màn hình). Trợ lý biết đang xem tab, ngày,
  tuyến, kho, từ khóa nào – hỏi "tuyến này", "ngày này" là hiểu; gợi ý câu hỏi đổi theo tab. Dùng chung cuộc trò chuyện với tab Trợ lý AI (nút ⤢).
- **Trợ lý AI**: dùng Claude của tài khoản claude.ai đang mở trang (capability `sample`, lần đầu hỏi cho phép), với 4 công cụ chỉ đọc
  `tong_quan`, `don_hang(ngay, tuyen?, tim?)`, `ton_kho(kho, tim?, chi_canh_bao?)`, `giao_hang(ngay, tuyen?)`. Trợ lý không sửa được 3 web.

## Gói dữ liệu (`goi/…` trong kho dữ liệu của trang)

| Tài liệu | Nguồn | Ai ghi |
|---|---|---|
| `goi/dh-<ngày>`, `goi/dh-<ngày>-t123` | trang chung An Tâm `khoout/<mã>` (đơn đã chia tuyến, dạng TSV) | tác vụ định kỳ (PHẦN K) |
| `goi/giao-<ngày>` | trang chung An Tâm `kho/TP/giao/<ngày>` (kết quả giao) | tác vụ định kỳ |
| `goi/kho` | Kho An Tâm `khovan/kho` – web Kho tự ghi Nhập–Xuất–Tồn hôm nay của **cả kho TP lẫn kho NVL** (sau khi tải số liệu / lưu phiếu, chờ 15 giây; trang mở thì gửi lại mỗi 10 phút) | tác vụ định kỳ |
| `goi/nv` | trang chung An Tâm `nvpub/list` (người giao, không có PIN) | tác vụ định kỳ |
| `goi/anh-<ngày>` | Ảnh giao hàng của trang chung An Tâm, chép sang kho ảnh của trang (`{m: {mã ảnh gốc: "/_blob/<mã mới>"}}`); xem ở tab Giao hàng và cột Giao của tab Đơn hàng (bấm ảnh để phóng to) | Claude chép |
| `goi/index` | `{s: {khóa: stamp/version đã chép}, at}` | tác vụ định kỳ |

4 tác vụ định kỳ "Kho vận – cập nhật từ trang chung An Tâm" (:07, :22, :37, :52 mỗi giờ, 6h–23h) chép các gói trên từ trang chung An Tâm
(https://claude.ai/artifact/ErmZYgHgUzBeTJrtTR6yAC – Đóng hàng + Kho + Giao hàng dùng chung kho dữ liệu từ 30/10/2026), kể cả ảnh giao hàng (K7).
Khi gộp, mã ảnh trong `goi/anh-*` đã đổi sang mã ảnh của trang chung.
Quyền ghi `goi` và `auth`: chỉ người sửa được trang (rules `write: admin`); người xem chỉ đọc.

Đổi mật khẩu `trolyai`: nhờ Claude tạo lại `auth/main` ({u, salt, iter, hash = PBKDF2-SHA256(mật khẩu, salt, iter)}).
