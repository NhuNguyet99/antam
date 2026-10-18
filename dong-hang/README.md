# Đóng hàng An Tâm

Web riêng (trang claude.ai, một file `dong-hang-antam.html`) thay cho Google Sheet **ĐỊNH MỨC ĐÓNG HÀNG - BẢN IN**:

- **Đơn hàng ngày**: danh sách khách theo khu vực, gõ số lượng từng loại bánh là tự lưu (nhiều người nhập cùng lúc được),
  tự tính **định mức đóng hàng** (túi đen / thùng giấy / nhỏ / chung / đại / cây kebab) và **tổng cần chuẩn bị** của ngày.
- **Định mức đóng hàng**: bản in tổng cần chuẩn bị + chi tiết từng khách; tải file in (HTML), tải Excel (CSV),
  **Sao chép cho Phân tuyến** (dán vào web Kho An Tâm › Phân tuyến giao hàng).
- **Tuyến kebab 123**: theo sheet "2-KHÁCH TUYẾN 123" (mẫu tab ngày 18/10): Tuyến 1, Tuyến 2, Tuyến chiều, Tuyến 3.
  Cột Hỗ trợ (tích), CRM, tên, SĐT, tình trạng (tự HOẠT ĐỘNG khi có số), 22/25/28/31 cm (túi), VÀNG/ĐEN (cái),
  CÂY THỊT (kg), Túi 50 / túi lẻ (tự tính từ VÀNG), ghi chú khách + ghi chú ngày. Tổng bánh, túi 50 và DOANH THU từng tuyến
  (giá mặc định 22cm 37.500đ/túi, 25cm 45.000đ/túi, vàng 2.640đ/cái, thịt 125.000đ/kg; sửa ở "Sửa giá").
  **Đưa vào Bánh tuyến** ghi tổng sang dòng BÁNH TUYẾN của Đơn hàng ngày (thịt 5/12/18 kg → cây thịt tương ứng);
  "Cập nhật từ sheet" dán tab ngày để cập nhật khách và số lượng (có thể thay toàn bộ danh sách).
  Dữ liệu: `tuyen123/khach` (khách), `t123/<ngày>` (số lượng).
- **Khách hàng**: danh mục khách (khu vực, CRM, địa chỉ, SĐT, ghi chú/chành xe, đóng gói mặc định).
- **Thống kê**: theo khoảng ngày – số đơn, bánh, kebab, bao bì, theo khu vực / người tạo đơn / tài xế / thanh toán,
  khách đặt nhiều, khách ngưng đặt; so với cùng số ngày trước đó.
- **Nhập từ sheet** (không bắt buộc): danh sách khách đã đưa sẵn lên web; mục này chỉ dùng khi muốn nạp lại từ sheet
  (mở sheet ngày, Ctrl+A, Ctrl+C rồi Ctrl+V vào web).
- **Định mức & cài đặt**: bảng số bánh tối đa cho 1 túi / thùng / cây, danh sách sản phẩm (loại size để tính đóng gói).

Quy tắc đóng gói (giống sheet): TÚI ĐEN – mỗi bánh chiếm 1/định mức túi, cộng lại làm tròn lên, kebab túi riêng;
THÙNG (gửi chành / Bà Tám / gửi tàu – tự chọn khi khu vực hoặc ghi chú có các chữ này) – chọn thùng nhỏ nhất đủ chứa
(giấy → nhỏ → chung → đại), vượt thùng đại thì thêm thùng, kebab đóng cây.

Dữ liệu nằm trong kho dữ liệu của trang: `cfg/main`, `khach/k0..k7` (danh mục khách chia 8 phần), `ngay/<yyyy-mm-dd>` (đơn của ngày).
Người nhập liệu cần được mời vào trang với quyền **Editor**.
