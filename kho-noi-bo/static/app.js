'use strict';
/* Web làm việc nội bộ – Kho Thành phẩm & Hàng hóa An Tâm.
   Mô phỏng quy trình của file Excel: Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất,
   Phiếu Nhập Xuất, Phiếu Điều chỉnh, Nhập Xuất Tồn, Thẻ kho, Kiểm kê, Bàn giao kho,
   kho NVL có thêm Kế hoạch mua hàng (KH Ngày/Tuần/Tháng).
   Web chứa 2 kho: TP (Thành phẩm - Hàng hóa) và NVL (Nguyên vật liệu), dữ liệu tách riêng từng kho. */

const S = { meta: null, dirty: false, skipDirty: false, user: '', wh: 'TP' };
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
    try { return await Backend.handle(method, path, body); } catch (e) { throw new Error(e.message || String(e)); }
  }
  const opt = { method, headers: { 'X-User': encodeURIComponent(S.user || ''), 'X-Wh': S.wh } };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer) { opt.body = body; opt.headers['Content-Type'] = 'application/octet-stream'; }
    else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const res = await fetch('/api' + path, opt);
  let data = null;
  try { data = await res.json(); } catch (e) { /* trống */ }
  if (!res.ok) throw new Error((data && data.error) || ('Lỗi ' + res.status));
  return data;
}
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
      <div class="d-info"><div>Kho điều chỉnh: <b>${esc(v.from_party)}</b></div><div>Căn cứ / Lý do: ${esc(v.reason)}</div>
      <div>Người thực hiện: ${esc(v.giver)}</div></div>
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
  [/^hang$/, viewProducts],
  [/^tuyen$/, viewRoutes],
  [/^phan-tuyen$/, viewRoutingList],
  [/^phan-tuyen\/(moi|[\w-]+)$/, viewRouting],
  [/^giao-hang-tk$/, viewDrivers],
  [/^cai-dat$/, viewSettings],
  [/^lich-su$/, viewLog],
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
  $$('#nav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === '' ? path === '' : (path === r || (path.startsWith(r + '/') && r !== 'phieu') || (r === 'phieu' && /^phieu\/(?!moi$)[\w-]+$/.test(path))));
  });
  const main = $('#main');
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
  const only = { 'tuyen': 'TP', 'phan-tuyen': 'TP', 'giao-hang-tk': 'TP', 'kh-ngay': 'NVL', 'kh-tuan': 'NVL', 'kh-thang': 'NVL' }[path.split('/')[0]];
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
  main.innerHTML = `
    ${empty ? `<div class="callout"><b>Bắt đầu với ${esc(S.meta.warehouse.name)}:</b> chưa có danh mục hàng. Vào <a href="#/cai-dat">Cài đặt &amp; dữ liệu</a> để
      <b>nhập dữ liệu từ file Excel</b> của kho này (Danh mục hàng, Sổ Nhập Xuất${S.wh === 'NVL' ? ', KH Ngày' : ', Danh mục tuyến'}), hoặc thêm tay ở <a href="#/hang">Danh mục › Mặt hàng</a>.</div>` : ''}
    <div class="quick">
      <a class="btn primary" href="#/phieu/moi?type=N">+ Phiếu nhập kho</a>
      <a class="btn primary" href="#/phieu/moi?type=X">+ Phiếu xuất kho</a>
      <a class="btn" href="#/phieu/moi?type=D">+ Phiếu điều chỉnh</a>
      <button class="btn" id="print-today">🖨 In tất cả phiếu hôm nay</button>
      <a class="btn" href="#/kiem-ke/moi">Kiểm kê</a>
      <a class="btn" href="#/ban-giao/moi">Bàn giao kho</a>
      ${S.wh === 'NVL' ? '<a class="btn" href="#/kh-ngay">Kế hoạch mua hàng</a>' : ''}
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
  function draw() {
    setTitle(editing ? `${VIEW ? 'Phiếu' : 'Sửa phiếu'} ${v.no}` : `Lập phiếu ${TYPE_LABEL[v.type].toLowerCase()} kho`);
    const L = labels();
    main.innerHTML = `
      <div class="toolbar"><div class="tabs" id="type-tabs">${['N', 'X', 'D'].map(t => `<button data-t="${t}" class="${v.type === t ? 'on' : ''}">${TYPE_PREFIX[t]} · ${TYPE_LABEL[t]}</button>`).join('')}</div>
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
        <button class="btn primary" id="btn-save">💾 Lưu phiếu</button>
        <button class="btn primary" id="btn-save-print">💾 Lưu &amp; In</button>
        ${editing ? '<button class="btn" id="btn-print">🖨 In phiếu</button>' : ''}
        <a class="btn" href="#/phieu/moi?type=${v.type}">+ Phiếu mới</a>
        ${editing ? '<button class="btn" id="btn-copy">Sao chép thành phiếu mới</button><button class="btn danger" id="btn-del">Xóa phiếu</button>' : ''}
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
    $('#btn-save').onclick = () => save(false);
    $('#btn-save-print').onclick = () => save(true);
    if (editing) {
      $('#btn-print').onclick = () => {
        if (S.dirty) return toast('Hãy lưu phiếu trước khi in', true);
        printVouchers('ids=' + editing);
      };
      $('#btn-del').onclick = async () => {
        if (!(await ask(`Xóa phiếu ${v.no}? Thao tác này không hoàn tác được (vẫn ghi trong Lịch sử).`))) return;
        if (await guard(() => api('DELETE', '/vouchers/' + editing))) { S.dirty = false; toast('Đã xóa phiếu ' + v.no); go('#/phieu'); }
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
    toast(`Đã lưu phiếu ${res.no}`);
    loadMeta();
    if (andPrint) printHtml(voucherDoc(res), 'portrait', res.no);
    if (!editing) go('#/phieu/' + res.id, { force: true });
    else { v.no = res.no; $('#f-no').value = res.no; setTitle(`Sửa phiếu ${res.no}`); }
  }

  draw();
  if (autoNo) refreshNo();
  refreshStock();
}

