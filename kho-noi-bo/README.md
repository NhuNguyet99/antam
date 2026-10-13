# Web làm việc nội bộ – Kho Thành phẩm & Hàng hóa An Tâm

Web nội bộ thay cho file Excel quản lý kho (các sheet *Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất,
Phiếu Nhập Xuất, Phiếu Điều chỉnh, Nhập Xuất Tồn, Thẻ kho, Kiểm kê, Bàn giao kho, SL Kebab hàng ngày*),
giữ nguyên quy trình và mẫu phiếu đang dùng, nhưng nhiều người nhập cùng lúc được, có lưu lịch sử sửa/xóa.

## Cài đặt và chạy

Chỉ cần **Python 3.8 trở lên** (không cần cài thêm thư viện, không cần Internet).

- **Windows**: cài Python từ python.org (tick "Add Python to PATH"), rồi bấm đúp `chay-web.bat`.
- **macOS / Linux**: `./chay-web.sh` (hoặc `python3 server.py`).

Mở trình duyệt: <http://localhost:8000>. Máy khác **cùng mạng nội bộ** mở `http://<IP-máy-chạy-web>:8000`
(xem IP bằng lệnh `ipconfig` trên Windows). Nếu Windows Firewall hỏi, chọn *Allow* cho mạng Private.

Tùy chọn (biến môi trường):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8000` | Cổng web |
| `ANTAM_PASSWORD` | (trống) | Đặt mật khẩu: trình duyệt sẽ hỏi đăng nhập (tên tùy ý, mật khẩu này) |
| `ANTAM_DB` | `data/kho.db` | File dữ liệu |

Toàn bộ dữ liệu nằm trong **một file `data/kho.db`** – nên để web chạy trên một máy cố định và sao lưu file này.

## Bắt đầu: chuyển dữ liệu từ Excel sang

1. Vào **Cài đặt & dữ liệu › Nhập dữ liệu từ file Excel**, chọn file Excel kho đang dùng (.xlsx).
2. Web đọc: *Danh mục hàng* (mã, tên, ĐVT, nhóm, đơn giá, NCC), *Danh mục tuyến*, cột *Số dư ban đầu / Tồn tối thiểu*
   ở sheet *Nhập Xuất Tồn*, và toàn bộ dòng *Sổ Nhập Xuất* (gom các dòng cùng Số phiếu thành một phiếu).
3. Kiểm tra lại ở **Báo cáo › Nhập – Xuất – Tồn** – số liệu phải khớp với sheet Nhập Xuất Tồn của Excel.

## Quy trình hằng ngày (giống file Excel)

| Việc | Trên web | Tương ứng Excel |
|---|---|---|
| Nhập kho từ xưởng | **Lập phiếu › PNK · Nhập** | Ghi Sổ Nhập Xuất, số `PNK-ngàytháng-STT` |
| Xuất kho theo tuyến | **Lập phiếu › PXK · Xuất**, chọn tuyến | Số `PXK-ngàytháng-STT-mã tuyến` |
| Điều chỉnh (thiếu/thừa, khách trả…) | **Lập phiếu › DCK · Điều chỉnh** – nhập *Tồn thực tế* hoặc *SL điều chỉnh (+/−)* | Số `DCK-ngàytháng-STT` |
| In phiếu | Nút **Lưu & In** / **In phiếu**; in cả ngày: **Danh sách phiếu › In tất cả phiếu trong danh sách** | Sheet Phiếu Nhập Xuất / Phiếu Điều chỉnh |
| Sửa / xóa phiếu | Mở phiếu ở **Danh sách phiếu** hoặc **Sổ nhập – xuất** | Sửa dòng trong sổ |
| Xem tồn | **Nhập – Xuất – Tồn** (theo ngày/kỳ, cảnh báo tồn âm, dưới tối thiểu) | Sheet Nhập Xuất Tồn |
| Theo dõi 1 mặt hàng | **Thẻ kho** | Sheet Thẻ kho |
| Kiểm kê | **Kiểm kê kho** › nhập số đếm › **Tạo phiếu điều chỉnh (DCK)** từ chênh lệch; có *In phiếu đếm (ẩn tồn sổ)* để đếm mù | Sheet Kiểm kê + Phiếu Điều chỉnh |
| Bàn giao ca / thủ kho | **Bàn giao kho** | Sheet Bàn giao kho |
| Sản lượng kebab | **SL Kebab hằng ngày** | Sheet SL Kebab hàng ngày |
| Kê đơn theo tuyến | **Kê đơn theo tuyến** | Sheet1 |

Ghi chú:

- Số phiếu được **cấp tự động** theo ngày (và tuyến với phiếu xuất), STT chạy liên tục trong ngày riêng cho từng loại phiếu.
  Có thể sửa tay; web báo lỗi nếu trùng số.
- Ô chọn mặt hàng **tìm không dấu**: gõ `tortila 25` hoặc `thit kebab` rồi Enter. Cột *Tồn* hiện tồn sổ trước → sau phiếu,
  báo đỏ nếu xuất vượt tồn.
- Tồn kho = Số dư ban đầu + Nhập − Xuất + Điều chỉnh (điều chỉnh mang dấu +/−), giống công thức Excel.
- Mọi thao tác lập / sửa / xóa đều ghi ở **Lịch sử thao tác** (ai, lúc nào, trước – sau).
- Khổ giấy in (A4/A5), tên đơn vị, danh sách nhân viên, bên giao/nhận… chỉnh ở **Cài đặt & dữ liệu**.

## Sao lưu

**Cài đặt & dữ liệu › Tải bản sao lưu (.db)** – nên làm cuối mỗi ngày. Khôi phục: tắt web, chép file sao lưu
đè lên `data/kho.db`, chạy lại. Có thể xuất toàn bộ sổ ra CSV để mở bằng Excel.

## Cấu trúc mã

- `server.py` – máy chủ web + API + SQLite (thư viện chuẩn Python).
- `xlsx_import.py` – đọc file .xlsx (không cần openpyxl).
- `static/` – giao diện (HTML/CSS/JS thuần), gồm cả mẫu in phiếu.
