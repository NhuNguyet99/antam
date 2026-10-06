/**
 * AN TÂM – TỰ ĐỘNG NHẬN CV QUA EMAIL
 * Script gắn với Google Sheet "An Tâm – CV nhận qua email".
 *
 * Cứ 15 phút quét Gmail của tài khoản bật script này: thư có file CV đính kèm (PDF, Word, ảnh)
 * được lưu file lên Google Drive (thư mục "An Tâm – CV qua email (chờ xử lý)") và ghi 1 dòng vào sheet
 * "CV nhận qua email". Web Nhân sự An Tâm đọc các dòng mới, tạo ứng viên, chấm điểm theo MTCV
 * và ghi lại cột "Trạng thái trên web", "Vị trí trên web", "Mã ứng viên".
 *
 * Bật lần đầu: mở Google Sheet → menu "An Tâm CV" → "Bật tự động nhận CV" → cho phép quyền.
 * (Hoặc trong trình soạn thảo Apps Script chọn hàm batNhanCVEmail → Chạy.)
 */
const LOG_TAB = 'CV nhận qua email';
const CFG_TAB = 'Cài đặt';
const HEAD = ['Thời gian nhận', 'Người gửi', 'Email người gửi', 'Tiêu đề email', 'Nội dung thư (trích)', 'Tên file CV', 'Link CV', 'File kèm khác',
  'Mã thư (Gmail)', 'Mã file CV (Drive)', 'Mã file kèm (Drive)', 'Trạng thái trên web', 'Vị trí trên web', 'Mã ứng viên', 'Ghi chú'];
const CFG_DEFAULT = [
  ['Địa chỉ email nhận CV (để trống = mọi thư đến hộp thư này)', ''],
  ['Từ khoá nhận diện thư ứng tuyển – cách nhau dấu phẩy (để trống = mọi thư có file CV)', 'ứng tuyển, ung tuyen, cv, resume, hồ sơ, ho so, xin việc, xin viec, sơ yếu, so yeu, lý lịch, ly lich, apply, application, tuyển dụng, tuyen dung'],
  ['Bỏ qua thư từ các địa chỉ / tên miền (cách nhau dấu phẩy)', ''],
  ['Số ngày quét lại khi bật lần đầu', 30],
  ['Thư mục lưu CV trên Google Drive', 'An Tâm – CV qua email (chờ xử lý)'],
  ['Lần quét gần nhất', ''],
  ['Kết quả lần quét gần nhất', '']
];
const EXT_DOC = /\.(pdf|docx?|rtf|odt)$/i, EXT_IMG = /\.(jpe?g|png|heic|webp)$/i;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('An Tâm CV')
    .addItem('Bật tự động nhận CV (15 phút/lần)', 'batNhanCVEmail')
    .addItem('Quét email ngay', 'quetCVEmail')
    .addItem('Tắt tự động nhận CV', 'tatNhanCVEmail')
    .addToUi();
}

/** Bật: cài trình kích hoạt 15 phút/lần và quét ngay */
function batNhanCVEmail() {
  xoaTrigger_();
  ScriptApp.newTrigger('quetCVEmail').timeBased().everyMinutes(15).create();
  setup_();
  const n = quetCVEmail();
  toast_('Đã bật tự động nhận CV (15 phút/lần). Lần quét này lưu ' + n + ' CV.');
}

function tatNhanCVEmail() {
  xoaTrigger_();
  toast_('Đã tắt tự động nhận CV.');
}

function xoaTrigger_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'quetCVEmail').forEach(t => ScriptApp.deleteTrigger(t));
}

function toast_(msg) { try { SpreadsheetApp.getActive().toast(msg, 'An Tâm CV', 8); } catch (e) { Logger.log(msg); } }

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return SpreadsheetApp.getActive() || SpreadsheetApp.openById(id);
}

/** Tạo sheet nhật ký và sheet cài đặt nếu chưa có */
function setup_() {
  const ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  let log = ss.getSheetByName(LOG_TAB);
  if (!log) {
    log = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(LOG_TAB) : ss.insertSheet(LOG_TAB, 0);
  }
  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#fde8e8').setWrap(true);
    log.setFrozenRows(1);
    [140, 160, 200, 260, 280, 220, 260, 200, 120, 120, 120, 180, 220, 100, 200].forEach((w, i) => log.setColumnWidth(i + 1, w));
    log.hideColumns(9, 3); // mã kỹ thuật
    log.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  }
  let cfg = ss.getSheetByName(CFG_TAB);
  if (!cfg) {
    cfg = ss.insertSheet(CFG_TAB);
    cfg.getRange(1, 1, 1, 2).setValues([['Cài đặt', 'Giá trị']]).setFontWeight('bold');
    cfg.getRange(2, 1, CFG_DEFAULT.length, 2).setValues(CFG_DEFAULT);
    cfg.setColumnWidth(1, 520); cfg.setColumnWidth(2, 520);
    cfg.getRange('B:B').setWrap(true);
  }
  return { log, cfg };
}

