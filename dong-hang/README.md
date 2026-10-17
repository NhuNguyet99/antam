# Đóng hàng An Tâm

Web riêng (trang claude.ai, một file `dong-hang-antam.html`) thay cho Google Sheet **ĐỊNH MỨC ĐÓNG HÀNG - BẢN IN**:

- **Đơn hàng ngày**: danh sách khách theo khu vực, gõ số lượng từng loại bánh là tự lưu (nhiều người nhập cùng lúc được),
  tự tính **định mức đóng hàng** (túi đen / thùng giấy / nhỏ / chung / đại / cây kebab) và **tổng cần chuẩn bị** của ngày.
- **Định mức đóng hàng**: bản in tổng cần chuẩn bị + chi tiết từng khách; tải file in (HTML), tải Excel (CSV),
  **Sao chép cho Phân tuyến** (dán vào web Kho An Tâm › Phân tuyến giao hàng).
- **Khách hàng**: danh mục khách (khu vực, CRM, địa chỉ, SĐT, ghi chú/chành xe, đóng gói mặc định).
- **Thống kê**: theo khoảng ngày – số đơn, bánh, kebab, bao bì, theo khu vực / người tạo đơn / tài xế / thanh toán,
  khách đặt nhiều, khách ngưng đặt; so với cùng số ngày trước đó.
- **Nhập từ Google Sheet**: mở sheet ngày, Ctrl+A, Ctrl+C rồi Ctrl+V vào web – cập nhật danh mục khách và đơn của ngày.
- **Định mức & cài đặt**: bảng số bánh tối đa cho 1 túi / thùng / cây, danh sách sản phẩm (loại size để tính đóng gói).

Quy tắc đóng gói (giống sheet): TÚI ĐEN – mỗi bánh chiếm 1/định mức túi, cộng lại làm tròn lên, kebab túi riêng;
THÙNG (gửi chành / Bà Tám / gửi tàu – tự chọn khi ghi chú có các chữ này) – chọn thùng nhỏ nhất đủ chứa
(giấy → nhỏ → chung → đại), vượt thùng đại thì thêm thùng, kebab đóng cây.

Dữ liệu nằm trong kho dữ liệu của trang: `cfg/main`, `khach/k0..k7` (danh mục khách chia 8 phần), `ngay/<yyyy-mm-dd>` (đơn của ngày).
Người nhập liệu cần được mời vào trang với quyền **Editor**.
