# Định dạng file tập: `kenh-meo-beo/episodes/<id>.json`
Mẫu đầy đủ: `episodes/tu-dien-tieng-nhan-su.json`. Chạy: `kenh-meo-beo/pipeline/make.sh <id> preview` để xem nhanh (khoảng 1 phút), bỏ chữ `preview` để dựng bản chính 720x1280 24fps (khoảng 5–8 phút). Bản chính lưu ở `video/<id>.mp4`.

```jsonc
{ "id":"<id>", "tag":"Chữ góc trên trái", "hook":"Chữ to\n2 dòng", "hook_secs":3,
  "end":"Tập sau:\nTên tập", "scenes":[ SCENE... ], "sfx":[ ["music","s0",0], ["sting","s4","L2",1.0] ] }
```
**SCENE**
| Trường | Ý nghĩa |
|---|---|
| `id` | s0, s1… |
| `set` | `office` (mặc định), `office_night`, `bedroom`, `beach` |
| `place` | `{mã nhân vật: vị trí}`. Nhân vật không có tên ở đây sẽ bị ẩn |
| `pose` | `{mã: tư thế}` áp dụng cho cả cảnh |
| `props` | `{mã: [đạo cụ]}` |
| `cam` | `auto` (mặc định: cận người đang nói), `two`, `wide`, `close:X`, `zoom:X` (từ từ zoom vào), `reveal:X` (từ cận lùi ra toàn cảnh) |
| `cctv` + `clock` | khung camera an ninh và giờ bắt đầu, ví dụ `"12:03:10"` |
| `lookcam` | `[mã]`: nhân vật quay mặt nhìn camera |
| `moves` | `[[mã, từ_vị_trí, đến_vị_trí, bắt_đầu, thời_lượng_hoặc_mốc_kết_thúc]]` |
| `door_open`, `papers` | `true` để mở cửa hoặc rải giấy dưới sàn |
| `overlays` | `[{type:"pill"\|"big"\|"card", text, from, to, color:"#rrggbb", y}]` |
| `min`, `pad` | độ dài tối thiểu của cảnh; khoảng nghỉ sau câu cuối (cảnh cuối nên để `pad` ≥ 2.2 cho màn hình kết thúc) |
| `lines` | `[[mã, "lời thoại", offset_hoặc_null, {opt}]]`. `null` = nói ngay sau câu trước |

**opt của từng câu:** `pose:{mã:tư thế}` (giữ đến hết cảnh), `props:{mã:[…]}`, `cam`, `lookcam:[…]`, `phone:true` (lọc giọng như qua điện thoại).
Câu bắt đầu bằng `"Dịch: "` sẽ tự hiện ô vàng DỊCH.

**Mốc thời gian:** số giây tính từ đầu cảnh, hoặc `"L1"` (lúc câu số 1 bắt đầu), `"L1e"` (lúc câu số 1 kết thúc), `"L2+0.5"`.

**Vị trí:**
- `office`: `boss_desk`, `guest_chair` (tự đặt ghế), `boss_stand`, `side`, `a`, `b`, `c`, `door`, `window`, `copier_sit`, `copier_sleep` (nằm ngủ), `desk_sleep` (gục bàn)
- `bedroom`: `bed_lie`, `bed_sit`, `stand`
- `beach`: `lounger1`, `lounger2`, `sand`

**Tư thế:** angry, shock, happy, celebrate, dance, sleep, smug, sad, nervous (đổ mồ hôi), raise_hand, squint
**Đạo cụ:** book, book_blue, phone (cầm trước ngực), phone_ear (nghe điện thoại), towel, shades, coconut, milktea, bag (vác bao trên đầu), sweat
**Hiệu ứng âm thanh (sfx):** music (nhạc nền cả tập), dance, sting, pop, ding, ring, cricket, waves, printer, hum, off, whoosh. Cú pháp: `[tên, cảnh, mốc, thời_lượng?]`

**Mẹo:** hai nhân vật ngồi đối diện (`boss_desk` và `guest_chair`) sẽ ra góc qua vai đẹp nhất. Người phiên dịch hoặc người dẫn đứng ở `boss_stand` và nhìn camera.
