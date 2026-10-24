'use strict';
/* Web làm việc nội bộ – Kho Thành phẩm & Hàng hóa An Tâm.
   Mô phỏng quy trình của file Excel: Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất,
   Phiếu Nhập Xuất, Phiếu Điều chỉnh, Nhập Xuất Tồn, Thẻ kho, Kiểm kê, Bàn giao kho,
   kho NVL có thêm Kế hoạch mua hàng (KH Ngày/Tuần/Tháng).
   Web chứa 2 kho: TP (Thành phẩm - Hàng hóa) và NVL (Nguyên vật liệu), dữ liệu tách riêng từng kho. */

const S = { meta: null, dirty: false, skipDirty: false, user: '', wh: 'TP', account: null, staffToken: '', notices: [], popped: new Set() };
// Bản online (trang claude.ai, online/backend.js) không có máy chủ: không in trực tiếp, không mở link tải, không dùng #url.
const ONLINE = !!window.ANTAM_ONLINE;
// Trang xem công khai: chỉ xem số liệu chụp sẵn (online/build.py --view)
const VIEW = !!window.ANTAM_VIEW;
// Web Giao hàng An Tâm (online/build.py --giao): trang riêng cho người giao + quản lý phân tuyến, dữ liệu riêng, không có phần kho
const GIAO_APP = !!window.ANTAM_GIAO_APP;
// Bản online của web kho: link trang Giao hàng An Tâm – phân tuyến làm ở web kho rồi "Gửi sang" trang đó cho người giao
const GIAO_URL = window.ANTAM_GIAO_URL || '';
const GIAO_LINKED = ONLINE && !VIEW && !GIAO_APP && !!GIAO_URL;
const WH_LABEL = { TP: 'Kho thành phẩm - hàng hóa', NVL: 'Kho nguyên vật liệu' };
const TYPE_LABEL = { N: 'Nhập', X: 'Xuất', D: 'Điều chỉnh' };
const TYPE_PREFIX = { N: 'PNK', X: 'PXK', D: 'DCK' };
// PHÂN QUYỀN tài khoản nhân viên kho (giống online/backend.js): mỗi tài khoản 1 danh sách quyền; chưa phân quyền thì theo vai trò cũ
const KHO_PERMS = [
  ['Kho được làm việc', [['khoTP', 'Kho thành phẩm – hàng hóa'], ['khoNVL', 'Kho nguyên vật liệu']]],
  ['Phiếu nhập – xuất', [['pN', 'Lập / sửa phiếu nhập'], ['pX', 'Lập / sửa phiếu xuất'], ['pD', 'Lập / sửa phiếu điều chỉnh'], ['xoa', 'Xóa phiếu'], ['duyet', 'Duyệt phiếu điều chỉnh']]],
  ['Xem & báo cáo', [['phieu', 'Danh sách phiếu, sổ nhập – xuất'], ['baocao', 'Nhập – Xuất – Tồn, thẻ kho']]],
  ['Biên bản & kế hoạch', [['kiemke', 'Kiểm kê kho'], ['bangiao', 'Bàn giao kho'], ['kehoach', 'Kế hoạch mua (kho NVL)'], ['sanxuat', 'Lệnh sản xuất & định mức NVL']]],
  ['Giao hàng', [['phantuyen', 'Phân tuyến giao hàng'], ['taixe', 'Tài khoản giao hàng']]],
  ['Danh mục & hệ thống', [['hang', 'Mặt hàng'], ['tuyen', 'Tuyến / nơi nhận'], ['caidat', 'Cài đặt & dữ liệu'], ['lichsu', 'Lịch sử thao tác'], ['taikhoan', 'Quản lý tài khoản & phân quyền']]],
];
const KHO_PERM_KEYS = KHO_PERMS.flatMap(([, l]) => l.map(x => x[0]));
const KHO_PERM_LAB = Object.fromEntries(KHO_PERMS.flatMap(([, l]) => l));
const KHO_ROLES = [['ql', 'Quản lý', KHO_PERM_KEYS], ['nv', 'Nhân viên kho', KHO_PERM_KEYS.filter(k => k !== 'duyet' && k !== 'taikhoan')],
  ['tk', 'Thủ kho', ['khoTP', 'khoNVL', 'pN', 'pX', 'pD', 'xoa', 'phieu', 'baocao', 'kiemke', 'bangiao', 'kehoach', 'sanxuat', 'hang']], ['xem', 'Chỉ xem', ['khoTP', 'khoNVL', 'phieu', 'baocao']]];
const permsOf = a => new Set(Array.isArray(a && a.perm) ? a.perm : a && a.admin ? KHO_PERM_KEYS : KHO_ROLES[1][2]);
const can = k => !S.account || permsOf(S.account).has(k);
const roleOfPerms = set => { const r = KHO_ROLES.find(([, , l]) => l.length === set.size && l.every(k => set.has(k))); return r ? r[1] : 'Tùy chỉnh'; };
// mục trên menu → quyền cần có (một trong các quyền)
const ROUTE_PERM = { 'phieu/moi': ['pN', 'pX', 'pD'], phieu: ['phieu', 'pN', 'pX', 'pD'], 'so-nx': ['phieu'], 'phan-tuyen': ['phantuyen'], 'kh-ngay': ['kehoach'], 'kh-tuan': ['kehoach'],
  'kh-thang': ['kehoach'], nxt: ['baocao'], 'the-kho': ['baocao'], 'kiem-ke': ['kiemke'], 'ban-giao': ['bangiao'], hang: ['hang'], tuyen: ['tuyen'], 'giao-hang-tk': ['taixe'],
  'cai-dat': ['caidat'], 'lich-su': ['lichsu'], lsx: ['sanxuat'], 'dinh-muc': ['sanxuat'] };
const routeOk = path => { const key = /^phieu\/moi/.test(path) ? 'phieu/moi' : path.split('/')[0]; const need = ROUTE_PERM[key]; return !need || need.some(can); };
function applyPerms() {
  $$('#nav a[data-route]').forEach(a => { a.hidden = !routeOk(a.dataset.route); });
  $$('#wh-switch button').forEach(b => { b.hidden = !can('kho' + b.dataset.wh); });
}
const HANDOVER_REASONS = ['Bàn giao ca', 'Bàn giao thủ kho (nghỉ phép/nghỉ việc)', 'Bàn giao cuối ngày', 'Chuyển kho', 'Khác'];
const ITEM_STATUS = ['Tốt', 'Hư hỏng', 'Móp/rách bao bì', 'Cận hạn sử dụng', 'Hết hạn'];

/* ============================================================ tiện ích */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
}
function noAccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function matches(query, hay) {
  const h = noAccent(hay);
  return noAccent(query).split(/\s+/).filter(Boolean).every(t => h.includes(t));
}
function fmt(n, dec = 3) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: dec });
}
const money = n => fmt(Math.round(Number(n) || 0), 0);
const fmtBlank0 = n => (Number(n) ? fmt(n) : '');
function parseNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}
function isoDate(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
function vnDate(iso) { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function longDate(iso) {
  if (!iso) return 'Ngày ..... tháng ..... năm .....';
  const [y, m, d] = iso.split('-');
  return `Ngày ${d} tháng ${m} năm ${y}`;
}
function firstOfMonth() { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); }
function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function api(method, path, body) {
  if (ONLINE) {
    Backend.who = S.user || '';
    try { return await Backend.handle(method, path, body, { token: S.staffToken }); } catch (e) { throw new Error(e.message || String(e)); }
  }
  const opt = { method, headers: { 'X-User': encodeURIComponent(S.user || ''), 'X-Wh': S.wh, 'X-Staff-Token': S.staffToken || '' } };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer) { opt.body = body; opt.headers['Content-Type'] = 'application/octet-stream'; }
    else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const res = await fetch('/api' + path, opt);
  let data = null;
  try { data = await res.json(); } catch (e) { /* trống */ }
  if (res.status === 401 && S.account && !path.startsWith('/staff')) { showStaffLogin('Phiên đăng nhập đã hết hạn – hãy đăng nhập lại.'); }
  if (!res.ok) throw new Error((data && data.error) || ('Lỗi ' + res.status));
  return data;
}
// Link tải file của bản chạy máy (không gửi được tiêu đề đăng nhập) kèm mã đăng nhập
const withToken = url => (S.staffToken ? url + (url.includes('?') ? '&' : '?') + 'st=' + encodeURIComponent(S.staffToken) : url);
function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3000);
}
async function guard(fn) {
  try { return await fn(); } catch (e) {
    if (ONLINE && e && /chỉ có quyền xem/.test(e.message)) showReadOnlyBanner();
    toast(e.message, true); return undefined;
  }
}
function setTitle(t) { $('#page-title').textContent = t; document.title = t + ' – Kho An Tâm'; }
function markDirty() { S.dirty = true; }

function datalist(id, items) {
  return `<datalist id="${id}">${items.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}
function options(items, selected, blank) {
  return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
    items.map(x => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('');
}
function productByCode(code) { return S.meta.products.find(p => p.code === code); }
function activeProducts() { return S.meta.products.filter(p => p.active); }

/* Đọc số tiền bằng chữ */
const CS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10, s = [];
  if (full || tr > 0) s.push(CS[tr] + ' trăm');
  if (ch > 1) {
    s.push(CS[ch] + ' mươi');
    if (dv === 1) s.push('mốt'); else if (dv === 5) s.push('lăm'); else if (dv > 0) s.push(CS[dv]);
  } else if (ch === 1) {
    s.push('mười');
    if (dv === 5) s.push('lăm'); else if (dv > 0) s.push(CS[dv]);
  } else if (dv > 0) {
    if (full || tr > 0) s.push('lẻ');
    s.push(CS[dv]);
  }
  return s.join(' ');
}
function docSo(num) {
  let n = Math.round(Math.abs(Number(num) || 0));
  if (n === 0) return 'Không đồng';
  const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(read3(groups[i], i < groups.length - 1) + units[i]);
  }
  const s = parts.join(' ') + ' đồng';
  return (num < 0 ? 'Âm ' : '') + s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================================================ modal */
function openModal({ title, body, saveText = 'Lưu', onSave, wide, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" ${wide ? 'style="width:min(960px,100%)"' : ''}><h3>${esc(title)}</h3><div class="m-body">${body}</div>
    <div class="actions"><button class="btn" data-x>Đóng</button>${onSave ? `<button class="btn primary" data-save>${esc(saveText)}</button>` : ''}</div></div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); if (onClose) onClose(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  $('[data-x]', back).onclick = close;
  if (onSave) $('[data-save]', back).onclick = async () => { if (await guard(() => onSave(back))) close(); };
  const first = $('input, select, textarea', back);
  if (first) first.focus();
  return { root: back, close };
}

// Hộp xác nhận ngay trong trang (trang online không cho dùng confirm() của trình duyệt)
function ask(message, okText = 'Đồng ý') {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" style="width:min(480px,100%)" role="dialog" aria-modal="true"><p style="margin:0 0 4px;font-size:15px">${esc(message)}</p>
      <div class="actions"><button class="btn" data-no>Hủy</button><button class="btn primary" data-yes>${esc(okText)}</button></div></div>`;
    document.body.appendChild(back);
    const done = v => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', onKey, true);
    $('[data-no]', back).onclick = () => done(false);
    $('[data-yes]', back).onclick = () => done(true);
    back.addEventListener('click', e => { if (e.target === back) done(false); });
    $('[data-yes]', back).focus();
  });
}

/* ============================================================ combobox mặt hàng */
function productCombo(code, onPick, { placeholder = 'Gõ mã hoặc tên hàng (không dấu cũng được)…', includeInactive = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  const input = document.createElement('input');
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  const label = c => { const p = productByCode(c); return p ? `${p.code} | ${p.name}` : (c || ''); };
  input.value = label(code);
  wrap.appendChild(input);
  let list = null, items = [], idx = 0, current = code || '';
  const pool = () => (includeInactive ? S.meta.products : activeProducts());
  function close() { if (list) { list.remove(); list = null; } }
  function open() {
    const q = input.value.includes(' | ') && input.value === label(current) ? '' : input.value;
    items = pool().filter(p => !q || matches(q, p.code + ' ' + p.name)).slice(0, 60);
    idx = 0;
    if (!list) { list = document.createElement('div'); list.className = 'combo-list'; wrap.appendChild(list); }
    list.innerHTML = items.length
      ? items.map((p, i) => `<div class="combo-item${i === idx ? ' on' : ''}" data-i="${i}"><span class="c-code">${esc(p.code)}</span><span>${esc(p.name)}</span><span class="c-unit">${esc(p.unit)}</span></div>`).join('')
      : '<div class="combo-empty">Không tìm thấy – thêm mã mới ở Danh mục › Mặt hàng</div>';
    $$('.combo-item', list).forEach(el => el.addEventListener('mousedown', e => { e.preventDefault(); pick(items[+el.dataset.i]); }));
  }
  function highlight() {
    if (!list) return;
    $$('.combo-item', list).forEach((el, i) => el.classList.toggle('on', i === idx));
    const on = $('.combo-item.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function pick(p) {
    close();
    current = p ? p.code : '';
    input.value = label(current);
    onPick(p || null);
  }
  input.addEventListener('focus', () => { input.select(); open(); });
  input.addEventListener('input', open);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!list) open(); idx = Math.min(idx + 1, items.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); highlight(); }
    else if (e.key === 'Enter') { if (list && items[idx]) { e.preventDefault(); pick(items[idx]); } }
    else if (e.key === 'Escape') { close(); input.value = label(current); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!list) return;
      const exact = pool().find(p => p.code.toLowerCase() === input.value.trim().toLowerCase());
      if (exact) pick(exact); else { close(); input.value = label(current); }
    }, 120);
  });
  wrap.focusInput = () => input.focus();
  return wrap;
}

/* ============================================================ in ấn */
function pageCss(orientation) {
  return `@page { size: ${(S.meta.settings.paper || 'A4')} ${orientation}; margin: 10mm 12mm; }`;
}
function allCss() {
  let css = '';
  for (const sh of Array.from(document.styleSheets)) {
    try { css += Array.from(sh.cssRules).map(r => r.cssText).join('\n') + '\n'; } catch (e) { /* bỏ qua */ }
  }
  return css;
}
// File HTML độc lập: mở bằng trình duyệt là hiện hộp thoại In (dùng cho bản online)
function printableFile(html, orientation, title) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${allCss()}
${pageCss(orientation)}
html, body { background: #fff; } body { margin: 0; padding: 12mm; } #print-root { display: block; }
@media print { body { padding: 0; } }</style></head><body><div id="print-root">${html}</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });<\/script></body></html>`;
}
function setPrintContent(html, orientation) {
  $('#page-style').textContent = html ? pageCss(orientation) : '';
  $('#print-root').innerHTML = html || '';
  document.body.classList.toggle('has-print', !!html);
}
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
function printHtml(html, orientation = 'portrait', filename = 'ban-in-kho') {
  if (!ONLINE) {
    setPrintContent(html, orientation);
    setTimeout(() => window.print(), 60);
    return;
  }
  // Trang trên claude.ai không được tự mở hộp thoại In: chuẩn bị sẵn bản in, người dùng bấm Ctrl+P / ⌘+P
  setPrintContent(html, orientation);
  const safe = String(filename).replace(/[^\w.\- ]+/g, '-').replace(/-+/g, '-') || 'ban-in-kho';
  const m = openModal({
    title: 'Xem trước bản in', wide: true, saveText: '⬇ Tải file để in',
    onClose: () => setPrintContent(''),
    body: `<div class="callout" style="margin:0 0 12px">Để in ngay: bấm <kbd>${IS_MAC ? '⌘' : 'Ctrl'}</kbd> + <kbd>P</kbd> trên bàn phím
      (điện thoại: menu trình duyệt → In / Chia sẻ → In). Hộp thoại In chỉ in phiếu bên dưới.
      <span class="small muted">Nếu máy không in được theo cách này, bấm <b>Tải file để in</b>.</span></div>
      <div class="print-preview ${orientation}">${html}</div>`,
    onSave: async () => {
      const dl = await claude.use('downloads');
      if (!dl) throw new Error('Trang này chưa được phép tải file xuống. Hãy mở trang trên claude.ai.');
      try { await dl.save({ filename: safe + '.html', data: printableFile(html, orientation, safe) }); }
      catch (e) { if (e && e.code === 'declined') return false; throw new Error('Không tải được file: ' + (e && e.message ? e.message : e)); }
      toast('Đã tải file ' + safe + '.html – mở file để in');
      return true;
    },
  });
  return m;
}
async function saveTextFile(filename, data) {
  if (!ONLINE) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain;charset=utf-8' }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return;
  }
  const dl = ONLINE ? await claude.use('downloads') : null;
  if (!dl) throw new Error('Không tải file được trong trang này.');
  try { await dl.save({ filename, data }); toast('Đã tải ' + filename); }
  catch (e) { if (!(e && e.code === 'declined')) throw new Error('Không tải được file: ' + (e && e.message ? e.message : e)); }
}
window.addEventListener('afterprint', () => { if (!ONLINE) setPrintContent(''); });

function docHead(rightTop, rightSub) {
  const s = S.meta.settings;
  return `<div class="d-head"><div>Đơn vị: <b>${esc(s.company)}</b><br>Bộ phận: ${esc(S.meta.warehouse.department)}</div>
    <div class="r"><b>${esc(rightTop)}</b><br><i>${esc(rightSub)}</i></div></div>`;
}
function signBlock(people) {
  return `<div class="sign">${people.map(([role, name]) => `<div><div class="role">${esc(role)}</div><p class="hint">(Ký, ghi rõ họ tên)</p><div class="name">${esc(name || '')}</div></div>`).join('')}</div>`;
}
const dots = '..........................................................';

function voucherDoc(v) {
  const lines = v.lines || [];
  if (v.type === 'D') {
    let up = 0, down = 0, val = 0;
    const body = lines.map((l, i) => {
      const q = Number(l.qty) || 0;
      const book = Number(l.book_qty) || 0;
      up += q > 0 ? q : 0; down += q < 0 ? -q : 0; val += q * (l.price || 0);
      return `<tr><td class="c">${i + 1}</td><td>${esc(l.product_code)}</td><td>${esc(l.name || '')}</td><td class="c">${esc(l.unit || '')}</td>
        <td class="n">${fmt(book)}</td><td class="n">${fmt(book + q)}</td><td class="n">${q > 0 ? fmt(q) : ''}</td><td class="n">${q < 0 ? fmt(-q) : ''}</td>
        <td class="n">${l.price ? money(q * l.price) : ''}</td><td>${esc(l.note || '')}</td></tr>`;
    }).join('');
    return `<div class="doc">${docHead('Phiếu nội bộ', '(Căn cứ biên bản kiểm kê)')}
      <div class="d-title">Phiếu điều chỉnh kho</div><div class="d-sub">${longDate(v.date)}</div><div class="d-no">Số: <b>${esc(v.no)}</b></div>
      ${v.status ? `<div class="d-sub"><b>${v.status === 'pending' ? 'CHỜ DUYỆT – chưa ghi sổ' : 'BỊ TỪ CHỐI – không ghi sổ'}</b></div>` : ''}
      <div class="d-info"><div>Kho điều chỉnh: <b>${esc(v.from_party)}</b></div><div>Căn cứ / Lý do: ${esc(v.reason)}</div>
      <div>Người thực hiện: ${esc(v.giver)}${v.created_by ? ` &nbsp; · &nbsp; Người lập phiếu: ${esc(v.created_by)}` : ''}${v.approved_by && !v.status ? ` &nbsp; · &nbsp; Quản lý duyệt: <b>${esc(v.approved_by)}</b> (${esc(vnDate(String(v.approved_at || '').slice(0, 10)))})` : ''}</div></div>
      <table class="t"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng hóa, vật tư</th><th>ĐVT</th><th>Tồn sổ sách</th><th>Tồn thực tế</th>
      <th>Điều chỉnh tăng (+)</th><th>Điều chỉnh giảm (−)</th><th>Giá trị điều chỉnh (đ)</th><th>Nguyên nhân / Ghi chú</th></tr></thead>
      <tbody>${body}<tr class="sum"><td colspan="6" class="c">CỘNG</td><td class="n">${fmt(up)}</td><td class="n">${fmt(down)}</td><td class="n">${money(val)}</td><td></td></tr></tbody></table>
      <div class="d-foot">Kèm theo: ${esc(v.doc_ref || 'Biên bản kiểm kê ngày ' + vnDate(v.date))} &nbsp; Số chứng từ kèm theo: ..........</div>
      ${signBlock((S.meta.warehouse.adj_signers || ['Người lập phiếu', 'Thủ kho', 'Kế toán']).map((r, i) => [r, i === 0 ? v.giver : r === 'Thủ kho' ? v.receiver : '']))}</div>`;
  }
  let tq = 0, tm = 0;
  const body = lines.map((l, i) => {
    const amt = (Number(l.qty) || 0) * (Number(l.price) || 0);
    tq += Number(l.qty) || 0; tm += amt;
    return `<tr><td class="c">${i + 1}</td><td>${esc(l.product_code)}</td><td>${esc(l.name || '')}</td><td class="c">${esc(l.unit || '')}</td>
      <td class="n">${fmt(l.qty)}</td><td class="n">${l.price ? money(l.price) : ''}</td><td class="n">${amt ? money(amt) : ''}</td><td>${esc(l.note || '')}</td></tr>`;
  }).join('');
  const isOut = v.type === 'X';
  return `<div class="doc">${docHead(isOut ? 'Mẫu số 02 - VT' : 'Mẫu số 01 - VT', '(Phiếu nội bộ)')}
    <div class="d-title">${isOut ? 'Phiếu xuất kho nội bộ' : 'Phiếu nhập kho nội bộ'}</div>
    <div class="d-sub">${longDate(v.date)}</div><div class="d-no">Số: <b>${esc(v.no)}</b></div>
    <div class="d-info">
      <div>Bên giao (kho/bộ phận): <b>${esc(v.from_party)}</b></div>
      <div>Bên nhận (kho/bộ phận): <b>${esc(v.to_party)}</b></div>
      <div>Người giao: ${esc(v.giver)}</div>
      <div>Người nhận: ${esc(v.receiver)}</div>
      ${isOut && v.route ? `<div>Tuyến giao hàng: ${esc(v.route)}</div>` : ''}
      <div>Lý do / Diễn giải: ${esc(v.reason)}</div>
      ${isOut ? `<div>Số lượng bill/ phiếu xuất: ${v.bill_count ? esc(v.bill_count) : '…….'} bill</div>` : ''}
    </div>
    <table class="t"><thead><tr><th style="width:34px">STT</th><th>Mã hàng</th><th>Tên hàng hóa, vật tư</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá (đ)</th><th>Thành tiền (đ)</th><th>Ghi chú</th></tr></thead>
    <tbody>${body}<tr class="sum"><td colspan="4" class="c">CỘNG</td><td class="n">${fmt(tq)}</td><td></td><td class="n">${tm ? money(tm) : ''}</td><td></td></tr></tbody></table>
    <div class="d-foot"><div>Tổng số tiền (viết bằng chữ): ${tm ? '<i>' + esc(docSo(tm)) + '</i>' : dots}</div>
    <div>Số chứng từ gốc kèm theo: ${v.doc_ref ? esc(v.doc_ref) : dots}</div></div>
    ${signBlock([['Người giao hàng', v.giver], ['Người nhận hàng', v.receiver]])}</div>`;
}
async function printVouchers(query) {
  const list = await guard(() => api('GET', '/vouchers/full?' + query));
  if (!list) return;
  if (!list.length) return toast('Không có phiếu nào để in', true);
  printHtml(list.map(voucherDoc).join(''), 'portrait', list.length === 1 ? list[0].no : 'phieu-' + list.length + '-to');
}

/* ============================================================ router */
const ROUTES = [
  [/^$/, (main, m, q) => (GIAO_APP ? viewGiaoImport(main) : viewDashboard(main, m, q))],
  [/^nhan$/, viewGiaoImport],
  [/^phieu\/moi$/, viewVoucherForm],
  [/^phieu\/([\w-]+)$/, viewVoucherForm],
  [/^phieu$/, viewVoucherList],
  [/^so-nx$/, viewLedger],
  [/^nxt$/, viewNXT],
  [/^the-kho$/, viewStockCard],
  [/^kiem-ke$/, () => viewDocList('stocktake')],
  [/^kiem-ke\/(moi|[\w-]+)$/, viewStocktake],
  [/^ban-giao$/, () => viewDocList('handover')],
  [/^ban-giao\/(moi|[\w-]+)$/, viewHandover],
  [/^kh-ngay$/, viewPlanDaily],
  [/^kh-tuan$/, viewPlanWeekly],
  [/^kh-thang$/, viewPlanMonthly],
  [/^lsx$/, viewLsxList],
  [/^lsx\/(moi|[\w-]+)$/, viewLsx],
  [/^dinh-muc$/, viewBom],
  [/^hang$/, viewProducts],
  [/^tuyen$/, viewRoutes],
  [/^phan-tuyen$/, viewRoutingList],
  [/^phan-tuyen\/(moi|[\w-]+)$/, viewRouting],
  [/^giao-hang-tk$/, viewDrivers],
  [/^cai-dat$/, viewSettings],
  [/^lich-su$/, viewLog],
  [/^tai-khoan$/, viewStaff],
];
// Điều hướng: bản chạy máy chủ dùng #/đường-dẫn trên thanh địa chỉ; bản online giữ đường dẫn trong trang.
let currentHash = ONLINE ? '#/' : location.hash;
const getHash = () => (ONLINE ? currentHash : location.hash);
function setHashSilently(h) {
  if (ONLINE) currentHash = h;
  else { history.replaceState(null, '', h); currentHash = location.hash; }
}
function parseHash() {
  const h = getHash().replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { path: path.replace(/\/$/, ''), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
async function render() {
  const { path, q } = parseHash();
  document.body.classList.remove('nav-open');
  applyPerms();
  if (S.account && !can('kho' + S.wh)) { const other = S.wh === 'TP' ? 'NVL' : 'TP'; if (can('kho' + other)) return switchWh(other); }
  $$('#nav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === '' ? path === '' : (path === r || (path.startsWith(r + '/') && r !== 'phieu') || (r === 'phieu' && /^phieu\/(?!moi$)[\w-]+$/.test(path))));
  });
  const main = $('#main');
  if (!routeOk(path)) { main.innerHTML = '<div class="callout warn">Tài khoản của bạn chưa được cấp quyền vào mục này – nhờ Quản lý phân quyền ở mục <b>Tài khoản nhân viên</b>.</div>'; return; }
  main.innerHTML = '<p class="muted">Đang tải…</p>';
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      try { await fn(main, m, q); } catch (e) { main.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
      return;
    }
  }
  main.innerHTML = '<p>Không có trang này.</p>';
}
if (ONLINE) {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.button !== 0) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
} else {
  window.addEventListener('hashchange', async () => {
    if (S.skipDirty) { S.skipDirty = false; return; }
    if (S.dirty) {
      const target = location.hash;
      S.skipDirty = true; location.hash = currentHash;
      if (!(await ask('Có thay đổi chưa lưu. Vẫn rời trang này?'))) return;
      S.dirty = false; location.hash = target; return;
    }
    currentHash = location.hash; render();
  });
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
}
async function go(hash, opts = {}) {
  if (!ONLINE) { if (opts.force) S.dirty = false; if (location.hash === hash) render(); else location.hash = hash; return; }
  if (S.dirty && !opts.force && !(await ask('Có thay đổi chưa lưu. Vẫn rời trang này?'))) return;
  S.dirty = false; currentHash = hash;
  window.scrollTo(0, 0);
  render();
}

async function loadMeta() {
  S.meta = await api('GET', '/meta');
  document.body.dataset.wh = S.wh;
  $$('#wh-switch button').forEach(b => b.classList.toggle('on', b.dataset.wh === S.wh));
  $('#wh-badge').textContent = S.meta.warehouse.name;
}
async function switchWh(wh, keepPage) {
  if (wh === S.wh) return;
  if (S.dirty && !(await ask('Có thay đổi chưa lưu. Vẫn chuyển kho?'))) return;
  S.dirty = false;
  S.wh = wh; store('wh', wh);
  if (ONLINE) { $('#main').innerHTML = '<p class="muted">Đang tải dữ liệu kho…</p>'; await Backend.setWh(wh); }
  await loadMeta();
  toast('Đang làm việc: ' + S.meta.warehouse.name);
  if (keepPage) return;
  const { path } = parseHash();
  const only = { 'tuyen': 'TP', 'phan-tuyen': 'TP', 'giao-hang-tk': 'TP', 'kh-ngay': 'NVL', 'kh-tuan': 'NVL', 'kh-thang': 'NVL', 'lsx': 'NVL', 'dinh-muc': 'NVL' }[path.split('/')[0]];
  if (/\/(?!moi$)[\w-]+$/.test(path) || (only && only !== wh)) go('#/', { force: true }); else render();
}

/* ============================================================ Tổng quan */
async function viewDashboard(main) {
  setTitle('Tổng quan – ' + S.meta.warehouse.name);
  const t = isoDate();
  const [today, nxt, recent] = await Promise.all([
    api('GET', `/vouchers?from=${t}&to=${t}`), api('GET', `/report/nxt?from=${t}&to=${t}`), api('GET', '/vouchers?limit=12')]);
  const cnt = { N: 0, X: 0, D: 0 };
  today.forEach(v => cnt[v.type]++);
  const neg = nxt.filter(r => r.warn === 'Tồn âm');
  const low = nxt.filter(r => r.warn === 'Dưới tồn tối thiểu');
  const value = nxt.reduce((a, r) => a + (r.value || 0), 0);
  const empty = !S.meta.products.length;
  const pend = S.account ? (await guard(() => api('GET', '/pending'))) || {} : {};
  main.innerHTML = `
    ${pend.count ? `<div class="callout warn">⏳ <b>${pend.count} phiếu điều chỉnh ${can('duyet') ? 'chờ bạn duyệt' : 'đang chờ Quản lý duyệt'}</b> – chưa tính vào tồn kho.
      <a class="btn sm ${can('duyet') ? 'primary' : ''}" href="#/phieu?status=pending">${can('duyet') ? 'Xem và duyệt' : 'Xem'}</a></div>` : ''}
    ${pend.rejected ? `<div class="callout warn">✖ <b>${pend.rejected} phiếu điều chỉnh bị từ chối</b> – người lập sửa lại rồi Lưu để gửi duyệt lại, hoặc xóa phiếu.
      <a class="btn sm" href="#/phieu?status=rejected">Xem</a></div>` : ''}
    ${empty ? `<div class="callout"><b>Bắt đầu với ${esc(S.meta.warehouse.name)}:</b> chưa có danh mục hàng. Vào <a href="#/cai-dat">Cài đặt &amp; dữ liệu</a> để
      <b>nhập dữ liệu từ file Excel</b> của kho này (Danh mục hàng, Sổ Nhập Xuất${S.wh === 'NVL' ? ', KH Ngày' : ', Danh mục tuyến'}), hoặc thêm tay ở <a href="#/hang">Danh mục › Mặt hàng</a>.</div>` : ''}
    <div class="quick">
      <a class="btn primary" href="#/phieu/moi?type=N">+ Phiếu nhập kho</a>
      <a class="btn primary" href="#/phieu/moi?type=X">+ Phiếu xuất kho</a>
      <a class="btn" href="#/phieu/moi?type=D">+ Phiếu điều chỉnh</a>
      <button class="btn" id="print-today">🖨 In tất cả phiếu hôm nay</button>
      <a class="btn" href="#/kiem-ke/moi">Kiểm kê</a>
      <a class="btn" href="#/ban-giao/moi">Bàn giao kho</a>
      ${S.wh === 'NVL' ? '<a class="btn primary" href="#/lsx/moi">+ Lệnh sản xuất (tự xuất NVL)</a><a class="btn" href="#/kh-ngay">Kế hoạch mua hàng</a>' : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><div class="k-label">Phiếu nhập hôm nay</div><div class="k-val">${cnt.N}</div></div>
      <div class="kpi"><div class="k-label">Phiếu xuất hôm nay</div><div class="k-val">${cnt.X}</div></div>
      <div class="kpi"><div class="k-label">Phiếu điều chỉnh hôm nay</div><div class="k-val">${cnt.D}</div></div>
      <div class="kpi ${neg.length ? 'bad' : ''}"><div class="k-label">Mã tồn âm</div><div class="k-val">${neg.length}</div></div>
      <div class="kpi ${low.length ? 'warn' : ''}"><div class="k-label">Mã dưới tồn tối thiểu</div><div class="k-val">${low.length}</div></div>
      <div class="kpi"><div class="k-label">Giá trị tồn kho (đ)</div><div class="k-val">${money(value)}</div></div>
    </div>
    <div class="grid c2">
      <div class="card"><h3>Cần chú ý</h3>${neg.length + low.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Tên hàng</th><th class="num">Tồn</th><th>Cảnh báo</th></tr></thead><tbody>
        ${neg.concat(low).slice(0, 15).map(r => `<tr class="clickable" data-code="${esc(r.code)}"><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="num ${r.close < 0 ? 'neg' : ''}">${fmt(r.close)}</td>
        <td><span class="badge ${r.warn === 'Tồn âm' ? 'bad' : 'warn'}">${esc(r.warn)}</span></td></tr>`).join('')}</tbody></table></div>
        <p class="hint">Tồn âm = thiếu phiếu nhập hoặc xuất không phiếu. Bấm dòng để xem thẻ kho.</p>` : '<p class="muted">Không có cảnh báo tồn kho.</p>'}</div>
      <div class="card"><h3>Phiếu gần đây</h3>${recent.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th class="num">SL</th></tr></thead><tbody>
        ${recent.map(v => `<tr class="clickable" data-id="${v.id}"><td>${vnDate(v.date)}</td><td>${esc(v.no)}</td><td><span class="badge ${v.type}">${TYPE_LABEL[v.type]}</span></td><td class="num">${fmt(v.total_qty)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Chưa có phiếu.</p>'}</div>
    </div>`;
  $('#print-today').onclick = () => printVouchers('date=' + t);
  $$('tr[data-code]', main).forEach(tr => tr.onclick = () => go(`#/the-kho?code=${encodeURIComponent(tr.dataset.code)}`));
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go('#/phieu/' + tr.dataset.id));
}

/* ============================================================ Lập / sửa phiếu */
function newVoucher(type) {
  const base = { id: null, wh: S.wh, type, date: isoDate(), no: '', route: '', from_party: '', to_party: '', giver: '', receiver: '',
    reason: '', bill_count: '', doc_ref: '', note: '', lines: [] };
  const last = store('lastVoucher_' + S.wh + '_' + type) || {};
  Object.assign(base, (S.meta.warehouse.defaults || {})[type] || {});
  base.giver = last.giver || ''; base.receiver = last.receiver || '';
  return base;
}

async function viewVoucherForm(main, m, q) {
  const editing = m[1] ? m[1] : null;
  let v;
  if (editing) {
    v = await api('GET', '/vouchers/' + editing);
    if (v.wh !== S.wh) await switchWh(v.wh, true);
    const seen = S.notices.filter(n => !n.read && n.link === '#/phieu/' + editing).map(n => n.id); // đã mở phiếu = đã xem thông báo
    if (seen.length) { readNotices(seen); $$('#toasts .toast.notice').forEach(el => { if (seen.includes(el.dataset.id)) el.remove(); }); }
  } else {
    v = newVoucher(TYPE_PREFIX[q.type] ? q.type : 'N');
    if (q.draft) {
      const d = store('voucherDraft');
      if (d && (!d.wh || d.wh === S.wh)) Object.assign(v, d);
      localStorage.removeItem('voucherDraft');
    }
  }
  v.lines = (v.lines || []).map(l => ({ product_code: l.product_code, qty: l.qty, price: l.price, note: l.note || '' }));
  if (!v.lines.length) v.lines.push({ product_code: '', qty: null, price: null, note: '' });
  let autoNo = !editing;
  let routeAutoReason = !editing;
  let stock = {};
  const useRoutes = !!S.meta.warehouse.routes;
  const routes = useRoutes ? S.meta.routes : [];

  function labels() {
    return v.type === 'D'
      ? { from: 'Kho điều chỉnh', to: 'Bên liên quan', giver: 'Người thực hiện / lập phiếu', receiver: 'Thủ kho' }
      : { from: 'Bên giao (kho/bộ phận)', to: 'Bên nhận (kho/bộ phận)', giver: 'Người giao', receiver: 'Người nhận' };
  }
  // Duyệt phiếu điều chỉnh: chỉ khi web kho dùng tài khoản nhân viên
  const isAdmin = !!(S.account && can('duyet')); // người có quyền duyệt phiếu điều chỉnh
  const locked = () => !!(editing && S.account && !isAdmin && v.type === 'D' && v.saved_type === 'D' && !v.status);
  v.saved_type = v.type;
  function approvalBox() {
    if (!S.account || v.type !== 'D') return '';
    const by = (name, at) => `${esc(name || '—')}${at ? ' lúc ' + esc(at) : ''}`;
    if (!editing || v.saved_type !== 'D') return isAdmin ? '' : '<div class="callout">Phiếu điều chỉnh nhân viên lập sẽ <b>chờ Quản lý duyệt</b> – chỉ tính vào tồn kho sau khi được duyệt.</div>';
    if (v.status === 'pending') return `<div class="callout warn">⏳ <b>Chờ Quản lý duyệt</b> – chưa tính vào tồn kho. Người lập: ${by(v.created_by)}.
      ${isAdmin ? '<div style="margin-top:8px"><button class="btn primary" id="btn-approve">✔ Duyệt phiếu</button> <button class="btn danger" id="btn-reject">✖ Từ chối</button></div>' : ''}</div>`;
    if (v.status === 'rejected') return `<div class="callout warn">✖ <b>Bị từ chối</b> bởi ${by(v.approved_by, v.approved_at)}: <b>${esc(v.review_note)}</b>
      <br>${isAdmin ? '<button class="btn primary sm" id="btn-approve" style="margin-top:6px">✔ Duyệt phiếu</button>' : 'Sửa lại rồi bấm Lưu để gửi Quản lý duyệt lại (hoặc xóa phiếu).'}</div>`;
    return `<div class="callout">✔ ${v.approved_by ? `Đã duyệt bởi <b>${by(v.approved_by, v.approved_at)}</b>` : 'Đã ghi sổ'}${v.created_by ? ` · Người lập: ${esc(v.created_by)}` : ''}${locked() ? ' – chỉ Quản lý sửa / xóa được.' : ''}</div>`;
  }
  async function review(ok) {
    if (S.dirty) return toast('Phiếu đang sửa dở – hãy Lưu trước khi duyệt', true);
    let note = '';
    if (!ok) {
      note = await new Promise(resolve => {
        openModal({ title: 'Từ chối phiếu ' + v.no, saveText: 'Từ chối',
          body: '<label class="field">Lý do (người lập phiếu sẽ thấy để sửa lại)<input id="rv-note" maxlength="300"></label>',
          onSave: root => { const t = $('#rv-note', root).value.trim(); if (!t) throw new Error('Hãy ghi lý do từ chối'); resolve(t); return true; },
          onClose: () => resolve(null) });
      });
      if (!note) return;
    }
    const res = await guard(() => api('POST', '/review/' + editing, { ok, note }));
    if (!res) return;
    toast(ok ? `Đã duyệt phiếu ${v.no} – đã tính vào tồn kho` : `Đã từ chối phiếu ${v.no}`);
    Object.assign(v, { status: res.status, approved_by: res.approved_by, approved_at: res.approved_at, review_note: res.review_note });
    draw(); refreshStock();
  }
  function draw() {
    setTitle(editing ? `${VIEW ? 'Phiếu' : 'Sửa phiếu'} ${v.no}` : `Lập phiếu ${TYPE_LABEL[v.type].toLowerCase()} kho`);
    const L = labels();
    if (!editing && !can('p' + v.type)) { const t = ['N', 'X', 'D'].find(x => can('p' + x)); if (t) v.type = t; }
    const canSave = can('p' + v.type);
    main.innerHTML = `${approvalBox()}${canSave ? '' : `<div class="callout">Chế độ xem – tài khoản của bạn chưa được cấp quyền lập / sửa phiếu ${TYPE_LABEL[v.type].toLowerCase()}.</div>`}
      <div class="toolbar"><div class="tabs" id="type-tabs">${['N', 'X', 'D'].filter(t => can('p' + t) || t === v.type).map(t => `<button data-t="${t}" class="${v.type === t ? 'on' : ''}">${TYPE_PREFIX[t]} · ${TYPE_LABEL[t]}</button>`).join('')}</div>
        <div class="grow"></div>${editing ? `<span class="muted small">Tạo: ${esc(v.created_at || '')} · Sửa: ${esc(v.updated_at || '')}</span>` : ''}</div>
      <div class="card"><div class="grid c4">
        <label class="field">Ngày<input type="date" id="f-date" value="${esc(v.date)}"></label>
        ${v.type === 'X' && useRoutes ? `<label class="field">Tuyến giao hàng<select id="f-route">${options(routes.map(r => [r.name, `${r.name} (${r.code})`]), v.route, '— Chọn tuyến —')}</select></label>` : ''}
        <label class="field">Số phiếu<div style="display:flex;gap:6px"><input id="f-no" value="${esc(v.no)}" style="flex:1"><button class="btn sm" id="btn-renum" title="Cấp số tiếp theo theo ngày/tuyến">Cấp số mới</button></div></label>
        ${v.type === 'X' ? `<label class="field">Số lượng bill / phiếu xuất<input id="f-bill" value="${esc(v.bill_count)}"></label>` : ''}
        <label class="field">${L.from}<input id="f-from" list="dl-parties" value="${esc(v.from_party)}"></label>
        <label class="field">${L.to}<input id="f-to" list="dl-parties" value="${esc(v.to_party)}"></label>
        <label class="field">${L.giver}<input id="f-giver" list="dl-people" value="${esc(v.giver)}"></label>
        <label class="field">${L.receiver}<input id="f-receiver" list="dl-people" value="${esc(v.receiver)}"></label>
        <label class="field span2">Lý do / Diễn giải<input id="f-reason" value="${esc(v.reason)}"></label>
        <label class="field span2">Chứng từ gốc kèm theo<input id="f-docref" value="${esc(v.doc_ref)}" placeholder="${v.type === 'D' ? 'VD: Biên bản kiểm kê ngày …' : 'VD: đơn hàng, hóa đơn…'}"></label>
      </div>
      ${datalist('dl-parties', S.meta.parties)}${datalist('dl-people', S.meta.people)}
      <p class="hint">${esc(S.meta.warehouse.name)} · Số phiếu tự cấp: ${TYPE_PREFIX[v.type]}-ngàytháng-STT${v.type === 'X' && useRoutes ? '-mã tuyến' : ''}. STT đánh liên tục trong ngày, riêng cho từng loại phiếu và từng kho.</p></div>
      <div class="card"><h3>Mặt hàng</h3>
        <div class="table-wrap"><table class="data lines-table"><thead>${v.type === 'D'
          ? '<tr><th style="width:34px">#</th><th style="min-width:280px">Mặt hàng</th><th>ĐVT</th><th class="num">Tồn sổ</th><th class="num" style="width:110px">Tồn thực tế</th><th class="num" style="width:120px">SL điều chỉnh (+/−)</th><th class="num" style="width:110px">Đơn giá</th><th class="num">Giá trị</th><th style="min-width:160px">Nguyên nhân / Ghi chú</th><th></th></tr>'
          : '<tr><th style="width:34px">#</th><th style="min-width:280px">Mặt hàng</th><th>ĐVT</th><th class="num">Tồn</th><th class="num" style="width:110px">Số lượng</th><th class="num" style="width:120px">Đơn giá (đ)</th><th class="num">Thành tiền</th><th style="min-width:160px">Ghi chú</th><th></th></tr>'}
        </thead><tbody id="lines"></tbody><tfoot id="lines-foot"></tfoot></table></div>
        <div style="margin-top:8px"><button class="btn" id="btn-add">+ Thêm dòng</button>
        <span class="hint">&nbsp;Mẹo: gõ vài chữ của tên hàng (không dấu) rồi Enter; bấm Enter ở ô số lượng dòng cuối để thêm dòng mới.</span></div>
      </div>
      <div class="form-actions">
        ${locked() || !canSave ? '' : `<button class="btn primary" id="btn-save">💾 ${S.account && !isAdmin && v.type === 'D' ? 'Lưu &amp; gửi duyệt' : 'Lưu phiếu'}</button>
        <button class="btn primary" id="btn-save-print">💾 Lưu &amp; In</button>`}
        ${editing ? '<button class="btn" id="btn-print">🖨 In phiếu</button>' : ''}
        <a class="btn" href="#/phieu/moi?type=${v.type}">+ Phiếu mới</a>
        ${editing ? `${canSave ? '<button class="btn" id="btn-copy">Sao chép thành phiếu mới</button>' : ''}${locked() || !can('xoa') ? '' : '<button class="btn danger" id="btn-del">Xóa phiếu</button>'}` : ''}
        <a class="btn ghost" href="#/phieu">← Danh sách phiếu</a>
      </div>`;
    bindHeader();
    drawLines();
  }

  async function refreshNo() {
    if (!autoNo) return;
    const r = routes.find(x => x.name === v.route);
    const res = await guard(() => api('GET', `/next-number?type=${v.type}&date=${v.date}&route_code=${encodeURIComponent(r ? r.code : '')}${editing ? '&exclude=' + editing : ''}`));
    if (res) { v.no = res.no; $('#f-no').value = v.no; }
  }
  async function refreshStock() {
    stock = (await guard(() => api('GET', `/report/stock?date=${v.date}${editing ? '&exclude=' + editing : ''}`))) || {};
    drawLines();
  }

  function bindHeader() {
    $$('#type-tabs button').forEach(b => b.onclick = async () => {
      if (b.dataset.t === v.type) return;
      if (editing && !(await ask('Đổi loại phiếu sẽ đổi cả số phiếu. Tiếp tục?'))) return;
      const nv = newVoucher(b.dataset.t);
      if (!editing) { v.from_party = nv.from_party; v.to_party = nv.to_party; v.reason = nv.reason; }
      v.type = b.dataset.t; autoNo = true; markDirty(); draw(); refreshNo();
    });
    const bind = (id, key, after) => { const el = $(id); if (el) el.addEventListener('input', () => { v[key] = el.value; markDirty(); if (after) after(); }); };
    bind('#f-from', 'from_party'); bind('#f-to', 'to_party'); bind('#f-giver', 'giver'); bind('#f-receiver', 'receiver');
    bind('#f-reason', 'reason', () => { routeAutoReason = false; }); bind('#f-bill', 'bill_count'); bind('#f-docref', 'doc_ref');
    bind('#f-no', 'no', () => { autoNo = false; });
    $('#f-date').addEventListener('change', () => { v.date = $('#f-date').value; markDirty(); refreshNo(); refreshStock(); });
    const rs = $('#f-route');
    if (rs) rs.addEventListener('change', () => {
      v.route = rs.value; markDirty();
      if (routeAutoReason || !v.reason) { v.reason = v.route ? 'Xuất tuyến ' + v.route : ''; $('#f-reason').value = v.reason; routeAutoReason = true; }
      refreshNo();
    });
    $('#btn-renum').onclick = () => { autoNo = true; markDirty(); refreshNo(); };
    $('#btn-add').onclick = () => addLine(true);
    if ($('#btn-save')) { $('#btn-save').onclick = () => save(false); $('#btn-save-print').onclick = () => save(true); }
    if ($('#btn-approve')) $('#btn-approve').onclick = () => review(true);
    if ($('#btn-reject')) $('#btn-reject').onclick = () => review(false);
    if (editing) {
      $('#btn-print').onclick = () => {
        if (S.dirty) return toast('Hãy lưu phiếu trước khi in', true);
        printVouchers('ids=' + editing);
      };
      if ($('#btn-del')) $('#btn-del').onclick = async () => {
        if (!(await ask(`Xóa phiếu ${v.no}? Thao tác này không hoàn tác được (vẫn ghi trong Lịch sử).`))) return;
        const r = await guard(() => api('DELETE', '/vouchers/' + editing));
        if (r) { S.dirty = false; toast('Đã xóa phiếu ' + v.no); lsxAutoToast(r.lsx_auto); go('#/phieu'); }
      };
      $('#btn-copy').onclick = () => {
        store('voucherDraft', { wh: S.wh, type: v.type, route: v.route, from_party: v.from_party, to_party: v.to_party, giver: v.giver,
          receiver: v.receiver, reason: v.reason, lines: v.lines });
        S.dirty = false; go(`#/phieu/moi?type=${v.type}&draft=1`);
      };
    }
  }

  function addLine(focus) {
    v.lines.push({ product_code: '', qty: null, price: null, note: '' });
    markDirty(); drawLines();
    if (focus) { const rows = $$('#lines tr'); const c = rows[rows.length - 1].querySelector('.combo'); if (c) c.focusInput(); }
  }

  function drawLines() {
    const tb = $('#lines');
    if (!tb) return;
    tb.innerHTML = '';
    v.lines.forEach((l, i) => {
      const p = productByCode(l.product_code);
      const tr = document.createElement('tr');
      const book = stock[l.product_code] || 0;
      if (v.type === 'D') {
        tr.innerHTML = `<td class="muted">${i + 1}</td><td class="c-prod"></td><td>${esc(p ? p.unit : '')}</td>
          <td class="num">${l.product_code ? fmt(book) : ''}</td>
          <td><input class="num" data-k="actual" inputmode="decimal" value="${l.product_code && l.qty !== null && l.qty !== '' ? esc(fmt(book + Number(l.qty))) : ''}"></td>
          <td><input class="num" data-k="qty" inputmode="decimal" value="${l.qty === null ? '' : esc(fmt(l.qty))}"></td>
          <td><input class="num" data-k="price" inputmode="decimal" value="${l.price === null ? '' : esc(fmt(l.price))}"></td>
          <td class="num" data-out="amt"></td>
          <td><input data-k="note" value="${esc(l.note)}"></td><td><button class="btn sm ghost danger" data-del title="Xóa dòng">✕</button></td>`;
      } else {
        tr.innerHTML = `<td class="muted">${i + 1}</td><td class="c-prod"></td><td>${esc(p ? p.unit : '')}</td>
          <td class="num"><span class="stock-hint" data-out="stock"></span></td>
          <td><input class="num" data-k="qty" inputmode="decimal" value="${l.qty === null ? '' : esc(fmt(l.qty))}"></td>
          <td><input class="num" data-k="price" inputmode="decimal" value="${l.price === null ? '' : esc(fmt(l.price))}"></td>
          <td class="num" data-out="amt"></td>
          <td><input data-k="note" value="${esc(l.note)}"></td><td><button class="btn sm ghost danger" data-del title="Xóa dòng">✕</button></td>`;
      }
      const combo = productCombo(l.product_code, prod => {
        l.product_code = prod ? prod.code : '';
        if (prod && (l.price === null || l.price === '' || l.price === 0)) l.price = prod.price || 0;
        markDirty(); drawLines();
        const qi = $$('#lines tr')[i].querySelector(v.type === 'D' ? 'input[data-k=actual]' : 'input[data-k=qty]');
        if (qi) qi.focus();
      });
      tr.querySelector('.c-prod').appendChild(combo);
      $$('input[data-k]', tr).forEach(inp => {
        inp.addEventListener('input', () => {
          markDirty();
          const k = inp.dataset.k;
          if (k === 'note') { l.note = inp.value; return; }
          const n = parseNum(inp.value);
          if (k === 'actual') {
            l.qty = n === null || isNaN(n) ? null : +(n - book).toFixed(6);
            $('input[data-k=qty]', tr).value = l.qty === null ? '' : fmt(l.qty);
          } else {
            l[k] = n === null || isNaN(n) ? null : n;
            if (k === 'qty' && v.type === 'D') $('input[data-k=actual]', tr).value = l.qty === null ? '' : fmt(book + l.qty);
          }
          inp.style.borderColor = isNaN(n) ? 'var(--danger)' : '';
          updateRow(tr, l);
          updateFoot();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' && (inp.dataset.k === 'qty' || inp.dataset.k === 'actual' || inp.dataset.k === 'note')) {
            e.preventDefault();
            if (i === v.lines.length - 1) addLine(true);
            else { const c = $$('#lines tr')[i + 1].querySelector('.combo'); if (c) c.focusInput(); }
          }
        });
      });
      $('[data-del]', tr).onclick = () => { v.lines.splice(i, 1); if (!v.lines.length) v.lines.push({ product_code: '', qty: null, price: null, note: '' }); markDirty(); drawLines(); };
      tb.appendChild(tr);
      updateRow(tr, l);
    });
    updateFoot();
  }
  function updateRow(tr, l) {
    const amt = (Number(l.qty) || 0) * (Number(l.price) || 0);
    $('[data-out=amt]', tr).textContent = amt ? money(amt) : '';
    const sh = $('[data-out=stock]', tr);
    if (sh) {
      if (!l.product_code) { sh.textContent = ''; return; }
      const book = stock[l.product_code] || 0;
      const after = v.type === 'X' ? book - (Number(l.qty) || 0) : book + (Number(l.qty) || 0);
      sh.textContent = fmt(book) + ' → ' + fmt(after);
      sh.className = 'stock-hint' + (after < 0 ? ' neg' : '');
      sh.title = after < 0 ? 'Xuất vượt tồn sổ sách – kiểm tra lại phiếu nhập' : 'Tồn sổ trước → sau phiếu này (tính đến hết ngày phiếu)';
    }
  }
  function updateFoot() {
    const tq = v.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
    const tm = v.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
    const n = v.lines.filter(l => l.product_code).length;
    $('#lines-foot').innerHTML = v.type === 'D'
      ? `<tr><td></td><td>${n} mặt hàng</td><td colspan="3"></td><td class="num">${fmt(tq)}</td><td></td><td class="num">${money(tm)}</td><td colspan="2"></td></tr>`
      : `<tr><td></td><td>${n} mặt hàng</td><td colspan="2"></td><td class="num">${fmt(tq)}</td><td></td><td class="num">${tm ? money(tm) : ''}</td><td colspan="2"></td></tr>`;
  }

  async function save(andPrint) {
    if (v.lines.some(l => l.product_code && (l.qty === null || isNaN(l.qty)))) return toast('Có dòng chưa nhập số lượng', true);
    if (v.lines.some(l => !l.product_code && l.qty)) return toast('Có dòng có số lượng nhưng chưa chọn mặt hàng', true);
    if (v.type === 'X' && useRoutes && !v.route && !(await ask('Phiếu xuất chưa chọn tuyến. Vẫn lưu?'))) return;
    if (v.type !== 'D') {
      const over = v.lines.filter(l => l.product_code && v.type === 'X' && (stock[l.product_code] || 0) - (Number(l.qty) || 0) < 0);
      if (over.length && !(await ask(`${over.length} mặt hàng xuất vượt tồn sổ sách (sẽ bị tồn âm). Vẫn lưu?`))) return;
    }
    const body = Object.assign({}, v, { lines: v.lines.filter(l => l.product_code) });
    if (autoNo && !editing) body.no = '';
    if (!body.no && v.type === 'X') { const r = routes.find(x => x.name === v.route); body.route_code = r ? r.code : ''; }
    const res = await guard(() => editing ? api('PUT', '/vouchers/' + editing, body) : api('POST', '/vouchers', body));
    if (!res) return;
    S.dirty = false;
    store('lastVoucher_' + S.wh + '_' + v.type, { giver: v.giver, receiver: v.receiver });
    toast(res.status === 'pending' ? `Đã lưu phiếu ${res.no} – đang chờ Quản lý duyệt` : `Đã lưu phiếu ${res.no}`);
    lsxAutoToast(res.lsx_auto);
    loadMeta();
    if (andPrint) printHtml(voucherDoc(res), 'portrait', res.no);
    if (!editing) go('#/phieu/' + res.id, { force: true });
    else {
      Object.assign(v, { no: res.no, status: res.status, created_by: res.created_by, approved_by: res.approved_by, approved_at: res.approved_at,
        review_note: res.review_note, saved_type: res.type });
      draw(); refreshStock();
    }
  }

  draw();
  if (autoNo) refreshNo();
  refreshStock();
}

