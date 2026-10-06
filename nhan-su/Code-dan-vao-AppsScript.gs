/**
 * Nhân sự An Tâm – phần chạy trên máy chủ Google (Apps Script).
 * Dữ liệu lưu trong trang tính "data" của Google Sheet chứa script này
 * (cột A = nhóm dữ liệu, B = mã bản ghi, C = nội dung JSON, D = lần sửa cuối) – giống web Quản trị An Tâm.
 * CV / MTCV lưu trong Google Drive, thư mục "An Tâm – Kho CV" › Phòng ban › Vị trí.
 * Triển khai: Deploy → New deployment → Web app.
 */

const DATA_SHEET = 'data';
const ROOT_FOLDER_NAME = 'An Tâm – Kho CV';
const COLLECTIONS = ['settings', 'requisitions', 'candidates', 'evaluations', 'employees', 'payrolls', 'legal_tasks', 'cv_files'];
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

/** Nạp giao diện từ GitHub (để trống = dùng file NhanSu.html trong dự án Apps Script) */
const HTML_SOURCE_URL = 'https://raw.githubusercontent.com/NhuNguyet99/antam/claude/hr-management-system-vfnwgx/nhan-su/NhanSu.html';

function doGet() {
  const out = HtmlService.createHtmlOutput(pageHtml_())
    .setTitle('Nhân sự An Tâm')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  return out;
}

/** Nội dung trang: lấy từ GitHub (lưu tạm 10 phút) hoặc từ file NhanSu trong dự án */
function pageHtml_() {
  if (!HTML_SOURCE_URL) return HtmlService.createHtmlOutputFromFile('NhanSu').getContent();
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('html_n') || 0);
  if (n) {
    const parts = cache.getAll(Array.from({ length: n }, (_, i) => 'html_' + i));
    if (Object.keys(parts).length === n) return Array.from({ length: n }, (_, i) => parts['html_' + i]).join('');
  }
  const res = UrlFetchApp.fetch(HTML_SOURCE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    try { return HtmlService.createHtmlOutputFromFile('NhanSu').getContent(); }
    catch (e) { throw new Error('Không tải được giao diện từ ' + HTML_SOURCE_URL + ' (mã ' + res.getResponseCode() + ')'); }
  }
  const html = res.getContentText('UTF-8'), size = 90000, chunks = {};
  for (let i = 0; i * size < html.length; i++) chunks['html_' + i] = html.slice(i * size, (i + 1) * size);
  chunks.html_n = String(Object.keys(chunks).length);
  try { cache.putAll(chunks, 600); } catch (e) { /* bỏ qua nếu bộ nhớ tạm đầy */ }
  return html;
}

/** Mã Google Sheet dữ liệu nhân sự – dùng khi script không được tạo từ bên trong Sheet (để trống nếu script gắn trong Sheet) */
const DB_SPREADSHEET_ID = '';

function sheet_() {
  const id = DB_SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  const ss = SpreadsheetApp.getActive() || (id ? SpreadsheetApp.openById(id) : null);
  if (!ss) throw new Error('Chưa gắn Google Sheet dữ liệu: điền DB_SPREADSHEET_ID trong Code.gs, hoặc tạo script từ Google Sheet (Tiện ích mở rộng → Apps Script)');
  let sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['collection', 'id', 'json', 'updatedAt']]).setFontWeight('bold');
    sh.getRange('B:B').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Toàn bộ dữ liệu, dạng {collection: [{id, ...}]} */
function getAll_() {
  const sh = sheet_();
  const out = {};
  COLLECTIONS.forEach(c => out[c] = []);
  if (sh.getLastRow() < 2) return JSON.stringify(out);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  values.forEach(v => {
    const c = String(v[0] || ''), id = String(v[1] || '');
    if (!c || !id || !out[c]) return;
    try { const doc = JSON.parse(v[2]); doc.id = id; out[c].push(doc); } catch (e) { /* bỏ qua dòng hỏng */ }
  });
  return JSON.stringify(out);
}

function check_(collection, id) {
  if (COLLECTIONS.indexOf(collection) < 0) throw new Error('Nhóm dữ liệu không hợp lệ: ' + collection);
  if (!ID_RE.test(id)) throw new Error('Mã bản ghi không hợp lệ');
}

/** Ghi đè (hoặc thêm mới) một bản ghi */
function setDoc_(collection, id, json) {
  return setDocs_(JSON.stringify([[collection, id, json]]));
}

