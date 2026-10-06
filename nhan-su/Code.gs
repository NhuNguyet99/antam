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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('NhanSu')
    .setTitle('Nhân sự An Tâm')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Script phải được tạo từ Google Sheet dữ liệu nhân sự (Tiện ích mở rộng → Apps Script)');
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
function getAll() {
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
function setDoc(collection, id, json) {
  return setDocs(JSON.stringify([[collection, id, json]]));
}

/** Ghi nhiều bản ghi trong một lần: json = [[collection, id, jsonString], ...] */
function setDocs(json) {
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

function deleteDoc(collection, id) {
  check_(collection, id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(), last = sh.getLastRow();
    if (last < 2) return true;
    const keys = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i][0] === collection && String(keys[i][1]) === id) sh.deleteRow(i + 2);
    }
    return true;
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

function rootFolderUrl() {
  return rootFolder_().getUrl();
}

/** Lưu file (base64) vào thư mục Phòng ban › Vị trí. Trả về {id, url}. */
function uploadFile(base64, name, mime, dept, position) {
  const folder = sub_(sub_(rootFolder_(), dept), position);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime || 'application/octet-stream', String(name || 'cv').slice(0, 200));
  const file = folder.createFile(blob);
  return JSON.stringify({ id: file.getId(), url: file.getUrl() });
}

/** Chuyển file sang thư mục Phòng ban › Vị trí khác */
function moveFile(fileId, dept, position) {
  const file = DriveApp.getFileById(fileId);
  file.moveTo(sub_(sub_(rootFolder_(), dept), position));
  return true;
}

/* ---------------- Gửi báo cáo cho Giám đốc ---------------- */

function sendReport(to, subject, html) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ''))) throw new Error('Email người nhận không hợp lệ');
  const blob = Utilities.newBlob(html, 'text/html', 'Bao-cao-nhan-su.html');
  MailApp.sendEmail({ to: to, subject: String(subject || 'Báo cáo nhân sự'), htmlBody: html, attachments: [blob], name: 'Phòng HCNS – Ẩm Thực An Tâm' });
  return true;
}