/* ============================================================ Danh sách phiếu */
async function viewVoucherList(main, m, q = {}) {
  setTitle('Danh sách phiếu');
  const f = Object.assign({ from: addDays(isoDate(), -6), to: isoDate(), type: '', q: '' }, store('voucherFilter') || {});
  f.status = ['pending', 'rejected'].includes(q.status) ? q.status : ''; // lọc phiếu điều chỉnh chờ duyệt / bị từ chối (mọi ngày)
  const STATUS = { pending: ['warn', '⏳ Chờ duyệt'], rejected: ['bad', '✖ Từ chối'] };
  main.innerHTML = `
    <div class="toolbar">
      <label class="field">Từ ngày<input type="date" id="v-from" value="${f.from}"></label>
      <label class="field">Đến ngày<input type="date" id="v-to" value="${f.to}"></label>
      <label class="field">Loại<select id="v-type">${options([['N', 'Nhập'], ['X', 'Xuất'], ['D', 'Điều chỉnh']], f.type, 'Tất cả')}</select></label>
      <label class="field grow">Tìm (số phiếu, mặt hàng, tuyến, người…)<input id="v-q" value="${esc(f.q)}"></label>
      <button class="btn" id="v-today">Hôm nay</button>
    </div>
    <div class="toolbar">
      <a class="btn primary" href="#/phieu/moi?type=N">+ Phiếu nhập</a>
      <a class="btn primary" href="#/phieu/moi?type=X">+ Phiếu xuất</a>
      <a class="btn" href="#/phieu/moi?type=D">+ Phiếu điều chỉnh</a>
      ${S.account ? `<button class="btn ${f.status === 'pending' ? 'primary' : ''}" id="v-pending">⏳ Phiếu chờ duyệt</button>` : ''}
      <div class="grow"></div>
      <button class="btn" id="v-print-sel" disabled>🖨 In phiếu đã chọn</button>
      <button class="btn" id="v-print-all">🖨 In tất cả phiếu trong danh sách</button>
    </div>
    <div id="v-list"></div>`;
  let list = [];
  const sel = new Set();
  async function load() {
    const p = new URLSearchParams({ from: f.from, to: f.to, type: f.type, q: f.q, status: f.status });
    list = await guard(() => api('GET', '/vouchers?' + p)) || [];
    sel.clear();
    draw();
  }
  function draw() {
    $('#v-print-sel').disabled = !sel.size;
    $('#v-print-sel').textContent = `🖨 In phiếu đã chọn${sel.size ? ' (' + sel.size + ')' : ''}`;
    $('#v-list').innerHTML = list.length ? `<div class="table-wrap"><table class="data"><thead><tr>
      <th><input type="checkbox" id="v-all"></th><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Tuyến / Bên nhận</th><th>Lý do / Diễn giải</th>
      <th class="num">Dòng</th><th class="num">Tổng SL</th><th>Người giao → nhận</th><th></th></tr></thead><tbody>
      ${list.map(v => `<tr class="clickable" data-id="${v.id}"><td><input type="checkbox" data-sel="${v.id}" ${sel.has(String(v.id)) ? 'checked' : ''}></td>
        <td class="nowrap">${vnDate(v.date)}</td><td class="nowrap"><b>${esc(v.no)}</b></td><td class="nowrap"><span class="badge ${v.type}">${TYPE_LABEL[v.type]}</span>${STATUS[v.status] ? ` <span class="badge ${STATUS[v.status][0]}">${STATUS[v.status][1]}</span>` : ''}</td>
        <td>${esc(v.route || v.to_party)}</td><td>${esc(v.reason)}</td><td class="num">${v.line_count}</td><td class="num">${fmt(v.total_qty)}</td>
        <td class="small">${esc(v.giver)}${v.receiver ? ' → ' + esc(v.receiver) : ''}</td>
        <td class="nowrap"><button class="btn sm" data-print="${v.id}">In</button></td></tr>`).join('')}
      </tbody></table></div><p class="hint">${list.length} phiếu${f.status ? (f.status === 'pending' ? ' chờ duyệt (mọi ngày)' : ' bị từ chối (mọi ngày)') : ''}. Bấm vào dòng để xem${f.status === 'pending' && S.account && can('duyet') ? ' và duyệt' : ' / sửa'}.${S.account ? ' Phiếu chờ duyệt / bị từ chối chưa tính vào tồn kho.' : ''}</p>`
      : `<p class="muted">${f.status === 'pending' ? 'Không có phiếu điều chỉnh nào chờ duyệt.' : f.status === 'rejected' ? 'Không có phiếu bị từ chối.' : 'Không có phiếu nào trong khoảng này.'}</p>`;
    $$('#v-list tr[data-id]').forEach(tr => tr.onclick = e => {
      if (e.target.closest('input,button')) return;
      go('#/phieu/' + tr.dataset.id);
    });
    $$('#v-list [data-sel]').forEach(cb => cb.onchange = () => { cb.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel); draw(); });
    $$('#v-list [data-print]').forEach(b => b.onclick = () => printVouchers('ids=' + b.dataset.print));
    const all = $('#v-all');
    if (all) { all.checked = sel.size && sel.size === list.length; all.onchange = () => { list.forEach(v => all.checked ? sel.add(String(v.id)) : sel.delete(String(v.id))); draw(); }; }
  }
  const upd = () => {
    f.from = $('#v-from').value; f.to = $('#v-to').value; f.type = $('#v-type').value; f.q = $('#v-q').value;
    if (f.status) { f.status = ''; setHashSilently('#/phieu'); const b = $('#v-pending'); if (b) b.classList.remove('primary'); } // đổi bộ lọc: về xem theo ngày
    store('voucherFilter', { from: f.from, to: f.to, type: f.type, q: f.q }); load();
  };
  if ($('#v-pending')) $('#v-pending').onclick = () => go(f.status === 'pending' ? '#/phieu' : '#/phieu?status=pending');
  ['#v-from', '#v-to', '#v-type'].forEach(id => $(id).addEventListener('change', upd));
  $('#v-q').addEventListener('input', debounce(upd, 350));
  $('#v-today').onclick = () => { $('#v-from').value = $('#v-to').value = isoDate(); upd(); };
  $('#v-print-sel').onclick = () => printVouchers('ids=' + Array.from(sel).join(','));
  $('#v-print-all').onclick = () => { if (!list.length) return toast('Danh sách trống', true); printVouchers('ids=' + list.slice().reverse().map(v => v.id).join(',')); };
  await load();
}

