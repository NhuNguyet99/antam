# Web làm việc nội bộ – Kho An Tâm (2 kho)

Web nội bộ thay cho 2 file Excel quản lý kho, giữ nguyên quy trình và mẫu phiếu đang dùng, nhiều người nhập cùng lúc
được, có lưu lịch sử sửa/xóa. Web chứa **2 kho**, chuyển qua lại bằng nút ở góc trên bên trái (mỗi kho một màu):

| Kho | Màu | Chức năng riêng |
|---|---|---|
| **Kho thành phẩm - hàng hóa** (trước đây ghi "Kho tổng") | xanh lá | Tuyến giao hàng (số PXK có mã tuyến) |
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

**Cho nhân viên dùng:** vào **Cài đặt & dữ liệu › Cho nhân viên dùng web** để xem link (dạng `http://192.168.x.x:8000`),
gửi cho nhân viên; ai dùng máy tính/điện thoại cùng wifi công ty đều mở được. Đặt mật khẩu: tạo file `mat-khau.txt`
cạnh `server.py`, gõ mật khẩu ở dòng đầu, tắt và mở lại web (trình duyệt sẽ hỏi; tên đăng nhập gõ gì cũng được).

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
| Chia khách đặt hàng vào tuyến (kho TP) | **Phân tuyến giao hàng** – dán sheet ngày, tự chia, in danh sách từng tuyến | File Google Sheet báo cáo tuyến lẻ |
| Người giao xem tuyến của mình, báo đã giao | **Web giao hàng** (mỗi người 1 nick + PIN, tạo ở **Tài khoản giao hàng**) | – |
| Đặt hàng mua NVL (kho NVL) | **KH mua theo ngày** – nhập ngày đặt, bộ phận, mặt hàng, SL, đơn giá (tự lấy, gõ đè được), ngày cần hàng | Sheet KH Ngày |
| Tổng hợp mua theo tuần (kho NVL) | **KH mua theo tuần** – tuần tính Thứ 2 → Chủ nhật, cắt theo tháng | Sheet KH Tuần |
| Kế hoạch mua tháng gửi Kế toán (kho NVL) | **KH mua theo tháng** – SL Xưởng / Văn phòng, đơn giá BQ, thành tiền; in có chữ ký Thủ kho, Kế toán, Giám đốc | Sheet KH Tháng |

## Phân tuyến giao hàng (kho TP)

**Tự động từ web Đóng hàng An Tâm**: đơn hàng ngày (đã chia tuyến) và tuyến kebab 123 nhập ở web Đóng hàng được tác vụ
tự động mỗi giờ chép vào `dhin/*` của trang kho. Khi có người mở web kho (trang tự kiểm tra 2 phút/lần), kho tự lập hoặc cập
nhật bảng Phân tuyến của ngày đó (tiêu đề "… (web Đóng hàng)", giữ tuyến đã chọn tay), lưu, ghi đã nhận ở `dhdone/index`,
rồi để sẵn gói chuyển sang Giao hàng An Tâm như khi bấm Lưu. Không cần dán sheet cho các đơn này nữa.
Trang Giao hàng An Tâm cũng nhận thẳng cùng bản đó (`dhin/*` của trang giao hàng) và tự lập tuyến cho từng người giao, không
phụ thuộc web kho; bảng kho chuyển tiếp mang cùng mã nguồn (`data.from`) nên thay đúng bảng, không nhân đôi.

Mục **Phân tuyến giao hàng** chia khách đặt hàng trong ngày vào các tuyến, theo file Google Sheet
"BÁO CÁO HẰNG NGÀY TUYẾN LẺ" (mỗi ngày một sheet, vd `14.10`):

1. Trên Google Sheet mở sheet của ngày, bấm `Ctrl+A` rồi `Ctrl+C`.
2. Trên web: **Phân tuyến giao hàng › + Phân tuyến ngày mới**, chọn ngày, bấm vào ô dán và `Ctrl+V`, rồi bấm
   **Lấy khách & chia tuyến**. Cách khác: tải file về (.xlsx hoặc .csv) và chọn file. Với file .xlsx, web tự mở sheet
   trùng ngày đã chọn.
