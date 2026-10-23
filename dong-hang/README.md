# Đóng hàng An Tâm

Web riêng (trang claude.ai, một file `dong-hang-antam.html`) thay cho Google Sheet **ĐỊNH MỨC ĐÓNG HÀNG - BẢN IN**:

- **Đơn hàng ngày**: danh sách khách theo khu vực, gõ số lượng từng loại bánh là tự lưu (nhiều người nhập cùng lúc được),
  tự tính **định mức đóng hàng** (túi đen / thùng giấy / nhỏ / chung / đại / cây kebab) và **tổng cần chuẩn bị** của ngày.
- **Định mức đóng hàng**: bản in tổng cần chuẩn bị + chi tiết từng khách; tải file in (HTML), tải Excel (CSV),
  **Sao chép cho Phân tuyến** (dán vào web Kho An Tâm › Phân tuyến giao hàng; có cột TUYẾN nên kho giữ đúng tuyến đã chia).
- **Chuyển thẳng sang Giao hàng An Tâm**: bản đơn đã chia tuyến kèm người giao (`khoout/*`) được tác vụ tự động chép cùng lúc
  vào `dhin/*` của web Giao hàng và web Kho. Trang Giao hàng tự lập bảng phân tuyến (mã bảng `rt-<ngày>-dong-hang<mã>`, giữ tài khoản
  người giao của trang) khi có người mở – mỗi người giao thấy ngay tuyến của mình, không cần chờ web Kho. Kho sửa rồi gửi lại cùng
  bảng thì thay đúng bảng đó; bản cũ hơn (`dhStamp`) bị bỏ qua.
- **Tự liên kết Kho → Giao hàng**: sửa đơn hàng ngày / tuyến kebab 123 xong khoảng 30 giây, web để sẵn bản mới ở
  `khoout/<ngày>` và `khoout/<ngày>-t123` (danh mục `khoout/index`). Tác vụ tự động mỗi giờ (phút :07, 6h–23h) chép sang
  `dhin/*` của web Kho và ghi `khoack/index` ở đây; web Kho tự lập bảng **Phân tuyến giao hàng** của ngày (giữ tuyến kho chọn tay)
  rồi để sẵn gói cho Giao hàng An Tâm, lần chạy kế tiếp chép sang trang giao hàng. Dòng trạng thái dưới hàng "Chia tuyến"
  (và ở Tuyến kebab 123) cho biết: đang gom / chờ chuyển / ✓ đã chuyển sang kho; nút **📤 Gửi kho** để sẵn bản mới ngay.
- **Người giao từng tuyến**: nút **👤 Người giao** (cạnh hàng "🚚 Chia tuyến") – mỗi tuyến tự chọn người có tuyến đó trong
  "tuyến thường chạy" của tài khoản người giao bên web Kho, chọn tay được cho từng ngày (`ngay/<ngày>.assign`). Danh sách người giao
  (không có mã PIN) do web Kho để ở `nvpub/list`, tác vụ tự động chép sang `giaonv/list`. Phân công đi kèm đơn sang Kho
  (`khoout/<ngày>.assign`) → Giao hàng An Tâm: mỗi người giao chỉ thấy tuyến của mình. Tên người giao hiện ở nút tuyến,
  tiêu đề nhóm của bảng đơn và bản in.
  Tuyến kebab 123 cũng có nút **👤 Người giao** cho Tuyến 1 / 2 / chiều / 3 (`t123/<ngày>.assign`, mặc định theo tuyến kho
  kebab đêm / kebab chiều / tuyến 3); gửi kèm `assignG` – Tuyến 1 và Tuyến 2 khác người thì web Kho tách thành tuyến T1, T2 riêng.
- **Tự động chia tuyến** (Đơn hàng ngày): mỗi đơn tự vào tuyến giao theo Khu vực của khách (không khớp thì theo địa chỉ, ghi chú),
  dùng cùng mã tuyến và quy tắc với web Kho (HM, TBTP, BTBC, TD, BTH, GV, BD, Q12, Q1PN, Qle, AS, BI, Tship, ĐB 1).
  Cột **Tuyến** chọn tay được và web nhớ cho khách; hàng nút "🚚 Chia tuyến" đếm số đơn từng tuyến (bấm để lọc, ⚠ Chưa chia);
  "Xếp theo: Tuyến / Khu vực"; bản in có bảng **Tổng theo tuyến giao** (đơn, TACOS, KEBAB, túi, thùng, cây) và chi tiết nhóm theo tuyến.
  Sửa tuyến / quy tắc ở "⚙ Quy tắc chia tuyến" hoặc Định mức & cài đặt (lưu trong `cfg/main.routes`; khách: `rt`, đơn: `rt`).