/* ============================================================ Sổ nhập xuất */
async function viewLedger(main) {
  setTitle('Sổ nhập – xuất kho');
  const f = Object.assign({ from: firstOfMonth(), to: isoDate(), type: '', q: '' }, store('ledgerFilter') || {});
  main.innerHTML = `<div class="toolbar">
      <label class="field">Từ ngày<input type="date" id="l-from" value="${f.from}"></label>
      <label class="field">Đến ngày<input type="date" id="l-to" value="${f.to}"></label>
      <label class="field">Loại<select id="l-type">${options([['N', 'Nhập'], ['X', 'Xuất'], ['D', 'Điều chỉnh']], f.type, 'Tất cả')}</select></label>
      <label class="field grow">Tìm nhanh (mã, tên hàng không dấu, số phiếu, ghi chú…)<input id="l-q" value="${esc(f.q)}"></label>
      ${ONLINE ? '<button class="btn" id="l-csv">⬇ Xuất Excel (CSV)</button>' : '<a class="btn" id="l-csv">⬇ Xuất Excel (CSV)</a>'}
    </div><div id="l-sum" class="kpis"></div><div id="l-list"></div>`;
  async function load() {
    const p = new URLSearchParams({ from: f.from, to: f.to, type: f.type });
    let rows = await guard(() => api('GET', '/lines?' + p)) || [];
    if (f.q) rows = rows.filter(r => matches(f.q, [r.no, r.product_code, r.name, r.note, r.reason, r.giver, r.receiver, r.to_party].join(' ')));
    if (ONLINE) $('#l-csv').onclick = () => guard(async () => saveTextFile(`so-nhap-xuat-${S.wh.toLowerCase()}-${f.from}-${f.to}.csv`, await api('GET', '/export/lines.csv?' + new URLSearchParams({ from: f.from, to: f.to }))));
    else $('#l-csv').href = withToken('/api/export/lines.csv?' + new URLSearchParams({ wh: S.wh, from: f.from, to: f.to }));
    const sum = { N: 0, X: 0, D: 0 };
    rows.forEach(r => { sum[r.type] += 1; });
    $('#l-sum').innerHTML = `<div class="kpi"><div class="k-label">Số dòng</div><div class="k-val">${rows.length}</div></div>
      <div class="kpi"><div class="k-label">Dòng nhập</div><div class="k-val">${sum.N}</div></div>
      <div class="kpi"><div class="k-label">Dòng xuất</div><div class="k-val">${sum.X}</div></div>
      <div class="kpi"><div class="k-label">Dòng điều chỉnh</div><div class="k-val">${sum.D}</div></div>`;
    $('#l-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Bên giao → nhận</th>
      <th>Mã hàng</th><th>Tên hàng</th><th>Ghi chú</th><th>ĐVT</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th>
      <th>Lý do / Diễn giải</th><th>Người giao</th><th>Người nhận</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="clickable" data-id="${r.voucher_id}"><td class="nowrap">${vnDate(r.date)}</td><td class="nowrap">${esc(r.no)}</td>
        <td><span class="badge ${r.type}">${TYPE_LABEL[r.type]}</span></td><td class="small">${esc(r.from_party)} → ${esc(r.to_party)}</td>
        <td>${esc(r.product_code)}</td><td>${esc(r.name)}</td><td class="small">${esc(r.note)}</td><td>${esc(r.unit)}</td>
        <td class="num ${r.qty < 0 ? 'neg' : ''}">${fmt(r.qty)}</td><td class="num">${fmtBlank0(r.price)}</td><td class="num">${r.price ? money(r.qty * r.price) : ''}</td>
        <td class="small">${esc(r.reason)}</td><td class="small">${esc(r.giver)}</td><td class="small">${esc(r.receiver)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Không có dòng nào.</p>';
    $$('#l-list tr[data-id]').forEach(tr => tr.onclick = () => go('#/phieu/' + tr.dataset.id));
  }
  const upd = () => { f.from = $('#l-from').value; f.to = $('#l-to').value; f.type = $('#l-type').value; f.q = $('#l-q').value; store('ledgerFilter', f); load(); };
  ['#l-from', '#l-to', '#l-type'].forEach(id => $(id).addEventListener('change', upd));
  $('#l-q').addEventListener('input', debounce(upd, 300));
  await load();
}

/* ============================================================ Nhập – Xuất – Tồn */
async function viewNXT(main, m, q) {
  setTitle('Báo cáo Nhập – Xuất – Tồn');
  const STOCK_FILTERS = [['', 'Tất cả mã'], ['in', 'Còn tồn trong kho (tồn > 0)'], ['zero', 'Hết hàng (tồn = 0)'], ['neg', 'Tồn âm (< 0)']];
  const f = { from: q.from || isoDate(), to: q.to || isoDate(), grp: '', moved: false, warn: false, q: '', stock: store('nxtStock') || '' };
  const groups = Array.from(new Set(S.meta.products.map(p => p.grp).filter(Boolean)));
  const EPS = 1e-9;
  const stockOk = r => !f.stock || (f.stock === 'in' ? r.close > EPS : f.stock === 'zero' ? Math.abs(r.close) <= EPS : r.close < -EPS);
  main.innerHTML = `<div class="toolbar">
      <label class="field">Từ ngày<input type="date" id="n-from" value="${f.from}"></label>
      <label class="field">Đến ngày<input type="date" id="n-to" value="${f.to}"></label>
      <button class="btn" data-range="today">Hôm nay</button><button class="btn" data-range="week">7 ngày</button><button class="btn" data-range="month">Tháng này</button>
      <label class="field">Nhóm hàng<select id="n-grp">${options(groups, '', 'Tất cả')}</select></label>
      <label class="field">Tồn cuối kỳ<select id="n-stock">${options(STOCK_FILTERS, f.stock)}</select></label>
      <label class="field grow">Tìm<input id="n-q"></label>
    </div>
    <div class="toolbar"><label class="check"><input type="checkbox" id="n-moved"> Chỉ mã có phát sinh</label>
      <label class="check"><input type="checkbox" id="n-warn"> Chỉ mã có cảnh báo</label><div class="grow"></div>
      <button class="btn" id="n-print">🖨 In báo cáo</button></div>
    <div id="n-kpi" class="kpis"></div><div id="n-list"></div>
    <p class="hint">Tồn đầu kỳ = Số dư ban đầu (nhập ở Danh mục hàng) + nhập − xuất + điều chỉnh trước "Từ ngày". Bấm dòng để mở thẻ kho.</p>`;
  let data = [];
  async function load() {
    data = await guard(() => api('GET', `/report/nxt?from=${f.from}&to=${f.to}`)) || [];
    draw();
  }
  function filtered() {
    return data.filter(r => (!f.grp || r.grp === f.grp) && stockOk(r) && (!f.moved || r.moved) && (!f.warn || r.warn) && (!f.q || matches(f.q, r.code + ' ' + r.name)));
  }
  function draw() {
    const rows = filtered();
    const neg = data.filter(r => r.warn === 'Tồn âm').length, low = data.filter(r => r.warn === 'Dưới tồn tối thiểu').length;
    const inStock = data.filter(r => r.close > EPS).length;
    $('#n-kpi').innerHTML = `<div class="kpi"><div class="k-label">${f.from === f.to ? 'Xem ngày ' + vnDate(f.from) : 'Kỳ ' + vnDate(f.from) + ' – ' + vnDate(f.to)}</div><div class="k-val">${rows.length} mã</div></div>
      <div class="kpi"><div class="k-label">Mã còn tồn trong kho</div><div class="k-val">${inStock}<span class="small muted"> / ${data.length}</span></div></div>
      <div class="kpi ${neg ? 'bad' : ''}"><div class="k-label">Số mã tồn âm</div><div class="k-val">${neg}</div></div>
      <div class="kpi ${low ? 'warn' : ''}"><div class="k-label">Mã dưới tồn tối thiểu</div><div class="k-val">${low}</div></div>
      <div class="kpi"><div class="k-label">Tổng giá trị tồn cuối kỳ (đ)</div><div class="k-val">${money(rows.reduce((a, r) => a + r.value, 0))}</div></div>`;
    $('#n-list').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Nhóm</th>
      <th class="num">Tồn tối thiểu</th><th class="num">Tồn đầu kỳ</th><th class="num">Nhập trong kỳ</th><th class="num">Xuất trong kỳ</th><th class="num">Điều chỉnh</th>
      <th class="num">Tồn cuối kỳ</th><th class="num">Đơn giá</th><th class="num">Giá trị tồn</th><th>Cảnh báo</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="clickable ${r.warn === 'Tồn âm' ? 'row-bad' : r.warn ? 'row-warn' : ''}" data-code="${esc(r.code)}"><td>${i + 1}</td><td>${esc(r.code)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="small">${esc(r.grp)}</td>
        <td class="num">${r.min_qty === null ? '' : fmt(r.min_qty)}</td><td class="num">${fmt(r.open)}</td><td class="num">${fmtBlank0(r.in)}</td><td class="num">${fmtBlank0(r.out)}</td>
        <td class="num">${fmtBlank0(r.adj)}</td><td class="num"><b class="${r.close < 0 ? 'neg' : ''}">${fmt(r.close)}</b></td><td class="num">${fmtBlank0(r.price)}</td>
        <td class="num">${fmtBlank0(Math.round(r.value))}</td><td>${r.warn ? `<span class="badge ${r.warn === 'Tồn âm' ? 'bad' : 'warn'}">${esc(r.warn)}</span>` : ''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="7">Cộng</td><td class="num">${fmt(rows.reduce((a, r) => a + r.in, 0))}</td><td class="num">${fmt(rows.reduce((a, r) => a + r.out, 0))}</td>
      <td class="num">${fmt(rows.reduce((a, r) => a + r.adj, 0))}</td><td class="num">${fmt(rows.reduce((a, r) => a + r.close, 0))}</td><td></td><td class="num">${money(rows.reduce((a, r) => a + r.value, 0))}</td><td></td></tr></tfoot></table></div>`;
    $$('#n-list tr[data-code]').forEach(tr => tr.onclick = () => go(`#/the-kho?code=${encodeURIComponent(tr.dataset.code)}&from=${f.from}&to=${f.to}`));
  }
  const upd = () => { f.from = $('#n-from').value; f.to = $('#n-to').value; load(); };
  $('#n-from').onchange = upd; $('#n-to').onchange = upd;
  $$('[data-range]').forEach(b => b.onclick = () => {
    const t = isoDate();
    $('#n-to').value = t;
    $('#n-from').value = b.dataset.range === 'today' ? t : b.dataset.range === 'week' ? addDays(t, -6) : firstOfMonth();
    upd();
  });
  $('#n-grp').onchange = () => { f.grp = $('#n-grp').value; draw(); };
  $('#n-moved').onchange = () => { f.moved = $('#n-moved').checked; draw(); };
  $('#n-warn').onchange = () => { f.warn = $('#n-warn').checked; draw(); };
  $('#n-stock').onchange = () => { f.stock = $('#n-stock').value; store('nxtStock', f.stock); draw(); };
  $('#n-q').oninput = debounce(() => { f.q = $('#n-q').value; draw(); }, 200);
  $('#n-print').onclick = () => {
    const rows = filtered();
    printHtml(`<div class="doc landscape">${docHead('', '')}
      <div class="d-title">Báo cáo nhập – xuất – tồn kho</div><div class="d-sub">${f.from === f.to ? 'Ngày ' + vnDate(f.from) : 'Từ ngày ' + vnDate(f.from) + ' đến ngày ' + vnDate(f.to)}${f.stock ? ' · ' + esc(STOCK_FILTERS.find(x => x[0] === f.stock)[1]) : ''}${f.grp ? ' · Nhóm: ' + esc(f.grp) : ''}</div>
      <table class="t"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Tồn đầu kỳ</th><th>Nhập</th><th>Xuất</th><th>Điều chỉnh</th><th>Tồn cuối kỳ</th><th>Đơn giá</th><th>Giá trị tồn</th><th>Cảnh báo</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td><td class="n">${fmt(r.open)}</td>
        <td class="n">${fmtBlank0(r.in)}</td><td class="n">${fmtBlank0(r.out)}</td><td class="n">${fmtBlank0(r.adj)}</td><td class="n"><b>${fmt(r.close)}</b></td>
        <td class="n">${fmtBlank0(r.price)}</td><td class="n">${fmtBlank0(Math.round(r.value))}</td><td>${esc(r.warn)}</td></tr>`).join('')}
      <tr class="sum"><td colspan="10" class="c">TỔNG GIÁ TRỊ TỒN KHO CUỐI KỲ</td><td class="n">${money(rows.reduce((a, r) => a + r.value, 0))}</td><td></td></tr></tbody></table>
      ${signBlock([['Người lập', S.user], ['Thủ kho', ''], ['Kế toán', '']])}</div>`, 'landscape', `NXT-${S.wh}-${f.from}-${f.to}`);
  };
  await load();
}

/* ============================================================ Thẻ kho */
async function viewStockCard(main, m, q) {
  setTitle('Thẻ kho');
  const f = { code: q.code || store('cardCode_' + S.wh) || '', from: q.from || firstOfMonth(), to: q.to || isoDate() };
  main.innerHTML = `<div class="toolbar">
      <label class="field grow" style="min-width:320px">Mặt hàng<div id="c-prod"></div></label>
      <label class="field">Từ ngày<input type="date" id="c-from" value="${f.from}"></label>
      <label class="field">Đến ngày<input type="date" id="c-to" value="${f.to}"></label>
      <button class="btn" id="c-print">🖨 In thẻ kho</button></div><div id="c-body"></div>`;
  $('#c-prod').appendChild(productCombo(f.code, p => { f.code = p ? p.code : ''; store('cardCode_' + S.wh, f.code); load(); }, { includeInactive: true }));
  let data = null;
  async function load() {
    if (!f.code) { $('#c-body').innerHTML = '<p class="muted">Chọn một mặt hàng để xem thẻ kho.</p>'; return; }
    data = await guard(() => api('GET', `/report/card?code=${encodeURIComponent(f.code)}&from=${f.from}&to=${f.to}`));
    if (!data) return;
    const p = productByCode(f.code) || {};
    const minq = p.min_qty;
    const tin = data.lines.filter(l => l.type === 'N').reduce((a, l) => a + l.qty, 0);
    const tout = data.lines.filter(l => l.type === 'X').reduce((a, l) => a + l.qty, 0);
    const tadj = data.lines.filter(l => l.type === 'D').reduce((a, l) => a + l.qty, 0);
    let prevDate = '';
    $('#c-body').innerHTML = `<div class="kpis"><div class="kpi"><div class="k-label">Mã hàng</div><div class="k-val" style="font-size:18px">${esc(f.code)}</div><div class="small">${esc(p.name || '')} · ĐVT: ${esc(p.unit || '')}</div></div>
      <div class="kpi"><div class="k-label">Tồn tối thiểu</div><div class="k-val">${minq === null || minq === undefined ? '—' : fmt(minq)}</div></div>
      <div class="kpi"><div class="k-label">Tồn đầu kỳ</div><div class="k-val">${fmt(data.opening)}</div></div>
      <div class="kpi ${data.closing < 0 ? 'bad' : ''}"><div class="k-label">Tồn cuối kỳ</div><div class="k-val">${fmt(data.closing)}</div></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Bên giao → Bên nhận</th><th>Diễn giải</th>
      <th class="num">Nhập</th><th class="num">Xuất</th><th class="num">Điều chỉnh</th><th class="num">Tồn</th></tr></thead><tbody>
      <tr><td colspan="9"><b>TỒN ĐẦU KỲ</b></td><td class="num"><b>${fmt(data.opening)}</b></td></tr>
      ${data.lines.map((l, i) => { const bad = l.balance < 0, low = !bad && minq !== null && minq !== undefined && l.balance < minq; const r = `<tr class="clickable ${bad ? 'row-bad' : low ? 'row-warn' : ''}" data-id="${l.voucher_id}"><td>${i + 1}</td>
        <td class="nowrap" ${prevDate > l.date ? 'style="background:var(--warn-bg)"' : ''}>${vnDate(l.date)}</td><td class="nowrap">${esc(l.no)}</td><td><span class="badge ${l.type}">${TYPE_LABEL[l.type]}</span></td>
        <td class="small">${esc(l.from_party)} → ${esc(l.to_party)}</td><td class="small">${esc(l.reason)}${l.note ? ' · ' + esc(l.note) : ''}</td>
        <td class="num">${l.type === 'N' ? fmt(l.qty) : ''}</td><td class="num">${l.type === 'X' ? fmt(l.qty) : ''}</td><td class="num">${l.type === 'D' ? fmt(l.qty) : ''}</td>
        <td class="num"><b class="${bad ? 'neg' : ''}">${fmt(l.balance)}</b></td></tr>`; prevDate = l.date; return r; }).join('')}
      </tbody><tfoot><tr><td colspan="6">CỘNG PHÁT SINH / TỒN CUỐI KỲ</td><td class="num">${fmt(tin)}</td><td class="num">${fmt(tout)}</td><td class="num">${fmt(tadj)}</td><td class="num">${fmt(data.closing)}</td></tr></tfoot></table></div>
      <p class="hint">Tồn đỏ = âm (thiếu phiếu nhập hoặc xuất không phiếu); tồn vàng = dưới tối thiểu.</p>`;
    $$('#c-body tr[data-id]').forEach(tr => tr.onclick = () => go('#/phieu/' + tr.dataset.id));
  }
  $('#c-from').onchange = () => { f.from = $('#c-from').value; load(); };
  $('#c-to').onchange = () => { f.to = $('#c-to').value; load(); };
  $('#c-print').onclick = () => {
    if (!data) return;
    const p = productByCode(f.code) || {};
    printHtml(`<div class="doc">${docHead('', '')}<div class="d-title">Thẻ kho</div>
      <div class="d-sub">Từ ngày ${vnDate(f.from)} đến ngày ${vnDate(f.to)}</div>
      <div class="d-info"><div>Mặt hàng: <b>${esc(f.code)} – ${esc(p.name || '')}</b> &nbsp; ĐVT: ${esc(p.unit || '')}</div></div>
      <table class="t"><thead><tr><th>STT</th><th>Ngày</th><th>Số phiếu</th><th>Diễn giải</th><th>Nhập</th><th>Xuất</th><th>Điều chỉnh</th><th>Tồn</th></tr></thead><tbody>
      <tr><td colspan="7"><b>TỒN ĐẦU KỲ</b></td><td class="n"><b>${fmt(data.opening)}</b></td></tr>
      ${data.lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td class="c">${vnDate(l.date)}</td><td>${esc(l.no)}</td><td>${esc(l.reason || (l.from_party + ' → ' + l.to_party))}</td>
        <td class="n">${l.type === 'N' ? fmt(l.qty) : ''}</td><td class="n">${l.type === 'X' ? fmt(l.qty) : ''}</td><td class="n">${l.type === 'D' ? fmt(l.qty) : ''}</td><td class="n">${fmt(l.balance)}</td></tr>`).join('')}
      <tr class="sum"><td colspan="7" class="c">TỒN CUỐI KỲ</td><td class="n">${fmt(data.closing)}</td></tr></tbody></table>
      ${signBlock([['Người lập thẻ', S.user], ['Thủ kho', ''], ['Kế toán', '']])}</div>`, 'portrait', `the-kho-${f.code}`);
  };
  await load();
}

/* ============================================================ Biên bản – danh sách chung */
const DOC_KINDS = {
  stocktake: { title: 'Kiểm kê kho', path: 'kiem-ke', add: '+ Biên bản kiểm kê mới' },
  handover: { title: 'Bàn giao kho', path: 'ban-giao', add: '+ Biên bản bàn giao mới' },
  routing: { title: 'Phân tuyến giao hàng', path: 'phan-tuyen', add: '+ Phân tuyến ngày mới' },
};
async function viewDocList(kind) {
  const K = DOC_KINDS[kind];
  setTitle(K.title);
  const main = $('#main');
  const list = await api('GET', '/docs?kind=' + kind);
  main.innerHTML = `<div class="toolbar"><a class="btn primary" href="#/${K.path}/moi">${K.add}</a></div>
    ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Cập nhật</th></tr></thead><tbody>
    ${list.map(d => `<tr class="clickable" data-id="${d.id}"><td>${vnDate(d.date)}</td><td>${esc(d.title)}</td><td class="small muted">${esc(d.updated_at)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Chưa có biên bản nào.</p>'}`;
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go(`#/${K.path}/${tr.dataset.id}`));
}
async function loadDoc(kind, idPart) {
  if (idPart === 'moi') return { id: null, kind, date: isoDate(), title: '', data: {} };
  const doc = await api('GET', '/docs/' + idPart);
  if (doc.wh && doc.wh !== S.wh) await switchWh(doc.wh, true);
  return doc;
}
async function saveDoc(doc) {
  const body = { kind: doc.kind, date: doc.date, title: doc.title, data: doc.data };
  const res = doc.id ? await api('PUT', '/docs/' + doc.id, body) : await api('POST', '/docs', body);
  S.dirty = false;
  toast('Đã lưu');
  if (!doc.id) { doc.id = res.id; setHashSilently(`#/${DOC_KINDS[doc.kind].path}/${res.id}`); }
  return true;
}
async function deleteDoc(doc) {
  if (!doc.id || !(await ask('Xóa biên bản này?'))) return;
  if (await guard(() => api('DELETE', '/docs/' + doc.id))) { S.dirty = false; go('#/' + DOC_KINDS[doc.kind].path); }
}

/* ============================================================ Kiểm kê */
async function viewStocktake(main, m) {
  const doc = await loadDoc('stocktake', m[1]);
  const s = S.meta.settings;
  const d = doc.data;
  d.counter = d.counter || S.user || ''; d.keeper = d.keeper || '';
  d.threshold = d.threshold === undefined ? (s.stocktake_threshold || 0.01) : d.threshold;
  d.rows = d.rows || [];
  const view = { grp: '', onlyDiff: false, q: '' };
  setTitle('Biên bản kiểm kê kho');

  async function fetchBook(keepActual) {
    const stock = await api('GET', '/report/stock?date=' + doc.date);
    const old = Object.fromEntries(d.rows.map(r => [r.code, r]));
    d.rows = activeProducts().map(p => ({
      code: p.code, name: p.name, unit: p.unit, grp: p.grp, price: p.price || 0, book: stock[p.code] || 0,
      actual: keepActual && old[p.code] ? old[p.code].actual : null, cause: keepActual && old[p.code] ? old[p.code].cause : '',
    }));
    d.snapshot_at = new Date().toLocaleString('vi-VN');
  }
  if (!doc.id) await fetchBook(false);

  function calc(r) {
    if (r.actual === null || r.actual === undefined || r.actual === '') return { diff: null };
    const diff = +(r.actual - r.book).toFixed(6);
    const pct = r.book === 0 ? (r.actual === 0 ? 0 : 1) : diff / r.book;
    const val = diff * (r.price || 0);
    let ev = 'Khớp';
    if (diff !== 0) ev = Math.abs(pct) > d.threshold ? (diff > 0 ? 'Thừa - vượt ngưỡng' : 'Thiếu - vượt ngưỡng') : (diff > 0 ? 'Thừa (trong ngưỡng)' : 'Thiếu (trong ngưỡng)');
    return { diff, pct, val, ev };
  }
  function draw() {
    const groups = Array.from(new Set(d.rows.map(r => r.grp).filter(Boolean)));
    main.innerHTML = `<div class="card"><div class="grid c4">
        <label class="field">Ngày kiểm kê<input type="date" id="k-date" value="${doc.date}"></label>
        <label class="field">Người kiểm kê<input id="k-counter" list="dl-people" value="${esc(d.counter)}"></label>
        <label class="field">Thủ kho<input id="k-keeper" list="dl-people" value="${esc(d.keeper)}"></label>
        <label class="field">Ngưỡng lệch cho phép (%)<input id="k-thr" class="num" value="${fmt(d.threshold * 100)}"></label>
      </div>${datalist('dl-people', S.meta.people)}
      <p class="hint">Tồn sổ sách lấy theo sổ đến hết ngày kiểm kê${d.snapshot_at ? ' (chốt lúc ' + esc(d.snapshot_at) + ')' : ''}. Nếu sau đó có thêm phiếu trong ngày, bấm "Cập nhật tồn sổ".</p></div>
      <div id="k-kpi" class="kpis"></div>
      <div class="toolbar"><label class="field">Nhóm<select id="k-grp">${options(groups, view.grp, 'Tất cả')}</select></label>
        <label class="field grow">Tìm<input id="k-q" value="${esc(view.q)}"></label>
        <label class="check"><input type="checkbox" id="k-diff" ${view.onlyDiff ? 'checked' : ''}> Chỉ dòng lệch</label></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Nhóm</th><th class="num">Tồn sổ sách</th>
        <th class="num" style="width:120px">Tồn thực tế (đếm/cân)</th><th class="num">Chênh lệch</th><th class="num">% lệch</th><th class="num">Giá trị lệch</th><th>Đánh giá</th><th style="min-width:180px">Nguyên nhân / Hướng xử lý</th></tr></thead>
        <tbody id="k-rows"></tbody></table></div>
      <div class="form-actions">
        <button class="btn primary" id="k-save">💾 Lưu biên bản</button>
        <button class="btn" id="k-print">🖨 In biên bản</button>
        <button class="btn" id="k-print-blank">🖨 In phiếu đếm (ẩn tồn sổ)</button>
        <button class="btn" id="k-refresh">↻ Cập nhật tồn sổ</button>
        <button class="btn" id="k-adj">→ Tạo phiếu điều chỉnh (DCK) từ chênh lệch</button>
        ${doc.id ? '<button class="btn danger" id="k-del">Xóa</button>' : ''}
        <a class="btn ghost" href="#/kiem-ke">← Danh sách</a></div>`;
    drawRows();
    $('#k-date').onchange = async () => { doc.date = $('#k-date').value; markDirty(); if ((await ask('Đổi ngày: lấy lại tồn sổ theo ngày mới? (giữ số đã đếm)'))) { await fetchBook(true); drawRows(); } };
    $('#k-counter').oninput = () => { d.counter = $('#k-counter').value; markDirty(); };
    $('#k-keeper').oninput = () => { d.keeper = $('#k-keeper').value; markDirty(); };
    $('#k-thr').oninput = () => { const n = parseNum($('#k-thr').value); if (n !== null && !isNaN(n)) { d.threshold = n / 100; markDirty(); drawRows(); } };
    $('#k-grp').onchange = () => { view.grp = $('#k-grp').value; drawRows(); };
    $('#k-q').oninput = debounce(() => { view.q = $('#k-q').value; drawRows(); }, 200);
    $('#k-diff').onchange = () => { view.onlyDiff = $('#k-diff').checked; drawRows(); };
    $('#k-save').onclick = () => guard(() => { doc.title = summaryTitle(); return saveDoc(doc).then(() => draw()); });
    $('#k-print').onclick = () => printStocktake(false);
    $('#k-print-blank').onclick = () => printStocktake(true);
    $('#k-refresh').onclick = async () => { if (!(await ask('Lấy lại tồn sổ sách theo sổ hiện tại? Số đã đếm được giữ nguyên.'))) return; await guard(() => fetchBook(true)); markDirty(); drawRows(); };
    $('#k-adj').onclick = makeAdjustment;
    if (doc.id) $('#k-del').onclick = () => deleteDoc(doc);
  }
  function summaryTitle() {
    const counted = d.rows.filter(r => calc(r).diff !== null);
    const off = counted.filter(r => calc(r).diff !== 0).length;
    return `Đã đếm ${counted.length} mã · ${off} mã lệch · Người kiểm kê: ${d.counter || '—'}`;
  }
  function drawKpi() {
    let counted = 0, ok = 0, over = 0, plus = 0, minus = 0;
    d.rows.forEach(r => { const c = calc(r); if (c.diff === null) return; counted++; if (c.diff === 0) ok++; if (c.ev.includes('vượt')) over++; if (c.val > 0) plus += c.val; else minus += c.val; });
    $('#k-kpi').innerHTML = `<div class="kpi"><div class="k-label">Số mã đã đếm</div><div class="k-val">${counted}/${d.rows.length}</div></div>
      <div class="kpi"><div class="k-label">Khớp</div><div class="k-val">${ok}</div></div>
      <div class="kpi ${over ? 'bad' : ''}"><div class="k-label">Lệch vượt ngưỡng</div><div class="k-val">${over}</div></div>
      <div class="kpi"><div class="k-label">Giá trị thừa (đ)</div><div class="k-val">${money(plus)}</div></div>
      <div class="kpi"><div class="k-label">Giá trị thiếu (đ)</div><div class="k-val">${money(minus)}</div></div>`;
  }
  function drawRows() {
    const tb = $('#k-rows');
    tb.innerHTML = '';
    d.rows.forEach((r, i) => {
      if (view.grp && r.grp !== view.grp) return;
      if (view.q && !matches(view.q, r.code + ' ' + r.name)) return;
      if (view.onlyDiff) { const c = calc(r); if (c.diff === null || c.diff === 0) return; }
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${esc(r.code)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="small">${esc(r.grp)}</td>
        <td class="num">${fmt(r.book)}</td><td><input class="num" inputmode="decimal" data-k="actual" value="${r.actual === null || r.actual === undefined ? '' : esc(fmt(r.actual))}"></td>
        <td class="num" data-o="diff"></td><td class="num" data-o="pct"></td><td class="num" data-o="val"></td><td data-o="ev"></td>
        <td><input data-k="cause" value="${esc(r.cause || '')}"></td>`;
      const upd = () => {
        const c = calc(r);
        $('[data-o=diff]', tr).innerHTML = c.diff === null ? '' : `<span class="${c.diff < 0 ? 'neg' : c.diff > 0 ? 'pos' : ''}">${fmt(c.diff)}</span>`;
        $('[data-o=pct]', tr).textContent = c.diff === null ? '' : fmt(c.pct * 100, 1) + '%';
        $('[data-o=val]', tr).textContent = c.diff === null || !c.val ? '' : money(c.val);
        $('[data-o=ev]', tr).innerHTML = c.diff === null ? '' : `<span class="badge ${c.ev === 'Khớp' ? 'ok' : c.ev.includes('vượt') ? 'bad' : 'warn'}">${esc(c.ev)}</span>`;
        drawKpi();
      };
      $('[data-k=actual]', tr).oninput = e => { const n = parseNum(e.target.value); r.actual = n === null || isNaN(n) ? null : n; markDirty(); upd(); };
      $('[data-k=actual]', tr).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const nx = tr.nextElementSibling; if (nx) $('[data-k=actual]', nx).focus(); } };
      $('[data-k=cause]', tr).oninput = e => { r.cause = e.target.value; markDirty(); };
      tb.appendChild(tr);
      upd();
    });
    drawKpi();
  }
  function printStocktake(blind) {
    const rows = d.rows.filter(r => !view.grp || r.grp === view.grp);
    const body = rows.map((r, i) => {
      const c = calc(r);
      return blind
        ? `<tr><td class="c">${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td><td style="height:22px"></td><td></td></tr>`
        : `<tr><td class="c">${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td><td class="n">${fmt(r.book)}</td>
          <td class="n">${c.diff === null ? '' : fmt(r.actual)}</td><td class="n">${c.diff === null ? '' : fmt(c.diff)}</td><td class="n">${c.diff === null ? '' : fmt(c.pct * 100, 1) + '%'}</td>
          <td class="n">${c.val ? money(c.val) : ''}</td><td>${c.diff === null ? '' : esc(c.ev)}</td><td>${esc(r.cause || '')}</td></tr>`;
    }).join('');
    printHtml(`<div class="doc ${blind ? '' : 'landscape'}">${docHead('', '')}<div class="d-title">${blind ? 'Phiếu đếm kiểm kê kho' : 'Biên bản kiểm kê kho'}</div>
      <div class="d-sub">Thời điểm kiểm kê: ngày ${vnDate(doc.date)}</div>
      <div class="d-info"><div>Người kiểm kê: <b>${esc(d.counter)}</b> &nbsp;&nbsp; Thủ kho: <b>${esc(d.keeper)}</b>${blind ? '' : ` &nbsp;&nbsp; Ngưỡng lệch cho phép: ${fmt(d.threshold * 100)}%`}</div></div>
      <table class="t"><thead><tr>${blind ? '<th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th style="width:22%">Tồn thực tế (đếm/cân)</th><th style="width:20%">Ghi chú</th>'
        : '<th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Tồn sổ sách</th><th>Tồn thực tế</th><th>Chênh lệch</th><th>% lệch</th><th>Giá trị lệch (đ)</th><th>Đánh giá</th><th>Nguyên nhân / Hướng xử lý</th>'}</tr></thead>
      <tbody>${body}</tbody></table>
      ${signBlock([['Người kiểm kê', d.counter], ['Thủ kho', d.keeper], ['Kế toán', '']])}</div>`, blind ? 'portrait' : 'landscape', (blind ? 'phieu-dem-' : 'kiem-ke-') + doc.date);
  }
  async function makeAdjustment() {
    const rows = d.rows.filter(r => { const c = calc(r); return c.diff !== null && c.diff !== 0; });
    if (!rows.length) return toast('Không có dòng chênh lệch để điều chỉnh', true);
    if (S.dirty && !(await ask('Biên bản chưa lưu. Vẫn tạo phiếu điều chỉnh? (nên Lưu trước)'))) return;
    store('voucherDraft', {
      wh: S.wh, type: 'D', date: doc.date, from_party: S.meta.warehouse.name, giver: d.counter, receiver: d.keeper,
      reason: 'Điều chỉnh về theo số kiểm kê thực tế', doc_ref: 'Biên bản kiểm kê ngày ' + vnDate(doc.date),
      lines: rows.map(r => ({ product_code: r.code, qty: calc(r).diff, price: r.price || 0, note: r.cause || '' })),
    });
    S.dirty = false;
    go('#/phieu/moi?type=D&draft=1');
  }
  draw();
}

/* ============================================================ Bàn giao kho */
async function viewHandover(main, m) {
  const doc = await loadDoc('handover', m[1]);
  const d = doc.data;
  Object.assign(d, Object.assign({ warehouse: S.meta.warehouse.name, giver_name: S.user, giver_title: '', receiver_name: '', receiver_title: '', witness: '',
    reason: 'Bàn giao ca', scope: 'Tất cả', conclusion: '', rows: [] }, d));
  setTitle('Biên bản bàn giao hàng tồn kho');
  const groups = Array.from(new Set(S.meta.products.map(p => p.grp).filter(Boolean)));

  async function fetchRows() {
    const stock = await api('GET', '/report/stock?date=' + doc.date);
    const old = Object.fromEntries(d.rows.map(r => [r.code, r]));
    d.rows = activeProducts().filter(p => Math.abs(stock[p.code] || 0) > 1e-9 && (d.scope === 'Tất cả' || !d.scope || p.grp === d.scope)).map(p => {
      const o = old[p.code] || {};
      return { code: p.code, name: p.name, unit: p.unit, grp: p.grp, price: p.price || 0, book: stock[p.code] || 0,
        actual: o.actual === undefined ? null : o.actual, status: o.status || 'Tốt', note: o.note || '' };
    });
  }
  if (!doc.id) await fetchRows();
  const val = r => ((r.actual === null || r.actual === undefined) ? r.book : r.actual) * (r.price || 0);

  function draw() {
    main.innerHTML = `<div class="card"><div class="grid c4">
      <label class="field">Ngày bàn giao<input type="date" id="h-date" value="${doc.date}"></label>
      <label class="field">Kho<input id="h-wh" value="${esc(d.warehouse)}"></label>
      <label class="field">Lý do bàn giao<select id="h-reason">${options(HANDOVER_REASONS, d.reason)}</select></label>
      <label class="field">Phạm vi hàng<select id="h-scope">${options(['Tất cả'].concat(groups), d.scope)}</select></label>
      <label class="field">Bên giao – Họ tên<input id="h-gn" list="dl-people" value="${esc(d.giver_name)}"></label>
      <label class="field">Bên giao – Chức vụ<input id="h-gt" value="${esc(d.giver_title)}"></label>
      <label class="field">Bên nhận – Họ tên<input id="h-rn" list="dl-people" value="${esc(d.receiver_name)}"></label>
      <label class="field">Bên nhận – Chức vụ<input id="h-rt" value="${esc(d.receiver_title)}"></label>
      <label class="field span2">Người chứng kiến (họ tên / chức vụ)<input id="h-w" value="${esc(d.witness)}"></label>
      <label class="field span2">Ý kiến / kết luận<input id="h-c" value="${esc(d.conclusion)}"></label>
      </div>${datalist('dl-people', S.meta.people)}
      <p class="hint">Danh sách gồm các mã có tồn sổ ≠ 0 tính đến hết ngày bàn giao. Đổi ngày / phạm vi rồi bấm "Lấy lại danh sách tồn".</p></div>
      <div id="h-kpi" class="kpis"></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng hóa</th><th>ĐVT</th><th class="num">Tồn sổ sách</th>
      <th class="num" style="width:120px">SL thực tế bàn giao</th><th class="num">Chênh lệch</th><th class="num">Giá trị tồn</th><th>Tình trạng hàng</th><th>Ghi chú</th></tr></thead><tbody id="h-rows"></tbody></table></div>
      <div class="form-actions"><button class="btn primary" id="h-save">💾 Lưu biên bản</button><button class="btn" id="h-print">🖨 In biên bản</button>
      <button class="btn" id="h-refresh">↻ Lấy lại danh sách tồn</button>${doc.id ? '<button class="btn danger" id="h-del">Xóa</button>' : ''}<a class="btn ghost" href="#/ban-giao">← Danh sách</a></div>`;
    const b = (id, k) => { $(id).oninput = $(id).onchange = () => { d[k] = $(id).value; markDirty(); }; };
    b('#h-wh', 'warehouse'); b('#h-reason', 'reason'); b('#h-gn', 'giver_name'); b('#h-gt', 'giver_title'); b('#h-rn', 'receiver_name');
    b('#h-rt', 'receiver_title'); b('#h-w', 'witness'); b('#h-c', 'conclusion');
    $('#h-date').onchange = () => { doc.date = $('#h-date').value; markDirty(); };
    $('#h-scope').onchange = () => { d.scope = $('#h-scope').value; markDirty(); };
    $('#h-refresh').onclick = async () => { await guard(fetchRows); markDirty(); drawRows(); };
    $('#h-save').onclick = () => guard(() => { doc.title = `${d.reason}: ${d.giver_name || '—'} → ${d.receiver_name || '—'} (${d.rows.length} mã)`; return saveDoc(doc).then(draw); });
    $('#h-print').onclick = printIt;
    if (doc.id) $('#h-del').onclick = () => deleteDoc(doc);
    drawRows();
  }
  function stats() {
    const counted = d.rows.filter(r => r.actual !== null && r.actual !== undefined);
    return { n: d.rows.length, counted: counted.length, off: counted.filter(r => Math.abs(r.actual - r.book) > 1e-9).length,
      bad: d.rows.filter(r => r.status && r.status !== 'Tốt').length, value: d.rows.reduce((a, r) => a + val(r), 0) };
  }
  function drawKpi() {
    const st = stats();
    $('#h-kpi').innerHTML = `<div class="kpi"><div class="k-label">Số mã bàn giao</div><div class="k-val">${st.n}</div></div>
      <div class="kpi"><div class="k-label">Đã đếm</div><div class="k-val">${st.counted}</div></div>
      <div class="kpi ${st.off ? 'bad' : ''}"><div class="k-label">Mã lệch</div><div class="k-val">${st.off}</div></div>
      <div class="kpi ${st.bad ? 'warn' : ''}"><div class="k-label">Mã có vấn đề</div><div class="k-val">${st.bad}</div></div>
      <div class="kpi"><div class="k-label">Giá trị tồn (đ)</div><div class="k-val">${money(st.value)}</div></div>`;
  }
  function drawRows() {
    const tb = $('#h-rows');
    tb.innerHTML = '';
    d.rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${esc(r.code)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="num">${fmt(r.book)}</td>
        <td><input class="num" inputmode="decimal" data-k="actual" value="${r.actual === null || r.actual === undefined ? '' : esc(fmt(r.actual))}"></td>
        <td class="num" data-o="diff"></td><td class="num" data-o="val"></td><td><select data-k="status">${options(ITEM_STATUS, r.status)}</select></td>
        <td><input data-k="note" value="${esc(r.note)}"></td>`;
      const upd = () => {
        const has = r.actual !== null && r.actual !== undefined;
        const df = has ? +(r.actual - r.book).toFixed(6) : null;
        $('[data-o=diff]', tr).innerHTML = df === null ? '' : `<span class="${df < 0 ? 'neg' : df > 0 ? 'pos' : ''}">${fmt(df)}</span>`;
        $('[data-o=val]', tr).textContent = fmtBlank0(Math.round(val(r)));
        drawKpi();
      };
      $('[data-k=actual]', tr).oninput = e => { const n = parseNum(e.target.value); r.actual = n === null || isNaN(n) ? null : n; markDirty(); upd(); };
      $('[data-k=actual]', tr).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const nx = tr.nextElementSibling; if (nx) $('[data-k=actual]', nx).focus(); } };
      $('[data-k=status]', tr).onchange = e => { r.status = e.target.value; markDirty(); drawKpi(); };
      $('[data-k=note]', tr).oninput = e => { r.note = e.target.value; markDirty(); };
      tb.appendChild(tr);
      upd();
    });
    if (!d.rows.length) tb.innerHTML = '<tr><td colspan="10" class="muted">Không có mã nào còn tồn trong phạm vi này.</td></tr>';
    drawKpi();
  }
  function printIt() {
    const st = stats();
    const no = 'BG-' + doc.date.replace(/-/g, '');
    printHtml(`<div class="doc landscape">${docHead('Biên bản nội bộ', 'Số: ' + no)}<div class="d-title">Biên bản bàn giao hàng tồn kho</div>
      <div class="d-info"><div>Ngày: <b>${vnDate(doc.date)}</b> &nbsp;&nbsp; Kho: <b>${esc(d.warehouse)}</b></div>
      <div>BÊN GIAO: Họ tên: <b>${esc(d.giver_name)}</b> &nbsp; Chức vụ: ${esc(d.giver_title)}</div>
      <div>BÊN NHẬN: Họ tên: <b>${esc(d.receiver_name)}</b> &nbsp; Chức vụ: ${esc(d.receiver_title)}</div>
      <div>CHỨNG KIẾN: ${esc(d.witness)}</div><div>Lý do bàn giao: ${esc(d.reason)} &nbsp;&nbsp; Phạm vi hàng: ${esc(d.scope)}</div>
      <div>→ Hai bên cùng kiểm đếm và bàn giao ${st.n} mã hàng có tồn như sau:</div></div>
      <table class="t"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng hóa</th><th>ĐVT</th><th>Tồn sổ sách</th><th>SL thực tế bàn giao</th><th>Chênh lệch</th><th>Giá trị tồn (đ)</th><th>Tình trạng hàng</th><th>Ghi chú</th></tr></thead>
      <tbody>${d.rows.map((r, i) => { const has = r.actual !== null && r.actual !== undefined; return `<tr><td class="c">${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td>
        <td class="n">${fmt(r.book)}</td><td class="n">${has ? fmt(r.actual) : ''}</td><td class="n">${has ? fmt(+(r.actual - r.book).toFixed(6)) : ''}</td><td class="n">${fmtBlank0(Math.round(val(r)))}</td>
        <td>${esc(r.status)}</td><td>${esc(r.note)}</td></tr>`; }).join('')}
      <tr class="sum"><td colspan="4" class="c">CỘNG</td><td class="n">${st.n} mã</td><td class="n">Đã đếm ${st.counted}</td><td class="n">${st.off} mã lệch</td><td class="n">${money(st.value)}</td><td>${st.bad} mã có vấn đề</td><td></td></tr></tbody></table>
      <div class="d-foot"><div>Ý kiến / kết luận: ${esc(d.conclusion) || dots}</div>
      <div>Bên nhận đã kiểm đếm và nhận đủ số lượng hàng tồn theo cột "SL thực tế bàn giao" và chịu trách nhiệm quản lý kể từ thời điểm bàn giao.</div></div>
      ${signBlock([['Bên giao', d.giver_name], ['Bên nhận', d.receiver_name], ['Người chứng kiến', d.witness], ['Quản lý / Kế toán', '']])}</div>`, 'landscape', no);
  }
  draw();
}

/* ============================================================ Phân tuyến giao hàng (kho TP) */
// Danh sách khách đặt hàng mỗi ngày (sheet "14.10"… của file báo cáo tuyến lẻ): lấy khách TRẠNG THÁI = HOẠT ĐỘNG,
// tự gán tuyến theo cột QUẬN / địa chỉ (quy tắc từ khóa sửa được), tuyến chọn tay được nhớ theo mã khách.
const DEFAULT_ROUTE_RULES = [
  { code: 'HM', kw: 'hóc môn, củ chi' },
  { code: 'TBTP', kw: 'tân bình, tân phú' },
  { code: 'BTBC', kw: 'bình tân, bình chánh' },
  { code: 'TD', kw: 'thủ đức, quận 2, quận 9' },
  { code: 'BTH', kw: 'bình thạnh' },
  { code: 'GV', kw: 'gò vấp' },
  { code: 'BD', kw: 'bình dương, thủ dầu một, dĩ an, thuận an, bến cát, tân uyên' },
  { code: 'Q12', kw: 'quận 12' },
  { code: 'Q1PN', kw: 'quận 1, phú nhuận, quận 3, quận 8' },
  { code: 'Qle', kw: 'quận 4, quận 5, quận 6, quận 7, quận 10, quận 11, nhà bè, cần giờ' },
  { code: 'AS', kw: 'chành xe' },
];
// Cột không lấy vào số lượng giao (vd "SỐ TÚI 50" – kho không cần cập nhật)
const SKIP_COL = h => /(^| )tui( |$)/.test(h);
const RT_META = ['quan', 'tuyen', 'crm', 'khach', 'sdt', 'ghi chu', 'bill', 'nguoi', 'trang thai', 'tinh trang', 'cong no', 'tai xe'];
function normPlace(s) {
  return ' ' + noAccent(s).replace(/[^a-z0-9]+/g, ' ').replace(/\b(?:q|quan)\s*(\d{1,2})\b/g, 'quan $1').replace(/\s+/g, ' ').trim() + ' ';
}
function routingCfg() {
  const r = S.meta.settings.routing || {};
  return { rules: (r.rules && r.rules.length ? r.rules : DEFAULT_ROUTE_RULES).map(x => ({ code: x.code, kw: x.kw || '' })), memory: Object.assign({}, r.memory) };
}
function routeList() {
  const seen = new Set();
  return S.meta.routes.filter(r => { const c = r.code.trim(); if (!c || seen.has(c.toLowerCase())) return false; seen.add(c.toLowerCase()); return true; })
    .map(r => ({ code: r.code.trim(), name: r.name.trim() }));
}
// Tìm tuyến theo từ khóa; cột Quận lấy từ khóa đứng trước nhất, địa chỉ lấy từ khóa đứng sau cùng (quận thường ở cuối địa chỉ)
function matchRule(textIn, rules, fromEnd) {
  const hay = normPlace(textIn);
  if (hay.trim() === '') return '';
  let best = null;
  for (const r of rules) {
    for (const k of String(r.kw).split(/[,;\n]/)) {
      const kw = normPlace(k);
      if (kw.trim() === '') continue;
      const pos = fromEnd ? hay.lastIndexOf(kw) : hay.indexOf(kw);
      if (pos < 0) continue;
      const better = !best || (fromEnd ? pos > best.pos : pos < best.pos) || (pos === best.pos && kw.length > best.len);
      if (better) best = { pos, len: kw.length, code: r.code };
    }
  }
  return best ? best.code : '';
}
// Mã CRM (cột CRM) dùng làm mã khách chính; dòng chưa có mã CRM thì dùng mã đầu tên khách (K1326, KH0306…)
const crmCode = s => String(s || '').replace(/\s+/g, '').toUpperCase();
const custKeys = row => [row.crm, row.code].map(crmCode).filter(Boolean);
// Sheet "khách tuyến 1-2-3": tuyến ghi sẵn ở cột A (T1, T 3, "chiều … giao") -> mã tuyến trong danh mục (trùng mã, hoặc từ khóa
// trong Quy tắc chia tuyến, vd ghi "t1, t2" cho tuyến kebab đêm); không khớp thì dùng chính nhãn trong sheet làm mã tuyến
// Mặc định của kho: T1, T2 = tuyến kebab đêm; T3 = khách qua lấy (tuyến 3 kebab); "chiều … giao" = tuyến kebab chiều (Cương)
const SHEET_ROUTE_DEFAULTS = [
  [/^t\s*[12]$/, ['kebabdem', 'tuyen1+2']],
  [/^t\s*3$/, ['tuyen3']],
  [/^chieu/, ['kebabchieu']],
];
function sheetRouteCode(label, cfg) {
  const lb = String(label || '').replace(/\s+/g, ' ').trim();
  const tn = lb.match(/^t\s*(\d+)$/i);
  const code = tn ? 'T' + tn[1] : lb;
  const flat = x => noAccent(x).replace(/\s+/g, '');
  const routes = routeList();
  const hit = routes.find(r => flat(r.code) === flat(code));
  if (hit) return hit.code;
  const byRule = matchRule(code, cfg.rules, false);
  if (byRule) return byRule;
  for (const [re, keys] of SHEET_ROUTE_DEFAULTS) {
    if (!re.test(noAccent(lb))) continue;
    const r = routes.find(x => keys.some(k => flat(x.code).includes(k) || flat(x.name).includes(k)));
    if (r) return r.code;
  }
  return code;
}
function autoRoute(row, cfg) {
  if (row.grp) return [sheetRouteCode(row.grp, cfg), 'cột tuyến của sheet'];
  if (row.rt) return [sheetRouteCode(row.rt, cfg), 'web đóng hàng'];
  const key = custKeys(row).find(k => cfg.memory[k]);
  if (key) return [cfg.memory[key], 'nhớ'];
  let c = matchRule(row.q, cfg.rules, false);
  if (c) return [c, 'quận'];
  c = matchRule(row.addr || row.cust, cfg.rules, true);
  return c ? [c, 'địa chỉ'] : ['', ''];
}
// Bảng dán từ Google Sheet / Excel: ưu tiên dạng HTML (giữ đúng ô có xuống dòng), không có thì đọc dạng chữ (tab / dấu phẩy)
function tableFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const t = doc.querySelector('table');
  if (!t) return null;
  // ô gộp nhiều dòng (rowspan, vd cột Tuyến của sheet tuyến 1-2-3) được chép xuống từng dòng để cột không bị lệch
  const rows = [], carry = [];
  t.querySelectorAll('tr').forEach((tr, ri) => {
    const r = [];
    let ci = 0;
    const fill = () => { while (carry[ci] && carry[ci].until > ri) { r.push(carry[ci].text); ci++; } };
    for (const td of tr.querySelectorAll('td,th')) {
      fill();
      const text = (td.innerText || td.textContent || '').trim();
      const cs = +td.getAttribute('colspan') || 1, rs = +td.getAttribute('rowspan') || 1;
      for (let i = 0; i < cs; i++) {
        r.push(i ? '' : text);
        carry[ci] = rs > 1 ? { until: ri + rs, text: i ? '' : text } : null;
        ci++;
      }
    }
    fill();
    rows.push(r);
  });
  return rows;
}
function tableFromText(txt) {
  const first = (txt.split('\n')[0] || '');
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) {
      if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function splitCustomer(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(k\s?h?\s?\d+[a-z]?)\s*[-–:]\s*(.*)$/i);
  let code = '', rest = t;
  if (m) { code = m[1].replace(/\s/g, '').toUpperCase(); rest = m[2]; }
  const i = rest.search(/\s[-–]\s/);
  return i < 0 ? { code, name: rest, addr: '' } : { code, name: rest.slice(0, i).trim(), addr: rest.slice(i).replace(/^\s*[-–]\s*/, '').trim() };
}
// Đọc bảng của 1 sheet ngày -> { cols: tên cột sản phẩm, rows: khách đang HOẠT ĐỘNG, total, skipped }
function parseOrderSheet(table) {
  const H = c => noAccent(c).replace(/\s+/g, ' ').trim();
  const t123 = parseRouteGroupSheet(table, H);
  if (t123) return t123;
  let hi = table.findIndex((r, i) => i < 15 && r.some(c => H(c) === 'quan') && r.some(c => H(c).startsWith('trang thai')));
  let col, cols = [], pcols = [];
  if (hi >= 0) {
    const h = table[hi].map(H);
    const find = f => h.findIndex(f);
    col = { q: find(x => x === 'quan'), crm: find(x => x === 'crm'), cust: find(x => x.startsWith('khach')), phone: find(x => x.includes('sdt') || x.includes('dien thoai')),
      note: find(x => x.startsWith('ghi chu')), status: find(x => x.startsWith('trang thai')), pay: find(x => x.startsWith('tinh trang')),
      rt: find(x => x === 'tuyen') }; // cột TUYẾN: tuyến web Đóng hàng An Tâm đã chia sẵn
    const lastMeta = h.reduce((a, x, i) => (RT_META.some(k => x.startsWith(k)) ? i : a), -1);
    h.forEach((x, i) => { if (i > lastMeta && x && !SKIP_COL(x)) { pcols.push(i); cols.push(String(table[hi][i]).replace(/\s+/g, ' ').trim()); } });
  } else {
    // dán không kèm dòng tiêu đề: dùng vị trí cột của mẫu báo cáo (A Quận, B CRM, C Khách, D SĐT, E Ghi chú, I Trạng thái, J Tình trạng, P→AE sản phẩm)
    col = { q: 0, crm: 1, cust: 2, phone: 3, note: 4, status: 8, pay: 9, rt: -1 };
    cols = ['22 CM', '25 CM', '28 CM', '31 CM', '34 CM', 'BÁNH TƯƠI 1', 'BÁNH TƯƠI 2', 'BÁNH TƯƠI 3', 'BÁNH TƯƠI 4', 'VÀNG', 'MÈ ĐEN', 'MÈ TRẮNG', 'THAN TRE', 'CÂY THỊT 5KG', 'CÂY THỊT 18KG', 'SẢN PHẨM KHÁC'];
    pcols = cols.map((_, i) => 15 + i);
  }
  const g = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).replace(/\s+/g, ' ').trim() : '');
  const rows = []; let total = 0;
  for (const r of table.slice(hi + 1)) {
    const cust = g(r, col.cust);
    if (!cust || H(cust).startsWith('khach dat hang')) continue;
    total++;
    if (!H(g(r, col.status)).includes('hoat dong')) continue;
    const qty = {};
    pcols.forEach((ci, k) => { const n = parseNum(r[ci]); if (n && !isNaN(n)) qty[k] = n; });
    const c = splitCustomer(cust);
    rows.push({ q: g(r, col.q), crm: crmCode(g(r, col.crm)), cust, code: c.code, name: c.name, addr: c.addr, phone: g(r, col.phone), note: g(r, col.note),
      pay: g(r, col.pay), qty, route: '', src: '', rt: g(r, col.rt) });
  }
  return { cols, rows, total, header: hi >= 0 };
}
// Mẫu "2-KHÁCH TUYẾN 123": A = tuyến (ô gộp), B CRM, C Tên khách hàng (địa chỉ), D SĐT, E trạng thái (không tiêu đề),
// các cột sản phẩm (22CM, 25 CM, …, VÀNG, ĐEN, CÂY THỊT (KG)), GHI CHÚ; bỏ dòng TỔNG BÁNH / DOANH THU
function parseRouteGroupSheet(table, H) {
  const hi = table.findIndex((r, i) => i < 15 && r.some(c => H(c) === 'crm') && r.some(c => H(c).startsWith('ten khach')) && !r.some(c => H(c) === 'quan'));
  if (hi < 0) return null;
  const h = table[hi].map(H);
  const find = f => h.findIndex(f);
  const col = { crm: find(x => x === 'crm'), cust: find(x => x.startsWith('ten khach')), phone: find(x => x.includes('sdt') || x.includes('dien thoai')),
    note: find(x => x.startsWith('ghi chu')) };
  const body = table.slice(hi + 1);
  // cột trạng thái: cột có nhiều ô "HOẠT ĐỘNG" / "NGHỈ" nhất
  let status = -1, best = 0;
  for (let c = 0; c < h.length; c++) {
    const n = body.filter(r => /^(hoat dong|nghi)$/.test(H(r[c] || ''))).length;
    if (n > best) { best = n; status = c; }
  }
  const pcols = [], cols = [];
  h.forEach((x, i) => { if (i > Math.max(col.phone, status) && x && !SKIP_COL(x) && (col.note < 0 || i < col.note)) { pcols.push(i); cols.push(String(table[hi][i]).replace(/\s+/g, ' ').trim()); } });
  const g = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).replace(/\s+/g, ' ').trim() : '');
  const rows = []; let total = 0, grp = '';
  for (const r of body) {
    if (g(r, 0)) grp = g(r, 0);
    const cust = g(r, col.cust);
    const hc = H(cust);
    if (!cust || hc.startsWith('tong banh') || hc.startsWith('doanh thu')) continue;
    total++;
    if (status >= 0 && H(g(r, status)) !== 'hoat dong') continue;
    const qty = {};
    pcols.forEach((ci, k) => { const n = parseNum(String(r[ci] == null ? '' : r[ci]).replace(/\s*kg\s*$/i, '')); if (n && !isNaN(n)) qty[k] = n; });
    const c = splitCustomer(cust);
    rows.push({ q: '', crm: crmCode(g(r, col.crm)), cust, code: c.code, name: c.name, addr: c.addr || c.name, phone: g(r, col.phone), note: g(r, col.note),
      pay: '', qty, route: '', src: '', grp });
  }
  return { cols, rows, total, header: true };
}
function sheetNameFor(iso) {
  const [, m, d] = iso.split('-');
  return [`${+d}.${+m}`, `${d}.${m}`, `${+d}.${m}`, `${d}.${+m}`, `${+d}/${+m}`, `${d}-${m}`];
}