/** Ghi nhiều bản ghi trong một lần: json = [[collection, id, jsonString], ...] */
function setDocs_(json) {
  const list = JSON.parse(json);
  list.forEach(x => {
    check_(x[0], String(x[1]));
    if (String(x[2]).length > 49000) throw new Error('Bản ghi quá lớn (giới hạn ô Google Sheet 50.000 ký tự): ' + x[0] + '/' + x[1]);
    JSON.parse(x[2]);
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_(), last = sh.getLastRow(), now = new Date(), row = {};
    if (last > 1) sh.getRange(2, 1, last - 1, 2).getValues().forEach((k, i) => { row[k[0] + '|' + String(k[1])] = i + 2; });
    list.forEach(x => { if (x[0] === 'payrolls' && payrollLockedAt_(sh, row['payrolls|' + String(x[1])])) throw new Error('Bảng lương ' + x[1] + ' đã khoá – không thể sửa. Mở khoá bằng mật khẩu quản lý lương.'); });
    const add = [];
    list.forEach(x => {
      const key = x[0] + '|' + String(x[1]), r = row[key];
      if (r > 0) sh.getRange(r, 3, 1, 2).setValues([[x[2], now]]);
      else if (r === -1) add.forEach(a => { if (a[0] + '|' + a[1] === key) { a[2] = x[2]; } });
      else { add.push([x[0], String(x[1]), x[2], now]); row[key] = -1; }
    });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 4).setValues(add);
    return list.length;
  } finally {
    lock.releaseLock();
  }
}

function deleteDoc_(collection, id) {
  check_(collection, id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(), last = sh.getLastRow();
    if (last < 2) return true;
    const keys = sh.getRange(2, 1, last - 1, 2).getValues();
    if (collection === 'payrolls') keys.forEach((k, i) => { if (k[0] === collection && String(k[1]) === id && payrollLockedAt_(sh, i + 2)) throw new Error('Bảng lương ' + id + ' đã khoá – không thể xoá.'); });
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i][0] === collection && String(keys[i][1]) === id) sh.deleteRow(i + 2);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Khoá bảng lương ---------------- */

/** Dòng r của trang "data" là bảng lương đã khoá? */
function payrollLockedAt_(sh, r) {
  if (!(r > 0)) return false;
  try { return JSON.parse(sh.getRange(r, 3).getValue()).locked === true; } catch (e) { return false; }
}

function pinHash_(salt, pin) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + String(pin), Utilities.Charset.UTF_8));
}

function checkPin_(pin) {
  const cache = CacheService.getScriptCache(), fails = Number(cache.get('pin_fails') || 0);
  if (fails >= 5) throw new Error('Nhập sai mật khẩu quá 5 lần – thử lại sau 15 phút.');
  const stored = PropertiesService.getScriptProperties().getProperty('PAY_PIN');
  if (!stored) throw new Error('Chưa đặt mật khẩu quản lý lương.');
  const [salt, hash] = stored.split(':');
  if (pinHash_(salt, pin) !== hash) { cache.put('pin_fails', String(fails + 1), 900); throw new Error('Sai mật khẩu quản lý lương.'); }
  cache.remove('pin_fails');
}

function hasPayrollPin_() {
  return !!PropertiesService.getScriptProperties().getProperty('PAY_PIN');
}

/** Đặt / đổi mật khẩu quản lý lương (đổi thì phải nhập đúng mật khẩu cũ) */
function setPayrollPin_(oldPin, newPin) {
  if (String(newPin || '').length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự.');
  if (hasPayrollPin_()) checkPin_(oldPin);
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('PAY_PIN', salt + ':' + pinHash_(salt, newPin));
  return true;
}

/** Khoá bảng lương: ghi kèm thời điểm, người khoá; từ đó máy chủ từ chối mọi lệnh sửa / xoá */
function lockPayroll_(month, json, by) {
  if (!hasPayrollPin_()) throw new Error('Hãy đặt mật khẩu quản lý lương trước khi khoá.');
  const doc = JSON.parse(json);
  doc.locked = true;
  doc.lockedAt = new Date().toISOString();
  doc.lockedBy = by || Session.getActiveUser().getEmail() || '';
  setDocs_(JSON.stringify([['payrolls', month, JSON.stringify(doc)]]));
  return JSON.stringify(doc);
}

/** Mở khoá bảng lương – cần mật khẩu quản lý lương */
function unlockPayroll_(month, pin) {
  check_('payrolls', month);
  checkPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(), last = sh.getLastRow();
    const keys = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
    const i = keys.findIndex(k => k[0] === 'payrolls' && String(k[1]) === month);
    if (i < 0) throw new Error('Không tìm thấy bảng lương ' + month);
    const doc = JSON.parse(sh.getRange(i + 2, 3).getValue());
    doc.locked = false;
    doc.unlockedAt = new Date().toISOString();
    sh.getRange(i + 2, 3, 1, 2).setValues([[JSON.stringify(doc), new Date()]]);
    return JSON.stringify(doc);
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Google Drive: kho CV theo Phòng ban › Vị trí ---------------- */

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* thư mục đã bị xoá – tạo lại */ } }
  const it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function sub_(parent, name) {
  name = String(name || 'Chưa phân loại').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) || 'Chưa phân loại';
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function rootFolderUrl_() {
  return rootFolder_().getUrl();
}