3. Web chỉ lấy khách có cột **TRẠNG THÁI = HOẠT ĐỘNG**. Khách được xếp tuyến theo thứ tự ưu tiên:
   - cột **TUYẾN** (danh sách chép từ web Đóng hàng An Tâm › Sao chép cho Phân tuyến đã chia tuyến sẵn);
   - tuyến đã chọn tay cho mã khách đó lần trước;
   - cột **QUẬN**;
   - **địa chỉ** của khách.

   Khách chưa xếp được tuyến hiện màu đỏ. Chọn tuyến ở cột *Tuyến*, web sẽ nhớ cho các ngày sau.
4. **Lưu**, rồi chọn kiểu in:
   - **In danh sách giao theo tuyến**: mỗi tuyến một trang, có số lượng từng loại bánh và cột ký nhận;
   - **In tổng hợp tuyến**: số khách và tổng hàng của từng tuyến, dùng để soạn hàng và xuất kho.

Cột **Mã CRM** (cột CRM của sheet) hiện ở bảng, trên bản in và trong file **⬇ Tải danh sách mã CRM** (CSV mở bằng Excel:
mã CRM, mã khách, tên, địa chỉ, tuyến, số lượng; theo tuyến đang xem). Tuyến chọn tay được nhớ theo mã CRM, dòng chưa có
mã CRM thì nhớ theo mã ở đầu tên khách.

Quận nào thuộc tuyến nào được chỉnh ở nút **⚙ Quy tắc chia tuyến**: mỗi tuyến ghi các quận/khu vực, cách nhau bằng
dấu phẩy.

## Web giao hàng (mỗi người giao hàng 1 tài khoản)

Người giao hàng xem **tuyến đã được sắp của từng ngày** (lấy từ mục Phân tuyến giao hàng) trên điện thoại:

1. Kho TP: **Danh mục › Tài khoản giao hàng › + Thêm người giao hàng** – đặt **nick** (không dấu, viết liền, vd `tuan.hm`),
   họ tên, SĐT, **mã PIN** (4–8 chữ số) và **tuyến thường chạy**. Khóa / đổi PIN / xóa ở cùng trang.
2. Mỗi ngày, sau khi chia tuyến ở **Phân tuyến giao hàng**, cột **Người giao** của bảng tổng hợp tự điền người có tuyến
   thường chạy là tuyến đó; ngày nào đổi người thì chọn lại rồi bấm **Lưu**. Người giao chỉ thấy tuyến sau khi bảng đã **Lưu**.
3. Người giao mở web giao hàng, đăng nhập nick + PIN (trình duyệt nhớ đăng nhập), chọn ngày (◀ ▶, mặc định hôm nay):
   - mỗi tuyến: tổng **hàng cần mang**, danh sách khách theo thứ tự trong bảng phân tuyến – mã CRM, địa chỉ (bấm mở Google Maps),
     SĐT (bấm để gọi), ghi chú, tình trạng thanh toán, số lượng từng loại bánh;
   - bấm **✓ Đã giao** hoặc **✗ Không giao được** (chọn/ghi lý do); bấm **Hoàn tác** nếu bấm nhầm;
   - danh sách "Các ngày có tuyến của bạn" để xem lại ngày khác.
4. Kho thấy kết quả ở bảng Phân tuyến của ngày đó: cột **Đã giao** từng tuyến và nhãn ✓ / ✗ cạnh từng khách
   (nút **↻ Kết quả giao** để cập nhật). Bản in danh sách tuyến ghi sẵn tên người giao.

**Ảnh giao hàng và định vị**

- Bấm **✓ Đã giao** (hoặc **✗ Không giao được**) mở ô xác nhận: **📷 Chụp ảnh giao hàng** (mở camera điện thoại, chụp được
  nhiều ảnh; ảnh được thu nhỏ và in sẵn giờ chụp + mã khách ở góc), web **tự lấy vị trí điện thoại lúc giao** rồi bấm
  **Xác nhận**. Giao xong vẫn **📷 Thêm ảnh** được.