function cfg_(cfg) {
  const v = cfg.getRange(2, 1, Math.max(1, cfg.getLastRow() - 1), 2).getValues();
  const get = i => (v[i] && v[i][1] !== undefined ? v[i][1] : CFG_DEFAULT[i][1]);
  const list = x => String(x || '').split(',').map(s => norm_(s)).filter(Boolean);
  return { to: String(get(0)).trim(), keywords: list(get(1)), skip: list(get(2)), days: Math.max(1, Number(get(3)) || 30), folder: String(get(4) || CFG_DEFAULT[4][1]).trim() };
}

/** Bỏ dấu tiếng Việt, chữ thường */
function norm_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function folder_(name) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed() && f.getName() === name) return f; } catch (e) { /* tạo lại */ } }
  const it = DriveApp.getFoldersByName(name);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

/** "Nguyễn Văn A <a@x.com>" → [tên, email] */
function parseFrom_(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  if (m) return [m[1].trim() || m[2], m[2].trim().toLowerCase()];
  return [String(from || '').trim(), String(from || '').trim().toLowerCase()];
}

/** Chọn file CV chính trong các file đính kèm */
function pickCv_(atts) {
  const docs = atts.filter(a => EXT_DOC.test(a.getName()));
  const pool = docs.length ? docs : atts;
  const named = pool.filter(a => /(^|[^a-z])(cv|resume|so yeu|ly lich|ho so|curriculum)/.test(norm_(a.getName())));
  const list = (named.length ? named : pool).slice().sort((a, b) => b.getSize() - a.getSize());
  return list[0];
}

/** Quét Gmail – chạy theo trình kích hoạt 15 phút/lần. Trả về số thư CV đã lưu. */
function quetCVEmail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 0;
  try {
    const { log, cfg } = setup_();
    const c = cfg_(cfg);
    const props = PropertiesService.getScriptProperties();
    const first = !props.getProperty('LAST_RUN');
    const days = first ? c.days : 3;
    let q = 'has:attachment -in:sent -in:chats -in:spam -in:trash newer_than:' + days + 'd';
    if (c.to) q += ' {to:' + c.to + ' deliveredto:' + c.to + ' cc:' + c.to + '}';
    const last = log.getLastRow();
    const seen = new Set(last > 1 ? log.getRange(2, 9, last - 1, 1).getValues().map(r => String(r[0])) : []);
    const me = norm_(Session.getEffectiveUser().getEmail());
    const folder = folder_(c.folder);
    const rows = [];
    let start = 0, threads;
    do {
      threads = GmailApp.search(q, start, 100);
      start += threads.length;
      threads.forEach(th => th.getMessages().forEach(msg => {
        const id = msg.getId();
        if (seen.has(id)) return;
        const [name, email] = parseFrom_(msg.getFrom());
        if (norm_(email) === me) return;
        if (c.skip.some(s => norm_(email).includes(s))) return;
        const atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true })
          .filter(a => (EXT_DOC.test(a.getName()) || (EXT_IMG.test(a.getName()) && a.getSize() > 40 * 1024)) && a.getSize() < 20 * 1024 * 1024);
        if (!atts.length) return;
        const subject = msg.getSubject() || '';
        let body = '';
        try { body = (msg.getPlainBody() || '').replace(/\s+\n/g, '\n').slice(0, 1500); } catch (e) { /* thư không có phần chữ */ }
        if (c.keywords.length) {
          const hay = norm_(subject + ' ' + atts.map(a => a.getName()).join(' ') + ' ' + body.slice(0, 400));
          if (!c.keywords.some(k => hay.includes(k))) return;
        }
        const main = pickCv_(atts), others = atts.filter(a => a !== main);
        const day = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        const save = a => folder.createFile(a.copyBlob().setName((day + ' ' + name + ' - ' + a.getName()).slice(0, 200)));
        const f = save(main), of = others.map(save);
        rows.push([msg.getDate(), name, email, subject, body, main.getName(), f.getUrl(), others.map(a => a.getName()).join(' | '),
          id, f.getId(), of.map(x => x.getId()).join(','), '', '', '', of.length ? of.map(x => x.getUrl()).join('\n') : '']);
        seen.add(id);
      }));
    } while (threads.length === 100 && start < 500);
    rows.sort((a, b) => a[0] - b[0]);
    if (rows.length) log.getRange(log.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
    const now = new Date();
    props.setProperty('LAST_RUN', now.toISOString());
    cfg.getRange(7, 2, 2, 1).setValues([[now], ['Lưu ' + rows.length + ' CV mới (quét ' + days + ' ngày gần nhất)']]);
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}
