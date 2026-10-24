// GPS An Tâm – bản 1 file: dán toàn bộ file này vào Code.gs của Apps Script (Sheet "GPS An Tâm" › Tiện ích mở rộng › Apps Script).
// Tự tạo từ Code.gs + gps.html (thư mục kho-noi-bo/gps-an-tam) – sửa ở 2 file đó rồi tạo lại.

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
  // bản 1 file (GPS-An-Tam.gs) có sẵn GPS_HTML; bản 2 file dùng gps.html
  const t = typeof GPS_HTML === 'string' ? HtmlService.createTemplate(GPS_HTML) : HtmlService.createTemplateFromFile('gps');
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

// Trang GPS người giao mở trên điện thoại (nội dung gps.html)
const GPS_HTML = "<!DOCTYPE html>\n<html lang=\"vi\">\n<head>\n<base target=\"_top\">\n<meta charset=\"utf-8\">\n<style>\n  :root { --brand: #13804b; --bad: #c4320a; --ink: #1d2939; --muted: #667085; --line: #d0d5dd; --soft: #f5f7f6; }\n  * { box-sizing: border-box; }\n  body { margin: 0; font: 16px/1.45 system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif; color: var(--ink); background: #fff; }\n  header { background: var(--brand); color: #fff; padding: 16px; }\n  header b { font-size: 19px; display: block; }\n  header span { font-size: 13px; opacity: .9; }\n  main { padding: 16px; max-width: 520px; margin: 0 auto; }\n  .card { border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 14px; }\n  .st { font-weight: 700; display: flex; align-items: center; gap: 8px; }\n  .dot { width: 11px; height: 11px; border-radius: 50%; background: #98a2b3; flex: none; }\n  .on .dot { background: var(--brand); box-shadow: 0 0 0 5px rgba(19,128,75,.18); }\n  .row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; padding: 4px 0; }\n  .row span { color: var(--muted); }\n  button { font: inherit; width: 100%; border: 0; border-radius: 14px; padding: 17px; font-size: 18px; font-weight: 700; color: #fff; cursor: pointer; }\n  .start { background: var(--brand); } .stop { background: var(--bad); }\n  .note { font-size: 13.5px; color: var(--muted); background: var(--soft); border-radius: 12px; padding: 12px; }\n  .note b { color: var(--ink); }\n  .err { color: var(--bad); font-size: 14px; margin: 10px 0 0; }\n</style>\n</head>\n<body>\n<header><b>🛰 GPS An Tâm</b><span id=\"who\"></span></header>\n<main id=\"app\"></main>\n<script>\n  /* Người giao mở link riêng (…/exec?t=mã&n=tên) → bấm Bật GPS → để trang mở trong lúc đi giao.\n     Ghi 1 điểm khi đi được ≥ 30 m (cách điểm trước ≥ 20 giây) hoặc đứng yên mỗi 5 phút; gửi về mỗi phút; mất mạng thì giữ lại gửi sau. */\n  const CFG = <?!= cfg ?>;\n  const KEY = 'gpsAT.' + CFG.t;\n  const S = { on: false, watch: null, buf: [], last: null, fix: null, err: '', sentAt: 0, sending: false, lock: null, day: '', n: 0, km: 0, timer: null };\n  const $ = id => document.getElementById(id);\n  const z = n => String(n).padStart(2, '0');\n  const hm = ms => { const d = new Date(ms); return z(d.getHours()) + ':' + z(d.getMinutes()); };\n  const today = () => { const d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };\n  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }\n  function keep() { try { localStorage.setItem(KEY, JSON.stringify({ on: S.on, buf: S.buf.slice(-3000), day: S.day, n: S.n, km: S.km, last: S.last })); } catch (e) { /* bỏ qua */ } }\n  function meters(a, b) {\n    const R = 6371000, r = x => x * Math.PI / 180;\n    const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[2] - a[2]) / 2) ** 2;\n    return 2 * R * Math.asin(Math.sqrt(h));\n  }\n  function call(body) {\n    return new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(bad).save(body));\n  }\n\n  function draw() {\n    $('who').textContent = (CFG.n || 'Người giao') + ' · ' + new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });\n    if (!CFG.t) {\n      $('app').innerHTML = '<div class=\"card\"><b>Link GPS chưa đúng.</b><p class=\"note\">Nhờ kho gửi lại link GPS riêng của bạn (Giao hàng An Tâm › Người giao &amp; kết quả giao › 🛰 GPS An Tâm).</p></div>';\n      return;\n    }\n    const f = S.fix;\n    $('app').innerHTML = `<div class=\"card ${S.on ? 'on' : ''}\">\n        <div class=\"st\"><span class=\"dot\"></span>${S.on ? (f ? 'Đang gửi vị trí' : 'Đang bật GPS, chờ vị trí…') : 'GPS đang tắt'}</div>\n        <div class=\"row\"><span>Vị trí mới nhất</span><b>${f ? hm(f.ts) + ' · ±' + Math.round(f.acc || 0) + ' m' : '—'}</b></div>\n        <div class=\"row\"><span>Đã ghi hôm nay</span><b>${S.n} điểm · ${(S.km).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km</b></div>\n        <div class=\"row\"><span>Gửi lên lần cuối</span><b>${S.sentAt ? hm(S.sentAt) : '—'}${S.buf.length ? ' · ' + S.buf.length + ' điểm chờ gửi' : ''}</b></div>\n      </div>\n      ${S.on ? '<button class=\"stop\" id=\"btn\">■ Tắt GPS (giao xong)</button>' : '<button class=\"start\" id=\"btn\">▶ Bật GPS</button>'}\n      ${S.err ? `<p class=\"err\">${S.err}</p>` : ''}\n      <p class=\"note\" style=\"margin-top:14px\">📱 <b>Giữ trang này mở và màn hình sáng</b> trong lúc đi giao – tắt màn hình hoặc chuyển hẳn sang app khác lâu thì điện thoại ngừng đọc GPS.\n        Bấm <b>Đã giao</b> ở trang Giao hàng An Tâm như bình thường rồi quay lại trang này.<br>Mất sóng: vị trí được giữ lại và tự gửi khi có mạng.</p>`;\n    $('btn').onclick = () => (S.on ? stop() : start());\n  }\n\n  function start() {\n    S.err = '';\n    if (!navigator.geolocation) { S.err = 'Trình duyệt này không đọc được GPS – hãy mở link bằng Chrome (Android) hoặc Safari (iPhone).'; return draw(); }\n    S.on = true; S.last = null; keep();\n    S.watch = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 10000, timeout: 60000 });\n    clearInterval(S.timer); S.timer = setInterval(flush, 60000);\n    awake(); flush({ on: true }); draw();\n  }\n  function stop() {\n    S.on = false;\n    if (S.watch != null) navigator.geolocation.clearWatch(S.watch);\n    S.watch = null; clearInterval(S.timer); S.timer = null;\n    if (S.lock) { S.lock.release().catch(() => {}); S.lock = null; }\n    keep(); flush({ on: false }); draw();\n  }\n  function onFix(pos) {\n    if (!S.on) return;\n    const c = pos.coords, ts = Date.now();\n    S.fix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, ts }; S.err = '';\n    if (S.day !== today()) { S.day = today(); S.n = 0; S.km = 0; S.last = null; }\n    const p = [Math.round(ts / 1000), Math.round(c.latitude * 1e5) / 1e5, Math.round(c.longitude * 1e5) / 1e5, Math.round(c.accuracy || 0)];\n    const L = S.last;\n    if (L && c.accuracy > 150) return draw(); // tín hiệu yếu: bỏ qua\n    if (!L || (p[0] - L[0] >= 20 && meters(L, p) >= Math.max(30, c.accuracy || 0)) || p[0] - L[0] >= 300 || p[0] < L[0]) {\n      if (L && p[0] > L[0]) { const m = meters(L, p); if (m < 20000) S.km += m / 1000; }\n      S.buf.push(p); S.last = p; S.n++; keep();\n      if (S.buf.length >= 30) flush();\n    }\n    draw();\n  }\n  function onErr(e) {\n    if (e.code === 1) {\n      S.err = 'Điện thoại chưa cho trang đọc vị trí. Bật <b>Vị trí (GPS)</b> của điện thoại, rồi cho phép: Chrome – bấm biểu tượng bên trái thanh địa chỉ › Quyền › Vị trí › Cho phép; iPhone – Cài đặt › Quyền riêng tư › Dịch vụ định vị › Safari › Khi dùng ứng dụng. Xong bấm Bật GPS lại.';\n      stop();\n    } else { S.err = 'Chưa bắt được tín hiệu GPS – ra chỗ thoáng, trang vẫn đang chờ.'; draw(); }\n  }\n  async function flush(extra) {\n    if (S.sending || !CFG.t || (!S.buf.length && !extra)) return;\n    const pts = S.buf.splice(0, 600);\n    S.sending = true;\n    try {\n      await call(Object.assign({ t: CFG.t, n: CFG.n, pts }, extra || {}));\n      S.sentAt = Date.now(); if (/gửi được/.test(S.err)) S.err = '';\n    } catch (e) {\n      S.buf = pts.concat(S.buf).slice(-3000);\n      S.err = 'Chưa gửi được vị trí (mất mạng?) – trang sẽ tự gửi lại.' + (e && /Link GPS/.test(e.message) ? ' ' + e.message : '');\n    } finally { S.sending = false; keep(); draw(); }\n  }\n  async function awake() {\n    if (!S.on || S.lock || document.hidden || !('wakeLock' in navigator)) return;\n    try { S.lock = await navigator.wakeLock.request('screen'); S.lock.addEventListener('release', () => { S.lock = null; }); } catch (e) { S.lock = null; }\n  }\n  document.addEventListener('visibilitychange', () => { if (!S.on) return; if (document.hidden) flush(); else { awake(); flush(); } });\n  window.addEventListener('pagehide', () => { if (S.on) flush(); });\n\n  const was = load();\n  S.buf = Array.isArray(was.buf) ? was.buf : [];\n  if (was.day === today()) { S.day = was.day; S.n = was.n || 0; S.km = was.km || 0; S.last = was.last || null; }\n  draw();\n  if (was.on && CFG.t) start(); // mở lại trang lúc đang bật: tiếp tục\n  else if (S.buf.length) flush();\n</script>\n</body>\n</html>\n";
