# Web làm việc nội bộ – Kho An Tâm (2 kho)

Web nội bộ thay cho 2 file Excel quản lý kho, giữ nguyên quy trình và mẫu phiếu đang dùng, nhiều người nhập cùng lúc
được, có lưu lịch sử sửa/xóa. Web chứa **2 kho**, chuyển qua lại bằng nút ở góc trên bên trái (mỗi kho một màu):

| Kho | Màu | Chức năng riêng |
|---|---|---|
| **Kho thành phẩm - hàng hóa** (trước đây ghi "Kho tổng") | xanh lá | Tuyến giao hàng (số PXK có mã tuyến), SL Kebab hằng ngày, Kê đơn theo tuyến |
| **Kho nguyên vật liệu** | xanh dương | Kế hoạch mua hàng theo Ngày / Tuần / Tháng (sheet KH Ngày, KH Tuần, KH Tháng) |

Hai kho dùng chung: Lập phiếu nhập/xuất/điều chỉnh, Danh sách phiếu, Sổ nhập – xuất, Nhập – Xuất – Tồn, Thẻ kho,
Kiểm kê, Bàn giao kho, Danh mục mặt hàng. Danh mục, phiếu, số phiếu, tồn kho, biên bản **tách riêng từng kho**
(cùng số PNK-0810-01 có thể tồn tại ở cả 2 kho).

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

Làm lần lượt cho từng kho:

1. Bấm chọn kho ở góc trên bên trái (**Thành phẩm – Hàng hóa** hoặc **Nguyên vật liệu**).
2. Vào **Cài đặt & dữ liệu › Nhập dữ liệu từ file Excel**, chọn file Excel của đúng kho đó (.xlsx).
   Nếu chọn nhầm file của kho kia, web sẽ báo và không nhập.
3. Web đọc: *Danh mục hàng* (mã, tên, ĐVT, nhóm, đơn giá, NCC), cột *Số dư ban đầu / Tồn tối thiểu* ở sheet
   *Nhập Xuất Tồn*, toàn bộ dòng *Sổ Nhập Xuất* (gom các dòng cùng Số phiếu thành một phiếu), cộng thêm
   *Danh mục tuyến* (kho TP) hoặc *KH Ngày* (kho NVL). Chữ "Kho tổng" trong file kho TP tự đổi thành
   "Kho thành phẩm - hàng hóa".
4. Kiểm tra lại ở **Báo cáo › Nhập – Xuất – Tồn** – số liệu phải khớp với sheet Nhập Xuất Tồn của Excel.

Nếu trước đây đã dùng bản web 1 kho, khi chạy bản mới dữ liệu cũ tự chuyển vào **Kho thành phẩm - hàng hóa**
(và "Kho tổng" được đổi tên) – không mất gì.

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
| Kê đơn theo tuyến (kho TP) | **Kê đơn theo tuyến** | Sheet1 |
| Đặt hàng mua NVL (kho NVL) | **KH mua theo ngày** – nhập ngày đặt, bộ phận, mặt hàng, SL, đơn giá (tự lấy, gõ đè được), ngày cần hàng | Sheet KH Ngày |
| Tổng hợp mua theo tuần (kho NVL) | **KH mua theo tuần** – tuần tính Thứ 2 → Chủ nhật, cắt theo tháng | Sheet KH Tuần |
| Kế hoạch mua tháng gửi Kế toán (kho NVL) | **KH mua theo tháng** – SL Xưởng / Văn phòng, đơn giá BQ, thành tiền; in có chữ ký Thủ kho, Kế toán, Giám đốc | Sheet KH Tháng |

Ghi chú:

- Số phiếu được **cấp tự động** theo ngày (và tuyến với phiếu xuất kho TP), STT chạy liên tục trong ngày riêng cho từng
  loại phiếu và từng kho.
  Có thể sửa tay; web báo lỗi nếu trùng số.
- Ô chọn mặt hàng **tìm không dấu**: gõ `tortila 25` hoặc `thit kebab` rồi Enter. Cột *Tồn* hiện tồn sổ trước → sau phiếu,
  báo đỏ nếu xuất vượt tồn.