/* ============================================================ Danh sách phiếu */
async function viewVoucherList(main) {
  setTitle('Danh sách phiếu');
  const f = Object.assign({ from: addDays(isoDate(), -6), to: isoDate(), type: '', q: '' }, store('voucherFilter') || {});
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
      <div class="grow"></div>
      <button class="btn" id="v-print-sel" disabled>🖨 In phiếu đã chọn</button>
      <button class="btn" id="v-print-all">🖨 In tất cả phiếu trong danh sách</button>
    </div>
    <div id="v-list"></div>`;
  let list = [];
  const sel = new Set();
  async function load() {
    const p = new URLSearchParams({ from: f.from, to: f.to, type: f.type, q: f.q });
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
        <td class="nowrap">${vnDate(v.date)}</td><td class="nowrap"><b>${esc(v.no)}</b></td><td><span class="badge ${v.type}">${TYPE_LABEL[v.type]}</span></td>
        <td>${esc(v.route || v.to_party)}</td><td>${esc(v.reason)}</td><td class="num">${v.line_count}</td><td class="num">${fmt(v.total_qty)}</td>
        <td class="small">${esc(v.giver)}${v.receiver ? ' → ' + esc(v.receiver) : ''}</td>
        <td class="nowrap"><button class="btn sm" data-print="${v.id}">In</button></td></tr>`).join('')}
      </tbody></table></div><p class="hint">${list.length} phiếu. Bấm vào dòng để xem / sửa.</p>` : '<p class="muted">Không có phiếu nào trong khoảng này.</p>';
    $$('#v-list tr[data-id]').forEach(tr => tr.onclick = e => {
      if (e.target.closest('input,button')) return;
      go('#/phieu/' + tr.dataset.id);
    });
    $$('#v-list [data-sel]').forEach(cb => cb.onchange = () => { cb.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel); draw(); });
    $$('#v-list [data-print]').forEach(b => b.onclick = () => printVouchers('ids=' + b.dataset.print));
    const all = $('#v-all');
    if (all) { all.checked = sel.size && sel.size === list.length; all.onchange = () => { list.forEach(v => all.checked ? sel.add(String(v.id)) : sel.delete(String(v.id))); draw(); }; }
  }
  const upd = () => { f.from = $('#v-from').value; f.to = $('#v-to').value; f.type = $('#v-type').value; f.q = $('#v-q').value; store('voucherFilter', f); load(); };
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
    else $('#l-csv').href = '/api/export/lines.csv?' + new URLSearchParams({ wh: S.wh, from: f.from, to: f.to });
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
const RT_META = ['quan', 'crm', 'khach', 'sdt', 'ghi chu', 'bill', 'nguoi', 'trang thai', 'tinh trang', 'cong no', 'tai xe'];
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
function autoRoute(row, cfg) {
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
  const rows = [];
  for (const tr of t.querySelectorAll('tr')) {
    const r = [];
    for (const td of tr.querySelectorAll('td,th')) {
      r.push((td.innerText || td.textContent || '').trim());
      for (let i = 1; i < (+td.getAttribute('colspan') || 1); i++) r.push('');
    }
    rows.push(r);
  }
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
  let hi = table.findIndex((r, i) => i < 15 && r.some(c => H(c) === 'quan') && r.some(c => H(c).startsWith('trang thai')));
  let col, cols = [], pcols = [];
  if (hi >= 0) {
    const h = table[hi].map(H);
    const find = f => h.findIndex(f);
    col = { q: find(x => x === 'quan'), crm: find(x => x === 'crm'), cust: find(x => x.startsWith('khach')), phone: find(x => x.includes('sdt') || x.includes('dien thoai')),
      note: find(x => x.startsWith('ghi chu')), status: find(x => x.startsWith('trang thai')), pay: find(x => x.startsWith('tinh trang')) };
    const lastMeta = h.reduce((a, x, i) => (RT_META.some(k => x.startsWith(k)) ? i : a), -1);
    h.forEach((x, i) => { if (i > lastMeta && x) { pcols.push(i); cols.push(String(table[hi][i]).replace(/\s+/g, ' ').trim()); } });
  } else {
    // dán không kèm dòng tiêu đề: dùng vị trí cột của mẫu báo cáo (A Quận, B CRM, C Khách, D SĐT, E Ghi chú, I Trạng thái, J Tình trạng, P→AE sản phẩm)
    col = { q: 0, crm: 1, cust: 2, phone: 3, note: 4, status: 8, pay: 9 };
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
      pay: g(r, col.pay), qty, route: '', src: '' });
  }
  return { cols, rows, total, header: hi >= 0 };
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
    địa chỉ, rồi in danh sách giao từng tuyến.</div>
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
      ${GIAO_LINKED ? '<p class="hint">Sau khi <b>Lưu</b>, bấm <b>📤 Gửi sang Giao hàng An Tâm</b> (cuối trang) để người giao thấy tuyến của mình; sửa phân tuyến thì Lưu và gửi lại. Kết quả giao (ảnh, vị trí) xem ở trang Giao hàng An Tâm.</p>'
        : drivers.length ? '<p class="hint">Người giao xem tuyến của mình trên <b>web giao hàng</b> sau khi bấm <b>Lưu</b>, và bấm "Đã giao" – cột Đã giao cập nhật khi mở lại trang này (hoặc bấm ↻ Kết quả giao).</p>'
        : '<p class="hint">Chưa có tài khoản giao hàng – tạo ở <a href="#/giao-hang-tk">Danh mục › Tài khoản giao hàng</a> để mỗi người giao xem tuyến của mình trên điện thoại.</p>'}
      <div class="toolbar" style="margin-top:14px"><label class="field">Xem<select id="rt-filter">${options([['', 'Tất cả khách'], ['-', 'Chưa có tuyến']].concat(gs.filter(g => g[0]).map(g => [g[0], `${g[0]} – ${rName(g[0])} (${g[1].length})`])), ui.filter)}</select></label>
      <label class="field">Tìm khách<input id="rt-search" value="${esc(ui.search)}" placeholder="mã, tên, địa chỉ…"></label></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>STT</th><th>Quận</th><th>Mã CRM</th><th>Khách hàng</th><th>Địa chỉ</th><th>SĐT</th><th>Ghi chú</th><th>Số lượng</th><th style="width:170px">Tuyến</th></tr></thead><tbody id="rt-rows"></tbody></table></div>
      <div class="form-actions"><button class="btn primary" id="rt-save">💾 Lưu</button><button class="btn" id="rt-print">🖨 In danh sách giao theo tuyến</button>
      <button class="btn" id="rt-print-sum">🖨 In tổng hợp tuyến</button><button class="btn" id="rt-csv">⬇ Tải danh sách mã CRM (Excel)</button>${doc.id ? (GIAO_LINKED ? '<button class="btn primary" id="rt-send">📤 Gửi sang Giao hàng An Tâm</button>' : '<button class="btn" id="rt-deliv">↻ Kết quả giao</button>') : ''}${doc.id ? '<button class="btn danger" id="rt-del">Xóa</button>' : ''}<a class="btn ghost" href="#/phan-tuyen">← Danh sách</a></div>`;
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
      <div class="small muted">${r.src === 'tay' ? 'chọn tay' : r.src === 'nhớ' ? 'như lần chọn tay trước' : r.src ? 'tự động theo ' + esc(r.src) : ''}</div>${delivBadge(delivOf(r))}</td></tr>`).join('')
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
  }
  // Gửi bảng phân tuyến (đã lưu) + tài khoản người giao + danh mục tuyến sang trang Giao hàng An Tâm: sao chép rồi dán bên đó
  async function sendToGiao() {
    if (S.dirty) return toast('Bấm 💾 Lưu trước rồi mới gửi', true);
    const pkg = await guard(() => api('GET', '/giao-sync?id=' + encodeURIComponent(doc.id)));
    if (!pkg) return;
    const text = JSON.stringify(pkg);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
    const n = (pkg.doc.data.rows || []).length;
    const { root } = openModal({
      title: 'Gửi sang Giao hàng An Tâm', wide: true,
      body: `<div class="callout" style="margin-top:0">${copied ? '✅ <b>Đã sao chép</b>' : 'Bấm vào ô dưới, <kbd>Ctrl</kbd>+<kbd>A</kbd> rồi <kbd>Ctrl</kbd>+<kbd>C</kbd> để sao chép'}
        dữ liệu phân tuyến ngày <b>${vnDate(doc.date)}</b> (${n} khách, ${Object.keys(pkg.drivers || {}).length} tài khoản người giao).</div>
        <ol style="margin:0 0 12px;padding-left:20px;line-height:1.7"><li>Mở <a href="${esc(GIAO_URL)}" target="_blank" rel="noopener"><b>Giao hàng An Tâm ↗</b></a> → <b>Quản lý phân tuyến</b> (mật khẩu quản lý).</li>
        <li>Mục <b>Nhận phân tuyến từ kho</b>: bấm vào ô dán → <kbd>Ctrl</kbd>+<kbd>V</kbd> → <b>Nhận dữ liệu</b>.</li>
        <li>Người giao bấm ↻ trên điện thoại (hoặc mở lại trang) là thấy tuyến mới.</li></ol>
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
function photoSrc(ref) { return ONLINE ? Backend.photoUrl(ref) : Promise.resolve('/api/photo?ref=' + encodeURIComponent(ref)); }
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
  return g && g.lat != null ? `<div><a class="small" href="https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}" target="_blank" rel="noopener">${label}${g.acc ? ' ±' + Math.round(g.acc) + 'm' : ''}</a></div>` : '';
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
  const res = { date: isoDate(), who: '', list: {} };
  const dName = id => { const x = (S.meta.drivers || []).find(v => v.id === id); return x ? x.name || x.nick : '(đã xóa)'; };
  async function loadRes() {
    const want = res.date;
    const list = await guard(() => api('GET', '/deliveries?date=' + want));
    if (want !== res.date || !$('#g-res')) return;
    res.list = list || {};
    drawRes();
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
        <b>Gửi phân tuyến</b>. Người giao chỉ được mời vào trang Giao hàng An Tâm này (email, quyền <b>Editor</b>, tắt "Anyone with the link") – không mời họ vào web Kho An Tâm.</div>`
      : GIAO_LINKED ? `<div class="callout small">Người giao dùng trang riêng <a href="${esc(GIAO_URL)}" target="_blank" rel="noopener"><b>Giao hàng An Tâm ↗</b></a> – mời họ vào trang đó
        (email, quyền <b>Editor</b>, tắt "Anyone with the link"), <b>không mời vào web Kho An Tâm</b>. Tài khoản tạo / sửa ở đây được chuyển sang khi bấm
        <b>📤 Gửi sang Giao hàng An Tâm</b> trong Phân tuyến giao hàng; kết quả giao, ảnh và vị trí xem ở trang Giao hàng An Tâm.</div>`
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
        <p class="hint">Ảnh do người giao chụp lúc giao (có ghi giờ, mã khách trên ảnh); "vị trí lúc giao" là định vị điện thoại khi bấm Đã giao. Bấm ảnh để xem lớn.</p></div>`}`;
    if (!GIAO_LINKED) {
      $('#g-date').onchange = () => { res.date = $('#g-date').value; loadRes(); };
      $('#g-who').onchange = () => { res.who = $('#g-who').value; drawRes(); };
      $('#g-reload').onclick = () => loadRes();
      loadRes();
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
      : `<a class="btn" href="/api/export/backup">⬇ Tải bản sao lưu cả 2 kho (.db)</a>
      <a class="btn" href="/api/export/backup.json">⬇ Tải dữ liệu (.json)</a>
      <a class="btn" href="/api/export/lines.csv?wh=${S.wh}">⬇ Xuất sổ nhập xuất ${esc(W.name)} (CSV mở bằng Excel)</a></div>
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

