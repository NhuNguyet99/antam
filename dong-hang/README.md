# Đóng hàng An Tâm

> **Từ 30/10/2026: trang chung An Tâm** – Đóng hàng, Kho và Giao hàng chạy trong **một trang claude.ai**
> (https://claude.ai/artifact/ErmZYgHgUzBeTJrtTR6yAC, file `kho-noi-bo/online/an-tam.html`, tạo bằng `python3 build.py --hop`)
> và **dùng chung một kho dữ liệu**, nên dữ liệu chuyển cho nhau **ngay** (không còn chờ tác vụ định kỳ):
> - Mở trang → chọn bộ phận 📦 Đóng hàng / 🏭 Kho / 🚚 Giao hàng (máy nhớ lần sau); đổi bằng **⇄ Đổi bộ phận**. Mỗi lần mở chỉ chạy 1 web.
> - Đóng hàng bấm *Gửi* → ghi `khoout/*`; web Kho / người giao đang mở nhận trong vài giây (theo dõi `khoout/index`, kiểm tra lại mỗi 30 giây),
>   ghi đã nhận vào `dhdone/index` – Đóng hàng thấy "✓ Đã chuyển" ngay.
> - Đóng hàng đọc thẳng người giao `nvpub/list` và kết quả giao `kho/TP/giao/<ngày>` (ảnh `/_blob/<mã>` cùng kho ảnh) của web Kho/Giao.
> - Trang cũ **Đóng hàng An Tâm** (FGE3VTLud2r3LnEjm5nkLK) và **Giao hàng An Tâm** (6bVzsWLxPdkdCKF687Bnky) chỉ còn trang báo chuyển
>   (dữ liệu cũ giữ nguyên, đã chép sang trang chung kèm 75 ảnh giao hàng). Các mục dưới nói về `dhin`, `giaoin`, `giaokq`, `giaoanh`,
>   tác vụ chép giữa các trang là cách làm **trước khi gộp**.
> - Mời nhân viên đóng hàng và người giao vào trang chung (email, quyền **Contributor**, chỉ người được mời).

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
  Số tuyến 123 tự vào **Báo cáo** của Đơn hàng ngày và **Thống kê** (xem mục *Báo cáo gộp Tuyến 123* dưới) – không cần chép sang Bánh tuyến;
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
- **Theo dõi giao hàng**: kết quả người giao bấm *Đã giao / Không giao được* ở trang Giao hàng An Tâm (`kho/TP/giao/<ngày>`)
  được tác vụ tự động chép sang `giaokq/<ngày>` (+ `giaokq/index` {s, at}) khoảng 15 phút một lần (phút :07 cùng tác vụ chính,
  thêm 3 tác vụ riêng phút :22, :37, :52; 6h–23h); trang tự hiện số mới. Mục này ghép với đơn Đơn hàng ngày và Tuyến
  kebab 123 theo mã CRM (hoặc mã đầu tên): số điểm giao, đã giao, không giao được, chưa giao, % hoàn thành; từng tuyến kèm người giao
  và thanh tiến độ; lọc trạng thái / tuyến / tìm; kết quả không khớp đơn nào nằm ở nhóm *Khác*; nút **🖨 In theo dõi giao hàng**.
  **Ảnh giao hàng**: tác vụ tự động chép ảnh (kho ảnh của trang Giao hàng) sang kho ảnh của trang này và ghi `giaoanh/<ngày>`
  {m: {mã ảnh bên Giao: url}}; cột *Ghi chú giao* hiện ảnh nhỏ, bấm để xem ảnh lớn (kèm giờ, người giao, ghi chú). Trang khai báo
  quyền `assets` để nhận ảnh. Vị trí lúc giao vẫn xem ở trang Giao hàng An Tâm. Quyền *Theo dõi giao hàng* (mọi vai trò có sẵn).
- **⚡ Đơn đi trong ngày** (Đơn hàng ngày): đơn phát sinh và giao ngay trong ngày. Đánh dấu bằng ô **⚡ Trong ngày** trên từng dòng
  (hoặc trong chi tiết đơn ⋯); khi nhập nhiều đơn loại này bấm **⚡ Nhập đơn đi trong ngày: BẬT** – đơn mới gõ số lượng tự được đánh dấu
  (nhớ trên máy, bấm lại để tắt). Chip **⚡ Đi trong ngày N** và **Đơn thường M** cạnh chip tuyến (hoặc dòng lọc cột) lọc riêng từng loại và báo cáo
  (TACOS, KEBAB, BILL, Tổng túi / cái, bao bì) tính riêng; kết hợp được với lọc tuyến. Bản in có điều kiện **Loại đơn** (đi trong ngày /
  đơn thường) và cột *⚡ Đi trong ngày*; đơn gửi sang Kho / Giao hàng có ghi chú "⚡ ĐI TRONG NGÀY". Lưu ở `ngay/<ngày>.r.<khách>.tn`.
- **Khách lên 2 đơn trong ngày** (1 đơn thường + 1 đơn đi trong ngày): bấm ⋯ ở dòng khách → **➕ Khách lên thêm đơn đi trong
  ngày** (hoặc nút **+⚡** cạnh ⋯ khi đang bật *Nhập đơn đi trong ngày*). Web tạo dòng riêng ngay dưới dòng khách, gắn nhãn
  *⚡ Đơn thêm trong ngày*, đã đánh dấu đi trong ngày; nhập số lượng như đơn thường. Báo cáo, chip ⚡ / Đơn thường, bản in tính 2 đơn
  riêng; gửi Kho / Giao hàng là 2 dòng, đơn thêm mang mã CRM đuôi `-TN` để kết quả giao không đè nhau. Xóa: ⋯ ở dòng đơn thêm →
  *Xóa đơn thêm này*. Lưu ở `ngay/<ngày>.r["<mã khách>~tn"]`, thông tin khách lấy từ khách gốc.
- **Lọc theo yêu cầu + In báo cáo** (cả Đơn hàng ngày và Tuyến kebab 123): lọc bằng ô tìm, chọn khu vực / tuyến và dòng
  "▼ Lọc theo cột" dưới tiêu đề bảng (CRM, hỗ trợ, tình trạng, từng sản phẩm có/trống, túi 50, túi lẻ, ghi chú…).
  Ở Đơn hàng ngày, khi lọc theo **tuyến** (bấm chip tuyến hoặc chọn ở cột Tuyến) thì báo cáo (TACOS, KEBAB, BILL, số đơn,
  thanh toán, Tổng túi / Tổng cái, bao bì) chỉ tính các đơn của tuyến đó, không cộng bánh tuyến của cả ngày; có dòng nhắc và nút
  *Bỏ lọc – xem cả ngày*.
  Ở Tuyến 123, bảng tổng tính theo các khách đang lọc. Nút **🖨 In báo cáo** cho chọn in *theo bộ lọc* hoặc *tất cả*,
  kèm/không kèm chi tiết từng khách. Bấm **🖨 In** là mở thẳng hộp thoại in của trình duyệt (A4 ngang, nền trắng);
  trên claude.ai trang không tự mở được hộp thoại in nên web giữ sẵn bản in trong trang và hiện xem trước: bấm **Ctrl+P**
  (⌘+P) là in đúng bản đó (giống web Kho), không cần tải file. "⬇ Tải file in" để lưu / gửi bản in.
- **Tài khoản** (chủ trang / Quản lý): mỗi nhân viên nhập liệu 1 tài khoản (họ tên, tên đăng nhập, mật khẩu, quyền
  **Nhập liệu**, **Điều phối** hoặc **Quản lý**, khóa được). Khi đã có tài khoản, ai mở web cũng phải đăng nhập bằng **nick + mật khẩu** (kể cả chủ
  trang); đăng nhập nhớ 30 ngày trên máy; đổi mật khẩu / khóa / xóa tài khoản là phiên cũ hết hiệu lực. Nút **⏏ Đăng xuất tất cả**
  (mục Tài khoản) bắt mọi máy đăng nhập lại (`cfg/tk.ep`). Chủ trang quên mật khẩu: ở màn đăng nhập bấm *Chủ trang: đặt lại mật
  khẩu một tài khoản*. Tên tài khoản tự ghi vào cột Người tạo đơn.
  **Phân quyền từng tài khoản** (Sửa tài khoản): chọn vai trò làm mẫu rồi tích thêm / bỏ từng quyền – Nhập liệu (Đơn hàng ngày
  xem / nhập-sửa đơn, Tuyến 123 xem / nhập-sửa đơn, Định mức đóng hàng, Khách hàng thêm/sửa, Thống kê), Điều phối (đổi tuyến, quy tắc chia tuyến, chọn người giao, gửi ngay),
  Quản lý (xóa khách, cập nhật MISA, giá Tuyến 123, nhập từ sheet, Định mức & cài đặt, tài khoản & phân quyền). Mục / nút không được
  cấp thì không hiện; lưu ở `perm` của tài khoản (chưa có thì theo mẫu của vai trò). Mẫu mặc định:
  Nhập liệu: Đơn hàng ngày, Tuyến 123, Định mức đóng hàng, Khách hàng (thêm / sửa), Thống kê, **Định mức & cài đặt** (sửa), in (cột Tuyến chỉ xem).
  Điều phối **chỉ xem đơn** (ô số lượng, thanh toán, tình trạng, chi tiết đơn, Bánh tuyến khóa; có dòng "Chế độ xem"), được: chia tuyến (cột Tuyến, tuyến của khách, quy tắc chia tuyến), chọn 👤 Người giao (Đơn hàng ngày, Tuyến 123),
  📤 Gửi ngay sang Giao hàng & Kho. Quản lý: tất cả – thêm Định mức & cài đặt,
  Nhập từ sheet, Tài khoản, quy tắc chia tuyến, giá / nhập sheet Tuyến 123, xóa khách, cập nhật từ MISA. Lưu ở `cfg/tk`, mật khẩu
  băm PBKDF2. Nhân viên vẫn phải được mời vào trang (Share, email, Contributor – không có thì Editor); tài khoản để biết ai nhập và giới hạn chức năng.
- **Khách hàng**: danh mục khách (khu vực, CRM, địa chỉ, SĐT, ghi chú/chành xe, đóng gói mặc định).
  **Sửa khách ngay trên bảng**: ở Đơn hàng ngày, Tuyến kebab 123 và danh mục Khách hàng, bấm vào tên khách / CRM / SĐT (danh mục:
  cả khu vực, ghi chú) → ô sửa nhỏ hiện cạnh dòng (tên – địa chỉ, CRM, SĐT, khu vực, ghi chú/chành xe). **Enter** hoặc bấm ra ngoài
  là lưu, **Esc** là hủy, *Thêm thông tin…* mở form đầy đủ (đóng gói, tuyến, bill, ngừng giao dịch). Khách có đơn trong ngày thì
  đơn gửi Kho / Giao hàng tự cập nhật tên mới.
  **⇅ Cập nhật từ MISA**: trong MISA xuất danh sách khách hàng ra Excel → mở file, Ctrl+A, Ctrl+C → dán vào ô (hoặc chọn file
  .csv/.txt). Web tự tìm dòng tiêu đề và các cột (mã khách hàng / mã CRM, tên, địa chỉ, điện thoại – ưu tiên ĐT di động, quận/huyện;
  chọn lại được), lấy cột mã trùng nhiều mã CRM của web nhất, khớp theo **ô CRM** hoặc **mã đứng đầu tên** (VD "KH00152 - …"),
  áp dụng cho khách Đơn hàng ngày và khách Tuyến kebab 123. Xem trước từng thay đổi (cũ → mới), bỏ chọn khách không muốn sửa rồi
  bấm Cập nhật. Chọn sửa Tên – địa chỉ (ghép "Tên - Địa chỉ" hoặc chỉ tên), SĐT, Khu vực; mặc định giữ mã đầu tên và ghi chú trong
  ngoặc của tên cũ; ô trống trong MISA thì giữ nguyên; SĐT chỉ khác dấu cách/chấm không tính là thay đổi; khách chưa có CRM được
  điền mã đã khớp. Đơn đã nhập các ngày trước giữ nguyên tên lúc nhập.
- **Thống kê**: theo khoảng ngày – số đơn, bánh, kebab, bao bì, theo khu vực / người tạo đơn / tài xế / thanh toán,
  khách đặt nhiều, khách ngưng đặt; so với cùng số ngày trước đó.
- **Báo cáo gộp Tuyến 123**: Báo cáo của Đơn hàng ngày (TACOS, KEBAB, BILL, số đơn, Tổng túi / cái, bao bì), bản in báo cáo
  và Thống kê tính cả khách **Tuyến kebab 123** đang hoạt động của ngày (mỗi khách = 1 đơn / 1 bill, đóng túi: túi 22–31 cm → bánh
  22–31 cm, VÀNG / ĐEN → bánh mì kebab / mè đen, cây thịt 5 / 12 / 18 kg → 1 cây; khách 123 không vào ô thanh toán).
  Chip **📊 Báo cáo gồm: Tất cả · 📦 Đơn hàng ngày · 🥙 Tuyến 123** (Đơn hàng ngày) và ô **Gồm** (Thống kê) xem riêng từng loại;
  bản in có điều kiện **Gồm**. Lọc tuyến / loại đơn (⚡) của Đơn hàng ngày thì báo cáo chỉ tính các đơn đó (không cộng Tuyến 123).
- **Nhập từ sheet** (không bắt buộc): danh sách khách đã đưa sẵn lên web; mục này chỉ dùng khi muốn nạp lại từ sheet
  (mở sheet ngày, Ctrl+A, Ctrl+C rồi Ctrl+V vào web).
- **Định mức & cài đặt**: bảng số bánh tối đa cho 1 túi / thùng / cây, danh sách sản phẩm (loại size để tính đóng gói).
  Danh sách sản phẩm kéo thả (⠿) hoặc ↑ ↓ để đổi thứ tự và **tự lưu** (0,7 giây sau lần sửa cuối): bảng Đơn hàng ngày, báo cáo, bản in
  theo ngay thứ tự / tên cột / nhóm màu mới. Định mức, chữ tự chọn thùng, thanh toán vẫn bấm **Lưu cài đặt**.

Quy tắc đóng gói (giống sheet): TÚI ĐEN – mỗi bánh chiếm 1/định mức túi, cộng lại làm tròn lên, kebab túi riêng;
THÙNG (gửi chành / Bà Tám / gửi tàu – tự chọn khi khu vực hoặc ghi chú có các chữ này) – chọn thùng nhỏ nhất đủ chứa
(giấy → nhỏ → chung → đại), vượt thùng đại thì thêm thùng, kebab đóng cây.

Dữ liệu nằm trong kho dữ liệu của trang: `cfg/main`, `khach/k0..k7` (danh mục khách chia 8 phần), `ngay/<yyyy-mm-dd>` (đơn của ngày).
Người nhập liệu cần được mời vào trang với quyền **Contributor** (nhập liệu được, không sửa được code trang);
menu Share không có Contributor thì phải chọn **Editor** (Editor sửa được cả code trang).