/** Lưu file (base64) vào thư mục Phòng ban › Vị trí. Trả về {id, url}. */
function uploadFile_(base64, name, mime, dept, position) {
  const folder = sub_(sub_(rootFolder_(), dept), position);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime || 'application/octet-stream', String(name || 'cv').slice(0, 200));
  const file = folder.createFile(blob);
  return JSON.stringify({ id: file.getId(), url: file.getUrl() });
}

/** Chuyển file sang thư mục Phòng ban › Vị trí khác */
function moveFile_(fileId, dept, position) {
  const file = DriveApp.getFileById(fileId);
  file.moveTo(sub_(sub_(rootFolder_(), dept), position));
  return true;
}

/* ---------------- Gửi báo cáo cho Giám đốc ---------------- */

function sendReport_(to, subject, html) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ''))) throw new Error('Email người nhận không hợp lệ');
  const blob = Utilities.newBlob(html, 'text/html', 'Bao-cao-nhan-su.html');
  MailApp.sendEmail({ to: to, subject: String(subject || 'Báo cáo nhân sự'), htmlBody: html, attachments: [blob], name: 'Phòng HCNS – Ẩm Thực An Tâm' });
  return true;
}

/* ================= ĐĂNG NHẬP & PHÂN QUYỀN =================
 * Web mở cho "Bất kỳ ai có tài khoản Google" nhưng mọi dữ liệu chỉ đọc / ghi được sau khi đăng nhập tài khoản của web.
 * Tài khoản, mật khẩu (đã mã hoá) lưu trong Thuộc tính tập lệnh (APP_USERS), không nằm trong Google Sheet.
 * Vai trò: admin (quản trị, quản lý tài khoản), hr (nhân viên HCNS – xem & sửa), view (chỉ xem – VD Ban Giám đốc).
 * Tài khoản quản trị đầu tiên tạo bằng mã khởi tạo SETUP_CODE (file Setup.gs riêng trong dự án, hoặc thuộc tính SETUP_CODE).
 */
const ROLES = ['admin', 'hr', 'view'];
function props_() { return PropertiesService.getScriptProperties(); }
function users_() { try { return JSON.parse(props_().getProperty('APP_USERS') || '[]'); } catch (e) { return []; } }
function saveUsers_(list) { props_().setProperty('APP_USERS', JSON.stringify(list)); }
function secret_() { let k = props_().getProperty('APP_SECRET'); if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('APP_SECRET', k); } return k; }
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_())); }
function pub_(u) { return { u: u.u, name: u.name || u.u, role: u.role }; }
function makeToken_(u) { const p = [u.u, Date.now() + 30 * 86400000, u.ver || 0].join('|'); return Utilities.base64EncodeWebSafe(p) + '.' + sign_(p); }
/** Kiểm tra phiên đăng nhập; write = true thì chặn tài khoản chỉ xem */
function auth_(token, write) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('AUTH: Chưa đăng nhập');
  let p = '';
  try { p = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { throw new Error('AUTH: Phiên đăng nhập không hợp lệ'); }
  if (sign_(p) !== parts[1]) throw new Error('AUTH: Phiên đăng nhập không hợp lệ');
  const [u, exp, ver] = p.split('|');
  if (Date.now() > Number(exp)) throw new Error('AUTH: Phiên đăng nhập đã hết hạn – đăng nhập lại');
  const user = users_().find(x => x.u === u && !x.disabled);
  if (!user || String(user.ver || 0) !== String(ver)) throw new Error('AUTH: Tài khoản đã bị khoá hoặc đổi mật khẩu – đăng nhập lại');
  if (write && user.role === 'view') throw new Error('Tài khoản chỉ xem – không được thay đổi dữ liệu');
  return user;
}
function admin_(token) { const u = auth_(token, true); if (u.role !== 'admin') throw new Error('Chỉ tài khoản quản trị được làm việc này'); return u; }
function normU_(u) { u = String(u || '').trim().toLowerCase(); if (!/^[a-z0-9._@-]{3,40}$/.test(u)) throw new Error('Tên đăng nhập 3–40 ký tự: chữ không dấu, số, . _ - @'); return u; }

function authStatus() { return JSON.stringify({ configured: users_().length > 0 }); }