async function viewRoutingList(main) {
  setTitle('Phân tuyến giao hàng');
  const list = await api('GET', '/docs?kind=routing');
  main.innerHTML = `<div class="toolbar"><a class="btn primary" href="#/phan-tuyen/moi">+ Phân tuyến ngày mới</a>
    <button class="btn" id="rt-rules">⚙ Quy tắc chia tuyến</button></div>
    <div class="callout">Mỗi ngày: mở file báo cáo tuyến lẻ trên Google Sheet, chọn sheet của ngày (vd <b>14.10</b>), bấm <kbd>Ctrl</kbd>+<kbd>A</kbd> rồi
    <kbd>Ctrl</kbd>+<kbd>C</kbd>, vào <b>Phân tuyến ngày mới</b> và dán vào ô. Web lấy các khách có <b>TRẠNG THÁI = HOẠT ĐỘNG</b>, tự chia vào tuyến theo cột QUẬN /
    địa chỉ, rồi in danh sách giao từng tuyến.<br>File <b>"2-KHÁCH TUYẾN 123"</b> (tuyến đã sắp sẵn ở cột A) làm một <b>Phân tuyến ngày mới</b> riêng cùng ngày:
    T1, T2 → tuyến kebab đêm, T3 → tuyến 3 khách qua lấy, "chiều … giao" → kebab chiều (Cương). Người giao thấy gộp cả hai bảng của ngày.</div>
    ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Cập nhật</th></tr></thead><tbody>
    ${list.map(d => `<tr class="clickable" data-id="${d.id}"><td>${vnDate(d.date)}</td><td>${esc(d.title)}</td><td class="small muted">${esc(d.updated_at)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Chưa có ngày nào được phân tuyến.</p>'}`;
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go(`#/phan-tuyen/${tr.dataset.id}`));
  $('#rt-rules').onclick = () => editRouteRules();
}
function editRouteRules(onDone) {
  if (VIEW) return;
  const cfg = routingCfg();
  const routes = routeList();
  const byCode = Object.fromEntries(cfg.rules.map(r => [r.code.toLowerCase(), r.kw]));
  const nMem = Object.keys(cfg.memory).length;
  const { root } = openModal({
    title: 'Quy tắc chia tuyến tự động', wide: true,
    body: `<p class="hint" style="margin-top:0">Mỗi tuyến ghi các <b>quận / huyện / tỉnh</b> thuộc tuyến, cách nhau bằng dấu phẩy (gõ có dấu hay không dấu đều được;
      "Q.7", "Q7" hiểu là "quận 7"). Web so với cột <b>QUẬN</b> trước, nếu không khớp thì so với <b>địa chỉ</b> của khách.
      Khách đã được chọn tuyến bằng tay sẽ luôn vào tuyến đó (đang nhớ ${nMem} khách).</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Tuyến</th><th>Quận / khu vực thuộc tuyến</th></tr></thead><tbody>
      ${routes.map(r => `<tr><td><b>${esc(r.code)}</b></td><td class="nm">${esc(r.name)}</td><td><input data-code="${esc(r.code)}" value="${esc(byCode[r.code.toLowerCase()] || '')}" style="width:100%"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm" id="rr-default">Dùng lại quy tắc mặc định</button>
      ${nMem ? '<button class="btn sm danger" id="rr-forget">Quên tuyến đã chọn tay của mọi khách</button>' : ''}</div>`,
    onSave: async () => {
      const rules = $$('input[data-code]', root).map(i => ({ code: i.dataset.code, kw: i.value.trim() })).filter(r => r.kw);
      const memory = root.dataset.forget ? {} : cfg.memory;
      await api('PUT', '/settings', { routing: { rules, memory } });
      await loadMeta();
      toast('Đã lưu quy tắc chia tuyến');
      if (onDone) onDone();
      return true;
    },
  });
  const def = $('#rr-default', root);
  if (def) def.onclick = () => {
    const d = Object.fromEntries(DEFAULT_ROUTE_RULES.map(r => [r.code.toLowerCase(), r.kw]));
    $$('input[data-code]', root).forEach(i => { i.value = d[i.dataset.code.toLowerCase()] || ''; });
  };
  const fg = $('#rr-forget', root);
  if (fg) fg.onclick = () => { root.dataset.forget = '1'; fg.disabled = true; fg.textContent = 'Sẽ quên khi bấm Lưu'; };
}

async function viewRouting(main, m) {
  const doc = await loadDoc('routing', m[1]);
  const d = doc.data;
  Object.assign(d, Object.assign({ sheet: '', cols: [], rows: [], total: 0 }, d));
  setTitle('Phân tuyến giao hàng ' + vnDate(doc.date));
  const routes = routeList();
  const rName = c => { const r = routes.find(x => x.code.toLowerCase() === String(c).toLowerCase()); return r ? r.name : ''; };
  const ui = { filter: '', search: '', file: null, sheets: [], paste: null };
  const changedMemory = {};
  // Người giao từng tuyến (chọn ở bảng tổng hợp; chưa chọn thì lấy người có tuyến thường chạy) + kết quả giao từ web giao hàng
  d.assign = Object.assign({}, d.assign);
  const drivers = (S.meta.drivers || []).filter(x => x.active);
  const driverName = id => { const x = (S.meta.drivers || []).find(v => v.id === id); return x ? x.name || x.nick : ''; };
  const routeDriver = code => routeDriverOf(d, code, S.meta.drivers || []);
  let deliv = {}, locs = {};
  async function loadDeliveries() {
    if (GIAO_LINKED) return; // kết quả giao nằm ở trang Giao hàng An Tâm
    [deliv, locs] = await Promise.all([guard(() => api('GET', '/deliveries?date=' + doc.date)), guard(() => api('GET', '/locations'))]);
    deliv = deliv || {}; locs = locs || {};
    if ($('#rt-body') && d.rows.length) { const y = window.scrollY; drawBody(); window.scrollTo(0, y); }
  }
  const delivOf = r => deliv[custKeyOf(r)] || null;

  function assignAll(keepManual) {
    const cfg = routingCfg();
    d.rows.forEach(r => { if (keepManual && r.src === 'tay') return; [r.route, r.src] = autoRoute(r, cfg); });
  }
  function load(table, sheet) {
    const p = parseOrderSheet(table);
    if (!p.rows.length) throw new Error(p.total ? `Có ${p.total} khách nhưng không ai ở trạng thái HOẠT ĐỘNG.` : 'Không đọc được danh sách khách. Hãy dán cả sheet (Ctrl+A rồi Ctrl+C trên Google Sheet).');
    const old = Object.fromEntries(d.rows.filter(r => r.src === 'tay').map(r => [r.cust, r.route]));
    Object.assign(d, { sheet: sheet || d.sheet, cols: p.cols, rows: p.rows, total: p.total });
    assignAll(false);
    d.rows.forEach(r => { if (old[r.cust] !== undefined) { r.route = old[r.cust]; r.src = 'tay'; } });
    markDirty();
    toast(`Đã lấy ${p.rows.length} khách hoạt động / ${p.total} khách trong sheet`);
  }
  function groups() {
    const g = new Map();
    for (const r of d.rows) { const k = r.route || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    const order = routes.map(r => r.code);
    return Array.from(g.entries()).sort((a, b) => {
      if (!a[0]) return 1; if (!b[0]) return -1;
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
    });
  }
  const sumQty = rows => { const s = {}; rows.forEach(r => Object.entries(r.qty || {}).forEach(([k, n]) => { s[k] = (s[k] || 0) + n; })); return s; };
  const qtyText = r => Object.entries(r.qty || {}).map(([k, n]) => `${esc(d.cols[k] || '?')}: <b>${fmt(n)}</b>`).join(' · ');

  function draw() {
    const sheetGuess = sheetNameFor(doc.date)[0];
    main.innerHTML = `<div class="card"><div class="grid c4">
      <label class="field">Ngày giao<input type="date" id="rt-date" value="${doc.date}"></label>
      <label class="field span2">Chọn file Excel / CSV đã tải về (nếu không dán)<input type="file" id="rt-file" accept=".xlsx,.csv,.tsv,.txt"></label>
      <label class="field" id="rt-sheet-wrap" ${ui.sheets.length ? '' : 'hidden'}>Sheet<select id="rt-sheet">${options(ui.sheets, d.sheet)}</select></label>
      </div>
      <div style="margin-top:10px"><div class="small muted" style="margin-bottom:4px">Dán danh sách khách của sheet ngày: trên Google Sheet chọn sheet <b>${esc(sheetGuess)}</b> →
        <kbd>Ctrl</kbd>+<kbd>A</kbd> → <kbd>Ctrl</kbd>+<kbd>C</kbd> → bấm vào ô dưới → <kbd>Ctrl</kbd>+<kbd>V</kbd></div>
        <textarea id="rt-paste" rows="2" placeholder="Dán vào đây…" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px"></textarea></div>
      <div class="form-actions" style="margin-top:6px"><button class="btn primary" id="rt-go">⚡ Lấy khách &amp; chia tuyến</button>
      <button class="btn" id="rt-rules">⚙ Quy tắc chia tuyến</button>
      ${d.rows.length ? '<button class="btn" id="rt-reauto">↻ Chia lại tự động (giữ tuyến chọn tay)</button>' : ''}</div>
      ${d.sheet ? `<p class="hint">Đang dùng: sheet <b>${esc(d.sheet)}</b> – ${d.rows.length} khách hoạt động / ${d.total} khách.</p>` : ''}</div>
      <div id="rt-body"></div>`;
    $('#rt-date').onchange = () => { doc.date = $('#rt-date').value; setTitle('Phân tuyến giao hàng ' + vnDate(doc.date)); markDirty(); loadDeliveries(); };
    const ta = $('#rt-paste');
    ta.onpaste = e => {
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      const t = html ? tableFromHtml(html) : null;
      if (t) { e.preventDefault(); ui.paste = t; ta.value = `(Đã dán ${t.length} dòng – bấm "Lấy khách & chia tuyến")`; }
      else ui.paste = null;
    };
    ta.oninput = () => { if (!ta.value.startsWith('(Đã dán')) ui.paste = null; };
    $('#rt-file').onchange = () => guard(async () => {
      const f = $('#rt-file').files[0];
      ui.file = f || null; ui.sheets = [];
      if (f && /\.xlsx$/i.test(f.name)) await readFile();
      else if (f) toast('Đã chọn ' + f.name + ' – bấm "Lấy khách & chia tuyến"');
    });
    $('#rt-sheet').onchange = () => guard(() => readFile($('#rt-sheet').value));
    $('#rt-go').onclick = () => guard(async () => {
      if (ui.paste) load(ui.paste, '(dán)');
      else if (ta.value.trim() && !ta.value.startsWith('(Đã dán')) load(tableFromText(ta.value), '(dán)');
      else if (ui.file && !/\.xlsx$/i.test(ui.file.name)) load(tableFromText(await ui.file.text()), ui.file.name);
      else if (ui.file) await readFile(d.sheet);
      else throw new Error('Hãy dán danh sách khách hoặc chọn file trước.');
      draw();
    });
    $('#rt-rules').onclick = () => editRouteRules(() => { if (d.rows.length) { assignAll(true); markDirty(); } draw(); });
    if ($('#rt-reauto')) $('#rt-reauto').onclick = () => { assignAll(true); markDirty(); draw(); toast('Đã chia lại theo quy tắc'); };
    drawBody();
  }
  async function readFile(sheet) {
    const f = ui.file;
    if (!f) return;
    const want = sheet || sheetNameFor(doc.date);
    const tryNames = Array.isArray(want) ? want : [want];
    let res = await api('POST', '/sheet-rows?sheet=' + encodeURIComponent(tryNames[0]), await f.arrayBuffer());
    const hit = tryNames.find(n => res.sheets.includes(n));
    if (hit && hit !== res.sheet) res = await api('POST', '/sheet-rows?sheet=' + encodeURIComponent(hit), await f.arrayBuffer());
    ui.sheets = res.sheets.slice().reverse();
    load(res.rows, res.sheet);
    draw();
  }

  function drawBody() {
    const box = $('#rt-body');
    if (!d.rows.length) { box.innerHTML = '<p class="muted">Chưa có danh sách khách.</p>'; return; }
    const gs = groups();
    const none = d.rows.filter(r => !r.route).length;
    const usedCols = Object.keys(sumQty(d.rows)).map(Number).sort((a, b) => a - b);
    box.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="k-label">Khách hoạt động</div><div class="k-val">${d.rows.length}</div></div>
      <div class="kpi"><div class="k-label">Số tuyến</div><div class="k-val">${gs.filter(g => g[0]).length}</div></div>
      <div class="kpi ${none ? 'bad' : ''}"><div class="k-label">Chưa có tuyến</div><div class="k-val">${none}</div></div>
      <div class="kpi"><div class="k-label">Khách trong sheet</div><div class="k-val">${d.total}</div></div></div>
      <h3 style="margin:14px 0 6px">Tổng hợp theo tuyến</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th>Tuyến</th><th style="width:190px">Người giao</th><th class="num">Số khách</th>${GIAO_LINKED ? '' : '<th class="num">Đã giao</th>'}${usedCols.map(k => `<th class="num">${esc(d.cols[k])}</th>`).join('')}</tr></thead><tbody>
      ${gs.map(([code, rows]) => { const s = sumQty(rows); const ok = rows.filter(r => (delivOf(r) || {}).status === 'ok').length; const bad = rows.filter(r => (delivOf(r) || {}).status === 'fail').length;
        return `<tr class="clickable ${code ? '' : 'row-bad'}" data-g="${esc(code)}"><td>${code ? `<b>${esc(code)}</b> ${esc(rName(code))}` : '<span class="badge bad">Chưa có tuyến</span>'}</td>
        <td>${code ? `<select data-assign="${esc(code)}">${options([['', '— chưa có —']].concat(drivers.map(x => [x.id, x.name || x.nick])).concat(routeDriver(code) && !drivers.some(x => x.id === routeDriver(code)) ? [[routeDriver(code), driverName(routeDriver(code)) || '(đã xóa)']] : []), routeDriver(code))}</select>
          <div class="small muted">${code in d.assign ? 'chọn cho ngày này' : routeDriver(code) ? 'tuyến thường chạy' : ''}</div>` : ''}</td>
        <td class="num">${rows.length}</td>${GIAO_LINKED ? '' : `<td class="num">${ok || bad ? `<b>${ok}</b>/${rows.length}${bad ? ` <span class="badge bad">${bad} không giao được</span>` : ''}` : ''}</td>`}${usedCols.map(k => `<td class="num">${fmtBlank0(s[k])}</td>`).join('')}</tr>`; }).join('')}
      <tr class="sum"><td>Cộng</td><td></td><td class="num">${d.rows.length}</td>${GIAO_LINKED ? '' : `<td class="num">${fmtBlank0(d.rows.filter(r => (delivOf(r) || {}).status === 'ok').length)}</td>`}${usedCols.map(k => `<td class="num">${fmtBlank0(sumQty(d.rows)[k])}</td>`).join('')}</tr></tbody></table></div>
      ${GIAO_LINKED ? '<p class="hint">Bấm <b>💾 Lưu</b> là phân tuyến <b>tự chuyển sang Giao hàng An Tâm</b> (trong khoảng 1 giờ, không cần làm gì thêm); sửa phân tuyến thì Lưu lại là tự gửi lại. Cần gấp: bấm <b>📤 Gửi ngay</b> rồi Ctrl+V ở tab Giao hàng An Tâm. Kết quả giao (ảnh, vị trí) xem ở trang Giao hàng An Tâm.</p>'
        : drivers.length ? '<p class="hint">Người giao xem tuyến của mình trên <b>web giao hàng</b> sau khi bấm <b>Lưu</b>, và bấm "Đã giao" – cột Đã giao cập nhật khi mở lại trang này (hoặc bấm ↻ Kết quả giao).</p>'
        : '<p class="hint">Chưa có tài khoản giao hàng – tạo ở <a href="#/giao-hang-tk">Danh mục › Tài khoản giao hàng</a> để mỗi người giao xem tuyến của mình trên điện thoại.</p>'}
      <div class="toolbar" style="margin-top:14px"><label class="field">Xem<select id="rt-filter">${options([['', 'Tất cả khách'], ['-', 'Chưa có tuyến']].concat(gs.filter(g => g[0]).map(g => [g[0], `${g[0]} – ${rName(g[0])} (${g[1].length})`])), ui.filter)}</select></label>
      <label class="field">Tìm khách<input id="rt-search" value="${esc(ui.search)}" placeholder="mã, tên, địa chỉ…"></label></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Quận</th><th>Mã CRM</th><th>Khách hàng</th><th>Địa chỉ</th><th>SĐT</th><th>Ghi chú</th><th>Số lượng</th><th style="width:170px">Tuyến</th></tr></thead><tbody id="rt-rows"></tbody></table></div>
      <div class="form-actions"><button class="btn primary" id="rt-save">💾 Lưu</button><button class="btn" id="rt-print">🖨 In danh sách giao theo tuyến</button>
      <button class="btn" id="rt-print-sum">🖨 In tổng hợp tuyến</button><button class="btn" id="rt-csv">⬇ Tải danh sách mã CRM (Excel)</button>${doc.id ? (GIAO_LINKED ? '<button class="btn" id="rt-send" title="Không chờ tự chuyển: sao chép rồi dán ở tab Giao hàng An Tâm">📤 Gửi ngay sang Giao hàng An Tâm</button>' : '<button class="btn" id="rt-deliv">↻ Kết quả giao</button>') : ''}${doc.id ? '<button class="btn danger" id="rt-del">Xóa</button>' : ''}<a class="btn ghost" href="#/phan-tuyen">← Danh sách</a></div>`;
    $$('tr[data-g]', box).forEach(tr => tr.onclick = e => { if (e.target.closest('select')) return; ui.filter = tr.dataset.g || '-'; $('#rt-filter').value = ui.filter; drawRows(); });
    $$('select[data-assign]', box).forEach(sel => sel.onchange = () => { d.assign[sel.dataset.assign] = sel.value; markDirty(); const y = window.scrollY; drawBody(); window.scrollTo(0, y); });
    $('#rt-filter').onchange = () => { ui.filter = $('#rt-filter').value; drawRows(); };
    $('#rt-search').oninput = debounce(() => { ui.search = $('#rt-search').value; drawRows(); }, 200);
    $('#rt-save').onclick = () => guard(save);
    $('#rt-print').onclick = () => printRoutes(ui.filter && ui.filter !== '-' ? ui.filter : null);
    $('#rt-print-sum').onclick = printSummary;
    $('#rt-csv').onclick = () => guard(exportCsv);
    if (doc.id) $('#rt-del').onclick = () => deleteDoc(doc);
    if ($('#rt-deliv')) $('#rt-deliv').onclick = () => loadDeliveries().then(() => toast('Đã cập nhật kết quả giao'));
    if ($('#rt-send')) $('#rt-send').onclick = () => sendToGiao();
    drawRows();
  }
  function drawRows() {
    const tb = $('#rt-rows');
    const rows = d.rows.map((r, i) => [r, i]).filter(([r]) => (!ui.filter || (ui.filter === '-' ? !r.route : r.route === ui.filter))
      && (!ui.search || matches(ui.search, [r.crm, r.cust, r.q, r.phone, r.note].join(' '))));
    const opts = [['', '— chưa có —']].concat(routes.map(r => [r.code, `${r.code} – ${r.name}`]));
    tb.innerHTML = rows.map(([r, i], n) => `<tr class="${r.route ? '' : 'row-bad'}" data-i="${i}"><td>${n + 1}</td><td>${esc(r.q)}</td>
      <td>${r.crm ? `<b>${esc(r.crm)}</b>` : '<span class="small muted">—</span>'}</td><td class="nm"><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="small">${esc(r.addr)}${locLink(locs[custKeyOf(r)], '📌 vị trí đã lưu')}</td>
      <td class="small">${esc(r.phone)}</td><td class="small">${esc(r.note)}${r.pay ? `<br><span class="badge ${/chua/.test(noAccent(r.pay)) ? 'warn' : 'ok'}">${esc(r.pay)}</span>` : ''}</td>
      <td class="small">${qtyText(r)}</td>
      <td><select data-k="route">${options(opts.some(o => o[0] === r.route) ? opts : opts.concat([[r.route, r.route]]), r.route)}</select>
      <div class="small muted">${r.src === 'tay' ? 'chọn tay' : r.src === 'nhớ' ? 'như lần chọn tay trước' : r.src ? 'theo ' + esc(r.src) : ''}${r.grp ? ` (${esc(r.grp)})` : ''}</div>${delivBadge(delivOf(r))}</td></tr>`).join('')
      || '<tr><td colspan="9" class="muted">Không có khách nào.</td></tr>';
    fillPhotos(tb);
    $$('select[data-k=route]', tb).forEach(sel => sel.onchange = () => {
      const r = d.rows[+sel.closest('tr').dataset.i];
      r.route = sel.value; r.src = 'tay';
      custKeys(r).forEach(k => { changedMemory[k] = sel.value; });
      markDirty();
      const y = window.scrollY; drawBody(); window.scrollTo(0, y);
    });
  }
  async function save() {
    const gs = groups();
    // chỉ giữ lựa chọn người giao của các tuyến đang có khách
    Object.keys(d.assign).forEach(c => { if (!gs.some(g => g[0] === c)) delete d.assign[c]; });
    doc.title = `${d.rows.length} khách – ${gs.filter(g => g[0]).map(([c, r]) => `${c}: ${r.length}`).join(', ')}${gs.some(g => !g[0]) ? ` – chưa có tuyến: ${d.rows.filter(r => !r.route).length}` : ''}`;
    if (Object.keys(changedMemory).length) {
      const cfg = routingCfg();
      for (const [k, v] of Object.entries(changedMemory)) { if (v) cfg.memory[k] = v; else delete cfg.memory[k]; }
      await api('PUT', '/settings', { routing: { rules: (S.meta.settings.routing || {}).rules || [], memory: cfg.memory } });
      for (const k of Object.keys(changedMemory)) delete changedMemory[k];
      await loadMeta();
    }
    await saveDoc(doc);
    toast('Đã lưu phân tuyến');
    draw();
    loadDeliveries();
    if (GIAO_LINKED) await sendToGiao(true); // lưu xong tự gửi (sao chép) sang Giao hàng An Tâm
  }
  // Gửi bảng phân tuyến (đã lưu) + tài khoản người giao + danh mục tuyến sang trang Giao hàng An Tâm: sao chép rồi dán bên đó
  async function sendToGiao(afterSave) {
    if (S.dirty) return toast('Bấm 💾 Lưu trước rồi mới gửi', true);
    // để sẵn gói dữ liệu cho tác vụ tự chuyển sang Giao hàng An Tâm
    const out = await guard(() => api('POST', '/giao-sync/out?id=' + encodeURIComponent(doc.id)));
    if (afterSave) {
      if (out) toast('Đã lưu – phân tuyến sẽ tự chuyển sang Giao hàng An Tâm (trong khoảng 1 giờ). Cần gấp: bấm 📤 Gửi ngay.');
      return;
    }
    const pkg = await guard(() => api('GET', '/giao-sync?id=' + encodeURIComponent(doc.id)));
    if (!pkg) return;
    const text = JSON.stringify(pkg);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
    const n = (pkg.doc.data.rows || []).length;
    const { root } = openModal({
      title: afterSave ? 'Đã lưu – gửi sang Giao hàng An Tâm' : 'Gửi sang Giao hàng An Tâm', wide: true,
      body: `<div class="callout" style="margin-top:0">${copied ? '✅ <b>Đã sao chép</b>' : 'Bấm vào ô dưới, <kbd>Ctrl</kbd>+<kbd>A</kbd> rồi <kbd>Ctrl</kbd>+<kbd>C</kbd> để sao chép'}
        dữ liệu phân tuyến ngày <b>${vnDate(doc.date)}</b> (${n} khách, ${Object.keys(pkg.drivers || {}).length} tài khoản người giao).</div>
        <ol style="margin:0 0 12px;padding-left:20px;line-height:1.7"><li>Sang tab <a href="${esc(GIAO_URL)}" target="_blank" rel="noopener"><b>Giao hàng An Tâm ↗</b></a> (đang ở phần quản lý).</li>
        <li>Bấm <kbd>Ctrl</kbd>+<kbd>V</kbd> – trang tự nhận và báo "Đã nhận phân tuyến".</li>
        <li>Người giao bấm ↻ trên điện thoại (hoặc mở lại trang) là thấy tuyến mới.</li></ol>
        <p class="hint" style="margin:0 0 8px">Không dán cũng được: phân tuyến đã lưu sẽ tự chuyển sang Giao hàng An Tâm trong khoảng 1 giờ. Dán chỉ khi cần người giao thấy ngay.</p>
        <textarea id="gs-text" rows="4" readonly style="width:100%;font:12px ui-monospace,monospace">${esc(text)}</textarea>
        <div class="toolbar" style="margin-top:8px"><button class="btn sm" id="gs-copy">Sao chép lại</button><button class="btn sm" id="gs-file">⬇ Tải file (.json)</button></div>`,
    });
    const ta = $('#gs-text', root);
    ta.onfocus = () => ta.select();
    $('#gs-copy', root).onclick = async () => { ta.select(); try { await navigator.clipboard.writeText(text); toast('Đã sao chép'); } catch (e) { toast('Hãy bấm Ctrl+C để sao chép phần đã chọn'); } };
    $('#gs-file', root).onclick = () => guard(() => saveTextFile(`phan-tuyen-${doc.date}.json`, text));
  }
  function routeDoc(code, rows) {
    const s = sumQty(rows);
    const used = Object.keys(s).map(Number).sort((a, b) => a - b);
    return `<div class="doc landscape">${docHead('Danh sách giao hàng', 'Ngày ' + vnDate(doc.date))}
      <div class="d-title">Danh sách giao hàng – tuyến ${esc(code || 'chưa có')}</div>
      <div class="d-sub">${esc(rName(code))} · ${rows.length} khách · ${longDate(doc.date)}</div>
      ${code && routeDriver(code) ? `<div class="d-sub">Người giao: <b>${esc(driverName(routeDriver(code)))}</b></div>` : ''}
      <table class="t"><thead><tr><th>STT</th><th>Mã CRM</th><th>Khách hàng</th><th>Địa chỉ</th><th>SĐT</th><th>Ghi chú</th>${used.map(k => `<th>${esc(d.cols[k])}</th>`).join('')}<th>Thanh toán</th><th>Ký nhận</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c"><b>${esc(r.crm)}</b></td><td>${esc(r.code)} ${esc(r.name)}</td><td>${esc(r.addr || r.q)}</td><td>${esc(r.phone)}</td><td>${esc(r.note)}</td>
        ${used.map(k => `<td class="n">${fmtBlank0((r.qty || {})[k])}</td>`).join('')}<td>${esc(r.pay)}</td><td style="min-width:70px"></td></tr>`).join('')}
      <tr class="sum"><td colspan="6" class="c">CỘNG ${rows.length} khách</td>${used.map(k => `<td class="n">${fmt(s[k])}</td>`).join('')}<td></td><td></td></tr></tbody></table>
      ${signBlock([['Người lập', S.user], ['Thủ kho', ''], ['Tài xế / người giao', code ? driverName(routeDriver(code)) : '']])}</div>`;
  }
  // File CSV (mở bằng Excel): mã CRM, mã khách, tên, tuyến… theo bộ lọc đang xem
  function exportCsv() {
    const rows = d.rows.filter(r => !ui.filter || (ui.filter === '-' ? !r.route : r.route === ui.filter));
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['STT', 'Mã CRM', 'Mã khách', 'Tên khách', 'Địa chỉ', 'Quận', 'SĐT', 'Ghi chú', 'Thanh toán', 'Mã tuyến', 'Tuyến'].concat(d.cols)]
      .concat(rows.map((r, i) => [i + 1, r.crm, r.code, r.name, r.addr, r.q, r.phone, r.note, r.pay, r.route, rName(r.route)].concat(d.cols.map((_, k) => (r.qty || {})[k] || ''))));
    return saveTextFile(`ma-crm-tuyen-${doc.date}${ui.filter && ui.filter !== '-' ? '-' + ui.filter : ''}.csv`, '\ufeff' + lines.map(l => l.map(q).join(',')).join('\r\n'));
  }
  function printRoutes(only) {
    const gs = groups().filter(([c]) => (only ? c === only : true));
    if (!gs.length) return toast('Không có khách để in', true);
    printHtml(gs.map(([c, rows]) => routeDoc(c, rows)).join(''), 'landscape', 'tuyen-' + doc.date + (only ? '-' + only : ''));
  }
  function printSummary() {
    const gs = groups();
    const all = sumQty(d.rows);
    const used = Object.keys(all).map(Number).sort((a, b) => a - b);
    printHtml(`<div class="doc landscape">${docHead('Tổng hợp phân tuyến', 'Ngày ' + vnDate(doc.date))}<div class="d-title">Tổng hợp hàng giao theo tuyến</div>
      <div class="d-sub">${longDate(doc.date)} · ${d.rows.length} khách hoạt động</div>
      <table class="t"><thead><tr><th>STT</th><th>Mã</th><th>Tuyến</th><th>Số khách</th>${used.map(k => `<th>${esc(d.cols[k])}</th>`).join('')}</tr></thead><tbody>
      ${gs.map(([c, rows], i) => { const s = sumQty(rows); return `<tr><td class="c">${i + 1}</td><td><b>${esc(c || '—')}</b></td><td>${esc(c ? rName(c) : 'Chưa có tuyến')}</td><td class="n">${rows.length}</td>${used.map(k => `<td class="n">${fmtBlank0(s[k])}</td>`).join('')}</tr>`; }).join('')}
      <tr class="sum"><td colspan="3" class="c">CỘNG</td><td class="n">${d.rows.length}</td>${used.map(k => `<td class="n">${fmt(all[k])}</td>`).join('')}</tr></tbody></table>
      ${signBlock([['Người lập', S.user], ['Thủ kho', ''], ['Quản lý', '']])}</div>`, 'landscape', 'tong-hop-tuyen-' + doc.date);
  }
  draw();
  if (doc.id) loadDeliveries();
}
// Giống server.py route_driver / cust_key (web giao hàng dùng cùng cách tính)
function routeDriverOf(data, code, drivers) {
  const a = (data && data.assign) || {};
  if (code in a) return a[code] || '';
  const x = drivers.find(v => v.active && (v.routes || []).some(c => String(c).toLowerCase() === String(code).toLowerCase()));
  return x ? x.id : '';
}
const custKeyOf = r => String(r.crm || '').trim() || String(r.code || '').trim() || String(r.cust || '').trim();
function delivBadge(x, full) {
  if (!x) return '';
  const b = x.status === 'ok' ? `<span class="badge ok">✓ Đã giao ${esc((x.at || '').slice(11, 16))}</span>`
    : `<span class="badge bad" title="${esc(x.note)}">✗ Không giao được${x.note ? ': ' + esc(x.note) : ''}</span>`;
  return b + (full === false ? '' : (x.status === 'ok' && x.note ? `<div class="small muted">${esc(x.note)}</div>` : '') + photoThumbs(x.photos) + locLink(x.gps, '📍 vị trí lúc giao'));
}
// Ảnh giao hàng: bản chạy máy lấy từ /api/photo, bản online từ kho ảnh của trang
function photoSrc(ref) { return ONLINE ? Backend.photoUrl(ref) : Promise.resolve(withToken('/api/photo?ref=' + encodeURIComponent(ref))); }
function photoThumbs(refs) {
  return refs && refs.length ? `<div class="ph-row">${refs.map((r, i) => `<img class="ph-thumb" data-ref="${esc(r)}" alt="Ảnh giao hàng ${i + 1}">`).join('')}</div>` : '';
}
function fillPhotos(root) {
  $$('img[data-ref]', root).forEach(img => {
    if (img.dataset.done) return;
    img.dataset.done = '1';
    photoSrc(img.dataset.ref).then(src => { if (src) img.src = src; else img.alt = '(không tải được ảnh)'; }, () => {});
    img.onclick = e => { e.stopPropagation(); if (img.src) openModal({ title: 'Ảnh giao hàng', wide: true, body: `<img src="${esc(img.src)}" style="max-width:100%;display:block;margin:auto" alt="Ảnh giao hàng">` }); };
  });
}
function locLink(g, label) {
  const href = g && (g.lat != null ? `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}` : g.url);
  return href ? `<div><a class="small" href="${esc(href)}" target="_blank" rel="noopener">${label}${g.acc ? ' ±' + Math.round(g.acc) + 'm' : ''}</a></div>` : '';
}

/* ---------- Hành trình giao hàng: điểm GPS người giao chia sẻ (web giao hàng › Chia sẻ hành trình) + các khách đã giao */
// tr: {pts: [[giây từ 0h, lat, lng, acc]], live, on}; stops: [[mã khách, kết quả giao]] của 1 người; locs: vị trí khách đã lưu
function geoMeters(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const secHm = sec => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
const atSec = at => { const m = /(\d\d):(\d\d)(?::(\d\d))?$/.exec(String(at || '')); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) : null; };
function journeyOf(tr, stops, locs) {
  const pts = ((tr && tr.pts) || []).map(p => ({ t: p[0], lat: p[1], lng: p[2], acc: p[3] }));
  const st = stops.map(([k, x]) => {
    const g = x.gps && x.gps.lat != null ? x.gps : locs[k] && locs[k].lat != null ? locs[k] : null;
    return { k, x, t: atSec(x.at), g, saved: !(x.gps && x.gps.lat != null) && !!g };
  }).sort((a, b) => (a.t || 0) - (b.t || 0));
  let km = 0, est = false;
  if (pts.length > 1) {
    for (let i = 1; i < pts.length; i++) { const m = geoMeters(pts[i - 1], pts[i]); if (m < 20000) km += m; } // bỏ cú nhảy GPS bất thường
  } else {
    const g = st.filter(s => s.g).map(s => s.g);
    for (let i = 1; i < g.length; i++) km += geoMeters(g[i - 1], g[i]);
    est = g.length > 1;
  }
  // chỗ dừng lâu: các điểm liên tiếp trong vòng 80 m suốt ≥ 10 phút
  const pauses = [];
  for (let i = 0; i < pts.length;) {
    let j = i;
    while (j + 1 < pts.length && geoMeters(pts[i], pts[j + 1]) <= 80) j++;
    if (pts[j].t - pts[i].t >= 600) pauses.push({ t: pts[i].t, end: pts[j].t, g: pts[i] });
    i = j + 1;
  }
  const times = pts.map(p => p.t).concat(st.map(s => s.t).filter(t => t != null));
  return { pts, st, km: km / 1000, est, pauses, from: times.length ? Math.min(...times) : null, to: times.length ? Math.max(...times) : null };
}
// sơ đồ đường đi (không cần bản đồ nền): đường GPS + các khách đánh số theo thứ tự giao
function journeySvg(J) {
  const all = J.pts.concat(J.st.filter(s => s.g).map(s => s.g));
  if (!all.length) return '';
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length, kx = Math.cos(lat0 * Math.PI / 180);
  const xs = all.map(p => p.lng * kx), ys = all.map(p => -p.lat);
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(Math.max(...xs) - minX, 1e-4), h = Math.max(Math.max(...ys) - minY, 1e-4);
  const W = 640, H = 300, pad = 18, k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  const ox = (W - w * k) / 2, oy = (H - h * k) / 2;
  const P = p => [(p.lng * kx - minX) * k + ox, (-p.lat - minY) * k + oy].map(v => Math.round(v * 10) / 10);
  const line = J.pts.length > 1 ? `<polyline points="${J.pts.map(p => P(p).join(',')).join(' ')}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".75"/>` : '';
  const ends = J.pts.length ? [[J.pts[0], 'Bắt đầu ' + secHm(J.pts[0].t), '#667085'], [J.pts[J.pts.length - 1], 'Vị trí cuối ' + secHm(J.pts[J.pts.length - 1].t), '#2459a8']]
    .map(([p, t, c]) => { const [x, y] = P(p); return `<circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="#fff" stroke-width="2"><title>${esc(t)}</title></circle>`; }).join('') : '';
  let n = 0;
  const dots = J.st.map(s => {
    n++;
    if (!s.g) return '';
    const [x, y] = P(s.g), c = s.x.status === 'ok' ? '#13804b' : '#c4320a';
    return `<g><circle cx="${x}" cy="${y}" r="9" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${n}</text>
      <title>${esc(`${n}. ${s.k} ${s.x.name || ''} – ${(s.x.at || '').slice(11, 16)}`)}</title></g>`;
  }).join('');
  return `<svg class="jr-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sơ đồ đường đi">${line}${ends}${dots}</svg>`;
}
function journeyRouteUrl(J) {
  let g = J.st.filter(s => s.g).map(s => s.g);
  if (J.pts.length > 1) g = [J.pts[0]].concat(g, [J.pts[J.pts.length - 1]]);
  if (g.length < 2) return '';
  if (g.length > 10) g = Array.from({ length: 10 }, (_, i) => g[Math.round(i * (g.length - 1) / 9)]); // Google Maps nhận tối đa ~10 điểm
  return 'https://www.google.com/maps/dir/' + g.map(p => `${p.lat},${p.lng}`).join('/');
}
function journeyCard(name, tr, stops, locs, date) {
  const J = journeyOf(tr, stops, locs);
  const last = J.pts[J.pts.length - 1];
  const nowSec = (() => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); })();
  const liveNow = tr && tr.on && last && date === isoDate() && nowSec - last.t < 600 && nowSec - last.t > -300;
  const ok = J.st.filter(s => s.x.status === 'ok').length;
  const url = journeyRouteUrl(J);
  const ev = J.st.map((s, i) => ({ t: s.t, html: `<td><b>${i + 1}</b></td><td>${delivBadge(s.x, false)} <b>${esc(s.k)}</b> ${esc(s.x.name || '')}
      ${s.x.status !== 'ok' && s.x.note ? '' : s.x.note ? `<div class="small muted">${esc(s.x.note)}</div>` : ''}</td>
      <td>${s.g ? `<a class="small" href="https://www.google.com/maps/search/?api=1&query=${s.g.lat},${s.g.lng}" target="_blank" rel="noopener">📍 ${s.saved ? 'vị trí khách' : 'lúc giao'}</a>` : '<span class="small muted">—</span>'}</td>` }))
    .concat(J.pauses.map(p => ({ t: p.t, html: `<td>⏸</td><td class="muted">Dừng ${Math.round((p.end - p.t) / 60)} phút (${secHm(p.t)}–${secHm(p.end)})</td>
      <td><a class="small" href="https://www.google.com/maps/search/?api=1&query=${p.g.lat},${p.g.lng}" target="_blank" rel="noopener">📍 xem</a></td>` })))
    .sort((a, b) => (a.t || 0) - (b.t || 0));
  return `<div class="jr-card">
    <div class="jr-head"><b>🚚 ${esc(name)}</b>
      ${liveNow ? '<span class="badge ok">● Đang chia sẻ</span>' : tr && tr.on ? '<span class="badge warn">Đang bật – chưa có vị trí mới</span>' : J.pts.length ? '<span class="badge">Đã tắt chia sẻ</span>' : ''}
      <span class="small muted">${J.from != null ? `${secHm(J.from)} → ${secHm(J.to)} · ` : ''}${ok}/${J.st.length} khách đã giao${J.km ? ` · ${J.est ? '≈ ' : ''}${fmt(Math.round(J.km * 10) / 10)} km${J.est ? ' (đường chim bay giữa các khách)' : ''}` : ''}${J.pts.length ? ` · ${J.pts.length} điểm GPS` : ''}</span></div>
    <div class="toolbar" style="margin:6px 0">
      ${last ? `<a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${last.lat},${last.lng}" target="_blank" rel="noopener">📍 Vị trí mới nhất ${secHm(last.t)}</a>` : ''}
      ${tr && tr.live ? `<a class="btn sm primary" href="${esc(tr.live)}" target="_blank" rel="noopener">🔗 Vị trí trực tiếp (Google Maps)</a>` : ''}
      ${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">🗺 Xem đường đi trên Google Maps</a>` : ''}</div>
    ${journeySvg(J)}
    ${ev.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Giờ</th><th>#</th><th>Sự kiện</th><th>Vị trí</th></tr></thead><tbody>
      ${ev.map(e => `<tr><td class="nowrap">${e.t != null ? secHm(e.t) : ''}</td>${e.html}</tr>`).join('')}</tbody></table></div>` : ''}
  </div>`;
}

/* ============================================================ Tài khoản giao hàng (web giao hàng) */
function giaoHangLinks() {
  if (ONLINE) return [];
  const urls = (S.meta.access && S.meta.access.urls.length ? S.meta.access.urls : [location.origin]);
  return urls.map(u => u.replace(/\/$/, '') + '/giao-hang');
}
function openGiaoHang() {
  if (GIAO_LINKED) return window.open(GIAO_URL, '_blank', 'noopener');
  if (ONLINE) return enterGiaoMode();
  window.open('/giao-hang', '_blank');
}
async function viewDrivers(main) {
  setTitle('Tài khoản giao hàng');
  const routes = routeList();
  const rName = c => { const r = routes.find(x => x.code.toLowerCase() === String(c).toLowerCase()); return r ? r.name : ''; };
  const res = { date: isoDate(), who: '', list: {}, tracks: [], locs: {} };
  const dName = id => { const x = (S.meta.drivers || []).find(v => v.id === id); return x ? x.name || x.nick : '(đã xóa)'; };
  async function loadRes(quiet) {
    const want = res.date;
    const g = quiet ? (fn => fn().catch(() => null)) : guard;
    const [list, tracks, locs] = await Promise.all([g(() => api('GET', '/deliveries?date=' + want)), g(() => api('GET', '/tracks?date=' + want)), g(() => api('GET', '/locations'))]);
    if (want !== res.date || !$('#g-res')) return;
    if (quiet && !list) return;
    res.list = list || {}; res.tracks = tracks || []; res.locs = locs || {};
    drawRes(); drawJourney();
  }
  function drawJourney() {
    const box = $('#g-jr');
    if (!box) return;
    const ids = new Set(res.tracks.map(t => t.driver));
    Object.values(res.list).forEach(x => { if (x.driver) ids.add(x.driver); });
    const list = Array.from(ids).filter(id => !res.who || id === res.who).sort((a, b) => dName(a).localeCompare(dName(b)));
    box.innerHTML = list.length ? list.map(id => journeyCard(dName(id), res.tracks.find(t => t.driver === id),
      Object.entries(res.list).filter(([, x]) => x.driver === id), res.locs, res.date)).join('')
      : '<p class="muted">Ngày này chưa có hành trình nào (người giao chưa bật chia sẻ và chưa giao khách nào).</p>';
  }
  function drawRes() {
    const rows = Object.entries(res.list).filter(([, x]) => !res.who || x.driver === res.who)
      .sort((a, b) => (a[1].route || '').localeCompare(b[1].route || '') || (a[1].at || '').localeCompare(b[1].at || ''));
    const ok = rows.filter(([, x]) => x.status === 'ok').length;
    $('#g-res').innerHTML = rows.length ? `<p class="small" style="margin:0 0 8px"><b>${ok}</b> khách đã giao · <b>${rows.length - ok}</b> không giao được ·
      ${rows.filter(([, x]) => (x.photos || []).length).length} khách có ảnh</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Giờ</th><th>Người giao</th><th>Tuyến</th><th>Khách</th><th>Kết quả</th><th>Ảnh giao hàng</th><th>Vị trí lúc giao</th></tr></thead><tbody>
      ${rows.map(([k, x]) => `<tr><td class="nowrap">${esc((x.at || '').slice(11, 16))}</td><td>${esc(dName(x.driver))}</td><td><b>${esc(x.route)}</b></td>
        <td><b>${esc(k)}</b> ${esc(x.name || '')}</td><td>${delivBadge(x, false)}${x.status === 'ok' && x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td>
        <td>${photoThumbs(x.photos) || '<span class="small muted">—</span>'}</td><td>${locLink(x.gps, '📍 Xem bản đồ') || '<span class="small muted">—</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Chưa có kết quả giao hàng ngày này.</p>';
    fillPhotos($('#g-res'));
  }
  function draw() {
    const list = (S.meta.drivers || []).slice().sort((a, b) => (b.active - a.active) || a.nick.localeCompare(b.nick));
    const links = giaoHangLinks();
    main.innerHTML = `<div class="toolbar">${GIAO_APP ? '' : '<button class="btn primary" id="g-add">+ Thêm người giao hàng</button>'}<button class="btn" id="g-open">🚚 ${GIAO_LINKED ? 'Mở Giao hàng An Tâm ↗' : 'Mở web giao hàng'}</button></div>
      <div class="callout">Mỗi người giao hàng có <b>1 nick + mã PIN</b>. Đăng nhập web giao hàng trên điện thoại sẽ thấy <b>tuyến đã sắp của từng ngày</b>
      (lấy từ <a href="#/phan-tuyen">Phân tuyến giao hàng</a>): khách, địa chỉ (bấm để mở bản đồ), SĐT (bấm để gọi), số lượng từng loại; bấm <b>Đã giao</b> /
      <b>Không giao được</b> và kho thấy kết quả ở bảng phân tuyến.<br>Tuyến của mỗi người = <b>tuyến thường chạy</b> dưới đây; ngày nào đổi người thì chọn lại ở cột
      <b>Người giao</b> trong phân tuyến của ngày đó.</div>
      ${GIAO_APP ? `<div class="callout small">Tài khoản người giao được <b>tạo / sửa / khóa ở web Kho An Tâm › Tài khoản giao hàng</b> và cập nhật sang đây mỗi lần kho
        <b>Lưu phân tuyến</b> (tự chuyển sang, trong khoảng 1 giờ). Người giao chỉ được mời vào trang Giao hàng An Tâm này (email, quyền <b>Editor</b>, tắt "Anyone with the link") – không mời họ vào web Kho An Tâm.</div>`
      : GIAO_LINKED ? `<div class="callout small">Người giao dùng trang riêng <a href="${esc(GIAO_URL)}" target="_blank" rel="noopener"><b>Giao hàng An Tâm ↗</b></a> – mời họ vào trang đó
        (email, quyền <b>Editor</b>, tắt "Anyone with the link"), <b>không mời vào web Kho An Tâm</b>. Tài khoản tạo / sửa ở đây tự chuyển sang mỗi lần
        <b>Lưu</b> bảng Phân tuyến giao hàng (trong khoảng 1 giờ); kết quả giao, ảnh và vị trí xem ở trang Giao hàng An Tâm.</div>`
      : ONLINE ? `<div class="callout small">Người giao hàng chỉ được mời vào <b>trang Giao hàng An Tâm này</b> – <b>không mời họ vào web Kho An Tâm</b>.
        Mời bằng <b>email</b> ở nút <i>Share</i> của trang, chọn quyền <b>Editor</b> (quyền Viewer/Commenter không bấm được "Đã giao" hay gửi ảnh), và để
        <i>General access</i> ở chế độ <b>chỉ người được mời</b> (tắt "Anyone with the link").
        Trên điện thoại: mở link → bấm <b>🚚 Tôi là người giao hàng</b> → đăng nhập nick + PIN. Lần sau mở link sẽ vào thẳng tuyến của mình.</div>`
      : `<div class="card"><h3>Link web giao hàng</h3><div class="toolbar">${links.map(u => `<code class="access-url">${esc(u)}</code><button class="btn sm" data-copy="${esc(u)}">Sao chép</button>`).join('')}</div>
        <p class="hint">Điện thoại phải dùng <b>cùng wifi / mạng công ty</b> với máy chạy web. Web giao hàng không hỏi mật khẩu chung của web kho – mỗi người đăng nhập bằng nick + PIN của mình.</p></div>`}
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Nick</th><th>Họ tên</th><th>SĐT</th><th>Tuyến thường chạy</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr class="clickable" data-id="${esc(x.id)}" ${x.active ? '' : 'style="opacity:.55"'}><td><b>${esc(x.nick)}</b></td><td>${esc(x.name)}</td><td>${esc(x.phone)}</td>
        <td>${x.routes.length ? x.routes.map(c => `<span class="badge" title="${esc(rName(c))}">${esc(c)}</span>`).join(' ') : '<span class="muted small">— chọn theo ngày —</span>'}</td>
        <td>${x.active ? '<span class="badge ok">Đang dùng</span>' : '<span class="badge warn">Đã khóa</span>'}</td>
        <td>${GIAO_APP ? '' : `<button class="btn sm danger" data-del="${esc(x.id)}">Xóa</button>`}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Chưa có tài khoản giao hàng nào.</p>'}
      ${GIAO_LINKED ? '' : `<div class="card" style="margin-top:16px"><h3>Kết quả giao hàng theo ngày</h3>
        <div class="toolbar"><label class="field">Ngày<input type="date" id="g-date" value="${res.date}"></label>
        <label class="field">Người giao<select id="g-who">${options([['', 'Tất cả']].concat((S.meta.drivers || []).map(x => [x.id, x.name || x.nick])), res.who)}</select></label>
        <button class="btn" id="g-reload">↻ Tải lại</button></div>
        <div id="g-res"><p class="muted">Đang tải…</p></div>
        <p class="hint">Ảnh do người giao chụp lúc giao (có ghi giờ, mã khách trên ảnh); "vị trí lúc giao" là định vị điện thoại khi bấm Đã giao. Bấm ảnh để xem lớn.</p></div>
        <div class="card" style="margin-top:16px"><h3>🛰 Hành trình giao hàng</h3>
        <div id="g-jr"><p class="muted">Đang tải…</p></div>
        <p class="hint">Người giao bấm <b>🛰 Bật chia sẻ hành trình</b> trên web giao hàng (giữ web mở trong lúc đi giao) – đường đi GPS hiện ở đây, tự cập nhật mỗi phút.
        Điện thoại không cho trang đọc định vị thì người giao gửi <b>link Chia sẻ vị trí của Google Maps</b> (nút 🔗 Vị trí trực tiếp), và đường đi được vẽ theo thứ tự các khách đã giao
        (vị trí lúc giao, hoặc vị trí khách đã lưu). Số trong vòng tròn = thứ tự giao: xanh đã giao, đỏ không giao được.</p></div>`}`;
    if (!GIAO_LINKED) {
      $('#g-date').onchange = () => { res.date = $('#g-date').value; loadRes(); };
      $('#g-who').onchange = () => { res.who = $('#g-who').value; drawRes(); drawJourney(); };
      $('#g-reload').onclick = () => loadRes();
      loadRes();
      clearInterval(viewDrivers.timer);
      viewDrivers.timer = setInterval(() => { if (!$('#g-jr')) return clearInterval(viewDrivers.timer); if (!document.hidden && !$('.modal')) loadRes(true); }, 60000);
    }
    if (!GIAO_APP) $('#g-add').onclick = () => edit(null);
    $('#g-open').onclick = () => openGiaoHang();
    if (!GIAO_APP) $$('tr[data-id]', main).forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) edit(S.meta.drivers.find(x => x.id === tr.dataset.id)); });
    $$('[data-del]', main).forEach(b => b.onclick = async () => {
      const x = S.meta.drivers.find(v => v.id === b.dataset.del);
      if (!(await ask(`Xóa tài khoản giao hàng "${x.nick}"? Người này sẽ không đăng nhập được nữa (kết quả giao cũ vẫn giữ).`))) return;
      if (await guard(() => api('DELETE', '/drivers/' + encodeURIComponent(x.id)))) { toast('Đã xóa'); await loadMeta(); draw(); }
    });
    $$('[data-copy]', main).forEach(btn => btn.onclick = async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); toast('Đã sao chép ' + btn.dataset.copy); }
      catch (e) { toast('Hãy tự bôi đen và sao chép: ' + btn.dataset.copy); }
    });
  }
  function edit(x) {
    if (VIEW) return;
    const v = x || { id: '', nick: '', name: '', phone: '', routes: [], active: true };
    const mine = new Set(v.routes.map(c => c.toLowerCase()));
    const taken = {};
    (S.meta.drivers || []).forEach(o => { if (o.id !== v.id && o.active) o.routes.forEach(c => { taken[c.toLowerCase()] = o.name || o.nick; }); });
    openModal({
      title: x ? 'Sửa tài khoản ' + x.nick : 'Thêm người giao hàng', wide: true,
      body: `<div class="grid c2">
        <label class="field">Nick đăng nhập (không dấu, viết liền, vd <i>tuan.hm</i>)<input id="g-nick" value="${esc(v.nick)}" autocapitalize="none"></label>
        <label class="field">Họ tên<input id="g-name" value="${esc(v.name)}"></label>
        <label class="field">SĐT<input id="g-phone" value="${esc(v.phone)}"></label>
        <label class="field">${x ? 'Mã PIN mới (để trống = giữ PIN cũ)' : 'Mã PIN (4–8 chữ số)'}<input id="g-pin" inputmode="numeric" autocomplete="new-password" placeholder="${x ? '••••' : 'vd 2468'}"></label>
        <label class="check span2"><input type="checkbox" id="g-active" ${v.active ? 'checked' : ''}> Đang dùng (bỏ chọn để khóa, không đăng nhập được)</label></div>
        <div class="field" style="margin-top:12px">Tuyến thường chạy (mặc định cho mọi ngày – ngày nào khác thì chọn lại ở Phân tuyến)</div>
        <div class="toolbar">${routes.map(r => `<label class="check"><input type="checkbox" data-route="${esc(r.code)}" ${mine.has(r.code.toLowerCase()) ? 'checked' : ''}>
          <b>${esc(r.code)}</b> ${esc(r.name)}${taken[r.code.toLowerCase()] ? ` <span class="small muted">(${esc(taken[r.code.toLowerCase()])})</span>` : ''}</label>`).join('') || '<span class="muted small">Chưa có tuyến – thêm ở Danh mục › Tuyến / nơi nhận.</span>'}</div>`,
      onSave: async root => {
        await api('POST', '/drivers', { id: v.id, nick: $('#g-nick', root).value, name: $('#g-name', root).value, phone: $('#g-phone', root).value,
          pin: $('#g-pin', root).value.trim(), active: $('#g-active', root).checked, routes: $$('input[data-route]', root).filter(i => i.checked).map(i => i.dataset.route) });
        toast('Đã lưu tài khoản giao hàng'); await loadMeta(); draw(); return true;
      },
    });
  }
  draw();
}