/* ============================================================ Lịch sử */
async function viewLog(main) {
  setTitle('Lịch sử thao tác');
  const rows = await api('GET', '/log');
  main.innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="nowrap">${esc(r.at)}</td><td>${esc(r.who)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td><td class="small" style="max-width:520px;word-break:break-word">${esc(r.detail)}</td></tr>`).join('')}
    </tbody></table></div><p class="hint">500 thao tác gần nhất.</p>` : '<p class="muted">Chưa có thao tác nào.</p>';
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
  if (store('mode') === 'giao') return startDriverMode();
  const tok = store(ADMIN_KEY);
  if (tok && (await api('POST', '/admin/check', { token: tok }).catch(() => ({}))).ok) return enterAdmin();
  return showGiaoStart();
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
      <p class="small" style="margin-top:0">Ở web <b>Kho An Tâm › Phân tuyến giao hàng</b>: mở ngày cần giao → <b>💾 Lưu</b> → <b>📤 Gửi sang Giao hàng An Tâm</b> (dữ liệu được sao chép).
      Sau đó bấm vào ô dưới và <kbd>Ctrl</kbd>+<kbd>V</kbd>, rồi <b>Nhận dữ liệu</b>. Gửi lại cùng ngày sẽ thay bảng cũ của ngày đó (kết quả đã giao vẫn giữ).</p>
      <textarea id="im-text" rows="3" placeholder="Bấm vào đây rồi Ctrl+V…" style="width:100%"></textarea>
      <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="im-go">📥 Nhận dữ liệu</button>
      <label class="field">hoặc chọn file .json đã tải<input type="file" id="im-file" accept=".json,application/json"></label></div>
      <div id="im-res"></div></div>
    <div class="card"><h3>Các ngày đã nhận</h3>${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ngày giao</th><th>Nội dung</th><th>Nhận lúc</th></tr></thead><tbody>
      ${list.map(d => `<tr><td class="nowrap">${vnDate(d.date)}</td><td>${esc(d.title)}</td><td class="small muted">${esc(d.updated_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa nhận ngày nào.</p>'}</div>`;
  const ta = $('#im-text');
  ta.onpaste = e => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t && t.length > 2000) { e.preventDefault(); pasted = t; ta.value = `(Đã dán ${Math.round(t.length / 1024)} KB dữ liệu – bấm "Nhận dữ liệu")`; }
  };
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
  $('#user-btn').onclick = () => askUser(true);
  $('#refresh-btn').onclick = async () => {
    if (S.dirty && !(await ask('Có thay đổi chưa lưu. Tải lại dữ liệu mới sẽ bỏ thay đổi đó?'))) return;
    S.dirty = false; $('#refresh-btn').hidden = true; await loadMeta(); render();
  };
  try {
    if (ONLINE) {
      $('#main').innerHTML = '<div class="callout">Đang kết nối dữ liệu dùng chung…</div>';
      await Backend.init();
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
    }
    await loadMeta();
  } catch (e) { $('#main').innerHTML = `<div class="callout warn">Không kết nối được dữ liệu: ${esc(e.message)}</div>`; return; }
  $('#user-btn').textContent = '👤 ' + (S.user || 'Khách');
  await render();
  if (!S.user && !VIEW) askUser();
}
boot();
