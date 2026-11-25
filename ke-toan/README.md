# Kế toán bán hàng An Tâm

Trang claude.ai (một file `ke-toan-ban-hang-antam.html`): https://claude.ai/artifact/JvUGzUPjrC93AoNzEbnhC9
Nhập dữ liệu MISA (chi tiết công nợ 131), đơn hàng, hóa đơn, doanh thu, thu tiền, công nợ, khách hàng, checklist ca, nhắc việc.

## Đăng nhập bằng nick
Giống Quỹ tiền mặt: trang khóa bằng nick + mật khẩu (`shared/nick-gate.html`, chép vào bằng `python3 shared/sync_gate.py`).
Chủ trang vào thẳng, bấm nút 👤 ở thanh bên › **+ Thêm tài khoản**. Danh sách tài khoản ở `auth/accounts`, chỉ chủ trang / Editor sửa được
(rules `auth write: admin`, `settings read: view, write: admin`).

## Báo cáo ca

Mục **Báo cáo ca** lập ngay trên web 3 báo cáo trước đây làm bằng Excel: Tổng hợp đơn hàng (16 chỉ tiêu), Số lượng giao theo loại bánh, Công nợ theo khách hàng. Kèm danh sách đơn chưa thanh toán, nút Copy gửi Zalo, Tải Excel và Chốt báo cáo.

- **Nhập file**: kéo file Đơn đặt hàng (MISA), Thống kê chi tiết bán hàng (CRM) hoặc chính file báo cáo Excel đang dùng. Web nhận sheet theo tên cột, không theo tên sheet. Chọn ngày và ca (ngày / đêm / cập nhật, không theo ca).
- **Ca**: khoảng số đơn của ca lấy từ các đơn trong file nhập với ca đó (`ca/<ngày>`). Báo cáo loại bánh tính theo cả ngày CRM, như file Excel.
- **Loại bánh**: TORTILASS gồm TORTILASS và TACOS; BÁNH MỲ KEBAB gồm BÁNH MỲ/BÁNH MÌ; Thịt KEBAB gồm THỊT; bỏ PHỤ PHÍ. Đã giao = "Giao thành công".
- **Công nợ cũ**: đơn trước ca còn nợ theo lần nhập mới nhất (`cn/open`). Thu nợ cũ = tiền thu thêm của đơn cũ ghi nhận khi nhập file (`cn/pay-<ngày>`). Đầu kỳ = còn lại + thu. Sheet "Công nợ cũ" chỉ dùng để khởi tạo; số chính xác nhất khi nhập định kỳ Đơn đặt hàng MISA từ đầu tháng trước.
- Dữ liệu: `dh/<ngày đơn>`, `crm/<ngày>`, `ca/<ngày>`, `cn/open`, `cn/pay-<ngày>`, `meta/khht`, `bcca/<ngày>-<ca>` (bản chốt).