/* ============================================================ Danh mục mặt hàng */
async function viewProducts(main) {
  setTitle('Danh mục mặt hàng');
  const f = { q: '', grp: '', inactive: false };
  main.innerHTML = `<div class="toolbar"><button class="btn primary" id="p-add">+ Thêm mặt hàng</button>
    <label class="field">Nhóm<select id="p-grp"></select></label><label class="field grow">Tìm (không dấu cũng được)<input id="p-q"></label>
    <label class="check"><input type="checkbox" id="p-inactive"> Hiện cả mã ngừng dùng</label></div><div id="p-list"></div>
    <p class="hint">Số dư ban đầu = tồn đầu tiên trước khi bắt đầu ghi sổ trên web. Tồn tối thiểu dùng để cảnh báo ở báo cáo NXT và Thẻ kho.</p>`;
  function draw() {
    const groups = Array.from(new Set(S.meta.products.map(p => p.grp).filter(Boolean)));
    $('#p-grp').innerHTML = options(groups, f.grp, 'Tất cả');
    const rows = S.meta.products.filter(p => (f.inactive || p.active) && (!f.grp || p.grp === f.grp) && (!f.q || matches(f.q, p.code + ' ' + p.name + ' ' + (p.supplier || ''))));
    $('#p-list').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Nhóm hàng</th><th class="num">Đơn giá mua gần nhất</th>
      <th>Nhà cung cấp</th><th class="num">Số dư ban đầu</th><th class="num">Tồn tối thiểu</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr class="clickable" data-code="${esc(p.code)}" ${p.active ? '' : 'style="opacity:.55"'}><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${esc(p.grp)}</td>
        <td class="num">${fmtBlank0(p.price)}</td><td>${esc(p.supplier)}</td><td class="num">${fmtBlank0(p.opening_qty)}</td><td class="num">${p.min_qty === null ? '' : fmt(p.min_qty)}</td>
        <td class="small">${esc(p.note)}${p.active ? '' : ' <span class="badge warn">Ngừng dùng</span>'}</td><td><button class="btn sm danger" data-del="${esc(p.code)}">Xóa</button></td></tr>`).join('')}
      </tbody></table></div><p class="hint">${rows.length} mã hàng.</p>`;
    $$('#p-list tr[data-code]').forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) edit(productByCode(tr.dataset.code)); });
    $$('#p-list [data-del]').forEach(b => b.onclick = async () => {
      if (!(await ask('Xóa mã ' + b.dataset.del + '?'))) return;
      if (await guard(() => api('DELETE', '/products/' + encodeURIComponent(b.dataset.del)))) { toast('Đã xóa'); await loadMeta(); draw(); }
    });
  }
  function edit(p) {
    if (VIEW) return;
    const s = S.meta.settings;
    const x = p || { code: '', name: '', unit: '', grp: '', price: 0, supplier: '', note: '', opening_qty: 0, min_qty: null, active: 1 };
    openModal({
      title: p ? 'Sửa mặt hàng ' + p.code : 'Thêm mặt hàng',
      body: `<div class="grid c2">
        <label class="field">Mã hàng (viết HOA, không dấu, không khoảng trắng)<input id="m-code" value="${esc(x.code)}"></label>
        <label class="field">Tên hàng<input id="m-name" value="${esc(x.name)}"></label>
        <label class="field">ĐVT<input id="m-unit" list="dl-units" value="${esc(x.unit)}"></label>
        <label class="field">Nhóm hàng<input id="m-grp" list="dl-groups" value="${esc(x.grp)}"></label>
        <label class="field">Đơn giá mua gần nhất (đ)<input id="m-price" class="num" value="${x.price ? fmt(x.price) : ''}"></label>
        <label class="field">Nhà cung cấp<input id="m-sup" value="${esc(x.supplier)}"></label>
        <label class="field">Số dư ban đầu<input id="m-open" class="num" value="${x.opening_qty ? fmt(x.opening_qty) : ''}"></label>
        <label class="field">Tồn tối thiểu<input id="m-min" class="num" value="${x.min_qty === null ? '' : fmt(x.min_qty)}"></label>
        <label class="field span2">Ghi chú<input id="m-note" value="${esc(x.note)}"></label>
        <label class="check"><input type="checkbox" id="m-active" ${x.active ? 'checked' : ''}> Đang dùng (hiện trong ô chọn mặt hàng)</label>
        </div>${datalist('dl-units', s.units || [])}${datalist('dl-groups', s.groups || [])}
        ${p ? '<p class="hint">Đổi mã hàng sẽ tự cập nhật mã trong tất cả phiếu đã lập.</p>' : ''}`,
      onSave: async root => {
        const g = id => $(id, root).value;
        const n = id => { const v = parseNum(g(id)); if (v !== null && isNaN(v)) throw new Error('Số không hợp lệ: ' + g(id)); return v; };
        await api('POST', '/products', { original_code: p ? p.code : '', code: g('#m-code'), name: g('#m-name'), unit: g('#m-unit'), grp: g('#m-grp'),
          price: n('#m-price') || 0, supplier: g('#m-sup'), note: g('#m-note'), opening_qty: n('#m-open') || 0, min_qty: n('#m-min') === null ? '' : n('#m-min'),
          active: $('#m-active', root).checked });
        toast('Đã lưu mặt hàng'); await loadMeta(); draw(); return true;
      },
    });
  }
  $('#p-add').onclick = () => edit(null);
  $('#p-grp').onchange = () => { f.grp = $('#p-grp').value; draw(); };
  $('#p-q').oninput = debounce(() => { f.q = $('#p-q').value; draw(); }, 150);
  $('#p-inactive').onchange = () => { f.inactive = $('#p-inactive').checked; draw(); };
  draw();
}

/* ============================================================ Danh mục tuyến */
async function viewRoutes(main) {
  setTitle('Danh mục tuyến / nơi nhận');
  function draw() {
    main.innerHTML = `<div class="toolbar"><button class="btn primary" id="r-add">+ Thêm tuyến</button></div>
      <div class="callout">Mã tuyến viết HOA, không dấu, không khoảng trắng, không dấu gạch — dùng để tạo số phiếu xuất (vd <b>PXK-0810-01-HM</b>).</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Tuyến giao hàng</th><th>Mã</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      ${S.meta.routes.map((r, i) => `<tr class="clickable" data-id="${r.id}"><td>${i + 1}</td><td>${esc(r.name)}</td><td><b>${esc(r.code)}</b></td><td>${esc(r.note)}</td>
        <td><button class="btn sm danger" data-del="${r.id}">Xóa</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#r-add').onclick = () => edit(null);
    $$('tr[data-id]', main).forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) edit(S.meta.routes.find(r => String(r.id) === tr.dataset.id)); });
    $$('[data-del]', main).forEach(b => b.onclick = async () => {
      if (!(await ask('Xóa tuyến này? (phiếu cũ vẫn giữ tên tuyến)'))) return;
      if (await guard(() => api('DELETE', '/routes/' + b.dataset.del))) { await loadMeta(); draw(); }
    });
  }
  function edit(r) {
    if (VIEW) return;
    const x = r || { name: '', code: '', note: '' };
    openModal({
      title: r ? 'Sửa tuyến' : 'Thêm tuyến',
      body: `<div class="grid c2"><label class="field">Tuyến giao hàng<input id="m-name" value="${esc(x.name)}"></label>
        <label class="field">Mã (vd HM, TBTP)<input id="m-code" value="${esc(x.code)}"></label>
        <label class="field span2">Ghi chú<input id="m-note" value="${esc(x.note)}"></label></div>`,
      onSave: async root => {
        await api('POST', '/routes', { id: r ? r.id : null, name: $('#m-name', root).value, code: $('#m-code', root).value, note: $('#m-note', root).value });
        await loadMeta(); draw(); return true;
      },
    });
  }
  draw();
}

/* ============================================================ Cài đặt & dữ liệu */
async function viewSettings(main) {
  if (GIAO_APP) return viewGiaoSettings(main);
  setTitle('Cài đặt & dữ liệu');
  const s = S.meta.settings;
  const W = S.meta.warehouse;
  const lines = a => (a || []).join('\n');
  const cnt = S.meta.counts[S.wh] || 0;
  main.innerHTML = `
    <div class="card"><h3>Nhập dữ liệu từ file Excel vào <span class="wh-badge">${esc(W.name)}</span></h3>
      <p class="small">Chọn file Excel quản lý <b>${esc(W.name)}</b> (.xlsx). Web lấy: <b>Danh mục hàng</b>, số dư ban đầu / tồn tối thiểu (sheet Nhập Xuất Tồn),
      toàn bộ <b>Sổ Nhập Xuất</b> (gom theo Số phiếu)${S.wh === 'NVL' ? ' và <b>KH Ngày</b> (kế hoạch mua hàng)' : ' và <b>Danh mục tuyến</b>'}.
      Muốn nhập file của kho kia, bấm chuyển kho ở góc trên bên trái trước.</p>
      <div class="toolbar"><input type="file" id="imp-file" accept=".xlsx">
        <label class="check"><input type="checkbox" id="imp-p" checked> Danh mục hàng</label>
        ${S.wh === 'TP' ? '<label class="check"><input type="checkbox" id="imp-r" checked> Danh mục tuyến</label>' : ''}
        ${S.wh === 'NVL' ? '<label class="check"><input type="checkbox" id="imp-k" checked> KH Ngày (thay toàn bộ kế hoạch)</label>' : ''}
        <label class="check"><input type="checkbox" id="imp-l" checked> Sổ nhập xuất (thay toàn bộ phiếu của kho này)</label>
        <button class="btn primary" id="imp-go">Nhập dữ liệu</button></div>
      <div id="imp-result"></div>
      ${cnt ? `<div class="callout warn small">${esc(W.name)} đã có ${cnt} phiếu trên web. Nếu chọn "Sổ nhập xuất", các phiếu này sẽ bị thay bằng dữ liệu trong file (kho kia không bị ảnh hưởng). Nên tải bản sao lưu trước.</div>` : ''}
    </div>
    ${!ONLINE && S.meta.access ? `<div class="card"><h3>Cho nhân viên dùng web</h3>
      <p class="small" style="margin-top:0">Nhân viên dùng máy tính hoặc điện thoại <b>cùng wifi / mạng công ty</b> mở link:</p>
      <div class="toolbar">${(S.meta.access.urls.length ? S.meta.access.urls : ['http://<IP-máy-này>:8000']).map(u => `<code class="access-url">${esc(u)}</code>
        <button class="btn sm" data-copy="${esc(u)}">Sao chép</button>`).join('')}</div>
      <p class="hint">Máy đang chạy web phải <b>bật và để mở cửa sổ đen</b> thì nhân viên mới vào được. Mỗi người bấm nút tên ở góc trên phải để ghi tên mình (hiện trong Lịch sử thao tác).<br>
      Mật khẩu: ${S.meta.access.password ? '<b>đang bật</b> – trình duyệt sẽ hỏi; tên đăng nhập gõ gì cũng được.' : '<b>chưa đặt</b> – để đặt, tạo file <code>mat-khau.txt</code> cạnh <code>server.py</code>, gõ mật khẩu ở dòng đầu, rồi tắt và mở lại web.'}</p></div>` : ''}
    <div class="card"><h3>Sao lưu / xuất dữ liệu</h3><div class="toolbar">
      ${ONLINE ? `<button class="btn" id="ex-backup">⬇ Tải dữ liệu (.json) để sao lưu</button>
      <button class="btn" id="ex-csv">⬇ Xuất sổ nhập xuất ${esc(W.name)} (CSV mở bằng Excel)</button></div>
      <p class="hint">Dữ liệu được lưu trực tuyến, dùng chung cho mọi người được chia sẻ trang. Nên tải dữ liệu định kỳ để sao lưu.
      File này cũng dùng để chuyển dữ liệu sang bản chạy trên máy (nút Nhập file dữ liệu .json ở bản đó).</p>
      <div class="toolbar" style="margin-top:12px"><label class="field">Chuyển dữ liệu từ bản chạy trên máy (file .json "Tải dữ liệu")<input type="file" id="bk-file" accept=".json,application/json"></label>
      <button class="btn" id="bk-go">Nhập file dữ liệu .json (thay toàn bộ dữ liệu 2 kho)</button></div></div>`
      : `<a class="btn" href="${esc(withToken('/api/export/backup'))}">⬇ Tải bản sao lưu cả 2 kho (.db)</a>
      <a class="btn" href="${esc(withToken('/api/export/backup.json'))}">⬇ Tải dữ liệu (.json)</a>
      <a class="btn" href="${esc(withToken('/api/export/lines.csv?wh=' + S.wh))}">⬇ Xuất sổ nhập xuất ${esc(W.name)} (CSV mở bằng Excel)</a></div>
      <p class="hint">Nên sao lưu mỗi cuối ngày. Để khôi phục: tắt web, chép file .db đè vào <code>kho-noi-bo/data/kho.db</code>, chạy lại.
      File <b>.json</b> dùng để chuyển dữ liệu lên web online (nút Nhập file dữ liệu .json ở web online).</p>
      <div class="toolbar" style="margin-top:12px"><label class="field">Chuyển dữ liệu từ bản online (file .json "Tải dữ liệu")<input type="file" id="bk-file" accept=".json,application/json"></label>
      <button class="btn" id="bk-go">Nhập file dữ liệu .json (thay toàn bộ dữ liệu 2 kho)</button></div></div>`}
    <div class="card"><h3>Thông tin ${esc(W.name)}</h3><div class="grid c3">
      <label class="field">Tên kho (ghi trên phiếu, bàn giao, điều chỉnh)<input id="w-name" value="${esc(W.name)}"></label>
      <label class="field">Bộ phận (dòng "Bộ phận:" trên phiếu in)<input id="w-dept" value="${esc(W.department)}"></label>
      <label class="field">Bên giao / bên nhận gợi ý (mỗi dòng một mục)<textarea id="w-parties" rows="6">${esc(lines(W.parties))}</textarea></label>
    </div></div>
    <div class="card"><h3>Chung cho cả 2 kho</h3><div class="grid c3">
      <label class="field">Đơn vị<input id="s-company" value="${esc(s.company)}"></label>
      <label class="field">Khổ giấy in<select id="s-paper">${options(['A4', 'A5'], s.paper)}</select></label>
      <label class="field">Ngưỡng lệch kiểm kê mặc định (%)<input id="s-thr" class="num" value="${fmt((s.stocktake_threshold || 0) * 100)}"></label>
      <label class="field">Bộ phận đặt hàng (kế hoạch mua, cách nhau dấu phẩy)<input id="s-depts" value="${esc((s.plan_depts || []).join(', '))}"></label>
    </div><div class="grid c3" style="margin-top:12px">
      <label class="field">Nhân viên<textarea id="s-staff" rows="7">${esc(lines(s.staff))}</textarea></label>
      <label class="field">Nhóm hàng<textarea id="s-groups" rows="7">${esc(lines(s.groups))}</textarea></label>
      <label class="field">Đơn vị tính<textarea id="s-units" rows="7">${esc(lines(s.units))}</textarea></label>
    </div><div style="margin-top:12px"><button class="btn primary" id="s-save">💾 Lưu cài đặt</button></div></div>`;
  if (ONLINE) {
    $('#ex-backup').onclick = () => guard(async () => saveTextFile(`kho-antam-sao-luu-${isoDate()}.json`, await api('GET', '/export/backup')));
    $('#ex-csv').onclick = () => guard(async () => saveTextFile(`so-nhap-xuat-${S.wh.toLowerCase()}.csv`, await api('GET', '/export/lines.csv')));
  }
  $$('[data-copy]', main).forEach(btn => btn.onclick = async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); toast('Đã sao chép ' + btn.dataset.copy); }
    catch (e) { toast('Hãy tự bôi đen và sao chép: ' + btn.dataset.copy); }
  });
  $('#bk-go').onclick = async () => {
    const file = $('#bk-file').files[0];
    if (!file) return toast('Chọn file .json trước', true);
    if (!(await ask(ONLINE ? 'Thay TOÀN BỘ dữ liệu 2 kho trên web này (mọi người dùng chung) bằng dữ liệu trong file? Nên tải dữ liệu hiện tại để sao lưu trước.'
      : 'Thay TOÀN BỘ dữ liệu 2 kho trên máy này bằng dữ liệu trong file? Nên tải bản sao lưu .db trước.'))) return;
    $('#bk-go').disabled = true;
    let snap;
    try { snap = JSON.parse(await file.text()); } catch (e) { return toast('File không đọc được', true); }
    const res = await guard(() => api('POST', '/import-backup', snap));
    $('#bk-go').disabled = false;
    if (!res) return;
    toast('Đã nhập: ' + Object.entries(res).map(([w, r]) => `${w}: ${r['Phiếu']} phiếu`).join(', '));
    await loadMeta(); render();
  };
  $('#imp-go').onclick = async () => {
    const file = $('#imp-file').files[0];
    if (!file) return toast('Chọn file .xlsx trước', true);
    const ledger = $('#imp-l').checked;
    if (ledger && cnt && !(await ask(`Thay toàn bộ ${cnt} phiếu của ${W.name} bằng dữ liệu trong file?`))) return;
    $('#imp-go').disabled = true; $('#imp-result').innerHTML = '<p class="muted">Đang nhập…</p>';
    const buf = await file.arrayBuffer();
    const chk = id => ($(id) && $(id).checked ? 1 : 0);
    const p = new URLSearchParams({ products: chk('#imp-p'), routes: chk('#imp-r'), plans: chk('#imp-k'), ledger: ledger ? 1 : 0, replace_ledger: 1 });
    const res = await guard(() => api('POST', '/import?' + p, buf));
    $('#imp-go').disabled = false;
    if (!res) { $('#imp-result').innerHTML = ''; return; }
    $('#imp-result').innerHTML = `<div class="callout">Đã nhập vào ${esc(W.name)}: ${Object.entries(res).map(([k, v]) => `<b>${esc(k)}</b>: ${fmt(v)}`).join(' · ')}</div>`;
    await loadMeta();
  };
  $('#s-save').onclick = async () => {
    const arr = id => $(id).value.split('\n').map(x => x.trim()).filter(Boolean);
    const thr = parseNum($('#s-thr').value);
    const body = { company: $('#s-company').value, paper: $('#s-paper').value,
      stocktake_threshold: thr && !isNaN(thr) ? thr / 100 : 0,
      plan_depts: $('#s-depts').value.split(',').map(x => x.trim()).filter(Boolean),
      staff: arr('#s-staff'), groups: arr('#s-groups'), units: arr('#s-units'),
      warehouses: { [S.wh]: { name: $('#w-name').value.trim() || W.name, department: $('#w-dept').value, parties: arr('#w-parties') } } };
    if (await guard(() => api('PUT', '/settings', body))) { toast('Đã lưu cài đặt'); await loadMeta(); }
  };
}