- **📌 Lưu vị trí khách** (làm 1 lần cho mỗi khách): bấm **🗺 Mở Google Maps** (mở sẵn địa chỉ khách) → chạm vào đúng điểm cửa hàng →
  **Chia sẻ → Sao chép đường liên kết** → quay lại dán vào ô (ô đã được chọn sẵn) – web tự lưu. Nhận link `maps.app.goo.gl/…`,
  link Google Maps dài hoặc tọa độ. Khách đã có vị trí thì bấm địa chỉ hoặc **🧭 Chỉ đường** là mở Google Maps tới đúng điểm.
- Bấm **Đã giao** không bắt buộc định vị: ảnh chụp (có in giờ) là bằng chứng. Vị trí lúc giao chỉ được ghi khi điện thoại cho trang
  đọc định vị (bản chạy trên máy mở bằng https); khi đó web cũng đề nghị lưu luôn làm vị trí khách nếu khách chưa có.
- Kho xem ở **Tài khoản giao hàng › Kết quả giao hàng theo ngày** (giờ giao, người giao, khách, ảnh, vị trí lúc giao; lọc
  theo người giao) và ở bảng Phân tuyến (ảnh nhỏ, 📍 vị trí lúc giao, 📌 vị trí khách đã lưu cạnh địa chỉ).
- Lưu ý định vị: trang trên claude.ai (bản online) không được đọc định vị điện thoại; bản chạy trên máy chỉ đọc được khi mở bằng
  **https** (`http://192.168…` thì không). Không đọc được thì lưu vị trí khách bằng link Google Maps như trên.
- **🛰 Chia sẻ hành trình** (thẻ trên màn hình hôm nay của người giao): bấm **▶ Bật chia sẻ hành trình** lúc bắt đầu đi giao →
  cho phép **Vị trí** → giữ web mở (nên để màn hình sáng; web xin giữ màn hình sáng nếu trình duyệt cho). Điện thoại ghi 1 điểm
  khi đi được ≥ 25 m hoặc đứng yên mỗi 5 phút, gửi về mỗi phút (mất mạng thì giữ lại gửi sau); tải lại trang thì tự bật lại; bấm
  **■ Dừng chia sẻ** / đăng xuất là tắt. Đang chia sẻ thì bấm **Đã giao** lấy luôn vị trí mới nhất.
  Khi trang không đọc được định vị (bản trên claude.ai), người giao bấm **🔗 Gửi link vị trí trực tiếp Google Maps**: trong app
  Google Maps → ảnh đại diện → **Chia sẻ vị trí** → *Cho đến khi bạn tắt* → **Sao chép** → dán vào ô – kho bấm link là thấy xe đang ở đâu.
- Kho xem ở **Tài khoản giao hàng › 🛰 Hành trình giao hàng** (chọn ngày, người giao; tự cập nhật mỗi phút): mỗi người có
  sơ đồ đường đi GPS + các khách đánh số theo thứ tự giao (xanh đã giao, đỏ không giao được), giờ bắt đầu → kết thúc, số km,
  các chỗ dừng ≥ 10 phút, nút **📍 Vị trí mới nhất**, **🔗 Vị trí trực tiếp**, **🗺 Xem đường đi trên Google Maps**. Không có
  điểm GPS thì đường đi vẽ theo thứ tự khách đã giao (vị trí lúc giao, không có thì vị trí khách đã lưu; km là đường chim bay).
  Dữ liệu: bản online `kho/TP/hanhtrinh/<ngày>-<id người giao>`, bản chạy máy bảng `tracks`.
- Ảnh ở bản chạy trên máy nằm trong thư mục `data/anh-giao/` (sao lưu cùng file `data/kho.db`; file .json không chứa ảnh).
  Ở bản online ảnh nằm trong kho ảnh của trang, nếu kho ảnh không dùng được cho người giao
  thì ảnh được lưu vào dữ liệu chung.