function setupAdmin(code, u, name, pw) {
  if (users_().length) throw new Error('Đã có tài khoản quản trị – hãy đăng nhập');
  const expect = (typeof SETUP_CODE !== 'undefined' ? SETUP_CODE : '') || props_().getProperty('SETUP_CODE') || '';
  if (!expect) throw new Error('Dự án chưa có mã khởi tạo (SETUP_CODE)');
  const cache = CacheService.getScriptCache(), f = Number(cache.get('setup_fails') || 0);
  if (f >= 5) throw new Error('Nhập sai mã quá 5 lần – thử lại sau 15 phút');
  if (String(code).trim() !== String(expect)) { cache.put('setup_fails', String(f + 1), 900); throw new Error('Mã khởi tạo không đúng'); }
  if (String(pw || '').length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
  const salt = Utilities.getUuid(), user = { u: normU_(u), name: String(name || '').trim() || u, role: 'admin', salt, hash: pinHash_(salt, pw), ver: 0 };
  saveUsers_([user]);
  return JSON.stringify({ token: makeToken_(user), user: pub_(user) });
}

function login(u, pw) {
  u = String(u || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache(), key = 'login_fail_' + u, f = Number(cache.get(key) || 0);
  if (f >= 5) throw new Error('Nhập sai quá 5 lần – thử lại sau 15 phút');
  const user = users_().find(x => x.u === u && !x.disabled);
  if (!user || pinHash_(user.salt, pw) !== user.hash) { cache.put(key, String(f + 1), 900); throw new Error('Sai tên đăng nhập hoặc mật khẩu'); }
  cache.remove(key);
  return JSON.stringify({ token: makeToken_(user), user: pub_(user) });
}
function whoami(t) { return JSON.stringify(pub_(auth_(t))); }
function changePassword(t, oldPw, newPw) {
  const me = auth_(t), list = users_(), u = list.find(x => x.u === me.u);
  if (pinHash_(u.salt, oldPw) !== u.hash) throw new Error('Mật khẩu hiện tại không đúng');
  if (String(newPw || '').length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
  u.salt = Utilities.getUuid(); u.hash = pinHash_(u.salt, newPw); u.ver = (u.ver || 0) + 1; saveUsers_(list);
  return JSON.stringify({ token: makeToken_(u), user: pub_(u) });
}
function listUsers(t) { admin_(t); return JSON.stringify(users_().map(u => Object.assign(pub_(u), { disabled: !!u.disabled }))); }
function saveUser(t, json) {
  const me = admin_(t), d = JSON.parse(json), list = users_(), id = normU_(d.u);
  if (ROLES.indexOf(d.role) < 0) throw new Error('Vai trò không hợp lệ');
  let u = list.find(x => x.u === id);
  if (!u) { if (String(d.password || '').length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự'); u = { u: id, ver: 0 }; list.push(u); }
  u.name = String(d.name || '').trim() || id; u.role = d.role; u.disabled = !!d.disabled;
  if (d.password) { if (String(d.password).length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự'); u.salt = Utilities.getUuid(); u.hash = pinHash_(u.salt, d.password); u.ver = (u.ver || 0) + 1; }
  if (!list.some(x => x.role === 'admin' && !x.disabled)) throw new Error('Phải còn ít nhất 1 tài khoản quản trị');
  if (u.u === me.u && (u.role !== 'admin' || u.disabled)) throw new Error('Không tự hạ quyền / khoá chính mình');
  saveUsers_(list); return true;
}
function deleteUser(t, id) {
  const me = admin_(t); if (id === me.u) throw new Error('Không xoá được chính mình');
  saveUsers_(users_().filter(x => x.u !== id)); return true;
}

/* -------- Các hàm web gọi: đều phải đăng nhập -------- */
function getAll(t) { auth_(t); return getAll_(); }
function setDoc(t, c, id, json) { auth_(t, true); return setDoc_(c, id, json); }
function setDocs(t, json) { auth_(t, true); return setDocs_(json); }
function deleteDoc(t, c, id) { auth_(t, true); return deleteDoc_(c, id); }
function uploadFile(t, b64, name, mime, dept, position) { auth_(t, true); return uploadFile_(b64, name, mime, dept, position); }
function moveFile(t, id, dept, position) { auth_(t, true); return moveFile_(id, dept, position); }
function rootFolderUrl(t) { auth_(t); return rootFolderUrl_(); }
function sendReport(t, to, subject, html) { auth_(t, true); return sendReport_(to, subject, html); }
function hasPayrollPin(t) { auth_(t); return hasPayrollPin_(); }
function setPayrollPin(t, oldPin, newPin) { auth_(t, true); return setPayrollPin_(oldPin, newPin); }
function lockPayroll(t, month, json) { const u = auth_(t, true); return lockPayroll_(month, json, u.name || u.u); }
function unlockPayroll(t, month, pin) { auth_(t, true); return unlockPayroll_(month, pin); }
function pendingImports(t) { const u = auth_(t); if (u.role === 'view') return '[]'; return typeof pendingImports_ === 'function' ? pendingImports_() : '[]'; }