/* ============================================================ Kế hoạch mua hàng (kho NVL) */
// Tuần trong tháng: tính từ Thứ 2 đến Chủ nhật, cắt theo tháng (giống công thức sheet KH Ngày)
function weekOfMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const wd = (first.getDay() + 6) % 7; // Thứ 2 = 0
  return Math.floor((d.getDate() - 1 + wd) / 7) + 1;
}
function monthWeeks(year, month) {
  const first = new Date(year, month - 1, 1), last = new Date(year, month, 0);
  const wd = (first.getDay() + 6) % 7;
  const out = [];
  for (let w = 1; w <= 6; w++) {
    const start = new Date(year, month - 1, 1 - wd + 7 * (w - 1));
    if (start > last) break;
    const s = start < first ? first : start;
    const e0 = new Date(start); e0.setDate(e0.getDate() + 6);
    const e = e0 > last ? last : e0;
    const z = n => String(n).padStart(2, '0');
    out.push({ w, label: `Tuần ${w}: ${z(s.getDate())}/${z(s.getMonth() + 1)} - ${z(e.getDate())}/${z(e.getMonth() + 1)}` });
  }
  return out;
}
function monthPicker(state) {
  const y0 = new Date().getFullYear();
  return `<label class="field">Tháng<select id="pm-m">${options(Array.from({ length: 12 }, (_, i) => [i + 1, 'Tháng ' + (i + 1)]), state.month)}</select></label>
    <label class="field">Năm<select id="pm-y">${options([y0 - 1, y0, y0 + 1], state.year)}</select></label>`;
}
function monthRange(y, m) { const z = n => String(n).padStart(2, '0'); return [`${y}-${z(m)}-01`, `${y}-${z(m)}-${z(new Date(y, m, 0).getDate())}`]; }
function planState() {
  const t = new Date();
  return Object.assign({ year: t.getFullYear(), month: t.getMonth() + 1 }, store('planMonth') || {});
}

async function viewPlanDaily(main) {
  setTitle('Kế hoạch mua hàng theo ngày');
  const st = Object.assign(planState(), { q: '' });
  const depts = S.meta.settings.plan_depts || ['Xưởng', 'Văn phòng'];
  let rows = [];
  let form = { id: null, date: isoDate(), dept: depts[0], product_code: '', qty: null, price: null, need_date: isoDate(), proposer: S.user, note: '' };
  main.innerHTML = `<div class="card" id="pf-card"><h3 id="pf-title">Thêm dòng kế hoạch</h3><div class="grid c4">
      <label class="field">Ngày đặt<input type="date" id="pf-date"></label>
      <label class="field">Bộ phận<select id="pf-dept">${options(depts, form.dept)}</select></label>
      <label class="field span2">Mặt hàng<div id="pf-prod"></div></label>
      <label class="field">Số lượng<input id="pf-qty" class="num" inputmode="decimal"></label>
      <label class="field">Đơn giá (đ) – tự lấy theo danh mục, gõ đè được<input id="pf-price" class="num" inputmode="decimal"></label>
      <label class="field">Ngày cần hàng<input type="date" id="pf-need"></label>
      <label class="field">Người đề xuất<input id="pf-prop" list="dl-people"></label>
      <label class="field span2">Ghi chú<input id="pf-note"></label>
      <div class="field span2" style="justify-content:flex-end;flex-direction:row;gap:8px;align-items:flex-end">
        <button class="btn primary" id="pf-save">+ Thêm vào kế hoạch</button><button class="btn" id="pf-cancel" style="display:none">Hủy sửa</button></div>
    </div>${datalist('dl-people', S.meta.people)}<p class="hint" id="pf-amt"></p></div>
    <div class="toolbar">${monthPicker(st)}<label class="field grow">Tìm<input id="pm-q"></label>
      <button class="btn" id="pm-print">🖨 In danh sách</button></div>
    <div id="pm-list"></div>`;
  const combo = productCombo('', p => { form.product_code = p ? p.code : ''; if (p) { form.price = p.price || 0; $('#pf-price').value = fmt(form.price); } amt(); });
  $('#pf-prod').appendChild(combo);
  function fill() {
    $('#pf-date').value = form.date; $('#pf-dept').value = form.dept; $('#pf-qty').value = form.qty === null ? '' : fmt(form.qty);
    $('#pf-price').value = form.price === null ? '' : fmt(form.price); $('#pf-need').value = form.need_date || ''; $('#pf-prop').value = form.proposer || '';
    $('#pf-note').value = form.note || '';
    const p = productByCode(form.product_code);
    $('input', combo).value = p ? `${p.code} | ${p.name}` : '';
    $('#pf-title').textContent = form.id ? 'Sửa dòng kế hoạch' : 'Thêm dòng kế hoạch';
    $('#pf-save').textContent = form.id ? '💾 Lưu thay đổi' : '+ Thêm vào kế hoạch';
    $('#pf-cancel').style.display = form.id ? '' : 'none';
    amt();
  }
  function amt() {
    const q = parseNum($('#pf-qty').value), pr = parseNum($('#pf-price').value);
    $('#pf-amt').textContent = q && pr ? 'Thành tiền: ' + money(q * pr) + ' đ' : '';
  }
  $('#pf-qty').oninput = amt; $('#pf-price').oninput = amt;
  $('#pf-cancel').onclick = () => { form = Object.assign(form, { id: null, product_code: '', qty: null, price: null, note: '' }); fill(); };
  $('#pf-save').onclick = async () => {
    const qty = parseNum($('#pf-qty').value), price = parseNum($('#pf-price').value);
    if (!form.product_code) return toast('Chọn mặt hàng', true);
    if (!qty || isNaN(qty)) return toast('Nhập số lượng', true);
    const body = { id: form.id, date: $('#pf-date').value, dept: $('#pf-dept').value, product_code: form.product_code, qty, price: isNaN(price) ? 0 : (price || 0),
      need_date: $('#pf-need').value, proposer: $('#pf-prop').value, note: $('#pf-note').value };
    if (!(await guard(() => api('POST', '/plans', body)))) return;
    toast(form.id ? 'Đã lưu' : 'Đã thêm vào kế hoạch');
    form = Object.assign(form, { id: null, date: body.date, dept: body.dept, need_date: body.need_date, proposer: body.proposer, product_code: '', qty: null, price: null, note: '' });
    fill(); combo.focusInput(); load();
  };
  async function load() {
    const [f, t] = monthRange(st.year, st.month);
    rows = await guard(() => api('GET', `/plans?from=${f}&to=${t}`)) || [];
    draw();
  }
  function filtered() { return rows.filter(r => !st.q || matches(st.q, [r.product_code, r.name, r.dept, r.proposer, r.note].join(' '))); }
  function draw() {
    const list = filtered();
    const total = list.reduce((a, r) => a + r.qty * r.price, 0);
    $('#pm-list').innerHTML = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày đặt</th><th>Bộ phận</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th>
      <th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th>Ngày cần hàng</th><th>Người đề xuất</th><th>Ghi chú</th><th>Tuần</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr class="clickable" data-id="${r.id}"><td class="nowrap">${vnDate(r.date)}</td><td>${esc(r.dept)}</td><td>${esc(r.product_code)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td>
        <td class="num">${fmt(r.qty)}</td><td class="num">${fmtBlank0(r.price)}</td><td class="num">${fmtBlank0(Math.round(r.qty * r.price))}</td>
        <td class="nowrap">${vnDate(r.need_date)}</td><td class="small">${esc(r.proposer)}</td><td class="small">${esc(r.note)}</td><td class="center">${weekOfMonth(r.date)}</td>
        <td><button class="btn sm danger" data-del="${r.id}">Xóa</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="7">Cộng ${list.length} dòng</td><td class="num">${money(total)}</td><td colspan="5"></td></tr></tfoot></table></div>
      <p class="hint">Bấm vào dòng để sửa. Tổng hợp theo tuần/tháng ở mục KH mua theo tuần / tháng.</p>` : '<p class="muted">Chưa có kế hoạch trong tháng này.</p>';
    $$('#pm-list tr[data-id]').forEach(tr => tr.onclick = e => {
      if (e.target.closest('button')) return;
      const r = rows.find(x => String(x.id) === tr.dataset.id);
      form = { id: r.id, date: r.date, dept: r.dept, product_code: r.product_code, qty: r.qty, price: r.price, need_date: r.need_date, proposer: r.proposer, note: r.note };
      fill(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $$('#pm-list [data-del]').forEach(b => b.onclick = async () => {
      if (!(await ask('Xóa dòng kế hoạch này?'))) return;
      if (await guard(() => api('DELETE', '/plans/' + b.dataset.del))) load();
    });
  }
  const upd = () => { st.month = +$('#pm-m').value; st.year = +$('#pm-y').value; store('planMonth', { year: st.year, month: st.month }); load(); };
  $('#pm-m').onchange = upd; $('#pm-y').onchange = upd;
  $('#pm-q').oninput = debounce(() => { st.q = $('#pm-q').value; draw(); }, 200);
  $('#pm-print').onclick = () => {
    const list = filtered().slice().reverse();
    printHtml(`<div class="doc landscape">${docHead('', '')}<div class="d-title">Kế hoạch mua hàng theo ngày</div><div class="d-sub">Tháng ${st.month}/${st.year}</div>
      <table class="t"><thead><tr><th>STT</th><th>Ngày đặt</th><th>Bộ phận</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá (đ)</th><th>Thành tiền (đ)</th><th>Ngày cần hàng</th><th>Người đề xuất</th><th>Ghi chú</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c">${vnDate(r.date)}</td><td>${esc(r.dept)}</td><td>${esc(r.product_code)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td>
        <td class="n">${fmt(r.qty)}</td><td class="n">${fmtBlank0(r.price)}</td><td class="n">${fmtBlank0(Math.round(r.qty * r.price))}</td><td class="c">${vnDate(r.need_date)}</td><td>${esc(r.proposer)}</td><td>${esc(r.note)}</td></tr>`).join('')}
      <tr class="sum"><td colspan="8" class="c">TỔNG CỘNG</td><td class="n">${money(list.reduce((a, r) => a + r.qty * r.price, 0))}</td><td colspan="3"></td></tr></tbody></table>
      ${signBlock([['Người lập (Thủ kho)', S.user], ['Kế toán', ''], ['Giám đốc duyệt', '']])}</div>`, 'landscape');
  };
  fill();
  await load();
}

async function viewPlanWeekly(main) {
  setTitle('Kế hoạch mua hàng theo tuần');
  const st = Object.assign(planState(), { all: false });
  main.innerHTML = `<div class="toolbar">${monthPicker(st)}<label class="check"><input type="checkbox" id="pw-all"> Hiện cả mã không có kế hoạch</label>
    <div class="grow"></div><button class="btn" id="pw-print">🖨 In</button></div>
    <p class="hint">Tự tổng hợp từ KH mua theo ngày. Tuần tính từ Thứ 2 đến Chủ nhật, cắt theo tháng.</p><div id="pw-list"></div>`;
  let data = null;
  async function load() {
    const [f, t] = monthRange(st.year, st.month);
    const rows = await guard(() => api('GET', `/plans?from=${f}&to=${t}`)) || [];
    const weeks = monthWeeks(st.year, st.month);
    const per = {};
    rows.forEach(r => {
      const p = per[r.product_code] = per[r.product_code] || { qty: {}, amt: {}, tq: 0, ta: 0 };
      const w = weekOfMonth(r.date);
      p.qty[w] = (p.qty[w] || 0) + r.qty; p.amt[w] = (p.amt[w] || 0) + r.qty * r.price;
      p.tq += r.qty; p.ta += r.qty * r.price;
    });
    data = { weeks, per };
    draw();
  }
  function list() {
    return S.meta.products.map(p => Object.assign({ p }, data.per[p.code] || { qty: {}, amt: {}, tq: 0, ta: 0 })).filter(r => st.all || r.tq);
  }
  function draw() {
    const { weeks } = data;
    const items = list();
    const wt = w => items.reduce((a, r) => a + (r.amt[w] || 0), 0);
    $('#pw-list').innerHTML = `<div class="table-wrap"><table class="data"><thead>
      <tr><th rowspan="2">Mã hàng</th><th rowspan="2">Tên hàng</th><th rowspan="2">ĐVT</th><th rowspan="2">Nhóm hàng</th>${weeks.map(w => `<th colspan="2" class="center">${esc(w.label)}</th>`).join('')}<th colspan="2" class="center">TỔNG THÁNG</th></tr>
      <tr>${weeks.map(() => '<th class="num">Số lượng</th><th class="num">Thành tiền</th>').join('')}<th class="num">Số lượng</th><th class="num">Thành tiền</th></tr></thead><tbody>
      <tr><td colspan="4"><b>TỔNG TIỀN THEO TUẦN</b></td>${weeks.map(w => `<td></td><td class="num"><b>${money(wt(w.w))}</b></td>`).join('')}<td></td><td class="num"><b>${money(items.reduce((a, r) => a + r.ta, 0))}</b></td></tr>
      ${items.map(r => `<tr><td>${esc(r.p.code)}</td><td class="nm">${esc(r.p.name)}</td><td>${esc(r.p.unit)}</td><td class="small">${esc(r.p.grp)}</td>
        ${weeks.map(w => `<td class="num">${fmtBlank0(r.qty[w.w])}</td><td class="num">${fmtBlank0(Math.round(r.amt[w.w] || 0))}</td>`).join('')}
        <td class="num"><b>${fmtBlank0(r.tq)}</b></td><td class="num"><b>${fmtBlank0(Math.round(r.ta))}</b></td></tr>`).join('')}
      </tbody></table></div>${items.length ? '' : '<p class="muted">Chưa có kế hoạch trong tháng này.</p>'}`;
  }
  const upd = () => { st.month = +$('#pm-m').value; st.year = +$('#pm-y').value; store('planMonth', { year: st.year, month: st.month }); load(); };
  $('#pm-m').onchange = upd; $('#pm-y').onchange = upd;
  $('#pw-all').onchange = () => { st.all = $('#pw-all').checked; draw(); };
  $('#pw-print').onclick = () => {
    const { weeks } = data;
    const items = list();
    printHtml(`<div class="doc landscape">${docHead('', '')}<div class="d-title">Kế hoạch mua hàng theo tuần</div><div class="d-sub">Tháng ${st.month}/${st.year}</div>
      <table class="t" style="font-size:9.5pt"><thead><tr><th rowspan="2">Mã hàng</th><th rowspan="2">Tên hàng</th><th rowspan="2">ĐVT</th>${weeks.map(w => `<th colspan="2">${esc(w.label)}</th>`).join('')}<th colspan="2">TỔNG THÁNG</th></tr>
      <tr>${weeks.map(() => '<th>SL</th><th>Thành tiền</th>').join('')}<th>SL</th><th>Thành tiền</th></tr></thead><tbody>
      ${items.map(r => `<tr><td>${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td class="c">${esc(r.p.unit)}</td>${weeks.map(w => `<td class="n">${fmtBlank0(r.qty[w.w])}</td><td class="n">${fmtBlank0(Math.round(r.amt[w.w] || 0))}</td>`).join('')}
        <td class="n">${fmtBlank0(r.tq)}</td><td class="n">${fmtBlank0(Math.round(r.ta))}</td></tr>`).join('')}
      <tr class="sum"><td colspan="3" class="c">TỔNG TIỀN</td>${weeks.map(w => `<td></td><td class="n">${money(items.reduce((a, r) => a + (r.amt[w.w] || 0), 0))}</td>`).join('')}<td></td><td class="n">${money(items.reduce((a, r) => a + r.ta, 0))}</td></tr>
      </tbody></table>${signBlock([['Người lập (Thủ kho)', S.user], ['Kế toán', ''], ['Giám đốc duyệt', '']])}</div>`, 'landscape');
  };
  await load();
}

async function viewPlanMonthly(main) {
  setTitle('Kế hoạch mua hàng tháng');
  const st = Object.assign(planState(), { all: false });
  const depts = S.meta.settings.plan_depts || ['Xưởng', 'Văn phòng'];
  main.innerHTML = `<div class="toolbar">${monthPicker(st)}<label class="check"><input type="checkbox" id="pt-all"> Hiện cả mã không có kế hoạch</label>
    <div class="grow"></div><button class="btn primary" id="pt-print">🖨 In kế hoạch tháng (gửi Kế toán)</button></div>
    <div id="pt-kpi" class="kpis"></div><div id="pt-list"></div>`;
  let items = [], deptAmt = {};
  async function load() {
    const [f, t] = monthRange(st.year, st.month);
    const rows = await guard(() => api('GET', `/plans?from=${f}&to=${t}`)) || [];
    const per = {};
    rows.forEach(r => {
      const p = per[r.product_code] = per[r.product_code] || { dept: {}, tq: 0, ta: 0 };
      p.dept[r.dept] = (p.dept[r.dept] || 0) + r.qty;
      p.tq += r.qty; p.ta += r.qty * r.price;
    });
    deptAmt = {};
    rows.forEach(r => { deptAmt[r.dept] = (deptAmt[r.dept] || 0) + r.qty * r.price; });
    items = S.meta.products.map(p => Object.assign({ p }, per[p.code] || { dept: {}, tq: 0, ta: 0 }));
    $('#pt-kpi').innerHTML = depts.map(d => `<div class="kpi"><div class="k-label">Tổng tiền ${esc(d)}</div><div class="k-val">${money(deptAmt[d] || 0)}</div></div>`).join('') +
      `<div class="kpi"><div class="k-label">Tổng cộng tháng ${st.month}/${st.year}</div><div class="k-val">${money(rows.reduce((a, r) => a + r.qty * r.price, 0))}</div></div>`;
    draw();
  }
  const shown = () => items.filter(r => st.all || r.tq);
  const avg = r => (r.tq ? r.ta / r.tq : (r.p.price || 0));
  function draw() {
    const list = shown();
    $('#pt-list').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Nhóm hàng</th>
      ${depts.map(d => `<th class="num">SL ${esc(d)}</th>`).join('')}<th class="num">Tổng số lượng</th><th class="num">Đơn giá BQ</th><th class="num">Thành tiền</th><th>Nhà cung cấp</th></tr></thead><tbody>
      ${list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td>${esc(r.p.unit)}</td><td class="small">${esc(r.p.grp)}</td>
        ${depts.map(d => `<td class="num">${fmtBlank0(r.dept[d])}</td>`).join('')}<td class="num"><b>${fmtBlank0(r.tq)}</b></td><td class="num">${fmtBlank0(Math.round(avg(r)))}</td>
        <td class="num">${fmtBlank0(Math.round(r.ta))}</td><td class="small">${esc(r.p.supplier)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="${7 + depts.length}">TỔNG CỘNG</td><td class="num">${money(list.reduce((a, r) => a + r.ta, 0))}</td><td></td></tr></tfoot></table></div>
      ${list.length ? '' : '<p class="muted">Chưa có kế hoạch trong tháng này.</p>'}`;
  }
  const upd = () => { st.month = +$('#pm-m').value; st.year = +$('#pm-y').value; store('planMonth', { year: st.year, month: st.month }); load(); };
  $('#pm-m').onchange = upd; $('#pm-y').onchange = upd;
  $('#pt-all').onchange = () => { st.all = $('#pt-all').checked; draw(); };
  $('#pt-print').onclick = () => {
    const list = shown();
    const z = n => String(n).padStart(2, '0');
    printHtml(`<div class="doc landscape">${docHead('', '')}<div class="d-title">Kế hoạch mua hàng tháng</div><div class="d-sub">Tháng ${z(st.month)}/${st.year}</div>
      <div class="d-info" style="display:flex;justify-content:space-between"><div>Bộ phận lập: <b>Kho</b></div><div>Gửi: <b>Phòng Kế toán</b></div></div>
      <table class="t"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Nhóm hàng</th>${depts.map(d => `<th>SL ${esc(d)}</th>`).join('')}<th>Tổng số lượng</th><th>Đơn giá BQ (đ)</th><th>Thành tiền (đ)</th><th>Nhà cung cấp</th><th>Ghi chú</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td class="c">${esc(r.p.unit)}</td><td>${esc(r.p.grp)}</td>
        ${depts.map(d => `<td class="n">${fmtBlank0(r.dept[d])}</td>`).join('')}<td class="n">${fmtBlank0(r.tq)}</td><td class="n">${fmtBlank0(Math.round(avg(r)))}</td><td class="n">${fmtBlank0(Math.round(r.ta))}</td><td>${esc(r.p.supplier)}</td><td></td></tr>`).join('')}
      <tr class="sum"><td colspan="${7 + depts.length}" class="c">TỔNG CỘNG</td><td class="n">${money(list.reduce((a, r) => a + r.ta, 0))}</td><td colspan="2"></td></tr></tbody></table>
      <div class="d-foot">${depts.map(d => `Tổng tiền ${esc(d)}: <b>${money(deptAmt[d] || 0)}</b>`).join(' &nbsp;·&nbsp; ')}</div>
      <div class="d-date-right">Ngày ..... tháng ${st.month} năm ${st.year}</div>
      ${signBlock([['Người lập (Thủ kho)', S.user], ['Kế toán', ''], ['Giám đốc duyệt', '']])}</div>`, 'landscape');
  };
  await load();
}

/* ============================================================ Sản xuất: định mức NVL & lệnh sản xuất (kho NVL) */
const LSX_WARN = { 'Thiếu': 'bad', 'Chưa có mã trong kho NVL': 'bad', 'Tồn âm': 'bad', 'Còn thiếu': 'bad', 'Còn thiếu – đủ tồn để xuất bổ sung': 'warn', 'Dưới tồn tối thiểu': 'warn' };
const warnBadge = w => (w ? `<span class="badge ${LSX_WARN[w] || 'warn'}">${esc(w)}</span>` : '<span class="badge ok">Đủ</span>');
function needNvlWh(main) {
  if (S.wh === 'NVL') return false;
  main.innerHTML = '<div class="callout">Định mức và lệnh sản xuất làm ở <b>Kho nguyên vật liệu</b>. <button class="btn primary sm" id="to-nvl">Chuyển sang kho NVL</button></div>';
  $('#to-nvl').onclick = () => switchWh('NVL');
  return true;
}
const bomCost = b => (b.lines || []).reduce((a, l) => a + (Number(l.q) || 0) * ((productByCode(l.c) || {}).price || 0), 0);

async function viewBom(main) {
  setTitle('Định mức nguyên vật liệu');
  if (needNvlWh(main)) return;
  let list = await api('GET', '/bom');
  const tps = (await guard(() => api('GET', '/tp-products'))) || [];
  const f = { q: '' };
  main.innerHTML = `<div class="toolbar"><button class="btn primary" id="b-add">+ Thêm định mức</button><a class="btn" href="#/lsx/moi">+ Lệnh sản xuất</a>
    <label class="field grow">Tìm thành phẩm / NVL<input id="b-q"></label></div>
    <div class="callout small">Định mức = lượng nguyên vật liệu (theo <b>ĐVT trong kho NVL</b>) cho <b>1 đơn vị thành phẩm</b> (1 túi tacos, 1 cái bánh kebab, 1 kg nhân / sốt).
    Lập <a href="#/lsx/moi">Lệnh sản xuất</a> thì web nhân định mức với số lượng, <b>tự lập phiếu xuất NVL</b> và cảnh báo NVL thiếu / dưới tồn tối thiểu.</div>
    <div id="b-list"></div>`;
  function draw() {
    const rows = list.filter(b => !f.q || matches(f.q, [b.code, b.name].concat((b.lines || []).map(l => l.c + ' ' + ((productByCode(l.c) || {}).name || ''))).join(' ')));
    const has = new Set(list.map(b => b.code));
    const none = tps.filter(t => t.active && !has.has(t.code));
    $('#b-list').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Mã thành phẩm</th><th>Tên thành phẩm</th><th>ĐVT</th><th>Định mức cho 1 ĐVT thành phẩm</th>
      <th class="num">Giá NVL / ĐVT (đ)</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      ${rows.map(b => `<tr class="clickable" data-code="${esc(b.code)}"><td class="nowrap"><b>${esc(b.code)}</b></td><td>${esc(b.name)}</td><td>${esc(b.unit)}</td>
        <td class="small">${(b.lines || []).map(l => { const p = productByCode(l.c); return `${p ? esc(p.name) : `<span class="neg">${esc(l.c)} (không có mã)</span>`}: <b>${fmt(l.q, 6)}</b> ${esc(p ? p.unit : '')}`; }).join('<br>')}</td>
        <td class="num">${money(bomCost(b))}</td><td class="small">${esc(b.note || '')}</td>
        <td class="nowrap"><a class="btn sm primary" href="#/lsx/moi?code=${encodeURIComponent(b.code)}">Lập lệnh SX</a></td></tr>`).join('')}
      </tbody></table></div><p class="hint">${rows.length} thành phẩm có định mức. Bấm dòng để sửa.${none.length ? ` Chưa có định mức: ${none.map(t => esc(t.code)).join(', ')}.` : ''}</p>`;
    $$('#b-list tr[data-code]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a,button')) edit(list.find(b => b.code === tr.dataset.code)); });
  }
  async function reload() { list = await api('GET', '/bom'); draw(); }
  function edit(b) {
    if (VIEW) return;
    const x = b ? JSON.parse(JSON.stringify(b)) : { code: '', name: '', unit: '', lines: [], note: '' };
    if (!x.lines.length) x.lines.push({ c: '', q: null });
    const opts = tps.filter(t => t.active || t.code === x.code).map(t => [t.code, `${t.code} – ${t.name} (${t.unit})`]);
    const { root, close } = openModal({
      title: b ? 'Sửa định mức ' + b.code : 'Thêm định mức NVL', wide: true, saveText: '💾 Lưu định mức',
      body: `<div class="grid c2"><label class="field">Thành phẩm (kho thành phẩm)<select id="bm-tp" ${b ? 'disabled' : ''}>${options(opts, x.code, '— Chọn thành phẩm —')}</select></label>
        <label class="field">Ghi chú<input id="bm-note" value="${esc(x.note || '')}"></label></div>
        <p class="hint" id="bm-unit"></p>
        <div class="table-wrap" style="margin-top:8px;overflow:visible"><table class="data lines-table"><thead><tr><th>#</th><th style="min-width:280px">Nguyên vật liệu</th><th>ĐVT</th><th class="num" style="width:150px">Lượng cho 1 ĐVT TP</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th></th></tr></thead>
        <tbody id="bm-lines"></tbody><tfoot><tr><td></td><td colspan="4">Giá NVL cho 1 đơn vị thành phẩm</td><td class="num" id="bm-sum"></td><td></td></tr></tfoot></table></div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="bm-add">+ Thêm NVL</button>${b ? '<button class="btn sm danger" id="bm-del">Xóa định mức này</button>' : ''}</div>`,
      onSave: async () => {
        const code = b ? b.code : $('#bm-tp', root).value;
        if (!code) throw new Error('Chọn thành phẩm');
        const tp = tps.find(t => t.code === code) || {};
        if (x.lines.some(l => l.c && !(Number(l.q) > 0))) throw new Error('Có dòng NVL chưa nhập lượng');
        const src = !b ? 'Thêm trên web' : b.src && !/sửa trên web/i.test(b.src) ? b.src + ' · đã sửa trên web' : b.src || 'Sửa trên web';
        await api('POST', '/bom', { code, name: tp.name || x.name, unit: tp.unit || x.unit, note: $('#bm-note', root).value, src, lines: x.lines.filter(l => l.c).map(l => ({ c: l.c, q: l.q })) });
        toast('Đã lưu định mức ' + code); await reload(); return true;
      },
    });
    const showUnit = () => { const t = tps.find(y => y.code === (b ? b.code : $('#bm-tp', root).value)); $('#bm-unit', root).textContent = t ? `Định mức tính cho 1 ${t.unit || 'ĐVT'} ${t.name}.` : ''; };
    $('#bm-tp', root).onchange = showUnit; showUnit();
    const sum = () => { $('#bm-sum', root).textContent = money(x.lines.reduce((a, l) => a + (Number(l.q) || 0) * ((productByCode(l.c) || {}).price || 0), 0)); };
    function lines() {
      const tb = $('#bm-lines', root); tb.innerHTML = '';
      x.lines.forEach((l, i) => {
        const p = productByCode(l.c);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="muted">${i + 1}</td><td class="c-prod"></td><td>${esc(p ? p.unit : '')}</td>
          <td><input class="num" inputmode="decimal" value="${l.q === null || l.q === undefined ? '' : esc(fmt(l.q, 6))}"></td>
          <td class="num">${p ? fmtBlank0(p.price) : ''}</td><td class="num" data-o="amt"></td><td><button class="btn sm ghost danger" title="Xóa dòng">✕</button></td>`;
        tr.querySelector('.c-prod').appendChild(productCombo(l.c, prod => {
          l.c = prod ? prod.code : ''; lines();
          const qi = $$('#bm-lines tr', root)[i].querySelector('input.num'); if (qi) qi.focus();
        }));
        const qi = $('input.num', tr);
        const upd = () => { const p2 = productByCode(l.c); $('[data-o=amt]', tr).textContent = p2 && l.q ? money(l.q * (p2.price || 0)) : ''; sum(); };
        qi.oninput = () => { const n = parseNum(qi.value); l.q = n === null || isNaN(n) ? null : n; qi.style.borderColor = isNaN(n) ? 'var(--danger)' : ''; upd(); };
        $('button', tr).onclick = () => { x.lines.splice(i, 1); if (!x.lines.length) x.lines.push({ c: '', q: null }); lines(); };
        tb.appendChild(tr); upd();
      });
    }
    $('#bm-add', root).onclick = () => { x.lines.push({ c: '', q: null }); lines(); };
    const del = $('#bm-del', root);
    if (del) del.onclick = async () => {
      if (!(await ask(`Xóa định mức của ${b.code}? (lệnh sản xuất đã lập vẫn giữ)`))) return;
      if (await guard(() => api('DELETE', '/bom/' + encodeURIComponent(b.code)))) { close(); toast('Đã xóa định mức'); reload(); }
    };
    lines();
  }
  $('#b-add').onclick = () => edit(null);
  $('#b-q').oninput = debounce(() => { f.q = $('#b-q').value; draw(); }, 150);
  draw();
}

// Kết quả tự lập lệnh sản xuất sau khi lưu / xóa phiếu nhập kho TP
function lsxAutoToast(r) {
  if (!r) return;
  const p = [];
  if ((r.created || []).length) p.push('tự lập ' + r.created.join(', '));
  if ((r.updated || []).length) p.push('cập nhật ' + r.updated.join(', '));
  if ((r.removed || []).length) p.push('xóa ' + r.removed.join(', '));
  if (p.length) toast('Lệnh sản xuất: ' + p.join(' · ') + ' – đã trừ NVL theo định mức');
  if ((r.errors || []).length) toast('Lệnh sản xuất tự lập bị lỗi: ' + r.errors.join('; '), true);
}
const checkBadge = x => (x.check ? `<span class="badge ok" title="${esc(x.check.at || '')}">✔ ${esc(x.check.by || 'Đã kiểm tra')}</span>`
  : x.recheck ? '<span class="badge bad">Cần kiểm tra lại</span>' : '<span class="badge warn">Chờ kiểm tra</span>');