- Tồn kho = Số dư ban đầu + Nhập − Xuất + Điều chỉnh (điều chỉnh mang dấu +/−), giống công thức Excel.
- Mọi thao tác lập / sửa / xóa đều ghi ở **Lịch sử thao tác** (ai, lúc nào, trước – sau).
- Tên kho, dòng "Bộ phận" in trên phiếu, danh sách bên giao/nhận chỉnh riêng từng kho ở **Cài đặt & dữ liệu**;
  khổ giấy (A4/A5), tên đơn vị, nhân viên… dùng chung.

## Chuyển dữ liệu giữa bản online và bản chạy trên máy

Cả hai bản dùng chung một loại file dữ liệu **.json**:
- Bản online → **Cài đặt & dữ liệu → Tải dữ liệu** ⇒ bản chạy trên máy → **Cài đặt & dữ liệu → Nhập file dữ liệu .json**
  (thay toàn bộ dữ liệu 2 kho trên máy).
- Bản chạy trên máy → **Tải dữ liệu (.json)** ⇒ dùng để cập nhật **trang xem công khai** (nút ⟳ Cập nhật số liệu).

Chỉ nên nhập phiếu ở **một** bản tại một thời điểm, để số liệu không bị tách làm hai.

## Sao lưu

**Cài đặt & dữ liệu › Tải bản sao lưu (.db)** – nên làm cuối mỗi ngày. Khôi phục: tắt web, chép file sao lưu
đè lên `data/kho.db`, chạy lại. Có thể xuất toàn bộ sổ ra CSV để mở bằng Excel.

## Cấu trúc mã

- `server.py` – máy chủ web + API + SQLite (thư viện chuẩn Python).
- `xlsx_import.py` – đọc file .xlsx (không cần openpyxl).
- `static/` – giao diện (HTML/CSS/JS thuần), gồm cả mẫu in phiếu.

## Bản online (không cần cài đặt)

Ngoài bản chạy trên máy (`server.py`), có bản **online trên claude.ai**: mở link là dùng, dữ liệu lưu trực tuyến
và dùng chung cho mọi người được chia sẻ trang (nút *Share* trên trang, cấp quyền **Contributor** hoặc **Editor**
để người đó nhập được phiếu; **Viewer** chỉ xem).

- Cùng giao diện và chức năng với bản chạy máy (2 kho, phiếu, sổ, NXT, thẻ kho, kiểm kê, bàn giao, kế hoạch mua…).
- **In phiếu:** bấm In → hiện bản xem trước → **Tải file để in** → mở file vừa tải, trình duyệt hiện hộp thoại In.
- Xuất CSV và tải bản sao lưu (.json) ở **Cài đặt & dữ liệu**.
- Khi người khác vừa thay đổi dữ liệu, nút **↻ Có dữ liệu mới** hiện trên đầu trang để tải lại.

Mã nguồn bản online: `online/backend.js` (thay cho server.py, chạy trong trình duyệt) + giao diện chung `static/`.
Đóng gói lại thành một trang: `python online/build.py` → `online/kho-antam.html`.

### Trang xem công khai (ai có link cũng xem, không cần đăng nhập)

`python online/build.py --view du-lieu.json` tạo `online/kho-antam-xem.html`: cùng giao diện nhưng **chỉ xem**
(ẩn mọi nút lập/sửa/xóa), số liệu chụp sẵn trong trang nên người xem không cần tài khoản. File này chứa số liệu
thật nên **không commit** (đã có trong `online/.gitignore`).

Cập nhật số liệu cho trang xem (chủ trang làm):
1. Web chính → **Cài đặt & dữ liệu** → **Tải dữ liệu** (file .json, đủ 2 kho).
2. Mở trang xem → nút **⟳ Cập nhật số liệu** (chỉ chủ trang thấy) → chọn file → **Đăng số liệu mới**.
   Trang tự đăng lại chính nó với số liệu mới; ai mở link sẽ thấy ngay.
