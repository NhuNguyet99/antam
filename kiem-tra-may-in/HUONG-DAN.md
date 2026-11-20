# Kiểm tra máy in tem nhãn & máy in hoá đơn

Công cụ cho máy tính Windows ở quầy: tự kiểm tra **máy in tem nhãn** và **máy in hoá đơn (máy in nhiệt)** có đang kết nối không.

## Cách dùng

1. Chép cả thư mục `kiem-tra-may-in` vào máy tính bán hàng (ví dụ `C:\AnTam\kiem-tra-may-in`).
2. **Kiểm tra ngay:** nhấp đúp `KiemTraMayIn.bat` để xem kết quả:
   - `[OK]`: máy in đã kết nối
   - `[LỖI]`: máy in đã cài nhưng đang mất kết nối (kèm lý do)
   - `[THIẾU]`: không tìm thấy máy in loại đó trên máy tính
3. **Tự động:** nhấp đúp `CaiDatTuDong.bat` một lần.
   - Mỗi lần bật máy tính, sau khoảng 1 phút sẽ tự kiểm tra, rồi cứ **5 phút** kiểm tra lại một lần.
   - Chỉ hiện cảnh báo khi có máy in **bị mất kết nối**, và báo lại khi máy in **đã kết nối lại**.
   - Không cần quyền Administrator.
4. **Tắt tự động:** nhấp đúp `GoTuDong.bat`.

Mỗi lần trạng thái thay đổi sẽ được ghi vào file `nhat-ky-may-in.log` trong cùng thư mục.

## Tự tìm & kết nối máy in nhiệt (máy in hoá đơn)

Nhấp đúp `TimKetNoiMayInNhiet.bat`, rồi bấm **Yes** khi Windows hỏi quyền Administrator. Script sẽ tự làm các việc sau:

1. Bật lại dịch vụ in Print Spooler nếu đang tắt.
2. Nếu máy in hoá đơn đã cài:
   - tắt chế độ "Use Printer Offline" và xoá lệnh in bị kẹt
   - nếu máy in bị cắm sang **lỗ USB khác**, chuyển máy in sang cổng mới
   - nếu máy in LAN bị **đổi IP**, tìm IP mới và cập nhật
3. Nếu chưa cài: tìm máy in nhiệt đang cắm USB hoặc trong mạng LAN (cổng 9100), rồi tự thêm vào Windows. Máy in văn phòng (HP, Canon, Brother…) và máy in tem sẽ được bỏ qua.
4. Hỏi có muốn in thử 1 tờ không.

Nếu máy chưa có driver của hãng, script tạm dùng driver "Generic / Text Only" (chỉ in được chữ không dấu). Nên cài driver của hãng (ví dụ Xprinter) rồi chạy lại.

## Script kiểm tra những gì

| Kiểu kết nối | Cách kiểm tra |
|---|---|
| USB (USB001, USB002…) | Máy in có thật sự đang cắm và bật nguồn hay không (dò thiết bị USB của đúng cổng đó) |
| Mạng LAN (IP) | Thử kết nối tới IP của máy in (cổng 9100) |
| Cổng COM | Cổng COM còn tồn tại không |
| Máy in chia sẻ từ máy khác | Máy tính chia sẻ máy in có đang bật và kết nối mạng không |

Ngoài ra script còn kiểm tra: trạng thái Offline trên Windows, hết giấy, kẹt giấy, mở nắp (nếu máy in có báo về), và dịch vụ in Print Spooler của Windows.

## Nếu nhận sai máy in

Script tự nhận diện theo tên của các hãng thường gặp: Xprinter, TSC, Zebra, Godex, Gprinter, Brother QL, Epson TM, Rongta, Bixolon, máy in POS-58/POS-80/K80…
Nếu nhận sai hoặc báo `[THIẾU]`, mở `kiem-tra-may-in.ps1` bằng Notepad rồi điền đúng tên máy in. Tên máy in xem trong *Settings > Printers & scanners*, hoặc trong danh sách mà script in ra:

```powershell
$TenMayInTem    = "Xprinter XP-365B"
$TenMayInHoaDon = "*XP-80C*"
```

Sau đó lưu file. Nếu đang bật tự động thì chạy lại `CaiDatTuDong.bat`.

> Nếu đổi tên hoặc di chuyển thư mục, cần chạy lại `CaiDatTuDong.bat`.