async function viewLsxList(main) {
  setTitle('Lệnh sản xuất');
  if (needNvlWh(main)) return;
  main.innerHTML = '<p class="muted">Đang đối chiếu phiếu nhập thành phẩm và cập nhật lệnh sản xuất tự lập…</p>';
  const cfg = await api('GET', '/lsx-auto');
  const sync = cfg.on ? await guard(() => api('POST', '/lsx-auto', {})) : null;
  if (sync) lsxAutoToast(sync);
  const list = await api('GET', '/lsx');
  const f = Object.assign({ only: '' }, store('lsxFilter') || {});
  const isAdmin = !S.account || can('duyet'); // người có quyền duyệt (Quản lý)
  const nobom = sync ? Object.entries(sync.nobom || {}) : [];
  main.innerHTML = `<div class="toolbar"><a class="btn primary" href="#/lsx/moi">+ Lệnh sản xuất lập tay</a><a class="btn" href="#/dinh-muc">Định mức NVL</a>
      <label class="field">Xem<select id="lx-only">${options([['', 'Tất cả lệnh'], ['wait', 'Chờ kiểm tra / cần kiểm tra lại'], ['auto', 'Lệnh tự lập'], ['tay', 'Lệnh lập tay']], f.only)}</select></label>
      <div class="grow"></div><button class="btn" id="lx-sync">↻ Đối chiếu lại phiếu nhập TP</button></div>
    <div class="callout small">${cfg.on ? `<b>Tự lập lệnh sản xuất</b> từ ngày <b>${vnDate(cfg.from)}</b>: mỗi ngày, mỗi thành phẩm = tổng số lượng các <b>phiếu nhập kho thành phẩm từ Xưởng</b>
      → web tự lập phiếu xuất NVL theo định mức (kho NVL <b>không lập tay</b> phiếu xuất NVL cho sản xuất nữa). Sửa / xóa phiếu nhập TP thì lệnh tự cập nhật.
      <br>Người kiểm tra: <b>Quản lý</b>${(cfg.reviewers || []).length ? ' và <b>' + cfg.reviewers.map(esc).join(', ') + '</b>' : ''} – mở lệnh để <b>sửa NVL thực tế</b> nếu có sai sót và bấm <b>Xác nhận đã kiểm tra</b>.`
      : 'Tự lập lệnh sản xuất theo phiếu nhập thành phẩm đang <b>tắt</b>.'}
      ${isAdmin ? ' <button class="btn sm" id="lx-cfg">⚙ Cài đặt</button>' : ''}</div>
    ${sync && sync.manualX && sync.manualX.length ? `<div class="callout warn">⚠ Có ${sync.manualX.length} phiếu xuất NVL cho Xưởng lập tay từ ${vnDate(cfg.from)} (không theo lệnh):
      ${sync.manualX.map(v => `<a href="#/phieu/${esc(v.id)}">${esc(v.no)}</a>`).join(', ')} – NVL có thể bị trừ 2 lần (lệnh tự lập đã trừ theo định mức). Kiểm tra và xóa nếu trùng.</div>` : ''}
    ${nobom.length ? `<div class="callout warn">Thành phẩm nhập từ xưởng nhưng <b>chưa có định mức NVL</b> (chưa trừ NVL): ${nobom.map(([c, n]) => `<b>${esc(c)}</b> (${fmt(n)})`).join(', ')} –
      khai báo ở <a href="#/dinh-muc">Định mức NVL</a> rồi bấm Đối chiếu lại.</div>` : ''}
    <div id="lx-list"></div>`;
  function draw() {
    const rows = list.filter(x => !f.only || (f.only === 'auto' ? x.auto : f.only === 'tay' ? !x.auto : !x.check));
    $('#lx-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày</th><th>Số lệnh</th><th>Thành phẩm</th><th class="num">Số lượng</th><th>Nguồn</th>
      <th>Phiếu xuất NVL</th><th>Tình trạng NVL</th><th>Kiểm tra</th></tr></thead><tbody>
      ${rows.map(x => `<tr class="clickable" data-id="${esc(x.id)}"><td class="nowrap">${vnDate(x.date)}</td><td class="nowrap"><b>${esc(x.no)}</b></td><td>${esc(x.tp)} – ${esc(x.tp_name)}</td>
        <td class="num">${fmt(x.qty)} ${esc(x.tp_unit)}</td><td class="small">${x.auto ? 'Tự lập: ' + esc((x.auto.src || []).join(', ')) : 'Lập tay'}</td>
        <td class="small">${x.vouchers.map(v => esc(v.no)).join('<br>') || '<span class="muted">—</span>'}</td>
        <td>${x.left ? `<span class="badge bad">Còn thiếu ${x.left} NVL</span>` : x.edited ? `<span class="badge warn">Đã sửa ${x.edited} NVL</span>` : '<span class="badge ok">Theo định mức</span>'}</td>
        <td>${checkBadge(x)}</td></tr>`).join('')}
      </tbody></table></div><p class="hint">${rows.length} lệnh. Bấm dòng để xem / kiểm tra.</p>` : '<p class="muted">Không có lệnh sản xuất nào.</p>';
    $$('#lx-list tr[data-id]').forEach(tr => tr.onclick = () => go('#/lsx/' + tr.dataset.id));
  }
  $('#lx-only').onchange = () => { f.only = $('#lx-only').value; store('lsxFilter', f); draw(); };
  $('#lx-sync').onclick = () => render();
  if ($('#lx-cfg')) $('#lx-cfg').onclick = () => {
    openModal({ title: 'Cài đặt lệnh sản xuất tự lập',
      body: `<div class="grid c2"><label class="check span2"><input type="checkbox" id="cf-on" ${cfg.on ? 'checked' : ''}> Tự lập lệnh sản xuất theo tổng phiếu nhập thành phẩm từ Xưởng mỗi ngày</label>
        <label class="field">Áp dụng từ ngày<input type="date" id="cf-from" value="${esc(cfg.from)}"></label>
        <label class="field">Người được kiểm tra / sửa lệnh (tên đăng nhập, cách nhau dấu phẩy)<input id="cf-rv" value="${esc((cfg.reviewers || []).join(', '))}"></label></div>
        <p class="hint">Quản lý luôn được kiểm tra / sửa. Không áp dụng cho ngày trước "từ ngày" (tránh trừ NVL 2 lần với phiếu xuất tay cũ).</p>`,
      onSave: async root => {
        const rv = $('#cf-rv', root).value.split(',').map(y => y.trim().toLowerCase()).filter(Boolean);
        await api('PUT', '/settings', { lsx_auto: { on: $('#cf-on', root).checked, from: $('#cf-from', root).value || cfg.from, reviewers: rv } });
        toast('Đã lưu cài đặt'); await loadMeta(); render(); return true;
      } });
  };
  draw();
}

async function viewLsx(main, m, q) {
  if (needNvlWh(main)) return;
  if (m[1] === 'moi') return lsxNew(main, q || {});
  const x = await api('GET', '/lsx/' + m[1]);
  const D = x.data;
  const auto = !!D.auto;
  setTitle('Lệnh sản xuất ' + D.no);
  const left = x.rows.filter(r => r.left > 1e-9);
  const canMore = !auto && left.some(r => r.have > 1e-9);
  const warnN = x.rows.filter(r => r.warn).length;
  const edited = x.rows.filter(r => r.edited).length;
  main.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="k-label">Thành phẩm</div><div class="k-val" style="font-size:17px">${esc(D.tp_name)}</div><div class="small">${esc(D.tp)}</div></div>
      <div class="kpi"><div class="k-label">Số lượng sản xuất</div><div class="k-val">${fmt(D.qty)} <span class="small">${esc(D.tp_unit)}</span></div></div>
      <div class="kpi"><div class="k-label">Phiếu xuất NVL</div><div class="k-val" style="font-size:16px">${x.vouchers.map(v => `<a href="#/phieu/${esc(v.id)}">${esc(v.no)}</a>`).join('<br>') || '—'}</div></div>
      <div class="kpi"><div class="k-label">Kiểm tra</div><div class="k-val" style="font-size:16px">${checkBadge(D)}</div><div class="small">${D.check ? esc(D.check.at || '') : ''}</div></div></div>
    <div class="callout small">${auto ? `🤖 <b>Lệnh tự lập</b> theo phiếu nhập kho thành phẩm từ Xưởng ngày ${vnDate(x.date)}: <b>${esc((D.auto.src || []).join(', '))}</b>.
      Số lượng thành phẩm lấy từ các phiếu nhập này – sai số lượng thì sửa phiếu nhập TP, lệnh và phiếu xuất NVL tự cập nhật.` : 'Lệnh lập tay.'}
      ${x.can_review ? ' Bạn được <b>kiểm tra / sửa</b> lệnh này.' : ` Chỉ Quản lý${(x.reviewers || []).length ? ' và ' + x.reviewers.map(esc).join(', ') : ''} được sửa / xác nhận kiểm tra.`}</div>
    ${D.recheck ? `<div class="callout warn">⚠ ${esc(D.recheck)} – cần kiểm tra lại.</div>` : ''}
    ${D.edit ? `<p class="hint">NVL thực tế đã sửa bởi <b>${esc(D.edit.by || '')}</b> lúc ${esc(D.edit.at || '')}${D.review_note ? ' – ' + esc(D.review_note) : ''}.</p>` : D.review_note ? `<p class="hint">Ghi chú kiểm tra: ${esc(D.review_note)}</p>` : ''}
    ${left.length ? `<div class="callout warn">⚠ <b>${left.length} NVL chưa xuất đủ</b> theo định mức vì kho không đủ tồn.
      ${canMore ? 'Kho đã có tồn cho một số NVL này – bấm <b>Xuất bổ sung NVL còn thiếu</b>.' : auto ? '' : 'Nhập hàng (phiếu nhập) xong quay lại bấm <b>Xuất bổ sung NVL còn thiếu</b>.'}</div>`
      : warnN ? `<div class="callout warn">⚠ ${warnN} NVL đang dưới tồn tối thiểu / tồn âm – kiểm tra phiếu nhập NVL hoặc lên kế hoạch mua hàng.</div>` : ''}
    ${x.bomChanged ? '<p class="hint">Định mức của thành phẩm này đã được sửa sau khi lập lệnh – lệnh giữ định mức lúc lập (tự tính lại khi số lượng thành phẩm đổi).</p>' : ''}
    ${auto ? '' : `<div class="card"><div class="small">Ngày lệnh: <b>${vnDate(x.date)}</b> · Người giao NVL (kho): ${esc(D.giver || '—')} · Người nhận (xưởng): ${esc(D.receiver || '—')}${D.note ? ' · Ghi chú: ' + esc(D.note) : ''} · Lập lúc ${esc(x.created_at || '')}</div></div>`}
    <div class="table-wrap"><table class="data"><thead><tr><th>Mã NVL</th><th>Tên NVL</th><th>ĐVT</th><th class="num">Định mức / 1 ${esc(D.tp_unit)}</th><th class="num">Theo định mức</th>
      <th class="num">Đã xuất (thực tế)</th><th class="num">Chênh lệch</th><th class="num">Còn thiếu</th><th class="num">Tồn kho hiện tại</th><th class="num">Tồn tối thiểu</th><th>Cảnh báo</th></tr></thead><tbody>
      ${x.rows.map(r => { const df = Math.round((r.got - r.need) * 1e6) / 1e6; return `<tr class="${r.left > 1e-9 || r.have < 0 ? 'row-bad' : r.warn ? 'row-warn' : ''}"><td>${esc(r.c)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td>
        <td class="num">${r.per ? fmt(r.per, 6) : '<span class="muted">ngoài ĐM</span>'}</td><td class="num">${fmt(r.need)}</td><td class="num">${fmt(r.got)}${r.edited ? ' <span class="badge warn">sửa</span>' : ''}</td>
        <td class="num">${df ? `<span class="${df > 0 ? 'neg' : 'pos'}">${df > 0 ? '+' : ''}${fmt(df)}</span>` : ''}</td><td class="num">${r.left > 1e-9 ? `<b class="neg">${fmt(r.left)}</b>` : ''}</td>
        <td class="num ${r.have < 0 ? 'neg' : ''}">${fmt(r.have)}</td><td class="num">${r.min === null ? '' : fmt(r.min)}</td><td>${warnBadge(r.warn)}</td></tr>`; }).join('')}
    </tbody></table></div>${edited ? `<p class="hint">${edited} NVL xuất khác định mức (đã sửa theo thực tế).</p>` : ''}
    <div class="form-actions">
      ${x.can_review && !(D.extra || []).length ? '<button class="btn primary" id="ls-edit">✏ Kiểm tra / sửa NVL thực tế</button>' : ''}
      ${x.can_review ? (D.check ? '<button class="btn" id="ls-uncheck">Bỏ xác nhận kiểm tra</button>' : '<button class="btn primary" id="ls-check">✔ Xác nhận đã kiểm tra</button>') : ''}
      ${left.length && !auto ? `<button class="btn primary" id="ls-more" ${canMore ? '' : 'disabled title="Kho chưa có tồn các NVL còn thiếu"'}>⤴ Xuất bổ sung NVL còn thiếu</button>` : ''}
      ${auto ? '' : '<button class="btn" id="ls-tp">→ Nhập thành phẩm vào kho TP</button>'}
      <button class="btn" id="ls-print">🖨 In lệnh sản xuất</button>
      ${auto ? '' : `<a class="btn" href="#/lsx/moi?code=${encodeURIComponent(D.tp)}">+ Lệnh mới cùng thành phẩm</a><button class="btn danger" id="ls-del">Xóa lệnh</button>`}
      <a class="btn ghost" href="#/lsx">← Danh sách lệnh</a></div>`;
  const review = async body => {
    if (await guard(() => api('POST', `/lsx/${encodeURIComponent(x.id)}?act=review`, body))) { await loadMeta(); render(); return true; }
    return false;
  };
  if ($('#ls-check')) $('#ls-check').onclick = async () => { if (await review({ check: true })) toast('Đã xác nhận kiểm tra ' + D.no); };
  if ($('#ls-uncheck')) $('#ls-uncheck').onclick = async () => { if (await review({ check: false })) toast('Đã bỏ xác nhận kiểm tra ' + D.no); };
  if ($('#ls-edit')) $('#ls-edit').onclick = () => lsxEditLines(x, review);
  if ($('#ls-more')) $('#ls-more').onclick = async () => {
    const r = await guard(() => api('POST', `/lsx/${encodeURIComponent(x.id)}?act=more`, { date: isoDate() }));
    if (r) { toast('Đã xuất bổ sung – phiếu ' + r.voucher_no); await loadMeta(); render(); }
  };
  if ($('#ls-tp')) $('#ls-tp').onclick = async () => {
    store('voucherDraft', { wh: 'TP', type: 'N', date: isoDate(), from_party: 'Xưởng', reason: `Nhập kho thành phẩm theo ${D.no}`, doc_ref: D.no,
      lines: [{ product_code: D.tp, qty: D.qty, price: 0, note: '' }] });
    await switchWh('TP', true);
    go('#/phieu/moi?type=N&draft=1', { force: true });
  };
  $('#ls-print').onclick = () => printLsx(x);
  if ($('#ls-del')) $('#ls-del').onclick = async () => {
    if (!(await ask(`Xóa lệnh ${D.no}? Các phiếu xuất NVL của lệnh (${x.vouchers.map(v => v.no).join(', ') || 'không có'}) cũng bị xóa – NVL được cộng lại vào tồn kho.`))) return;
    if (await guard(() => api('DELETE', '/lsx/' + encodeURIComponent(x.id)))) { toast('Đã xóa lệnh ' + D.no); await loadMeta(); go('#/lsx', { force: true }); }
  };
}
// Sửa lượng NVL thực tế đã dùng cho lệnh (ghi lại phiếu xuất NVL của lệnh)
function lsxEditLines(x, review) {
  const D = x.data;
  const lines = x.rows.map(r => ({ c: r.c, qty: r.got, need: r.need }));
  const { root } = openModal({
    title: 'Kiểm tra / sửa NVL thực tế – ' + D.no, wide: true, saveText: '💾 Lưu & ghi lại phiếu xuất NVL',
    body: `<p class="small" style="margin-top:0">${esc(D.tp_name)} × <b>${fmt(D.qty)} ${esc(D.tp_unit)}</b>. Sửa cột <b>Thực tế dùng</b> theo số liệu đúng (cân / đếm ở xưởng);
      phiếu xuất NVL ${esc(D.voucher_no || '')} được ghi lại theo các số này. Bấm "Về định mức" để lấy lại số theo định mức.</p>
      <div class="table-wrap" style="overflow:visible"><table class="data lines-table"><thead><tr><th style="min-width:260px">Nguyên vật liệu</th><th>ĐVT</th><th class="num">Theo định mức</th>
      <th class="num" style="width:150px">Thực tế dùng</th><th class="num">Chênh lệch</th><th></th></tr></thead><tbody id="ed-lines"></tbody></table></div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="ed-add">+ Thêm NVL ngoài định mức</button><button class="btn sm" id="ed-reset">Về định mức</button></div>
      <label class="field" style="margin-top:10px">Ghi chú kiểm tra (lý do sửa)<input id="ed-note" value="${esc(D.review_note || '')}" maxlength="500"></label>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="ed-check" checked> Xác nhận đã kiểm tra lệnh này</label>`,
    onSave: async () => {
      if (lines.some(l => l.c && (l.qty === null || isNaN(l.qty)))) throw new Error('Có dòng chưa nhập số lượng thực tế');
      return review({ lines: lines.filter(l => l.c).map(l => ({ c: l.c, qty: l.qty })), note: $('#ed-note', root).value, check: $('#ed-check', root).checked });
    },
  });
  function draw() {
    const tb = $('#ed-lines', root); tb.innerHTML = '';
    lines.forEach((l, i) => {
      const p = productByCode(l.c);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="c-prod">${l.need !== undefined ? `<b>${esc(l.c)}</b> ${esc(p ? p.name : '')}` : ''}</td><td>${esc(p ? p.unit : '')}</td><td class="num">${l.need !== undefined ? fmt(l.need) : ''}</td>
        <td><input class="num" inputmode="decimal" value="${l.qty === null || l.qty === undefined ? '' : esc(fmt(l.qty, 6))}"></td><td class="num" data-o="df"></td>
        <td>${l.need === undefined ? '<button class="btn sm ghost danger" title="Bỏ dòng">✕</button>' : ''}</td>`;
      if (l.need === undefined) tr.querySelector('.c-prod').appendChild(productCombo(l.c, prod => { l.c = prod ? prod.code : ''; draw(); }));
      const qi = $('input.num', tr);
      const upd = () => { const df = Math.round(((Number(l.qty) || 0) - (l.need || 0)) * 1e6) / 1e6; $('[data-o=df]', tr).innerHTML = df ? `<span class="${df > 0 ? 'neg' : 'pos'}">${df > 0 ? '+' : ''}${fmt(df)}</span>` : ''; };
      qi.oninput = () => { const n = parseNum(qi.value); l.qty = n === null ? 0 : n; qi.style.borderColor = isNaN(n) ? 'var(--danger)' : ''; upd(); };
      const b = $('button', tr); if (b) b.onclick = () => { lines.splice(i, 1); draw(); };
      tb.appendChild(tr); upd();
    });
  }
  $('#ed-add', root).onclick = () => { lines.push({ c: '', qty: null }); draw(); };
  $('#ed-reset', root).onclick = () => { for (let i = lines.length - 1; i >= 0; i--) { if (lines[i].need === undefined) lines.splice(i, 1); else lines[i].qty = lines[i].need; } draw(); };
  draw();
}
function printLsx(x) {
  const D = x.data;
  printHtml(`<div class="doc">${docHead('Phiếu nội bộ', '')}<div class="d-title">Lệnh sản xuất</div><div class="d-sub">${longDate(x.date)}</div><div class="d-no">Số: <b>${esc(D.no)}</b></div>
    <div class="d-info"><div>Thành phẩm: <b>${esc(D.tp)} – ${esc(D.tp_name)}</b></div><div>Số lượng sản xuất: <b>${fmt(D.qty)} ${esc(D.tp_unit)}</b></div>
    <div>Phiếu xuất NVL kèm theo: ${x.vouchers.map(v => esc(v.no)).join(', ') || '—'}</div>${D.note ? `<div>Ghi chú: ${esc(D.note)}</div>` : ''}</div>
    <table class="t"><thead><tr><th>STT</th><th>Mã NVL</th><th>Tên nguyên vật liệu</th><th>ĐVT</th><th>Định mức / 1 ${esc(D.tp_unit)}</th><th>Cần theo lệnh</th><th>Đã xuất</th><th>Còn thiếu</th></tr></thead>
    <tbody>${x.rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.c)}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td><td class="n">${fmt(r.per, 6)}</td>
      <td class="n">${fmt(r.need)}</td><td class="n">${fmt(r.got)}</td><td class="n">${r.left > 1e-9 ? fmt(r.left) : ''}</td></tr>`).join('')}</tbody></table>
    ${signBlock([['Người lập lệnh', S.user], ['Thủ kho', D.giver], ['Tổ trưởng sản xuất', D.receiver]])}</div>`, 'portrait', D.no);
}
async function lsxNew(main, q) {
  setTitle('Lệnh sản xuất mới');
  const boms = await api('GET', '/bom');
  if (!boms.length) { main.innerHTML = '<div class="callout warn">Chưa có định mức NVL nào – khai báo ở <a href="#/dinh-muc">Sản xuất › Định mức NVL</a> trước.</div>'; return; }
  const last = store('lsxLast') || {};
  const q0 = q.qty ? parseNum(q.qty) : null;
  const f = { date: isoDate(), code: q.code || '', qty: q0 && !isNaN(q0) ? q0 : null, mode: 'part' };
  let plan = null, seq = 0;
  main.innerHTML = `<div class="card"><div class="grid c4">
      <label class="field">Ngày<input type="date" id="lx-date" value="${f.date}"></label>
      <label class="field span2">Thành phẩm<select id="lx-tp">${options(boms.map(b => [b.code, `${b.code} – ${b.name} (${b.unit})`]), f.code, '— Chọn thành phẩm —')}</select></label>
      <label class="field">Số lượng sản xuất <span id="lx-unit"></span><input id="lx-qty" class="num" inputmode="decimal" value="${f.qty ? esc(fmt(f.qty)) : ''}"></label>
      <label class="field">Người giao NVL (kho)<input id="lx-giver" list="dl-people" value="${esc(last.giver || S.user || '')}"></label>
      <label class="field">Người nhận (xưởng)<input id="lx-recv" list="dl-people" value="${esc(last.receiver || '')}"></label>
      <label class="field span2">Ghi chú (ca, tổ…)<input id="lx-note"></label></div>${datalist('dl-people', S.meta.people)}</div>
    <div id="lx-plan"></div>
    <div class="form-actions"><button class="btn primary" id="lx-save">✔ Lập lệnh &amp; tự xuất NVL</button><a class="btn ghost" href="#/lsx">← Danh sách lệnh</a></div>`;
  const unit = () => { const b = boms.find(y => y.code === f.code); $('#lx-unit').textContent = b ? `(${b.unit})` : ''; };
  async function load() {
    unit();
    const box = $('#lx-plan');
    if (!f.code || !(f.qty > 0)) { plan = null; box.innerHTML = '<p class="muted">Chọn thành phẩm và nhập số lượng – web tính NVL cần xuất theo định mức và so với tồn kho.</p>'; return; }
    const my = ++seq;
    const p = await guard(() => api('GET', `/lsx?plan=1&code=${encodeURIComponent(f.code)}&qty=${f.qty}&date=${f.date}`));
    if (my !== seq || !p) return;
    plan = p; draw();
  }
  function draw() {
    const short = plan.rows.filter(r => r.warn === 'Thiếu'), low = plan.rows.filter(r => r.warn === 'Dưới tồn tối thiểu'), miss = plan.rows.filter(r => r.missing);
    const val = plan.rows.reduce((a, r) => a + r.need * r.price, 0);
    $('#lx-plan').innerHTML = `${miss.length ? `<div class="callout warn">⛔ Định mức có ${miss.length} mã NVL không có trong danh mục kho NVL (${miss.map(r => esc(r.c)).join(', ')}) – sửa ở <a href="#/dinh-muc">Định mức NVL</a>.</div>` : ''}
      ${short.length ? `<div class="callout warn">⚠ <b>${short.length} NVL không đủ tồn</b>: ${short.map(r => `${esc(r.name)} (cần ${fmt(r.need)}, tồn ${fmt(r.have)} ${esc(r.unit)})`).join('; ')}.
        <div style="margin-top:8px;display:grid;gap:4px"><label class="check"><input type="radio" name="lx-mode" value="part" ${f.mode === 'part' ? 'checked' : ''}> Chỉ xuất phần NVL đang còn tồn – phần thiếu xuất bổ sung sau khi nhập hàng (khuyên dùng)</label>
        <label class="check"><input type="radio" name="lx-mode" value="full" ${f.mode === 'full' ? 'checked' : ''}> Vẫn xuất đủ theo định mức (tồn kho NVL sẽ bị âm)</label></div></div>` : ''}
      ${low.length ? `<div class="callout warn">⚠ ${low.length} NVL sẽ <b>xuống dưới tồn tối thiểu</b> sau lệnh này: ${low.map(r => esc(r.name)).join(', ')} – nên lên kế hoạch mua hàng.</div>` : ''}
      ${!short.length && !low.length && !miss.length ? '<div class="callout">✔ Đủ nguyên vật liệu cho lệnh này.</div>' : ''}
      <div class="table-wrap"><table class="data"><thead><tr><th>Mã NVL</th><th>Tên NVL</th><th>ĐVT</th><th class="num">Định mức / 1 ${esc(plan.unit)}</th><th class="num">Cần xuất</th>
        <th class="num">Tồn kho</th><th class="num">Tồn sau khi xuất</th><th class="num">Tồn tối thiểu</th><th class="num">Thành tiền (đ)</th><th>Cảnh báo</th></tr></thead><tbody>
        ${plan.rows.map(r => `<tr class="${r.warn === 'Thiếu' || r.missing ? 'row-bad' : r.warn ? 'row-warn' : ''}"><td>${esc(r.c)}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.unit)}</td>
          <td class="num">${fmt(r.per, 6)}</td><td class="num"><b>${fmt(r.need)}</b></td><td class="num">${fmt(r.have)}</td><td class="num ${r.after < 0 ? 'neg' : ''}">${fmt(r.after)}</td>
          <td class="num">${r.min === null ? '' : fmt(r.min)}</td><td class="num">${fmtBlank0(Math.round(r.need * r.price))}</td><td>${warnBadge(r.warn)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="8">Giá trị NVL theo định mức (đơn giá mua gần nhất)</td><td class="num">${money(val)}</td><td></td></tr></tfoot></table></div>
      ${plan.note ? `<p class="hint">Ghi chú định mức: ${esc(plan.note)}</p>` : ''}`;
    $$('input[name=lx-mode]').forEach(r => r.onchange = () => { f.mode = r.value; });
  }
  const reload = debounce(load, 300);
  $('#lx-date').onchange = () => { f.date = $('#lx-date').value; load(); };
  $('#lx-tp').onchange = () => { f.code = $('#lx-tp').value; load(); };
  $('#lx-qty').oninput = () => { const n = parseNum($('#lx-qty').value); f.qty = n === null || isNaN(n) ? null : n; reload(); };
  $('#lx-save').onclick = async () => {
    if (!f.code) return toast('Chọn thành phẩm', true);
    if (!(f.qty > 0)) return toast('Nhập số lượng sản xuất', true);
    await load();
    if (!plan) return;
    if (plan.rows.some(r => r.missing)) return toast('Định mức có NVL chưa có trong danh mục kho NVL', true);
    const short = plan.rows.filter(r => r.warn === 'Thiếu').length;
    if (short && f.mode === 'full' && !(await ask(`${short} NVL không đủ tồn – xuất đủ sẽ làm tồn kho âm. Vẫn lập lệnh?`))) return;
    const body = { date: f.date, code: f.code, qty: f.qty, mode: f.mode, giver: $('#lx-giver').value, receiver: $('#lx-recv').value, note: $('#lx-note').value };
    $('#lx-save').disabled = true;
    const r = await guard(() => api('POST', '/lsx', body));
    $('#lx-save').disabled = false;
    if (!r) return;
    store('lsxLast', { giver: body.giver, receiver: body.receiver });
    toast(`Đã lập ${r.no}` + (r.voucher_no ? ` và xuất NVL – phiếu ${r.voucher_no}` : ' – kho chưa có NVL để xuất'));
    await loadMeta();
    go('#/lsx/' + r.id, { force: true });
  };
  load();
}

/* ============================================================ Lịch sử */
// Chi tiết phiếu trong lịch sử: detail = {trước?, sau?, id?} (mỗi bên {ngày, dòng: ["MÃ x SL"], v?: đủ thông tin phiếu});
// bản cũ: Lập phiếu = ["MÃ x SL"], Xóa phiếu = {ngày, dòng}
function logVoucher(r) {
  if (!/phiếu/i.test(r.action) || /biên bản|kế hoạch/i.test(r.action)) return null;
  let d; try { d = JSON.parse(r.detail); } catch (e) { return null; }
  if (Array.isArray(d)) d = { sau: { 'dòng': d } };
  else if (d && d['dòng'] && !d['trước'] && !d['sau']) d = { 'trước': d };
  if (!d || (!d['trước'] && !d['sau'])) return null;
  const side = x => {
    if (!x) return null;
    if (Array.isArray(x)) x = { 'dòng': x }; // bản cũ: "sau" chỉ là danh sách "MÃ x SL"
    const lines = x.v && Array.isArray(x.v.lines) ? x.v.lines.map(([c, q, p, n]) => ({ c, q: Number(q) || 0, p: Number(p) || 0, n: n || '' }))
      : (x['dòng'] || []).map(s => { const m = /^(.*)\s+x\s+(-?[\d.,]+)$/.exec(String(s)); return m ? { c: m[1], q: Number(m[2].replace(/,/g, '')) || 0, p: null, n: '' } : { c: String(s), q: 0, p: null, n: '' }; });
    return { date: x['ngày'] || '', h: x.v || null, lines };
  };
  return { before: side(d['trước']), after: side(d['sau']), id: d.id || '' };
}
const LOG_H = [['type', 'Loại phiếu', v => TYPE_LABEL[v] || v], ['no', 'Số phiếu'], ['route', 'Tuyến'], ['from_party', 'Bên giao'], ['to_party', 'Bên nhận'], ['giver', 'Người giao'],
  ['receiver', 'Người nhận'], ['reason', 'Lý do'], ['bill_count', 'Số bill'], ['doc_ref', 'Chứng từ kèm'], ['note', 'Ghi chú']];
function logVoucherHtml(r, x) {
  const pn = c => { const p = ((S.meta && S.meta.products) || []).find(y => y.code === c); return p ? p.name : ''; };
  const B = x.before, A = x.after, both = B && A;
  // thông tin phiếu
  const hrows = [['date', 'Ngày phiếu']].concat(LOG_H).map(([k, lab, f]) => {
    const g = s => (!s ? '' : k === 'date' ? (s.date ? vnDate(s.date) : '') : s.h ? (f ? f(s.h[k] || '') : s.h[k] || '') : '');
    const b = g(B), a = g(A);
    if (!b && !a) return '';
    const ch = both && b !== a;
    return `<tr${ch ? ' class="lg-ch"' : ''}><td>${esc(lab)}</td>${B ? `<td>${esc(b) || '<span class="muted">—</span>'}</td>` : ''}${A ? `<td>${esc(a) || '<span class="muted">—</span>'}</td>` : ''}</tr>`;
  }).join('');
  // các dòng hàng: ghép theo mã hàng
  const codes = []; [B, A].forEach(s => s && s.lines.forEach(l => { if (!codes.includes(l.c)) codes.push(l.c); }));
  const sum = (s, c) => s ? s.lines.filter(l => l.c === c).reduce((t, l) => t + l.q, 0) : 0;
  const has = (s, c) => !!s && s.lines.some(l => l.c === c);
  let nCh = 0;
  const lrows = codes.map(c => {
    const qb = sum(B, c), qa = sum(A, c), inB = has(B, c), inA = has(A, c);
    let st = '';
    if (both) { st = !inB ? 'Thêm' : !inA ? 'Bỏ' : qb !== qa ? 'Đổi' : ''; if (st) nCh++; }
    const nb = B ? (B.lines.find(l => l.c === c) || {}).n || '' : '', na = A ? (A.lines.find(l => l.c === c) || {}).n || '' : '';
    return `<tr class="${st ? 'lg-ch' : ''}"><td class="nowrap"><b>${esc(c)}</b></td><td>${esc(pn(c))}</td>
      ${B ? `<td class="num">${inB ? fmt(qb) : '<span class="muted">—</span>'}</td>` : ''}${A ? `<td class="num">${inA ? fmt(qa) : '<span class="muted">—</span>'}</td>` : ''}
      ${both ? `<td class="num">${inA && inB && qa !== qb ? (qa > qb ? '+' : '') + fmt(qa - qb) : ''}</td><td>${st ? `<span class="badge ${st === 'Thêm' ? 'ok' : st === 'Bỏ' ? 'bad' : 'warn'}">${st}</span>` : ''}</td>` : ''}
      <td class="small">${esc(both && inA && inB && nb !== na ? `${nb || '—'} → ${na || '—'}` : na || nb)}</td></tr>`;
  }).join('');
  const tb = (s, t) => (s ? `<th class="num">${t}</th>` : '');
  return `<p style="margin:0 0 10px"><b>${esc(r.action)}</b> ${esc(r.target)} · ${esc(r.who || '')} · ${esc(r.at)}${both ? ` · <b>${nCh}</b> dòng hàng thay đổi` : ''}</p>
    ${hrows ? `<h4 style="margin:6px 0">Thông tin phiếu</h4><div class="table-wrap"><table class="data"><thead><tr><th></th>${B ? `<th>${both ? 'Trước khi sửa' : 'Lúc xóa'}</th>` : ''}${A ? `<th>${both ? 'Sau khi sửa' : 'Nội dung'}</th>` : ''}</tr></thead><tbody>${hrows}</tbody></table></div>` : ''}
    <h4 style="margin:12px 0 6px">Mặt hàng</h4><div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Tên hàng</th>${tb(B, both ? 'SL trước' : 'Số lượng')}${tb(A, both ? 'SL sau' : 'Số lượng')}${both ? '<th class="num">Chênh lệch</th><th>Thay đổi</th>' : ''}<th>Ghi chú</th></tr></thead>
    <tbody>${lrows || '<tr><td colspan="6" class="muted">Không có dòng hàng</td></tr>'}</tbody></table></div>
    ${both && !nCh ? '<p class="hint">Số lượng các mặt hàng không đổi (chỉ sửa thông tin phiếu hoặc ngày).</p>' : ''}
    ${!(B && B.h) && !(A && A.h) ? '<p class="hint">Thao tác ghi trước khi có bản lưu đầy đủ: chỉ xem được ngày và số lượng từng mã hàng.</p>' : ''}`;
}
async function viewLog(main) {
  setTitle('Lịch sử thao tác');
  const rows = await api('GET', '/log');
  const f = Object.assign({ q: '', only: '' }, store('logF') || {});
  const short = (r, x) => {
    if (!x) return esc(r.detail);
    const n = s => (s ? s.lines.length : 0);
    return x.before && x.after ? `Sửa ${n(x.before)} → ${n(x.after)} dòng hàng${x.before.date !== x.after.date ? ` · ngày ${vnDate(x.before.date)} → ${vnDate(x.after.date)}` : ''}`
      : x.after ? `${n(x.after)} dòng hàng${x.after.date ? ' · ngày ' + vnDate(x.after.date) : ''}` : `${n(x.before)} dòng hàng${x.before.date ? ' · ngày ' + vnDate(x.before.date) : ''}`;
  };
  const list = rows.map(r => Object.assign({ x: logVoucher(r) }, r));
  function draw() {
    const qn = noAccent(f.q);
    const show = list.filter(r => (!f.only || (f.only === 'sua' ? r.action === 'Sửa phiếu' : !!r.x)) && (!qn || noAccent([r.who, r.action, r.target, r.detail].join(' ')).includes(qn)));
    $('#lg-body').innerHTML = show.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th><th></th></tr></thead><tbody>
      ${show.map(r => `<tr${r.x ? ` class="clickable" data-lg="${esc(r.id)}"` : ''}><td class="nowrap">${esc(r.at)}</td><td>${esc(r.who)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td>
        <td class="small" style="max-width:520px;word-break:break-word">${short(r, r.x)}</td><td>${r.x ? '<button class="btn sm">🔍 Xem</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Không có thao tác nào khớp.</p>';
    $$('#lg-body tr[data-lg]').forEach(tr => tr.onclick = () => {
      const r = list.find(y => y.id === tr.dataset.lg); if (!r) return;
      const m = openModal({ title: `${r.action} ${r.target}`, wide: true, body: logVoucherHtml(r, r.x) + (r.x.id && !/Xóa/.test(r.action) ? '<div class="form-actions" style="margin-top:12px"><button class="btn" id="lg-open">Mở phiếu hiện tại</button></div>' : '') });
      const b = $('#lg-open', m.root); if (b) b.onclick = () => { m.close(); location.hash = '#/phieu/' + r.x.id; };
    });
  }
  main.innerHTML = rows.length ? `<div class="toolbar"><label class="field">Tìm (người, thao tác, số phiếu…)<input id="lg-q" value="${esc(f.q)}"></label>
      <label class="field">Hiện<select id="lg-only"><option value="">Tất cả thao tác</option><option value="phieu" ${f.only === 'phieu' ? 'selected' : ''}>Chỉ thao tác phiếu</option><option value="sua" ${f.only === 'sua' ? 'selected' : ''}>Chỉ phiếu sửa</option></select></label></div>
    <div id="lg-body"></div><p class="hint">500 thao tác gần nhất. Bấm dòng phiếu (🔍 Xem) để xem chi tiết: phiếu sửa hiện trước / sau và các dòng hàng thay đổi.</p>` : '<p class="muted">Chưa có thao tác nào.</p>';
  if (!rows.length) return;
  let t; $('#lg-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; store('logF', f); draw(); }, 200); };
  $('#lg-only').onchange = e => { f.only = e.target.value; store('logF', f); draw(); };
  draw();
}

/* ============================================================ trang xem công khai */
// Trang xem tự đăng lại chính nó với số liệu mới: dựng lại mã nguồn từ các khối gốc (không lấy DOM đang chạy).
function viewPageSource(snapshotText) {
  const t = id => document.getElementById(id).textContent;
  const reset = Backend.skeletonReset || ':root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}';
  const content = [
    `<title>${esc(window.ANTAM_TITLE)}</title>`,
    `<meta name="description" content="${esc(window.ANTAM_DESC)}">`,
    `<style id="app-style">${t('app-style')}</style>`,
    window.ANTAM_MARKUP,
    `<script type="application/json" id="antam-snapshot">${snapshotText.replace(/</g, '\\u003c')}<\/script>`,
    `<script id="antam-boot">${t('antam-boot')}<\/script>`,
    `<script src="${window.ANTAM_SHEETJS}"><\/script>`,
    `<script id="antam-backend">${t('antam-backend')}<\/script>`,
    `<script id="antam-app">${t('antam-app')}<\/script>`,
  ].join('\n');
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' +
    reset + '</style></head><body>' + content + '</body></html>';
}
function openSnapshotUpdate() {
  openModal({
    title: 'Cập nhật số liệu cho trang xem',
    saveText: 'Đăng số liệu mới',
    body: `<ol class="small" style="margin:0 0 12px;padding-left:18px">
        <li>Mở <b>web chính</b> → <b>Cài đặt &amp; dữ liệu</b> → <b>Tải dữ liệu</b> (file .json).</li>
        <li>Chọn file đó ở đây rồi bấm <b>Đăng số liệu mới</b>. Mọi người mở link sẽ thấy số liệu mới.</li></ol>
      <label class="field">File dữ liệu (.json)<input type="file" id="snap-file" accept=".json,application/json"></label>
      <p class="hint" id="snap-info">Số liệu đang hiển thị: ${esc(Backend.snapshotAt || '—')}</p>`,
    onSave: async root => {
      const f = $('#snap-file', root).files[0];
      if (!f) throw new Error('Chọn file dữ liệu trước');
      const text = await f.text();
      const snap = Backend.checkSnapshot(text);
      const artifact = await claude.use('artifact');
      if (!artifact) throw new Error('Trang này chưa được phép tự cập nhật.');
      $('#snap-info', root).textContent = 'Đang đăng số liệu lúc ' + (snap.at || '') + '…';
      try { await artifact.publish(viewPageSource(text)); }
      catch (e) {
        const code = e && e.code;
        if (code === 'conflict') return true; // trang đang tải lại bản mới nhất
        if (code === 'not_writer' || code === 'not_granted' || code === 'capability_disabled') throw new Error('Bạn không có quyền cập nhật trang này (chỉ chủ trang).');
        if (code === 'too_large') throw new Error('Số liệu quá lớn để đăng trong một trang.');
        throw new Error('Không đăng được: ' + (e && e.message ? e.message : e));
      }
      toast('Đã đăng số liệu mới – trang sẽ tải lại');
      return true;
    },
  });
}

// Người được mời nhưng trang đang bật link công khai (hoặc chỉ được quyền Viewer): giải thích rõ vì sao không lưu được
function showReadOnlyBanner() {
  const el = $('#ro-banner');
  el.innerHTML = 'Bạn đang có quyền <b>CHỈ XEM</b> trên trang này nên <b>không lưu, không nhập phiếu, không tải file lên được</b>. Nếu bạn đã được mời làm <b>Editor</b>: nhờ chủ trang mở <b>Share</b> → ở mục <i>General access</i> tắt <b>“Anyone with the link”</b> (chuyển về chỉ người được mời) → rồi bạn tải lại trang. Khi trang đang bật link công khai, claude.ai chỉ cho người được mời qua email quyền xem.';
  el.hidden = false;
}

/* ============================================================ khởi động */
function askUser(force) {
  if (S.user && !force) return;
  const { root, close } = openModal({
    title: 'Bạn là ai?',
    body: `<label class="field">Họ tên (ghi vào lịch sử thao tác và gợi ý người lập phiếu)<input id="u-name" list="dl-u" value="${esc(S.user)}"></label>${datalist('dl-u', S.meta.people)}
      ${GIAO_APP ? '' : `<div class="callout small" style="margin-top:12px">Người giao hàng: <button class="btn sm primary" id="u-giao">🚚 Tôi là người giao hàng</button> – ${GIAO_LINKED ? 'mở web Giao hàng An Tâm.' : 'đăng nhập bằng nick + mã PIN để xem tuyến của mình.'}</div>`}`,
    saveText: 'Xác nhận',
    onSave: async root => { S.user = $('#u-name', root).value.trim(); store('user', S.user); $('#user-btn').textContent = '👤 ' + (S.user || 'Khách'); return true; },
  });
  const ug = $('#u-giao', root);
  if (ug) ug.onclick = () => { close(); openGiaoHang(); };
}
// Web giao hàng: bản chạy máy chủ mở trang /giao-hang; bản online chạy ngay trong trang này (dùng chung dữ liệu)
function giaoRoot() {
  let el = document.getElementById('gh-root');
  if (!el) { el = document.createElement('div'); el.id = 'gh-root'; document.body.appendChild(el); }
  el.hidden = false;
  return el;
}
async function enterGiaoMode() {
  if (S.dirty && !(await ask('Có thay đổi chưa lưu. Vẫn chuyển sang web giao hàng?'))) return;
  S.dirty = false;
  store('mode', 'giao');
  window.scrollTo(0, 0);
  Backend.onRemote(() => GiaoHang.onRemoteChange());
  await GiaoHang.start(giaoRoot(), { onExit: exitGiaoMode });
}
async function exitGiaoMode() {
  if (GIAO_APP && !S.meta) { GiaoHang.stop(); return showGiaoStart(); } // người giao bấm "Quản lý" ở màn đăng nhập
  store('mode', '');
  GiaoHang.stop();
  document.body.classList.remove('gh-mode');
  const el = document.getElementById('gh-root');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  Backend.onRemote(() => { const b = $('#refresh-btn'); if (b) b.hidden = false; });
  if (!S.meta) return bootKho();
  await loadMeta();
  document.title = 'Kho An Tâm';
  render();
}
/* ---------- web Giao hàng An Tâm: màn hình chọn "Người giao hàng" / "Quản lý" */
const ADMIN_KEY = 'giaoAdminToken';
function applyGiaoApp() {
  document.title = 'Giao hàng An Tâm';
  $('.brand-mark').textContent = '🚚';
  $('.brand-name').textContent = 'Giao hàng An Tâm';
  $('.brand-sub').textContent = 'Quản lý phân tuyến & giao hàng';
  $('#wh-switch').hidden = true;
  $('#wh-badge').hidden = true;
  $('#nav').innerHTML = `<a href="#/nhan" data-route="nhan">Nhận phân tuyến từ kho</a>
    <a href="#/giao-hang-tk" data-route="giao-hang-tk">Người giao & kết quả giao</a>
    <div class="nav-group">Hệ thống</div>
    <a href="#/cai-dat" data-route="cai-dat">Cài đặt & mật khẩu</a>
    <a href="#/lich-su" data-route="lich-su">Lịch sử thao tác</a>
    <a href="#" id="nav-admin-out">↩ Thoát quản lý</a>`;
  $('#nav-admin-out').onclick = e => { e.preventDefault(); store(ADMIN_KEY, ''); location.reload(); };
}
async function bootGiaoApp() {
  document.title = 'Giao hàng An Tâm';
  document.body.classList.add('gh-mode');
  giaoRoot().innerHTML = '<p style="padding:20px;font-family:sans-serif">Đang kết nối dữ liệu…</p>';
  try { await Backend.init(); } catch (e) { giaoRoot().innerHTML = `<p style="padding:20px">Không kết nối được dữ liệu: ${esc(e.message)}</p>`; return; }
  await pullGiaoInbox();
  setInterval(pullGiaoInbox, 120000);
  pullDhInbox();
  if (store('mode') === 'giao') return startDriverMode();
  const tok = store(ADMIN_KEY);
  if (tok && (await api('POST', '/admin/check', { token: tok }).catch(() => ({}))).ok) return enterAdmin();
  return showGiaoStart();
}
// Nhận phân tuyến web kho gửi tự động (tác vụ định kỳ chép vào "giaoin" của trang này)
async function pullGiaoInbox() {
  const r = await api('POST', '/giao-sync/inbox').catch(e => { console.warn('giaoin', e); return null; });
  if (!r || !r.got.length) return;
  const days = [...new Set(r.got.map(g => vnDate(g.date)))].join(', ');
  if (store('mode') === 'giao' && window.GiaoHang) GiaoHang.onRemoteChange();
  else { toast(`Đã tự nhận phân tuyến từ web kho: ngày ${days}`); if (S.meta) { await loadMeta(); render(); } }
}
function startDriverMode() {
  store('mode', 'giao');
  document.body.classList.add('gh-mode');
  Backend.onRemote(() => GiaoHang.onRemoteChange());
  return GiaoHang.start(giaoRoot(), { onExit: exitGiaoMode, exitLabel: 'Quản lý (dành cho kho)', exitInHeader: false });
}
async function showGiaoStart(msg) {
  store('mode', '');
  document.body.classList.add('gh-mode');
  document.title = 'Giao hàng An Tâm';
  const st = await api('GET', '/admin').catch(() => ({ set: true, owner: false }));
  const root = giaoRoot();
  root.innerHTML = `<div class="gh-login"><div class="gh-logo">🚚</div><h1>Giao hàng An Tâm</h1>
    <p class="gh-muted">Web dành cho nhân viên giao hàng và bộ phận phân tuyến.</p>
    <button class="gh-btn primary big" id="gs-driver" style="margin-top:18px">🚚 Tôi là người giao hàng</button>
    <form id="gs-admin" class="gh-admin-form">
      <div class="gh-panel-title">🗂 Quản lý phân tuyến (kho)</div>
      ${st.set ? `<label>Mật khẩu quản lý<input id="gs-pin" type="password" autocomplete="current-password" required></label>
        <button class="gh-btn big" type="submit">Vào quản lý</button>`
      : st.owner ? `<p class="gh-muted gh-small">Lần đầu: đặt mật khẩu quản lý (4–40 ký tự). Chỉ người phân tuyến biết mật khẩu này; người giao hàng không vào được phần quản lý.</p>
        <label>Mật khẩu quản lý mới<input id="gs-pin" type="password" autocomplete="new-password" minlength="4" required></label>
        <button class="gh-btn big" type="submit">Đặt mật khẩu và vào quản lý</button>`
      : '<p class="gh-muted gh-small">Chủ trang chưa đặt mật khẩu quản lý.</p>'}
      <p class="gh-err" id="gs-err">${esc(msg || '')}</p>
    </form></div>`;
  $('#gs-driver', root).onclick = () => startDriverMode();
  $('#gs-admin', root).onsubmit = async e => {
    e.preventDefault();
    const pin = $('#gs-pin', root);
    if (!pin) return;
    try {
      const res = await api('POST', st.set ? '/admin/login' : '/admin/set', { pin: pin.value });
      store(ADMIN_KEY, res.token);
      enterAdmin();
    } catch (err) { $('#gs-err', root).textContent = err.message; }
  };
}
function enterAdmin() {
  store('mode', '');
  document.body.classList.remove('gh-mode');
  const el = giaoRoot(); el.hidden = true; el.innerHTML = '';
  store('wh', 'TP');
  applyGiaoApp();
  return bootKho();
}
// Trang Giao hàng An Tâm: dán dữ liệu "Gửi sang Giao hàng An Tâm" của web kho
async function viewGiaoImport(main) {
  setTitle('Nhận phân tuyến từ kho');
  const list = await api('GET', '/docs?kind=routing');
  let pasted = '';
  main.innerHTML = `<div class="card"><h3>Dán dữ liệu phân tuyến</h3>
      <p class="small" style="margin-top:0"><b>Tự động:</b> phân tuyến lưu ở web <b>Kho An Tâm › Phân tuyến giao hàng</b> tự chuyển sang trang này trong khoảng 1 giờ – không cần làm gì.
      <br><b>Cần ngay:</b> ở web kho bấm <b>📤 Gửi ngay</b>, rồi sang trang này bấm <kbd>Ctrl</kbd>+<kbd>V</kbd> – trang tự nhận. Gửi lại cùng ngày sẽ thay bảng cũ của ngày đó (kết quả đã giao vẫn giữ).</p>
      <textarea id="im-text" rows="3" placeholder="Bấm vào đây rồi Ctrl+V…" style="width:100%"></textarea>
      <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="im-go">📥 Nhận dữ liệu</button>
      <label class="field">hoặc chọn file .json đã tải<input type="file" id="im-file" accept=".json,application/json"></label></div>
      <div id="im-res"></div></div>
    <div class="card"><h3>Các ngày đã nhận</h3>${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày giao</th><th>Nội dung</th><th>Nhận lúc</th></tr></thead><tbody>
      ${list.map(d => `<tr><td class="nowrap">${vnDate(d.date)}</td><td>${esc(d.title)}</td><td class="small muted">${esc(d.updated_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa nhận ngày nào.</p>'}</div>`;
  const ta = $('#im-text');
  // Ctrl+V ở bất kỳ đâu trên trang này: dữ liệu "Gửi sang Giao hàng An Tâm" được nhận ngay, không cần bấm nút
  const onPaste = e => {
    if (!document.body.contains(ta)) { document.removeEventListener('paste', onPaste); return; }
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!t || t.indexOf('"antam-giao-sync"') < 0) return;
    e.preventDefault();
    pasted = t; ta.value = `(Đã dán ${Math.round(t.length / 1024)} KB dữ liệu – đang nhận…)`;
    guard(() => take(t));
  };
  document.addEventListener('paste', onPaste);
  ta.focus();
  ta.oninput = () => { if (!ta.value.startsWith('(Đã dán')) pasted = ''; };
  async function take(text) {
    let pkg;
    try { pkg = JSON.parse(text); } catch (e) { throw new Error('Dữ liệu không đúng. Hãy bấm "📤 Gửi sang Giao hàng An Tâm" ở web kho rồi dán lại.'); }
    const r = await api('POST', '/giao-sync', pkg);
    $('#im-res').innerHTML = `<div class="callout" style="margin:12px 0 0">✅ Đã nhận phân tuyến ngày <b>${vnDate(r.date)}</b>: ${r.rows} khách, ${r.routes} tuyến, ${r.drivers} tài khoản người giao.
      Người giao bấm ↻ trên điện thoại là thấy tuyến mới.</div>`;
    toast('Đã nhận phân tuyến ngày ' + vnDate(r.date));
    await loadMeta();
    setTimeout(() => render(), 1500);
  }
  $('#im-go').onclick = () => guard(async () => {
    const text = pasted || ta.value.trim();
    if (!text) throw new Error('Chưa dán dữ liệu.');
    await take(text);
  });
  $('#im-file').onchange = () => guard(async () => { const f = $('#im-file').files[0]; if (f) await take(await f.text()); });
}
async function viewGiaoSettings(main) {
  setTitle('Cài đặt & mật khẩu');
  main.innerHTML = `<div class="card"><h3>Mật khẩu quản lý</h3>
      <p class="small" style="margin-top:0">Mật khẩu để vào phần quản lý (phân tuyến, tài khoản người giao, kết quả giao). Người giao hàng chỉ dùng nick + PIN của mình.</p>
      <div class="toolbar"><label class="field">Mật khẩu mới<input id="ad-pin" type="password" autocomplete="new-password"></label>
      <button class="btn primary" id="ad-save">Đổi mật khẩu quản lý</button></div></div>
    <div class="card"><h3>Sao lưu</h3><div class="toolbar"><button class="btn" id="ex-backup">⬇ Tải dữ liệu (.json)</button></div>
      <p class="hint">Gồm danh mục tuyến, quy tắc chia tuyến, tài khoản người giao, các bảng phân tuyến, kết quả giao và vị trí khách (không gồm file ảnh).</p></div>`;
  $('#ad-save').onclick = () => guard(async () => {
    const res = await api('POST', '/admin/set', { pin: $('#ad-pin').value, token: store(ADMIN_KEY) });
    store(ADMIN_KEY, res.token); $('#ad-pin').value = ''; toast('Đã đổi mật khẩu quản lý');
  });
  $('#ex-backup').onclick = () => guard(async () => saveTextFile(`giao-hang-antam-sao-luu-${isoDate()}.json`, await api('GET', '/export/backup')));
}
// Web kho online: người giao đã chuyển sang trang riêng
function showMovedNotice() {
  store('mode', '');
  document.body.classList.add('gh-mode');
  giaoRoot().innerHTML = `<div class="gh-login"><div class="gh-logo">🚚</div><h1>Web giao hàng đã chuyển</h1>
    <p>Người giao hàng dùng trang riêng <b>Giao hàng An Tâm</b>:</p><p><a class="gh-link" href="${esc(GIAO_URL)}" target="_blank" rel="noopener">${esc(GIAO_URL)}</a></p>
    <button class="gh-btn" id="mv-kho">Tôi là nhân viên kho – vào web kho</button></div>`;
  $('#mv-kho').onclick = () => { document.body.classList.remove('gh-mode'); const el = giaoRoot(); el.hidden = true; el.innerHTML = ''; bootKho(); };
}
async function boot() {
  if (GIAO_APP) return bootGiaoApp();
  if (GIAO_LINKED && store('mode') === 'giao') return showMovedNotice();
  if (ONLINE && !VIEW && store('mode') === 'giao') {
    // điện thoại người giao hàng: vào thẳng web giao hàng, chỉ tải dữ liệu phân tuyến
    giaoRoot().innerHTML = '<p style="padding:20px;font-family:sans-serif">Đang kết nối dữ liệu…</p>';
    document.body.classList.add('gh-mode');
    try { await Backend.init(); } catch (e) { giaoRoot().innerHTML = `<p style="padding:20px">Không kết nối được dữ liệu: ${esc(e.message)}</p>`; return; }
    Backend.onRemote(() => GiaoHang.onRemoteChange());
    return GiaoHang.start(giaoRoot(), { onExit: exitGiaoMode });
  }
  return bootKho();
}
async function bootKho() {
  S.user = store('user') || '';
  S.staffToken = (!GIAO_APP && !VIEW && store('staffToken')) || '';
  S.wh = !GIAO_APP && store('wh') === 'NVL' ? 'NVL' : 'TP';
  if (GIAO_LINKED && !$('#nav-giao-link')) {
    // người giao dùng trang riêng Giao hàng An Tâm (nhận dữ liệu từ Phân tuyến của web kho)
    const a = document.createElement('a');
    a.href = GIAO_URL; a.target = '_blank'; a.rel = 'noopener'; a.dataset.only = 'TP'; a.id = 'nav-giao-link';
    a.textContent = '🚚 Giao hàng An Tâm ↗';
    $('#nav a[data-route="phan-tuyen"]').after(a);
  }
  $$('#wh-switch button').forEach(b => b.onclick = () => switchWh(b.dataset.wh));
  $('#menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  $('#user-btn').onclick = () => (S.account ? accountMenu() : askUser(true));
  $('#refresh-btn').onclick = async () => {
    if (S.dirty && !(await ask('Có thay đổi chưa lưu. Tải lại dữ liệu mới sẽ bỏ thay đổi đó?'))) return;
    S.dirty = false; $('#refresh-btn').hidden = true; await loadMeta(); render();
  };
  try {
    if (ONLINE) {
      $('#main').innerHTML = '<div class="callout">Đang kết nối dữ liệu dùng chung…</div>';
      await Backend.init();
      if (!(await staffGate())) return;
      if (!S.user && Backend.myName) { S.user = Backend.myName; store('user', S.user); }
      await Backend.setWh(S.wh);
      Backend.onRemote(() => { const b = $('#refresh-btn'); if (b) b.hidden = false; });
      if (VIEW) {
        document.body.classList.add('readonly');
        const vb = $('#view-badge');
        vb.textContent = 'Chỉ xem · số liệu lúc ' + (Backend.snapshotAt ? Backend.snapshotAt.slice(11, 16) + ' ' + vnDate(Backend.snapshotAt.slice(0, 10)) : '—');
        vb.hidden = false;
        Backend.canEditPage().then(ok => { if (ok) { const b = $('#snap-btn'); b.hidden = false; b.onclick = openSnapshotUpdate; } });
      } else if (Backend.canWrite === false) showReadOnlyBanner();
    } else if (!(await staffGate())) return;
    await loadMeta();
  } catch (e) { $('#main').innerHTML = `<div class="callout warn">Không kết nối được dữ liệu: ${esc(e.message)}</div>`; return; }
  $('#user-btn').textContent = '👤 ' + (S.user || 'Khách');
  await render();
  if (!S.user && !VIEW && !S.account) askUser();
  checkNotices();
  pullDhInbox();
}

/* ============================================================ nhận đơn hàng từ web Đóng hàng An Tâm */
// Web Đóng hàng chia tuyến sẵn cho đơn hàng ngày và tuyến kebab 123; tác vụ định kỳ chép vào "dhin" của trang này.
// Web kho tự lập (hoặc cập nhật) bảng Phân tuyến giao hàng của ngày, giữ tuyến kho đã chọn tay, lưu, rồi để sẵn gói
// chuyển tiếp sang Giao hàng An Tâm – không cần dán sheet.
const DH_EVERY = 120000;
let dhTimer = null, dhBusy = false;
// Trang Giao hàng An Tâm cũng nhận thẳng (tác vụ chép cùng gói vào "dhin" của trang giao hàng): tự lập bảng phân tuyến
// kèm người giao từng tuyến, không cần chờ web kho mở – mỗi người giao thấy ngay tuyến của mình.
const dhSrc = id => ('dong-hang:' + id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
async function pullDhInbox() {
  try { await pullDhInbox1(); } catch (e) { console.warn('dhin', e); dhBusy = false; }
}
async function pullDhInbox1() {
  if (!ONLINE || VIEW || dhBusy) return;
  if (!dhTimer) dhTimer = setInterval(pullDhInbox, DH_EVERY);
  dhBusy = true;
  const got = [];
  try {
    const list = await api('GET', '/dh-inbox').catch(() => []);
    if ((list || []).length && !S.meta) S.meta = await api('GET', '/meta').catch(() => null);
    if (!S.meta) return;
    for (const x of list || []) {
      try {
        if (!GIAO_APP && S.dirty && x.doc && location.hash.includes(x.doc)) continue; // đang sửa chính bảng này: để lần sau
        const p = parseOrderSheet(String(x.tsv).split('\n').map(l => l.split('\t')));
        let docId = GIAO_APP ? `rt-${x.date}-${dhSrc(x.id)}` : x.doc || '';
        const old = docId ? await api('GET', '/docs/' + encodeURIComponent(docId)).catch(() => null) : null;
        if (!old && !GIAO_APP) docId = '';
        if (old && text0((old.data || {}).dhStamp) > text0(x.stamp)) { await api('POST', '/dh-inbox', { id: x.id, stamp: x.stamp, doc: docId }); continue; }
        if (!p.rows.length && !old) { await api('POST', '/dh-inbox', { id: x.id, stamp: x.stamp, doc: '' }); continue; }
        const od = (old && old.data) || {};
        const manual = Object.fromEntries((od.rows || []).filter(r => r.src === 'tay').map(r => [r.cust, r.route]));
        const cfg = routingCfg();
        p.rows.forEach(r => { [r.route, r.src] = autoRoute(r, cfg); if (manual[r.cust] !== undefined) { r.route = manual[r.cust]; r.src = 'tay'; } });
        const assign = Object.assign({}, od.assign || {}, dhAssign(x.assign));
        // tuyến kebab 123: người giao chọn theo nhóm T1 / T2 / chiều / T3; 2 nhóm cùng 1 tuyến kho (T1, T2 → kebab đêm) mà khác người thì tách riêng
        const ag = dhAssign(x.assignG);
        if (Object.keys(ag).length) {
          const codeOf = {}, byCode = {};
          p.rows.forEach(r => { if (r.grp && r.src !== 'tay' && !(r.grp in codeOf)) codeOf[r.grp] = r.route; });
          for (const [lb, code] of Object.entries(codeOf)) if (lb in ag) (byCode[code] = byCode[code] || new Set()).add(ag[lb]);
          const split = lb => byCode[codeOf[lb]] && byCode[codeOf[lb]].size > 1;
          p.rows.forEach(r => { if (r.grp && r.src !== 'tay' && r.grp in ag && split(r.grp)) { r.route = r.grp; r.src = 'web đóng hàng'; } });
          for (const [lb, id] of Object.entries(ag)) if (codeOf[lb]) assign[split(lb) ? lb : codeOf[lb]] = id;
        }
        const body = { kind: 'routing', date: x.date, title: text0(x.title) || 'Web Đóng hàng An Tâm',
          data: { sheet: text0(x.title) || 'Web Đóng hàng An Tâm', cols: p.cols, rows: p.rows, total: p.total, assign, from: 'dong-hang:' + x.id, dhStamp: text0(x.stamp) } };
        if (GIAO_APP) {
          // trang giao hàng: lưu như một bảng phân tuyến nhận từ kho (giữ tài khoản người giao, danh mục tuyến của trang)
          await api('POST', '/giao-sync', { format: 'antam-giao-sync', version: 1, at: text0(x.stamp), date: x.date, src: 'dong-hang:' + x.id, doc: { date: x.date, title: body.title, data: body.data } });
        } else {
          // tự nhận đơn từ web Đóng hàng: không phụ thuộc quyền của người đang mở trang
          const res = docId ? await api('PUT', '/docs/' + encodeURIComponent(docId) + '?wh=TP&auto=1', body) : await api('POST', '/docs?wh=TP&auto=1', body);
          docId = res.id;
        }
        if (GIAO_LINKED) await api('POST', '/giao-sync/out?id=' + encodeURIComponent(docId)).catch(e => console.warn('giaoout', e));
        await api('POST', '/dh-inbox', { id: x.id, stamp: x.stamp, doc: docId });
        got.push(`${vnDate(x.date)} – ${x.kind === 't123' ? 'tuyến kebab 123' : 'đơn hàng ngày'} (${p.rows.length} khách)`);
      } catch (e) { console.warn('dhin', x.id, e); }
    }
  } finally { dhBusy = false; }
  if (!got.length) return;
  if (GIAO_APP) {
    // trang giao hàng: chỉ báo cho màn hình đang mở cập nhật, không vẽ lại trang kho (đang ẩn ở màn hình đăng nhập / người giao)
    try {
      if (store('mode') === 'giao' && window.GiaoHang) GiaoHang.onRemoteChange();
      else if (!document.body.classList.contains('gh-mode')) { toast('Đã tự nhận đơn đã chia tuyến từ web Đóng hàng: ' + got.join('; ')); await loadMeta(); render(); }
    } catch (e) { console.warn('dhin render', e); }
    return;
  }
  toast('Đã tự nhận từ web Đóng hàng: ' + got.join('; ') + (GIAO_LINKED ? ' – sẽ tự chuyển sang Giao hàng An Tâm' : ''));
  if (!S.dirty && location.hash.startsWith('#/phan-tuyen')) render();
}
const text0 = v => String(v == null ? '' : v).trim();
// người giao từng tuyến do web Đóng hàng chọn: {mã tuyến: mã người giao ('' = không ai)}; ưu tiên hơn bảng cũ của kho
const dhAssign = a => Object.fromEntries(Object.entries(a && typeof a === 'object' ? a : {}).filter(([k, v]) => k && typeof v === 'string').map(([k, v]) => [k, v]));

/* ============================================================ thông báo cho nhân viên (kết quả duyệt phiếu) */
const NOTICE_EVERY = 60000;
let noticeTimer = null;
async function checkNotices() {
  const b = $('#notice-btn');
  if (!S.account) { if (b) b.hidden = true; return; }
  if (!noticeTimer) noticeTimer = setInterval(checkNotices, NOTICE_EVERY);
  let r;
  try { r = await api('GET', '/notices'); } catch (e) { return; }
  S.notices = r.list || [];
  const unread = S.notices.filter(n => !n.read);
  b.hidden = false;
  b.innerHTML = '🔔' + (unread.length ? ` <span class="nb">${unread.length}</span>` : '');
  b.title = unread.length ? `${unread.length} thông báo mới` : 'Thông báo';
  b.onclick = openNotices;
  unread.filter(n => !S.popped.has(n.id)).slice(0, 3).forEach(n => { S.popped.add(n.id); noticePop(n); });
}
async function readNotices(ids) {
  await guard(() => api('POST', '/notices/read', { ids: ids || [] }));
  S.notices.forEach(n => { if (!ids || ids.includes(n.id)) n.read = true; });
  const left = S.notices.filter(n => !n.read).length;
  $('#notice-btn').innerHTML = '🔔' + (left ? ` <span class="nb">${left}</span>` : '');
}
const openNoticeLink = n => go(n.link); // trang phiếu tự chuyển sang đúng kho
// Hiện ngay ở góc màn hình, giữ đến khi bấm Xem / Đóng
function noticePop(n) {
  const el = document.createElement('div');
  el.className = 'toast notice' + (n.ok ? '' : ' bad');
  el.dataset.id = n.id;
  el.innerHTML = `<div><b>🔔 Thông báo</b> <span class="small muted">${esc(n.at || '')}</span></div><div>${esc(n.text)}</div>
    <div class="actions">${n.link ? '<button class="btn sm primary" data-go>Xem phiếu</button>' : ''}<button class="btn sm" data-ok>Đã biết</button></div>`;
  $('#toasts').appendChild(el);
  const go_ = $('[data-go]', el);
  if (go_) go_.onclick = () => { el.remove(); readNotices([n.id]); openNoticeLink(n); };
  $('[data-ok]', el).onclick = () => { el.remove(); readNotices([n.id]); };
}
function openNotices() {
  const unread = S.notices.filter(n => !n.read).map(n => n.id);
  const { root, close } = openModal({
    title: '🔔 Thông báo',
    body: S.notices.length ? `<ul class="notice-list">${S.notices.map((n, i) => `<li data-i="${i}" class="${n.read ? '' : 'unread'}">${esc(n.text)}<div class="at">${esc(n.at || '')}${n.wh ? ' · ' + esc(n.wh === 'NVL' ? 'Kho nguyên vật liệu' : 'Kho thành phẩm') : ''}</div></li>`).join('')}</ul>`
      : '<p class="muted">Chưa có thông báo nào. Khi Quản lý duyệt hoặc từ chối phiếu điều chỉnh bạn lập, thông báo sẽ hiện ở đây.</p>',
  });
  $$('#toasts .toast.notice').forEach(el => el.remove());
  $$('li[data-i]', root).forEach(li => li.onclick = () => { const n = S.notices[li.dataset.i]; close(); if (n.link) openNoticeLink(n); });
  if (unread.length) readNotices(unread);
}

/* ============================================================ tài khoản nhân viên */
// Đã có tài khoản: phải đăng nhập, tên người làm (phiếu, lịch sử) lấy từ tài khoản. Chưa có: dùng ô "Bạn là ai?" như cũ.
async function staffGate() {
  if (GIAO_APP || VIEW) return true;
  const st = await api('GET', '/staff/status');
  S.staffCount = st.count;
  if (st.me) { S.account = st.me; S.user = st.me.name || st.me.user; return true; }
  S.account = null;
  if (!st.count) { S.staffToken = ''; return true; }
  showStaffLogin();
  return false;
}
function showStaffLogin(msg) {
  S.account = null; S.staffToken = ''; store('staffToken', '');
  S.notices = []; S.popped = new Set(); $$('#toasts .toast.notice').forEach(el => el.remove());
  if ($('#notice-btn')) $('#notice-btn').hidden = true;
  document.body.classList.add('locked');
  $('#main').innerHTML = `<div class="login-card card"><div class="brand-mark" style="margin:0 auto 10px">AT</div>
    <h2>Đăng nhập Kho An Tâm</h2><p class="muted small">Mỗi nhân viên dùng tài khoản riêng – phiếu và lịch sử thao tác ghi đúng tên người đăng nhập.</p>
    <form id="lg-form" class="grid"><label class="field">Tên đăng nhập<input id="lg-user" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(store('staffUser') || '')}" required></label>
    <label class="field">Mật khẩu<input id="lg-pw" type="password" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">Đăng nhập</button><p class="small" id="lg-err" style="color:var(--danger);margin:0">${esc(msg || '')}</p></form>
    <p class="hint">Quên mật khẩu: nhờ người có tài khoản <b>Quản lý</b> đặt lại ở Hệ thống › Tài khoản nhân viên.</p></div>`;
  const u = $('#lg-user'), pw = $('#lg-pw');
  (u.value ? pw : u).focus();
  $('#lg-form').onsubmit = async e => {
    e.preventDefault();
    try {
      const res = await api('POST', '/staff/login', { user: u.value, password: pw.value });
      store('staffToken', res.token); store('staffUser', res.account.user);
      document.body.classList.remove('locked');
      bootKho();
    } catch (err) { $('#lg-err').textContent = err.message; }
  };
}
function accountMenu() {
  const { root, close } = openModal({
    title: '👤 ' + (S.account.name || S.account.user),
    body: `<p class="small" style="margin-top:0">Tên đăng nhập: <b>${esc(S.account.user)}</b> · <span class="badge ${S.account.admin ? 'ok' : ''}">${esc(roleOfPerms(permsOf(S.account)))}</span></p>
      <p class="small muted">Quyền: ${[...permsOf(S.account)].map(k => esc(KHO_PERM_LAB[k] || k)).join(' · ')}</p>
      <div class="grid c2"><label class="field">Mật khẩu hiện tại<input id="ac-old" type="password" autocomplete="current-password"></label>
      <label class="field">Mật khẩu mới (4–40 ký tự)<input id="ac-new" type="password" autocomplete="new-password"></label></div>
      <div class="toolbar" style="margin-top:12px"><button class="btn" id="ac-pw">Đổi mật khẩu</button><button class="btn danger" id="ac-out">Đăng xuất</button></div>`,
  });
  $('#ac-pw', root).onclick = () => guard(async () => {
    const res = await api('POST', '/staff/password', { old: $('#ac-old', root).value, password: $('#ac-new', root).value });
    S.staffToken = res.token; store('staffToken', res.token); toast('Đã đổi mật khẩu'); close();
  });
  $('#ac-out', root).onclick = async () => {
    if (S.dirty && !(await ask('Có thay đổi chưa lưu. Vẫn đăng xuất?'))) return;
    S.dirty = false; close(); showStaffLogin();
  };
}
async function viewStaff(main) {
  setTitle('Tài khoản nhân viên');
  let list = (await api('GET', '/staff')) || [];
  const canEdit = !list.length || (S.account && can('taikhoan'));
  function draw() {
    list.sort((a, b) => (b.active - a.active) || (b.admin - a.admin) || a.user.localeCompare(b.user));
    main.innerHTML = `${canEdit ? '<div class="toolbar"><button class="btn primary" id="sa-add">+ Thêm tài khoản</button></div>' : ''}
      <div class="callout">Mỗi nhân viên kho đăng nhập bằng <b>tên đăng nhập + mật khẩu</b> riêng; phiếu, phân tuyến và <b>Lịch sử thao tác</b> ghi đúng tên người đăng nhập.
      ${list.length ? '' : '<br><b>Chưa có tài khoản nào</b> – tạo tài khoản đầu tiên (tự là <b>Quản lý</b>). Từ lúc đó mọi người vào web kho đều phải đăng nhập.'}
      Bấm vào tài khoản để <b>phân quyền</b>: chọn vai trò làm mẫu (Quản lý, Nhân viên kho, Thủ kho, Chỉ xem) rồi tích thêm / bỏ từng quyền – mục và nút không được cấp sẽ ẩn với người đó.
      Chỉ tài khoản có quyền <b>Quản lý tài khoản</b> được thêm / sửa / khóa / xóa / phân quyền; ai cũng tự đổi được mật khẩu của mình (bấm tên ở góc trên phải).
      ${ONLINE ? '<br><span class="small">Bản online: đăng nhập giữ đúng tên người làm trên web; quyền xem / sửa trang vẫn do nút <i>Share</i> của claude.ai quyết định.</span>' : ''}</div>
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Quyền được cấp</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list.map(a => `<tr class="${canEdit ? 'clickable' : ''}" data-id="${esc(a.id)}" ${a.active ? '' : 'style="opacity:.55"'}><td><b>${esc(a.user)}</b>${S.account && S.account.id === a.id ? ' <span class="small muted">(bạn)</span>' : ''}</td><td>${esc(a.name)}</td>
        <td><span class="badge ${a.admin ? 'ok' : ''}">${esc(roleOfPerms(permsOf(a)))}</span></td>
        <td class="small" style="max-width:420px">${permsOf(a).size === KHO_PERM_KEYS.length ? 'Tất cả' : [...permsOf(a)].map(k => esc(KHO_PERM_LAB[k] || k)).join(' · ') || '<span class="muted">(chưa có quyền nào)</span>'}</td><td>${a.active ? '<span class="badge ok">Đang dùng</span>' : '<span class="badge warn">Đã khóa</span>'}</td>
        <td>${canEdit && !(S.account && S.account.id === a.id) ? `<button class="btn sm danger" data-del="${esc(a.id)}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    if (!canEdit) return;
    $('#sa-add').onclick = () => edit(null);
    $$('tr[data-id]', main).forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) edit(list.find(a => a.id === tr.dataset.id)); });
    $$('[data-del]', main).forEach(b => b.onclick = async () => {
      const a = list.find(x => x.id === b.dataset.del);
      if (!(await ask(`Xóa tài khoản "${a.user}"? Người này sẽ không đăng nhập được nữa (lịch sử cũ vẫn giữ).`))) return;
      if (await guard(() => api('DELETE', '/staff/' + encodeURIComponent(a.id)))) { toast('Đã xóa'); list = await api('GET', '/staff'); draw(); }
    });
  }
  function edit(a) {
    const v = a || { id: '', user: '', name: '', admin: !list.length, active: true, perm: !list.length ? KHO_PERM_KEYS : KHO_ROLES[1][2] };
    const first = !list.length, P = permsOf(v);
    const m = openModal({
      title: a ? 'Sửa tài khoản ' + a.user : (first ? 'Tạo tài khoản Quản lý đầu tiên' : 'Thêm tài khoản'), wide: true,
      body: `<div class="grid c2">
        <label class="field">Tên đăng nhập (không dấu, viết liền, vd <i>thukho.lan</i>)<input id="sa-user" value="${esc(v.user)}" autocapitalize="none"></label>
        <label class="field">Họ tên (ghi trên phiếu, lịch sử)<input id="sa-name" value="${esc(v.name)}"></label>
        <label class="field">${a ? 'Mật khẩu mới (để trống = giữ mật khẩu cũ)' : 'Mật khẩu (4–40 ký tự)'}<input id="sa-pw" type="password" autocomplete="new-password"></label>
        <div class="field" style="justify-content:flex-end;gap:8px">
          <label class="check"><input type="checkbox" id="sa-active" ${v.active ? 'checked' : ''} ${first ? 'disabled' : ''}> Đang dùng (bỏ chọn để khóa)</label></div></div>
        <div style="margin-top:12px"><div class="toolbar" style="align-items:center"><b>Phân quyền</b>
          <label class="field" style="flex-direction:row;align-items:center;gap:6px">Mẫu<select id="sa-role" ${first ? 'disabled' : ''}><option value="">— chọn mẫu —</option>${KHO_ROLES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <span class="small muted" id="sa-pst"></span></div>
          <div class="perm-grid">${KHO_PERMS.map(([g, l]) => `<fieldset><legend>${esc(g)}</legend>${l.map(([k, t]) => `<label class="check"><input type="checkbox" data-perm="${k}" ${P.has(k) ? 'checked' : ''} ${first ? 'disabled' : ''}> ${esc(t)}</label>`).join('')}</fieldset>`).join('')}</div></div>
        ${first ? '<p class="hint">Sau khi tạo, bạn được đăng nhập luôn bằng tài khoản này; những người khác phải đăng nhập.</p>' : ''}`,
      onSave: async root => {
        const perm = $$('[data-perm]', root).filter(i => i.checked).map(i => i.dataset.perm);
        if (!first && !perm.some(k => k.startsWith('kho'))) throw new Error('Cần cấp ít nhất 1 kho (thành phẩm hoặc nguyên vật liệu) cho tài khoản');
        const res = await api('POST', '/staff', { id: v.id, user: $('#sa-user', root).value, name: $('#sa-name', root).value, password: $('#sa-pw', root).value,
          admin: perm.includes('taikhoan'), perm, active: $('#sa-active', root).checked });
        if (res.token) {
          S.staffToken = res.token; store('staffToken', res.token); store('staffUser', res.account.user);
          S.account = res.account; S.user = res.account.name; $('#user-btn').textContent = '👤 ' + S.user;
        }
        if (S.account && res.account.id === S.account.id) { S.account = res.account; S.user = res.account.name; $('#user-btn').textContent = '👤 ' + S.user; }
        toast('Đã lưu tài khoản & phân quyền'); list = await api('GET', '/staff'); draw(); applyPerms(); return true;
      },
    });
    const root = m.root, boxes = () => $$('[data-perm]', root);
    const st = () => { $('#sa-pst', root).textContent = '(' + roleOfPerms(new Set(boxes().filter(i => i.checked).map(i => i.dataset.perm))) + ')'; };
    $('#sa-role', root).onchange = e => { const r = KHO_ROLES.find(x => x[0] === e.target.value); if (r) boxes().forEach(i => { i.checked = r[2].includes(i.dataset.perm); }); st(); };
    boxes().forEach(i => i.onchange = st); st();
  }
  draw();
}
boot();