Link web giao hàng:

- **Bản chạy trên máy**: `http://<IP-máy-chạy-web>:8000/giao-hang` (xem ở **Tài khoản giao hàng › Link web giao hàng**), điện thoại
  dùng cùng wifi công ty. Trang này **không hỏi mật khẩu chung** (`mat-khau.txt`) của web kho – chỉ đăng nhập bằng nick + PIN, và chỉ
  xem/ghi được tuyến của chính mình.
- **Bản online**: trang riêng **Giao hàng An Tâm** (https://claude.ai/artifact/6bVzsWLxPdkdCKF687Bnky), không có phần kho.
  **Phân tuyến giao hàng** và **Tài khoản giao hàng** vẫn làm ở web Kho An Tâm như cũ; trang Giao hàng An Tâm chỉ nhận dữ liệu:
  - Web kho › Phân tuyến giao hàng: chia tuyến, chọn người giao, bấm **💾 Lưu** – web tự sao chép dữ liệu gửi sang (bảng phân tuyến
    của ngày + tài khoản người giao + danh mục tuyến). Sang tab Giao hàng An Tâm (phần quản lý › **Nhận phân tuyến từ kho**) bấm
    `Ctrl+V` là trang tự nhận. Hai trang trên claude.ai không ghi được dữ liệu của nhau nên còn bước dán này; sửa phân tuyến thì
    Lưu lại và dán lại (thay bảng cũ cùng ngày, kết quả đã giao vẫn giữ). Nút **📤 Gửi lại** để sao chép lại khi cần.
  - Trang Giao hàng An Tâm › **🗂 Quản lý phân tuyến**: mật khẩu quản lý (chủ trang đặt lần đầu). Kết quả giao (ảnh, vị trí lúc giao)
    xem ở **Người giao & kết quả giao** của trang này.
  - Muốn Lưu là người giao thấy ngay, không cần bước dán: dùng **bản chạy trên máy** (`/giao-hang` dùng chung dữ liệu với web kho).
  - Người giao mở trang → **🚚 Tôi là người giao hàng** → nick + PIN (lần sau vào thẳng tuyến của mình).
  - Mời người giao **chỉ vào trang Giao hàng An Tâm** bằng email ở nút *Share*, quyền **Editor**, và tắt "Anyone with the link"
    (tài khoản claude.ai cá nhân không có quyền Contributor; Viewer/Commenter chỉ xem, không bấm "Đã giao" hay gửi ảnh được).
    Không mời người giao vào web Kho An Tâm.
  - Nick + PIN và mật khẩu quản lý được kiểm tra ở trình duyệt: chúng giữ mỗi người ở đúng phần của mình trên giao diện, không phải
    lớp bảo mật như bản chạy trên máy – người được mời Editor vẫn có quyền Editor của trang Giao hàng An Tâm trên claude.ai.
  - Đóng gói lại: `python online/build.py --giao` → `online/giao-hang-antam.html`.

Tài khoản giao hàng và kết quả giao nằm trong file dữ liệu **.json**, chuyển qua lại giữa 2 bản như các dữ liệu khác.

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

## Tự chuyển phân tuyến sang Giao hàng An Tâm (bản online)

Hai trang trên claude.ai có dữ liệu riêng, nên việc chuyển do một **tác vụ định kỳ** (scheduled task của Claude, mỗi giờ từ 6h–23h) làm:
1. Web kho: bấm **💾 Lưu** ở Phân tuyến giao hàng → gói dữ liệu (bảng phân tuyến, tuyến, tài khoản người giao) được để ở `giaoout/<mã bảng>`
   và `giaoout/index` (dữ liệu của trang kho).
2. Tác vụ định kỳ so `giaoout/index` (kho) với `giaosent/index` (trang giao hàng); bảng nào mới thì chép `giaoout/<mã>` sang `giaoin/<mã>`
   của trang Giao hàng An Tâm.
3. Trang Giao hàng An Tâm (ai mở cũng được: người giao hoặc quản lý) tự nhận `giaoin/*` chưa nhận, ghi đã nhận vào `giaodone/index`.

Cần gấp thì vẫn dùng **📤 Gửi ngay** (sao chép) rồi Ctrl+V ở trang Giao hàng An Tâm.

## Tài khoản nhân viên

**Hệ thống › Tài khoản nhân viên**: mỗi nhân viên kho một **tên đăng nhập + mật khẩu**; phiếu, phân tuyến và **Lịch sử thao tác**
ghi đúng tên người đăng nhập (thay cho ô "Bạn là ai?" gõ tên tự do).

- Chưa có tài khoản nào thì web chạy như cũ. Tài khoản đầu tiên tạo ra tự là **Quản lý** và được đăng nhập luôn; từ lúc đó ai vào
  web kho cũng phải đăng nhập.
- Chỉ tài khoản **Quản lý** được thêm / sửa / khóa / xóa tài khoản và đặt lại mật khẩu. Mỗi người tự đổi mật khẩu hoặc đăng xuất
  bằng cách bấm tên mình ở góc trên phải.
- Bản chạy trên máy: máy chủ kiểm tra đăng nhập cho mọi thao tác (phiên 30 ngày); có thể dùng cùng `mat-khau.txt`.
- Bản online: đăng nhập để ghi đúng người làm; quyền xem / sửa trang vẫn do nút *Share* của claude.ai quyết định.
- Tài khoản nằm trong file dữ liệu **.json**, chuyển qua lại giữa 2 bản như các dữ liệu khác.

### Duyệt phiếu điều chỉnh

Khi đã dùng tài khoản nhân viên, **phiếu điều chỉnh (DCK)** do nhân viên lập (kể cả phiếu tạo từ biên bản kiểm kê) ở trạng thái
**⏳ Chờ duyệt**: chưa tính vào tồn kho, Nhập – Xuất – Tồn, thẻ kho và sổ nhập – xuất.

- Quản lý thấy thông báo ở **Tổng quan** và nút **⏳ Phiếu chờ duyệt** ở Danh sách phiếu; mở phiếu bấm **✔ Duyệt phiếu** (tính vào
  tồn kho từ lúc đó) hoặc **✖ Từ chối** kèm lý do.
- Phiếu bị từ chối: người lập sửa lại rồi **Lưu & gửi duyệt** để gửi lại, hoặc xóa phiếu.
- Phiếu đã duyệt chỉ Quản lý sửa / xóa được. Phiếu điều chỉnh Quản lý tự lập được duyệt luôn. Phiếu nhập / xuất không cần duyệt.
- Người lập và người duyệt ghi trên phiếu in và trong Lịch sử thao tác.
- Duyệt / từ chối xong, **người lập phiếu được thông báo**: chuông 🔔 kèm số thông báo mới ở góc trên phải và khung thông báo hiện
  ở góc màn hình (ngay khi đăng nhập, hoặc trong khoảng 1 phút nếu đang mở web) với nút **Xem phiếu**. Bấm 🔔 để xem lại 50 thông báo gần nhất.

## Chuyển dữ liệu giữa bản online và bản chạy trên máy

Cả hai bản dùng chung một loại file dữ liệu **.json**:
- Bản online → **Cài đặt & dữ liệu → Tải dữ liệu** ⇒ bản chạy trên máy → **Cài đặt & dữ liệu → Nhập file dữ liệu .json**
  (thay toàn bộ dữ liệu 2 kho trên máy).
- Bản chạy trên máy → **Tải dữ liệu (.json)** ⇒ bản online → **Nhập file dữ liệu .json**.

Chỉ nên nhập phiếu ở **một** bản tại một thời điểm, để số liệu không bị tách làm hai.

## Sao lưu

**Cài đặt & dữ liệu › Tải bản sao lưu (.db)** – nên làm cuối mỗi ngày. Khôi phục: tắt web, chép file sao lưu
đè lên `data/kho.db`, chạy lại. Có thể xuất toàn bộ sổ ra CSV để mở bằng Excel.

## Cấu trúc mã

- `server.py` – máy chủ web + API + SQLite (thư viện chuẩn Python).
- `xlsx_import.py` – đọc file .xlsx (không cần openpyxl).
- `static/` – giao diện (HTML/CSS/JS thuần), gồm cả mẫu in phiếu; `static/giao-hang.*` – web giao hàng (trang `/giao-hang`).

## Bản online (không cần cài đặt)

Ngoài bản chạy trên máy (`server.py`), có bản **online trên claude.ai**: mở link là dùng, dữ liệu lưu trực tuyến
và dùng chung cho mọi người được chia sẻ trang (nút *Share* trên trang, cấp quyền **Contributor** hoặc **Editor**
để người đó nhập được phiếu; **Viewer** chỉ xem).

- Cùng giao diện và chức năng với bản chạy máy (2 kho, phiếu, sổ, NXT, thẻ kho, kiểm kê, bàn giao, kế hoạch mua…).
- **In phiếu:** bấm In → hiện bản xem trước → **Tải file để in** → mở file vừa tải, trình duyệt hiện hộp thoại In.
- Xuất CSV và tải bản sao lưu (.json) ở **Cài đặt & dữ liệu**.
- Khi người khác vừa thay đổi dữ liệu, nút **↻ Có dữ liệu mới** hiện trên đầu trang để tải lại.

Mã nguồn bản online: `online/backend.js` (thay cho server.py, chạy trong trình duyệt) + giao diện chung `static/`
(web giao hàng được nhúng vào cùng trang để dùng chung dữ liệu).
Đóng gói lại thành một trang: `python online/build.py` → `online/kho-antam.html`.


## Lịch sử thao tác – xem chi tiết phiếu

Mục **Lịch sử thao tác** có ô tìm và bộ lọc *Chỉ thao tác phiếu / Chỉ phiếu sửa*. Bấm dòng **Lập / Sửa / Xóa phiếu** (🔍 Xem) để xem
chi tiết: phiếu sửa hiện **Trước khi sửa / Sau khi sửa** (ngày, loại, số phiếu, tuyến, bên giao / nhận, người giao / nhận, lý do,
ghi chú – dòng thay đổi tô màu) và bảng mặt hàng với SL trước, SL sau, chênh lệch, Thêm / Bỏ / Đổi; nút *Mở phiếu hiện tại*.
Từ bản này mỗi lần lập / sửa / xóa phiếu ghi đủ nội dung phiếu vào lịch sử (`detail` = {trước, sau, id}, mỗi bên {ngày, dòng, v});
thao tác ghi trước đó chỉ xem được ngày và số lượng từng mã hàng.

## Phân quyền tài khoản nhân viên kho

Mục **Tài khoản nhân viên** › bấm vào tài khoản: chọn **mẫu** (Quản lý, Nhân viên kho, Thủ kho, Chỉ xem) rồi tích thêm / bỏ từng quyền:
kho được làm việc (thành phẩm / nguyên vật liệu); lập / sửa phiếu nhập, xuất, điều chỉnh; xóa phiếu; duyệt phiếu điều chỉnh; danh sách
phiếu & sổ nhập – xuất; NXT & thẻ kho; kiểm kê; bàn giao; kế hoạch mua; phân tuyến giao hàng; tài khoản giao hàng; mặt hàng; tuyến /
nơi nhận; cài đặt & dữ liệu; lịch sử thao tác; quản lý tài khoản & phân quyền. Mục menu, kho, loại phiếu và nút không được cấp thì ẩn;
bản online chặn luôn khi lưu (online/backend.js `must`). Lưu ở `staff_accounts.<id>.perm`; tài khoản chưa phân quyền giữ như cũ
(Quản lý = tất cả, nhân viên = tất cả trừ duyệt phiếu và quản lý tài khoản). Tự nhận đơn từ web Đóng hàng không phụ thuộc quyền người
đang mở trang. Bản chạy máy (server.py) lưu và trả `perm`, giao diện tự ẩn theo quyền.