- **Tuyến kebab 123**: theo sheet "2-KHÁCH TUYẾN 123" (mẫu tab ngày 18/10): Tuyến 1, Tuyến 2, Tuyến chiều, Tuyến 3.
  Cột Hỗ trợ (tích), CRM, tên, SĐT, tình trạng (tự HOẠT ĐỘNG khi có số), 22/25/28/31 cm (túi), VÀNG/ĐEN (cái),
  CÂY THỊT (kg), Túi 50 / túi lẻ (tự tính từ VÀNG), ghi chú khách + ghi chú ngày. Tổng bánh, túi 50 và DOANH THU từng tuyến
  (giá mặc định 22cm 37.500đ/túi, 25cm 45.000đ/túi, vàng 2.640đ/cái, thịt 125.000đ/kg; sửa ở "Sửa giá").
  **Đưa vào Bánh tuyến** ghi tổng sang dòng BÁNH TUYẾN của Đơn hàng ngày (thịt 5/12/18 kg → cây thịt tương ứng);
  "Cập nhật từ sheet" dán tab ngày để cập nhật khách và số lượng (có thể thay toàn bộ danh sách).
  Dữ liệu: `tuyen123/khach` (khách), `t123/<ngày>` (số lượng).
- **Ẩn / hiện từng cột** (Đơn hàng ngày và Tuyến kebab 123): nút **👁 Ẩn / hiện cột** mở hộp tích chọn từng cột (thông tin,
  từng sản phẩm, túi 50 / túi lẻ, ghi chú…), có "Hiện tất cả" và tùy chọn tự ẩn cột sản phẩm chưa có đơn. Chỉ lưu trên máy đang
  dùng (localStorage `dh_hideDon`, `dh_hideT1`), không đổi dữ liệu; cột "Khách hàng" luôn hiện.
  Bảng **Báo cáo** (Bánh tuyến / Tổng túi / Tổng cái), bản in báo cáo và trang Định mức đóng hàng cũng bỏ các cột đang ẩn;
  số tổng TACOS, KEBAB, doanh thu vẫn tính đủ, bản in ghi "Đang ẩn cột: …".
- **In theo yêu cầu** (nút 🖨 In báo cáo): chọn phạm vi (tất cả / theo bộ lọc) và điều kiện tích chọn — Đơn hàng ngày:
  **Thanh toán** (CTT, ĐTT, Hỗ trợ, Tiền mặt, chưa chọn) và **Tuyến**; Tuyến 123: tuyến và khách hỗ trợ — kèm số đơn sẽ in;
  chọn phần in (số tổng, bảng túi/cái, bao bì, tổng theo tuyến, danh sách khách), cột của danh sách, tiêu đề, nhóm theo
  (tuyến / khu vực / thanh toán), khổ ngang / dọc, mỗi nhóm một trang, dòng ký tên.
  Bản in có bảng **Tổng theo tuyến giao – số lượng từng sản phẩm** (đơn, số lượng từng sản phẩm, bao bì) và
  dưới danh sách mỗi tuyến / nhóm là bảng **TỔNG** của nhóm đó (số lượng từng sản phẩm, bao bì). Lựa chọn nhớ trên máy (`dh_prDon`, `dh_prT1`).
- **Lọc theo yêu cầu + In báo cáo** (cả Đơn hàng ngày và Tuyến kebab 123): lọc bằng ô tìm, chọn khu vực / tuyến và dòng
  "▼ Lọc theo cột" dưới tiêu đề bảng (CRM, hỗ trợ, tình trạng, từng sản phẩm có/trống, túi 50, túi lẻ, ghi chú…).
  Ở Tuyến 123, bảng tổng tính theo các khách đang lọc. Nút **🖨 In báo cáo** cho chọn in *theo bộ lọc* hoặc *tất cả*,
  kèm/không kèm chi tiết từng khách. Bấm **🖨 In** là mở thẳng hộp thoại in của trình duyệt (A4 ngang, nền trắng);
  trên claude.ai trang không tự mở được hộp thoại in nên web giữ sẵn bản in trong trang và hiện xem trước: bấm **Ctrl+P**
  (⌘+P) là in đúng bản đó (giống web Kho), không cần tải file. "⬇ Tải file in" để lưu / gửi bản in.
- **Khách hàng**: danh mục khách (khu vực, CRM, địa chỉ, SĐT, ghi chú/chành xe, đóng gói mặc định).
  **⇅ Cập nhật từ MISA**: trong MISA xuất danh sách khách hàng ra Excel → mở file, Ctrl+A, Ctrl+C → dán vào ô (hoặc chọn file
  .csv/.txt). Web tự tìm dòng tiêu đề và các cột (mã khách hàng / mã CRM, tên, địa chỉ, điện thoại – ưu tiên ĐT di động, quận/huyện;
  chọn lại được), lấy cột mã trùng nhiều mã CRM của web nhất, khớp theo **ô CRM** hoặc **mã đứng đầu tên** (VD "KH00152 - …"),
  áp dụng cho khách Đơn hàng ngày và khách Tuyến kebab 123. Xem trước từng thay đổi (cũ → mới), bỏ chọn khách không muốn sửa rồi
  bấm Cập nhật. Chọn sửa Tên – địa chỉ (ghép "Tên - Địa chỉ" hoặc chỉ tên), SĐT, Khu vực; mặc định giữ mã đầu tên và ghi chú trong
  ngoặc của tên cũ; ô trống trong MISA thì giữ nguyên; SĐT chỉ khác dấu cách/chấm không tính là thay đổi; khách chưa có CRM được
  điền mã đã khớp. Đơn đã nhập các ngày trước giữ nguyên tên lúc nhập.
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
