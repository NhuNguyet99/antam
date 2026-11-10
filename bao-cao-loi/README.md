# Báo cáo lỗi An Tâm

Trang https://claude.ai/artifact/Pra6DjARdoAaRrLEGiLA93 – đọc `bc/<yyyy-mm-dd-HHMM>` do agent ghi
(`{at, ky, tom_tat, so_loi, so_canh_bao, webs, muc: [{web, muc_do: loi|canh_bao|ok, nhom, tieu_de, chi_tiet}]}`; rules `bc write: admin`).

- **Agent**: tác vụ định kỳ "Báo cáo lỗi An Tâm (11:47, 21:47)" (mỗi lần chạy một phiên mới, báo về điện thoại khi xong).
  Đọc lỗi trang + kiểm tra dữ liệu của An Tâm (Đóng hàng · Kho · Giao), Quỹ tiền mặt, Kế toán bán hàng, Kho vận và tác vụ cập nhật Kho vận;
  chỉ đọc các web, chỉ ghi vào trang này; xóa báo cáo cũ hơn 30 ngày.
- **Lỗi trang**: `shared/err-log.html` gắn vào các web (An Tâm qua `build.py --hop`, 3 web còn lại qua `python3 shared/sync_gate.py`) ghi lỗi chưa bắt được,
  promise bị từ chối và lỗi kho dữ liệu vào `errlog/<ngày>` `{e: {mã: {at, web, bo_phan, who, msg, src, view}}}` của từng web (tối đa 15 lỗi mỗi lần mở trang, lỗi trùng ghi 1 lần).
- **Kiểm tra dữ liệu**: tồn âm, phiếu điều chỉnh chờ duyệt, đơn Đóng hàng chưa sang Kho, bảng phân tuyến trùng; quỹ âm, phiếu chi chờ duyệt / quá 3 ngày chưa có hóa đơn,
  kiểm quỹ lệch, chưa tạo nick; dữ liệu MISA cũ; Kho vận không được cập nhật.

## Đối chiếu sản xuất (tab "Đối chiếu sản xuất", `#doi-chieu`)

So đơn Đóng hàng ngày D (bảng Đóng hàng + Tuyến 123, `khoout/<D>` và `khoout/<D>-t123` của trang An Tâm) với Kho thành phẩm ngày D+1
(phiếu nhập từ sản xuất `type N` và phiếu xuất `type X` trong `kho/TP/days/<D+1>`; phiếu chờ duyệt / từ chối không tính).

- **Script**: `doi_chieu.py <thư mục dữ liệu> <D> map-doi-chieu.json` → `{dh_ngay, kho_ngay, rows: [{code, ten, dvt, dat, nhap, xuat, lech_sx, lech_xuat, sx, xk, ton_dau, dieu_chinh, ton_cuoi, co_hang, danh_gia, danh_gia_text}], co_ton, so_ton_am, so_thieu_hang, chua_ma, phieu_cho_duyet, so_lech_sx, so_lech_xuat, tom_tat}`
  (`sx`/`xk`: `khop` | `thieu` | `thua` | `khong` = mã không lập phiếu sản xuất). Lệch khi chênh quá `max(2, 2% số đặt)`.
- **Tồn**: thư mục dữ liệu chứa mọi `kho/TP/days/*.json`; tồn tính như web Kho (số dư ban đầu trong danh mục + nhập − xuất + điều chỉnh, bỏ phiếu chờ duyệt / bị từ chối).
  `danh_gia`: `ton_am` (tồn cuối âm: xuất quá hàng có), `thieu_hang` (tồn đầu + sản xuất + điều chỉnh < đặt), `xuat_thieu` / `xuat_thua`, `bu_ton` (sản xuất thiếu nhưng tồn bù đủ), `dung`.
- **Bảng gán mã** `map-doi-chieu.json`: tên cột đơn (viết hoa, bỏ khoảng trắng khi so) → mã Kho TP và hệ số (cây thịt 5/12/18 kg → kg Thịt KEBAB);
  bánh không hương / không đường / bánh tươi → mã "TP TACOS SIZE … Đặt"; `khong_sx` = mã chỉ so số xuất. Cột chưa gán mã hiện ở mục "Chưa gán mã".
- **Agent**: tác vụ định kỳ "Đối chiếu Đóng hàng – Kho (7:23, 17:23)" (phiên mới mỗi lần, báo về điện thoại). 7:23 chốt đơn hôm kia (Kho hôm qua đã xong),
  17:23 tạm tính đơn hôm qua; ghi `dc/<D>` = kết quả script + `{at, chot, nhan_xet}` (rules `dc write: admin`). Agent lấy script và bảng gán mã từ
  `cfg/doi-chieu` `{py, map}` của trang Báo cáo lỗi (rules `cfg write: admin`): sửa ở đây thì ghi lại tài liệu đó (ArtifactData set), không cần sửa tác vụ. Chạy lại một ngày: kích hoạt tác vụ kèm "ngày đơn yyyy-mm-dd".
