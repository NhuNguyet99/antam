/* GPS An Tâm – Google Apps Script (Tiện ích mở rộng › Apps Script của Google Sheet "GPS An Tâm").
   Trang Giao hàng An Tâm (claude.ai) không được đọc GPS điện thoại, nên người giao mở trang này bằng link riêng
   (…/exec?t=mã&n=tên, kho tạo ở Giao hàng An Tâm › Người giao & kết quả giao › 🛰 GPS An Tâm) và bấm Bật GPS.
   Điểm GPS ghi vào trang tính đầu tiên: mỗi mã link 1 dòng, giữ các lần gửi trong 24 giờ gần nhất.
   Trang Giao hàng An Tâm (chủ trang mở, có kết nối Google Drive) đọc trang tính này mỗi phút và gộp vào Hành trình giao hàng.

   Cột diem: các lần gửi cách nhau "|", mỗi lần: R<giây unix lúc nhận>:<giây unix>,<vĩ độ×1e5>,<kinh độ×1e5>,<độ chính xác m>
   rồi các điểm sau ghi chênh lệch so với điểm trước: ;<+giây>,<+vĩ độ×1e5>,<+kinh độ×1e5>,<độ chính xác m> */
const SHEET_ID = '1icIATdG_hZxIv3MCkEJh1Gv3Bk0Uv_mCMiAO90OOF80';
const KEEP_SEC = 24 * 3600;    // giữ các lần gửi trong 24 giờ (trang Giao hàng đọc lúc chủ trang mở)
const MAX_CELL = 45000;        // 1 ô Google Sheet tối đa 50.000 ký tự: quá thì bỏ các lần gửi cũ nhất
const DROP_ROW_SEC = 2 * 86400; // dòng không gửi gì 2 ngày thì xóa
const MAX_PTS = 600;           // tối đa điểm mỗi lần gửi
const HEAD = ['ma', 'ten', 'cap_nhat', 'bat', 'diem']; // bat: 1 = đang bật GPS, 0 = đã tắt

function doGet(e) {
  const p = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile('gps');
  t.cfg = JSON.stringify({ t: cleanTok(p.t), n: String(p.n || '').slice(0, 60) }).replace(/</g, '\\u003c');
  return t.evaluate().setTitle('GPS An Tâm')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// trang GPS gọi qua google.script.run.save(...)
function save(b) {
  const tok = cleanTok(b && b.t);
  if (!tok) throw new Error('Link GPS không đúng – nhờ kho gửi lại link');
  const now = Math.floor(Date.now() / 1000);
  const pts = (Array.isArray(b.pts) ? b.pts : []).slice(-MAX_PTS)
    .map(p => [Math.round(+p[0]), Math.round(+p[1] * 1e5), Math.round(+p[2] * 1e5), Math.min(9999, Math.round(+p[3] || 0))])
    .filter(p => p[0] > now - 86400 && p[0] < now + 600 && Math.abs(p[1]) <= 9e6 && Math.abs(p[2]) <= 18e6 && (p[1] || p[2]))
    .sort((a, c) => a[0] - c[0]);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    const n = sh.getLastRow();
    const rows = n > 1 ? sh.getRange(2, 1, n - 1, HEAD.length).getValues() : [];
    const out = [];
    let mine = null;
    rows.forEach(r => {
      const at = Date.parse(r[2]) / 1000 || 0;
      if (r[0] === tok) mine = r;
      else if (r[0] && now - at < DROP_ROW_SEC) out.push([r[0], r[1], r[2], r[3], keep(r[4], now)]);
    });
    const enc = encode(now, pts);
    let batches = keep(mine ? mine[4] : '', now);
    while (batches && batches.length + enc.length > MAX_CELL) batches = batches.split('|').slice(1).join('|');
    out.push([tok, String(b.n || (mine && mine[1]) || '').slice(0, 60), new Date().toISOString(),
      (b.on === undefined ? mine && String(mine[3]) === '1' : !!b.on) ? '1' : '0', [batches, enc].filter(Boolean).join('|')]);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    if (n > 1) sh.getRange(2, 1, n - 1, HEAD.length).clearContent();
    sh.getRange(2, 1, out.length, HEAD.length).setNumberFormat('@').setValues(out.map(r => r.map(String)));
    return { ok: true, n: pts.length, at: now };
  } finally {
    lock.releaseLock();
  }
}

function cleanTok(t) { t = String(t || ''); return /^[a-f0-9]{24}$/.test(t) ? t : ''; }
// bỏ các lần gửi cũ hơn 24 giờ
function keep(s, now) {
  return String(s || '').split('|').filter(x => { const m = /^R(\d+):/.exec(x); return m && now - +m[1] < KEEP_SEC; }).join('|');
}
function encode(now, pts) {
  if (!pts.length) return '';
  let prev = null;
  return 'R' + now + ':' + pts.map(p => {
    const s = prev ? [p[0] - prev[0], p[1] - prev[1], p[2] - prev[2], p[3]] : p;
    prev = p;
    return s.join(',');
  }).join(';');
}
