'use strict';
/* Bản online (trang claude.ai): thay máy chủ Python (server.py) bằng kho dữ liệu dùng chung của trang.
   Giao diện (static/app.js) gọi api(method, path, body) như cũ; ở đây trả lời các API đó từ bộ nhớ,
   đồng bộ trực tiếp với kho dữ liệu chung (ai mở trang cũng thấy cùng dữ liệu).

   Cấu trúc dữ liệu:
     config/settings              {s: cài đặt}
     config/routes                {r: {id: tuyến|null}}
     kho/<TP|NVL>/meta/products   {p: {mã: mặt hàng|null}}
     kho/<kho>/days/<yyyy-mm-dd>  {date, v: {id: phiếu|null}}       – các phiếu của 1 ngày
     kho/<kho>/docs/<id>          biên bản kiểm kê / bàn giao / kebab / kê đơn
     kho/<kho>/plans/<yyyy-mm>    {ym, p: {id: dòng kế hoạch|null}}
     log/<yyyy-mm-dd>             {date, e: {id: thao tác}}
   null = đã xóa (ghi gộp từng phần nên mỗi người sửa phiếu riêng không đè lên nhau). */
window.ANTAM_ONLINE = true;

const Backend = (() => {
  const TYPE_PREFIX = { N: 'PNK', X: 'PXK', D: 'DCK' };
  const TYPE_LABEL = { N: 'Nhập', X: 'Xuất', D: 'Điều chỉnh' };
  const TP_NAME = 'Kho thành phẩm - hàng hóa';
  const NVL_NAME = 'Kho nguyên vật liệu';
  const OLD_TP_NAME = 'Kho tổng';
  const WAREHOUSES = ['TP', 'NVL'];
  const DEFAULT_WAREHOUSES = {
    TP: {
      name: TP_NAME, department: 'Kho Thành phẩm & Hàng hóa – An Tâm', routes: true,
      parties: [TP_NAME, 'Xưởng', 'Văn phòng', 'Nhà cung cấp', 'Đóng đơn- giao hàng', 'Khách trả hàng', NVL_NAME],
      defaults: {
        N: { from_party: 'Xưởng', to_party: TP_NAME, reason: 'Nhập kho từ bộ phận sản xuất' },
        X: { from_party: TP_NAME, to_party: 'Đóng đơn- giao hàng', reason: '' },
        D: { from_party: TP_NAME, to_party: '', reason: 'Điều chỉnh về theo số kiểm kê thực tế' },
      },
      adj_signers: ['Người lập phiếu / kiểm duyệt', 'Thủ kho', 'Kế toán'],
    },
    NVL: {
      name: NVL_NAME, department: 'Kho Nguyên vật liệu – An Tâm', routes: false,
      parties: [NVL_NAME, 'Xưởng', 'Văn phòng', 'Nhà cung cấp', TP_NAME],
      defaults: {
        N: { from_party: 'Nhà cung cấp', to_party: NVL_NAME, reason: 'Nhập mua nguyên vật liệu' },
        X: { from_party: NVL_NAME, to_party: 'Xưởng', reason: 'Xuất nguyên vật liệu cho sản xuất' },
        D: { from_party: NVL_NAME, to_party: '', reason: 'Điều chỉnh về theo số kiểm kê thực tế' },
      },
      adj_signers: ['Người lập phiếu', 'Thủ kho', 'Kế toán', 'Giám đốc duyệt'],
    },
  };
  const DEFAULT_SETTINGS = {
    company: 'Công Ty TNHH SX- TM Ẩm Thực An Tâm',
    warehouses: DEFAULT_WAREHOUSES,
    groups: ['Thành phẩm', 'Bán thành phẩm', 'Hàng hóa', 'Nguyên liệu', 'Vật liệu - Bao bì', 'Công cụ dụng cụ'],
    units: ['Cái', 'Túi', 'Kg', 'Gr', 'Cây', 'Thùng', 'Hộp', 'Gói', 'Lít', 'Cuộn'],
    staff: [], stocktake_threshold: 0.01, kebab_sizes: [50, 45, 40, 35, 30, 25, 20, 15, 10, 5],
    plan_depts: ['Xưởng', 'Văn phòng'], paper: 'A4',
  };

  const st = {
    db: null, user: null, uid: '', wh: 'TP', ready: {},
    settings: {}, routes: {}, products: {}, days: {}, docs: {}, plans: {},
    ver: {}, vcache: {}, globalSubs: [], whSubs: [], lastLocal: 0, onRemote: null, loaded: false,
  };

  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const clone = o => JSON.parse(JSON.stringify(o));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const z = n => String(n).padStart(2, '0');
  function nowStr() { const d = new Date(); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }
  const today = () => nowStr().slice(0, 10);
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const text = v => (v === null || v === undefined ? '' : String(v).trim());
  function num(v, dflt = 0) {
    if (v === null || v === undefined || v === '') return dflt;
    if (typeof v === 'number') return v;
    let s = String(v).trim().replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    if (isNaN(n)) throw new ApiError(400, 'Giá trị số không hợp lệ: ' + v);
    return n;
  }
  const safeNum = (v, d = 0) => { try { return num(v, d); } catch (e) { return d; } };
  function validDate(v, field = 'Ngày') {
    const s = text(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00'))) throw new ApiError(400, `${field} không hợp lệ: ${s || '(trống)'}`);
    return s;
  }
  const fmtq = x => (Math.round((x + 0) * 1e6) / 1e6).toString();
  const live = obj => Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined);
  function deepMerge(target, patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepMerge(target[k], v);
      else target[k] = clone(v === undefined ? null : v);
    }
    return target;
  }

  /* ---------------------------------------------------------- kho dữ liệu */
  const ref = {
    settings: () => st.db.doc('config/settings'),
    routes: () => st.db.doc('config/routes'),
    products: wh => st.db.doc(`kho/${wh}/meta/products`),
    days: wh => st.db.collection(`kho/${wh}/days`),
    day: (wh, d) => st.db.doc(`kho/${wh}/days/${d}`),
    docs: wh => st.db.collection(`kho/${wh}/docs`),
    doc: (wh, id) => st.db.doc(`kho/${wh}/docs/${id}`),
    plans: wh => st.db.collection(`kho/${wh}/plans`),
    planMonth: (wh, ym) => st.db.doc(`kho/${wh}/plans/${ym}`),
    logs: () => st.db.collection('log'),
    logDay: d => st.db.doc('log/' + d),
  };
  function dbError(e) {
    const code = e && e.code;
    if (code === 'invalid_argument') return new ApiError(403, 'Không lưu được: bạn có thể chỉ có quyền xem trang này (cần quyền Contributor/Editor), hoặc dữ liệu quá lớn.');
    if (code === 'quota_exceeded') return new ApiError(507, 'Kho dữ liệu đã đầy: ' + (e.message || ''));
    if (code === 'resource_exhausted') return new ApiError(429, 'Thao tác quá nhanh, hãy thử lại sau vài giây.');
    return new ApiError(503, 'Mất kết nối dữ liệu, hãy thử lại. ' + (e && e.message ? '(' + e.message + ')' : ''));
  }
  async function write(fn) {
    st.lastLocal = Date.now();
    try { return await fn(); } catch (e) {
      if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 600); try { return await fn(); } catch (e2) { throw dbError(e2); } }
      throw dbError(e);
    } finally { st.lastLocal = Date.now(); }
  }
  // Gộp một phần vào tài liệu (tạo mới nếu chưa có, có khóa ngắn để 2 người tạo cùng lúc không đè nhau)
  async function mergeInto(r, patch, base) {
    await write(async () => {
      try { await r.update(patch); return; } catch (e) { if (!e || e.code !== 'invalid_argument') throw e; }
      const snap = await r.get();
      if (snap.exists) { await r.update(patch); return; }
      const lease = await r.acquire({ holder: st.uid || newId('h'), ttlMs: 3000 });
      if (!lease.acquired) { await sleep(800); await r.update(patch); return; }
      const again = await r.get();
      if (again.exists) await r.update(patch);
      else await r.set(deepMerge(clone(base || {}), patch));
    });
  }

  function bump(wh) { st.ver[wh] = (st.ver[wh] || 0) + 1; }
  function remote() {
    if (st.loaded && Date.now() - st.lastLocal > 4000 && st.onRemote) st.onRemote();
  }
  function snapKey(snap) {
    if (snap.docs) return JSON.stringify(snap.docs.map(d => [d.id, d.data()]));
    return JSON.stringify(snap.exists ? snap.data() : null);
  }
  function subscribe(list, query, onData, key) {
    return new Promise(resolve => {
      let first = true, last = null;
      const unsub = query.onSnapshot(snap => {
        const k = snapKey(snap);
        if (k === last) return; // lần giao lại không đổi gì (bản nháp từ bộ nhớ đệm → bản chính thức)
        last = k;
        onData(snap);
        if (first) { first = false; resolve(); } else if (!(snap.metadata && snap.metadata.hasPendingWrites)) remote();
      }, err => {
        console.warn('db subscription', key, err);
        if (first) { first = false; resolve(); }
      });
      list.push(unsub);
      setTimeout(() => { if (first) { first = false; resolve(); } }, 15000);
    });
  }
  function docData(snap) { return snap.exists ? snap.data() : null; }

  async function init() {
    if (!window.claude || !window.claude.use) throw new Error('Trang này cần mở trên claude.ai để dùng dữ liệu chung.');
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db) throw new Error('Không mở được kho dữ liệu chung. Hãy đăng nhập claude.ai rồi tải lại trang.');
    st.db = db; st.user = user;
    if (user) {
      try { st.uid = (await user.id()) || ''; } catch (e) { st.uid = ''; }
      try { const me = await user.me(); st.myName = (me && me.name) || ''; } catch (e) { st.myName = ''; }
      try { st.canWrite = await user.can('data.write'); } catch (e) { st.canWrite = null; }
    }
    await Promise.all([
      subscribe(st.globalSubs, ref.settings(), s => { st.settings = (docData(s) || {}).s || {}; }, 'settings'),
      subscribe(st.globalSubs, ref.routes(), s => { st.routes = (docData(s) || {}).r || {}; }, 'routes'),
    ]);
  }
  async function setWh(wh) {
    st.whSubs.forEach(u => { try { u(); } catch (e) { /* bỏ qua */ } });
    st.whSubs = [];
    st.wh = wh;
    st.loaded = false;
    await Promise.all([
      subscribe(st.whSubs, ref.products(wh), s => { st.products[wh] = (docData(s) || {}).p || {}; }, 'products'),
      subscribe(st.whSubs, ref.days(wh).orderBy('date', 'desc').limit(1000), s => {
        const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); st.days[wh] = m; bump(wh);
      }, 'days'),
      subscribe(st.whSubs, ref.docs(wh).orderBy('date', 'desc').limit(500), s => {
        const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); st.docs[wh] = m;
      }, 'docs'),
      subscribe(st.whSubs, ref.plans(wh).orderBy('ym', 'desc').limit(240), s => {
        const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); st.plans[wh] = m;
      }, 'plans'),
    ]);
    st.loaded = true;
  }

  /* ---------------------------------------------------------- cài đặt */
  function settings() {
    const s = Object.assign(clone(DEFAULT_SETTINGS), clone(st.settings || {}));
    const whs = s.warehouses || {};
    for (const code of WAREHOUSES) whs[code] = Object.assign(clone(DEFAULT_WAREHOUSES[code]), whs[code] || {});
    s.warehouses = whs;
    return s;
  }
  async function log(action, target, detail, wh) {
    const d = today();
    const id = newId('l');
    const entry = { at: nowStr(), who: st.who || '', action, target: wh ? `[${wh}] ${target}` : target,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail || '') };
    try { await mergeInto(ref.logDay(d), { e: { [id]: entry } }, { date: d }); } catch (e) { console.warn('log', e); }
  }

  /* ---------------------------------------------------------- dữ liệu đọc */
  function products(wh) {
    return live(st.products[wh]).map(([code, p]) => Object.assign({ unit: '', grp: '', price: 0, supplier: '', note: '', opening_qty: 0, min_qty: null, active: 1, sort: 0 }, p, { code }))
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.code.localeCompare(b.code));
  }
  const productMap = wh => Object.fromEntries(products(wh).map(p => [p.code, p]));
  function vouchers(wh) {
    const c = st.vcache[wh];
    if (c && c.ver === st.ver[wh]) return c.list;
    const list = [];
    for (const [day, doc] of Object.entries(st.days[wh] || {})) {
      for (const [id, v] of live(doc && doc.v)) {
        list.push(Object.assign({}, v, { id, wh, date: v.date || day,
          lines: (v.lines || []).map((l, i) => ({ line_no: i + 1, product_code: l.c, qty: l.q || 0, price: l.p || 0, note: l.n || '' })) }));
      }
    }
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1 : a.id < b.id ? -1 : 1));
    st.vcache[wh] = { ver: st.ver[wh], list, byId: Object.fromEntries(list.map(v => [v.id, v])) };
    return list;
  }
  const voucherById = (wh, id) => { vouchers(wh); return st.vcache[wh].byId[id]; };

  function nextNumber(wh, type, d, routeCode, excludeId) {
    const prefix = TYPE_PREFIX[type];
    const ddmm = d.slice(8, 10) + d.slice(5, 7);
    const head = `${prefix}-${ddmm}-`;
    let seq = 0;
    for (const v of vouchers(wh)) {
      if (v.type !== type || v.date.slice(0, 4) !== d.slice(0, 4) || v.id === excludeId) continue;
      const s = String(v.no).replace(/\s/g, '').toUpperCase();
      if (!s.startsWith(head)) continue;
      const m = s.slice(head.length).match(/^(\d+)/);
      if (m) seq = Math.max(seq, parseInt(m[1], 10));
    }
    let no = `${prefix}-${ddmm}-${z(seq + 1)}`;
    if (type === 'X') { const c = String(routeCode || '').replace(/\s/g, ''); if (c) no += '-' + c; }
    return no;
  }
  const sign = v => (v.type === 'X' ? -1 : 1);
  function stockMap(wh, { until, before, exclude } = {}) {
    const res = {};
    products(wh).forEach(p => { res[p.code] = p.opening_qty || 0; });
    for (const v of vouchers(wh)) {
      if (until && v.date > until) continue;
      if (before && v.date >= before) continue;
      if (exclude && v.id === exclude) continue;
      for (const l of v.lines) res[l.product_code] = (res[l.product_code] || 0) + sign(v) * l.qty;
    }
    return res;
  }
  function reportNxt(wh, from, to) {
    const opening = stockMap(wh, { before: from });
    const per = {};
    for (const v of vouchers(wh)) {
      if (v.date < from || v.date > to) continue;
      for (const l of v.lines) {
        const p = per[l.product_code] = per[l.product_code] || { N: 0, X: 0, D: 0, n: 0 };
        p[v.type] += l.qty; p.n++;
      }
    }
    const list = products(wh);
    const known = new Set(list.map(p => p.code));
    Object.keys(per).filter(c => !known.has(c)).sort().forEach(code => list.push({ code, name: '(không có trong danh mục)', unit: '', grp: '', price: 0, opening_qty: 0, min_qty: null }));
    return list.map(p => {
      const m = per[p.code] || { N: 0, X: 0, D: 0, n: 0 };
      const op = opening[p.code] || 0;
      const close = op + m.N - m.X + m.D;
      let warn = '';
      if (close < -1e-9) warn = 'Tồn âm';
      else if (p.min_qty !== null && p.min_qty !== undefined && close < p.min_qty) warn = 'Dưới tồn tối thiểu';
      return { code: p.code, name: p.name, unit: p.unit, grp: p.grp, opening_qty: p.opening_qty || 0, min_qty: p.min_qty === undefined ? null : p.min_qty,
        open: op, in: m.N, out: m.X, adj: m.D, close, price: p.price || 0, value: close * (p.price || 0), warn, moved: m.n > 0 };
    });
  }
  function stockCard(wh, code, from, to) {
    const opening = stockMap(wh, { before: from })[code] || 0;
    let bal = opening;
    const lines = [];
    for (const v of vouchers(wh)) {
      if (v.date < from || v.date > to) continue;
      for (const l of v.lines) {
        if (l.product_code !== code) continue;
        bal += sign(v) * l.qty;
        lines.push({ voucher_id: v.id, no: v.no, date: v.date, type: v.type, from_party: v.from_party, to_party: v.to_party, reason: v.reason, qty: l.qty, note: l.note, balance: bal });
      }
    }
    return { opening, lines, closing: bal };
  }
  function voucherFull(id) {
    let v = null;
    for (const wh of WAREHOUSES) { if (st.days[wh]) { v = voucherById(wh, id); if (v) break; } }
    if (!v) throw new ApiError(404, 'Không tìm thấy phiếu (có thể phiếu thuộc kho kia hoặc đã bị xóa)');
    const pm = productMap(v.wh);
    const out = clone(v);
    out.lines.forEach(l => { const p = pm[l.product_code]; l.name = p ? p.name : null; l.unit = p ? p.unit : null; });
    if (v.type === 'D') {
      const book = stockMap(v.wh, { until: v.date, exclude: v.id });
      out.lines.forEach(l => { l.book_qty = book[l.product_code] || 0; });
    }
    return out;
  }
  function voucherSummaryRow(v) {
    return Object.assign({}, v, { line_count: v.lines.length, total_qty: v.lines.reduce((a, l) => a + l.qty, 0),
      total_amount: v.lines.reduce((a, l) => a + l.qty * l.price, 0) });
  }
  const like = (q, ...vals) => vals.some(x => String(x || '').toLowerCase().includes(q));

  /* ---------------------------------------------------------- phiếu (ghi) */
  function storeVoucher(v) {
    return { no: v.no, type: v.type, date: v.date, route: v.route || '', from_party: v.from_party || '', to_party: v.to_party || '',
      giver: v.giver || '', receiver: v.receiver || '', reason: v.reason || '', bill_count: v.bill_count || '', doc_ref: v.doc_ref || '',
      note: v.note || '', created_at: v.created_at || nowStr(), updated_at: nowStr(),
      lines: v.lines.map(l => ({ c: l.product_code, q: l.qty, p: l.price || 0, n: l.note || '' })) };
  }
  function applyLocalVoucher(wh, date, id, stored) {
    st.days[wh] = st.days[wh] || {};
    const doc = st.days[wh][date] = Object.assign({ date, v: {} }, st.days[wh][date] || {});
    doc.v = Object.assign({}, doc.v, { [id]: stored });
    bump(wh);
  }
  async function saveVoucher(wh, data, vid) {
    const type = text(data.type);
    if (!TYPE_PREFIX[type]) throw new ApiError(400, 'Loại phiếu không hợp lệ');
    let old = null;
    if (vid) {
      for (const w of WAREHOUSES) { if (st.days[w]) { old = voucherById(w, vid); if (old) { wh = w; break; } } }
      if (!old) throw new ApiError(404, 'Không tìm thấy phiếu');
    }
    const d = validDate(data.date);
    const pm = productMap(wh);
    const clean = [];
    (data.lines || []).forEach((ln, i) => {
      const code = text(ln.product_code);
      if (!code) return;
      if (!pm[code]) throw new ApiError(400, `Dòng ${i + 1}: mã hàng ${code} chưa có trong danh mục kho này`);
      const qty = num(ln.qty);
      if (type !== 'D' && qty < 0) throw new ApiError(400, `Dòng ${i + 1}: số lượng không được âm (dùng phiếu điều chỉnh)`);
      clean.push({ product_code: code, qty, price: num(ln.price), note: text(ln.note) });
    });
    if (!clean.length) throw new ApiError(400, 'Phiếu chưa có mặt hàng nào');
    const no = text(data.no) || nextNumber(wh, type, d, data.route_code, vid);
    if (vouchers(wh).some(v => v.no === no && v.date.slice(0, 4) === d.slice(0, 4) && v.id !== vid)) {
      throw new ApiError(409, `Số phiếu ${no} đã tồn tại – hãy bấm 'Cấp số mới' hoặc sửa số`);
    }
    const id = vid || newId('v');
    const v = { no, type, date: d, lines: clean, created_at: old ? old.created_at : nowStr() };
    ['route', 'from_party', 'to_party', 'giver', 'receiver', 'reason', 'bill_count', 'doc_ref', 'note'].forEach(k => { v[k] = text(data[k]); });
    const stored = storeVoucher(v);
    if (old && old.date !== d) {
      await mergeInto(ref.day(wh, old.date), { v: { [id]: null } }, { date: old.date });
      applyLocalVoucher(wh, old.date, id, null);
    }
    await mergeInto(ref.day(wh, d), { v: { [id]: stored } }, { date: d });
    applyLocalVoucher(wh, d, id, stored);
    const summ = clean.map(l => `${l.product_code} x ${fmtq(l.qty)}`);
    await log(old ? 'Sửa phiếu' : 'Lập phiếu', no,
      old ? { 'trước': { 'ngày': old.date, 'dòng': old.lines.map(l => `${l.product_code} x ${fmtq(l.qty)}`) }, 'sau': summ } : summ, wh);
    return id;
  }
  async function deleteVoucher(id) {
    const v = voucherFull(id);
    await mergeInto(ref.day(v.wh, v.date), { v: { [id]: null } }, { date: v.date });
    applyLocalVoucher(v.wh, v.date, id, null);
    await log('Xóa phiếu', v.no, { 'ngày': v.date, 'dòng': v.lines.map(l => `${l.product_code} x ${fmtq(l.qty)}`) }, v.wh);
  }

  /* ---------------------------------------------------------- nhập Excel (SheetJS) */
  class DateVal { constructor(iso) { this.iso = iso; } }
  function readWorkbook(buf) {
    if (!window.XLSX) throw new ApiError(500, 'Chưa tải được thư viện đọc Excel, hãy tải lại trang.');
    let wb;
    try { wb = window.XLSX.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellDates: false, cellFormula: false }); } catch (e) {
      throw new ApiError(400, 'File không phải định dạng .xlsx (hãy lưu lại file bằng Excel dạng .xlsx)');
    }
    const out = {};
    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name];
      const range = ws['!ref'] ? window.XLSX.utils.decode_range(ws['!ref']) : { e: { r: 0 } };
      out[name] = {
        maxRow: range.e.r + 1,
        get(a) {
          const c = ws[a];
          if (!c || c.t === 'e' || c.t === 'z') return null;
          if (c.t === 'n' && c.z && window.XLSX.SSF.is_date(c.z)) {
            const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(c.v * 86400000));
            return new DateVal(dt.toISOString().slice(0, 10));
          }
          if (c.t === 'd') return new DateVal(new Date(c.v).toISOString().slice(0, 10));
          return c.v === '' ? null : c.v;
        },
      };
    });
    return out;
  }
  function detectWarehouse(wb) {
    for (const [name, cell] of [['Sổ Nhập Xuất', 'A1'], ['Phiếu Nhập Xuất', 'A2'], ['Phiếu Điều chỉnh', 'A2']]) {
      const sh = wb[name];
      if (!sh) continue;
      const hay = text(sh.get(cell)).toUpperCase();
      if (hay.includes('NGUYÊN VẬT LIỆU')) return 'NVL';
      if (hay.includes('THÀNH PHẨM')) return 'TP';
    }
    return null;
  }
  async function importExcel(wh, buf, opts) {
    const wb = readWorkbook(buf);
    const detected = detectWarehouse(wb);
    const names = { TP: TP_NAME, NVL: NVL_NAME };
    if (detected && detected !== wh && !opts.force) {
      throw new ApiError(409, `File này có vẻ là của ${names[detected]}, nhưng bạn đang nhập vào ${names[wh]}. Hãy chuyển kho ở góc trên bên trái rồi nhập lại.`);
    }
    const sheet = n => { const k = Object.keys(wb).find(x => x.trim().toLowerCase() === n.toLowerCase()); return k ? wb[k] : null; };
    const party = v => { const s = text(v); return wh === 'TP' && s === OLD_TP_NAME ? TP_NAME : s; };
    const summary = {};
    const prods = clone(st.products[wh] || {});
    let prodChanged = false;
    const ensureProduct = (code, name, unit) => {
      if (!prods[code]) { prods[code] = { name: name || code, unit: unit || '', grp: '', price: 0, supplier: '', note: '', opening_qty: 0, min_qty: null, active: 1, sort: 9000 + Object.keys(prods).length }; prodChanged = true; }
    };
    const cat = sheet('Danh mục hàng'), nxt = sheet('Nhập Xuất Tồn');
    const opening = {};
    if (nxt) for (let r = 6; r < 2000; r++) { const c = text(nxt.get('B' + r)); if (c) opening[c] = [nxt.get('F' + r), nxt.get('G' + r)]; }
    if (cat && opts.products) {
      let n = 0;
      for (let r = 5; r < 5000; r++) {
        const code = text(cat.get('A' + r));
        if (!code) continue;
        const [op, mn] = opening[code] || [null, null];
        prods[code] = Object.assign({ active: 1 }, prods[code] || {}, {
          name: text(cat.get('B' + r)) || code, unit: text(cat.get('C' + r)), grp: text(cat.get('D' + r)), price: safeNum(cat.get('E' + r)),
          supplier: text(cat.get('F' + r)), note: text(cat.get('G' + r)), opening_qty: safeNum(op), min_qty: safeNum(mn, null), sort: r });
        n++;
      }
      prodChanged = true;
      summary['Mặt hàng'] = n;
    }
    const rt = sheet('Danh mục tuyến');
    if (rt && opts.routes) {
      const routes = clone(st.routes || {});
      const byName = Object.fromEntries(live(routes).map(([id, r]) => [r.name, id]));
      let n = 0;
      for (let r = 5; r < 1000; r++) {
        const name = text(rt.get('B' + r)), code = text(rt.get('C' + r));
        if (!name) continue;
        const id = byName[name] || newId('r');
        routes[id] = { name, code, note: text(rt.get('D' + r)), sort: r };
        n++;
      }
      await write(() => ref.routes().set({ r: routes }));
      st.routes = routes;
      summary['Tuyến'] = n;
    }
    const ledger = sheet('Sổ Nhập Xuất');
    let newDays = null;
    if (ledger && opts.ledger) {
      const groups = new Map();
      let skipped = 0;
      for (let r = 5; r <= ledger.maxRow; r++) {
        const no = text(ledger.get('A' + r)), item = text(ledger.get('F' + r));
        if (!no && !item) continue;
        let code = text(ledger.get('G' + r));
        if ((!code || code === 'Không có mã') && item) code = item.split('|')[0].trim();
        const d = ledger.get('B' + r);
        if (!no || !code || !(d instanceof DateVal)) { skipped++; continue; }
        let type = { 'Nhập': 'N', 'Xuất': 'X', 'Điều chỉnh': 'D' }[text(ledger.get('C' + r))];
        if (!type) { const h = no.replace(/\s/g, '').toUpperCase(); type = h.startsWith('PN') ? 'N' : h.startsWith('PX') ? 'X' : h.startsWith('DC') ? 'D' : null; }
        if (!type) { skipped++; continue; }
        const key = `${no}\u0001${d.iso}\u0001${type}`;
        if (!groups.has(key)) groups.set(key, { no, date: d.iso, type, hdr: {}, lines: [] });
        const g = groups.get(key);
        for (const [f, col] of [['from_party', 'D'], ['to_party', 'E'], ['reason', 'N'], ['giver', 'O'], ['receiver', 'P']]) {
          const val = f.endsWith('party') ? party(ledger.get(col + r)) : text(ledger.get(col + r));
          if (val && !g.hdr[f]) g.hdr[f] = val;
        }
        ensureProduct(code, text(ledger.get('H' + r)) || item, text(ledger.get('J' + r)));
        g.lines.push({ product_code: code, qty: safeNum(ledger.get('K' + r)), price: safeNum(ledger.get('L' + r)), note: text(ledger.get('I' + r)) });
      }
      const routeByCode = Object.fromEntries(live(st.routes).map(([, r]) => [String(r.code).replace(/\s/g, ''), r.name]));
      newDays = {};
      let i = 0;
      const ts = nowStr();
      for (const g of groups.values()) {
        let route = '';
        if (g.type === 'X' && wh === 'TP') { const m = g.no.replace(/\s/g, '').match(/^PXK-\d{4}-\d+-(.+)$/i); if (m) route = routeByCode[m[1]] || ''; }
        const id = 'x' + (i++).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
        const v = Object.assign({ no: g.no, type: g.type, date: g.date, route, lines: g.lines, created_at: ts }, g.hdr);
        (newDays[g.date] = newDays[g.date] || { date: g.date, v: {} }).v[id] = storeVoucher(v);
      }
      summary['Phiếu'] = groups.size;
      summary['Dòng hàng'] = [...groups.values()].reduce((a, g) => a + g.lines.length, 0);
      if (skipped) summary['Dòng bỏ qua (thiếu số phiếu/ngày/mã)'] = skipped;
    }
    const kh = sheet('KH Ngày');
    let newPlans = null;
    if (kh && opts.plans) {
      newPlans = {};
      let n = 0;
      const ts = nowStr();
      for (let r = 5; r <= kh.maxRow; r++) {
        const item = text(kh.get('C' + r)), d = kh.get('A' + r);
        if (!item || !(d instanceof DateVal)) continue;
        let code = text(kh.get('D' + r));
        if (!code || code === 'Không có mã') code = item.split('|')[0].trim();
        ensureProduct(code, text(kh.get('E' + r)) || item, text(kh.get('F' + r)));
        const nd = kh.get('J' + r);
        const ym = d.iso.slice(0, 7);
        (newPlans[ym] = newPlans[ym] || { ym, p: {} }).p[newId('p') + n] = {
          date: d.iso, dept: text(kh.get('B' + r)), product_code: code, qty: safeNum(kh.get('G' + r)), price: safeNum(kh.get('H' + r)),
          need_date: nd instanceof DateVal ? nd.iso : '', proposer: text(kh.get('K' + r)), note: text(kh.get('L' + r)), created_at: ts, updated_at: ts };
        n++;
      }
      summary['Dòng kế hoạch mua hàng'] = n;
    }
    if (!Object.keys(summary).length) throw new ApiError(400, 'Không tìm thấy sheet phù hợp (Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất, KH Ngày)');
    if (prodChanged) { await write(() => ref.products(wh).set({ p: prods })); st.products[wh] = prods; }
    if (newDays) {
      for (const d of Object.keys(st.days[wh] || {})) if (!newDays[d]) await write(() => ref.day(wh, d).delete());
      for (const [d, doc] of Object.entries(newDays)) await write(() => ref.day(wh, d).set(doc));
      st.days[wh] = clone(newDays); bump(wh);
    }
    if (newPlans) {
      for (const ym of Object.keys(st.plans[wh] || {})) if (!newPlans[ym]) await write(() => ref.planMonth(wh, ym).delete());
      for (const [ym, doc] of Object.entries(newPlans)) await write(() => ref.planMonth(wh, ym).set(doc));
      st.plans[wh] = clone(newPlans);
    }
    await log('Nhập Excel', '', summary, wh);
    return summary;
  }

  /* ---------------------------------------------------------- kế hoạch mua */
  function planRows(wh, from, to) {
    const pm = productMap(wh);
    const rows = [];
    for (const [ym, doc] of Object.entries(st.plans[wh] || {})) {
      for (const [id, r] of live(doc && doc.p)) {
        if ((from && r.date < from) || (to && r.date > to)) continue;
        const p = pm[r.product_code] || {};
        rows.push(Object.assign({ id, ym, wh }, r, { name: p.name || null, unit: p.unit || null, grp: p.grp || null, supplier: p.supplier || null }));
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  }
  function findPlan(wh, id) {
    for (const [ym, doc] of Object.entries(st.plans[wh] || {})) if (doc && doc.p && doc.p[id]) return { ym, row: doc.p[id] };
    return null;
  }
  function applyLocalPlan(wh, ym, id, row) {
    st.plans[wh] = st.plans[wh] || {};
    const doc = st.plans[wh][ym] = Object.assign({ ym, p: {} }, st.plans[wh][ym] || {});
    doc.p = Object.assign({}, doc.p, { [id]: row });
  }

  /* ---------------------------------------------------------- xuất file */
  function csvCell(v) { const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportCsv(wh, from, to) {
    const pm = productMap(wh);
    const out = [['Số phiếu', 'Ngày', 'Loại', 'Bên giao', 'Bên nhận', 'Mã hàng', 'Tên hàng', 'Ghi chú', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Lý do / Diễn giải', 'Người giao', 'Người nhận']];
    for (const v of vouchers(wh)) {
      if ((from && v.date < from) || (to && v.date > to)) continue;
      const d = `${v.date.slice(8, 10)}/${v.date.slice(5, 7)}/${v.date.slice(0, 4)}`;
      for (const l of v.lines) {
        const p = pm[l.product_code] || {};
        out.push([v.no, d, TYPE_LABEL[v.type], v.from_party, v.to_party, l.product_code, p.name || '', l.note, p.unit || '', fmtq(l.qty), fmtq(l.price), fmtq(l.qty * l.price), v.reason, v.giver, v.receiver]);
      }
    }
    return '﻿' + out.map(r => r.map(csvCell).join(',')).join('\r\n');
  }
  function exportBackup() {
    return JSON.stringify({ format: 'kho-antam-backup', version: 1, at: nowStr(), settings: st.settings, routes: st.routes,
      warehouses: Object.fromEntries(WAREHOUSES.filter(w => st.days[w]).map(w => [w, { products: st.products[w], days: st.days[w], docs: st.docs[w], plans: st.plans[w] }])) }, null, 1);
  }

  /* ---------------------------------------------------------- bộ định tuyến API (giống server.py) */
  async function handle(method, fullPath, body) {
    const [pathPart, qs] = fullPath.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const parts = pathPart.replace(/^\/+|\/+$/g, '').split('/');
    const res = parts[0], arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    const wh = q.wh || st.wh;
    if (!WAREHOUSES.includes(wh)) throw new ApiError(400, 'Kho không hợp lệ: ' + wh);
    if (!st.days[wh] && res !== 'meta' && res !== 'settings' && res !== 'routes') throw new ApiError(400, 'Chưa tải dữ liệu kho ' + wh);

    if (res === 'meta' && method === 'GET') {
      const s = settings();
      const people = new Set(s.staff || []), parties = new Set(s.warehouses[wh].parties || []);
      for (const v of vouchers(wh)) {
        [v.giver, v.receiver].forEach(x => { if (x && x.trim()) people.add(x.trim()); });
        [v.from_party, v.to_party].forEach(x => { if (x && x.trim()) parties.add(x.trim()); });
      }
      planRows(wh).forEach(r => { if (r.proposer) people.add(r.proposer.trim()); });
      const sortVi = a => [...a].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), 'vi'));
      return {
        wh, settings: s, warehouse: s.warehouses[wh], products: products(wh),
        routes: live(st.routes).map(([id, r]) => Object.assign({ id }, r)).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
        people: sortVi(people), parties: sortVi(parties),
        counts: Object.fromEntries(WAREHOUSES.map(w => [w, st.days[w] ? vouchers(w).length : 0])),
        online: { canWrite: st.canWrite, myName: st.myName || '' },
      };
    }
    if (res === 'settings' && method === 'PUT') {
      const cur = settings();
      const next = clone(st.settings || {});
      for (const [k, v] of Object.entries(body || {})) {
        if (k === 'warehouses') {
          const whs = cur.warehouses;
          for (const [code, d] of Object.entries(v || {})) if (whs[code]) ['name', 'department', 'parties'].forEach(f => { if (d[f] !== undefined) whs[code][f] = d[f]; });
          next.warehouses = Object.fromEntries(WAREHOUSES.map(c => [c, { name: whs[c].name, department: whs[c].department, parties: whs[c].parties }]));
        } else if (k in DEFAULT_SETTINGS) next[k] = v;
      }
      await write(() => ref.settings().set({ s: next }));
      st.settings = next;
      await log('Sửa cài đặt', '', Object.keys(body || {}));
      return { ok: true };
    }

    if (res === 'products') {
      if (method === 'POST') {
        const d = body || {};
        const code = text(d.code).toUpperCase().replace(/\s/g, '');
        if (!code || !text(d.name)) throw new ApiError(400, 'Cần nhập Mã hàng và Tên hàng');
        if (!/^[A-Za-z0-9_\-.~:@+]+$/.test(code)) throw new ApiError(400, 'Mã hàng chỉ dùng chữ không dấu, số và các ký tự _ - .');
        const orig = text(d.original_code);
        const cur = st.products[wh] || {};
        const exists = c => !!cur[c];
        const rec = { name: text(d.name), unit: text(d.unit), grp: text(d.grp), price: num(d.price), supplier: text(d.supplier), note: text(d.note),
          opening_qty: num(d.opening_qty), min_qty: text(d.min_qty) === '' ? null : num(d.min_qty), active: d.active === false ? 0 : 1 };
        if (orig) {
          if (orig !== code && exists(code)) throw new ApiError(409, `Mã ${code} đã tồn tại`);
          rec.sort = (cur[orig] || {}).sort || 0;
          const patch = { [code]: rec };
          if (orig !== code) patch[orig] = null;
          await mergeInto(ref.products(wh), { p: patch }, {});
          st.products[wh] = Object.assign({}, cur, patch);
          if (orig !== code) {
            for (const [date, doc] of Object.entries(st.days[wh] || {})) {
              const ch = {};
              for (const [id, v] of live(doc.v)) if ((v.lines || []).some(l => l.c === orig)) ch[id] = Object.assign({}, v, { lines: v.lines.map(l => (l.c === orig ? Object.assign({}, l, { c: code }) : l)) });
              if (Object.keys(ch).length) { await mergeInto(ref.day(wh, date), { v: ch }, { date }); Object.entries(ch).forEach(([id, v]) => applyLocalVoucher(wh, date, id, v)); }
            }
            for (const [ym, doc] of Object.entries(st.plans[wh] || {})) {
              const ch = {};
              for (const [id, r] of live(doc.p)) if (r.product_code === orig) ch[id] = Object.assign({}, r, { product_code: code });
              if (Object.keys(ch).length) { await mergeInto(ref.planMonth(wh, ym), { p: ch }, { ym }); Object.entries(ch).forEach(([id, r]) => applyLocalPlan(wh, ym, id, r)); }
            }
          }
          await log('Sửa mặt hàng', code, '', wh);
        } else {
          if (exists(code)) throw new ApiError(409, `Mã ${code} đã tồn tại`);
          rec.sort = Math.max(0, ...live(cur).map(([, p]) => p.sort || 0)) + 1;
          await mergeInto(ref.products(wh), { p: { [code]: rec } }, {});
          st.products[wh] = Object.assign({}, cur, { [code]: rec });
          await log('Thêm mặt hàng', code, '', wh);
        }
        return { ok: true, code };
      }
      if (method === 'DELETE' && arg) {
        let used = 0;
        vouchers(wh).forEach(v => v.lines.forEach(l => { if (l.product_code === arg) used++; }));
        used += planRows(wh).filter(r => r.product_code === arg).length;
        if (used) throw new ApiError(409, `Mã ${arg} đã có ${used} dòng trong sổ/kế hoạch – không xóa được (có thể bỏ chọn 'Đang dùng')`);
        await mergeInto(ref.products(wh), { p: { [arg]: null } }, {});
        st.products[wh] = Object.assign({}, st.products[wh], { [arg]: null });
        await log('Xóa mặt hàng', arg, '', wh);
        return { ok: true };
      }
    }

    if (res === 'routes') {
      if (method === 'POST') {
        const d = body || {};
        const name = text(d.name), code = text(d.code).replace(/\s/g, '');
        if (!name || !code) throw new ApiError(400, 'Cần nhập Tên tuyến và Mã tuyến');
        const id = d.id || newId('r');
        const sort = d.id && st.routes[id] ? st.routes[id].sort : Math.max(0, ...live(st.routes).map(([, r]) => r.sort || 0)) + 1;
        const rec = { name, code, note: text(d.note), sort };
        await mergeInto(ref.routes(), { r: { [id]: rec } }, {});
        st.routes = Object.assign({}, st.routes, { [id]: rec });
        await log('Lưu tuyến', name);
        return { ok: true };
      }
      if (method === 'DELETE' && arg) {
        await mergeInto(ref.routes(), { r: { [arg]: null } }, {});
        st.routes = Object.assign({}, st.routes, { [arg]: null });
        await log('Xóa tuyến', arg);
        return { ok: true };
      }
    }

    if (res === 'next-number' && method === 'GET') {
      if (!TYPE_PREFIX[q.type || 'N']) throw new ApiError(400, 'Loại phiếu không hợp lệ');
      return { no: nextNumber(wh, q.type || 'N', validDate(q.date), q.route_code || '', q.exclude || null) };
    }
    if (res === 'vouchers') {
      if (method === 'GET' && arg === 'full') {
        let ids;
        if (q.ids) ids = q.ids.split(',').filter(Boolean);
        else {
          const d = validDate(q.date);
          ids = vouchers(wh).filter(v => v.date === d && (!TYPE_PREFIX[q.type] || v.type === q.type))
            .sort((a, b) => (a.type + a.no).localeCompare(b.type + b.no)).map(v => v.id);
        }
        return ids.map(voucherFull);
      }
      if (method === 'GET' && arg) return voucherFull(arg);
      if (method === 'GET') {
        const qq = (q.q || '').trim().toLowerCase();
        const pm = productMap(wh);
        const list = vouchers(wh).filter(v => (!q.from || v.date >= q.from) && (!q.to || v.date <= q.to) && (!TYPE_PREFIX[q.type] || v.type === q.type) &&
          (!qq || like(qq, v.no, v.reason, v.route, v.giver, v.receiver, v.to_party) || v.lines.some(l => like(qq, l.product_code, (pm[l.product_code] || {}).name, l.note))));
        list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.type < b.type ? -1 : a.type > b.type ? 1 : a.no < b.no ? 1 : a.no > b.no ? -1 : 0));
        return list.slice(0, parseInt(q.limit || '1000', 10)).map(voucherSummaryRow);
      }
      if (method === 'POST') return voucherFull(await saveVoucher(wh, body || {}, null));
      if (method === 'PUT' && arg) return voucherFull(await saveVoucher(wh, body || {}, arg));
      if (method === 'DELETE' && arg) { await deleteVoucher(arg); return { ok: true }; }
    }

    if (res === 'lines' && method === 'GET') {
      const pm = productMap(wh);
      const out = [];
      const list = vouchers(wh).filter(v => (!q.from || v.date >= q.from) && (!q.to || v.date <= q.to) && (!TYPE_PREFIX[q.type] || v.type === q.type));
      for (let i = list.length - 1; i >= 0 && out.length < 5000; i--) {
        const v = list[i];
        for (const l of v.lines) {
          if (q.code && l.product_code !== q.code) continue;
          const p = pm[l.product_code] || {};
          out.push({ voucher_id: v.id, no: v.no, date: v.date, type: v.type, from_party: v.from_party, to_party: v.to_party, giver: v.giver,
            receiver: v.receiver, reason: v.reason, product_code: l.product_code, name: p.name || null, unit: p.unit || null, qty: l.qty, price: l.price, note: l.note });
        }
      }
      return out;
    }

    if (res === 'report') {
      if (arg === 'nxt') return reportNxt(wh, validDate(q.from, 'Từ ngày'), validDate(q.to, 'Đến ngày'));
      if (arg === 'stock') return stockMap(wh, { until: q.date ? validDate(q.date) : null, exclude: q.exclude || null });
      if (arg === 'card') return stockCard(wh, q.code || '', validDate(q.from, 'Từ ngày'), validDate(q.to, 'Đến ngày'));
    }

    if (res === 'plans') {
      if (method === 'GET') return planRows(wh, q.from, q.to);
      if (method === 'POST') {
        const d = body || {};
        const code = text(d.product_code);
        if (!(st.products[wh] || {})[code]) throw new ApiError(400, 'Chưa chọn mặt hàng (hoặc mã không có trong danh mục kho này)');
        const row = { date: validDate(d.date, 'Ngày đặt'), dept: text(d.dept), product_code: code, qty: num(d.qty), price: num(d.price),
          need_date: text(d.need_date) ? validDate(d.need_date, 'Ngày cần hàng') : '', proposer: text(d.proposer), note: text(d.note), updated_at: nowStr() };
        const ym = row.date.slice(0, 7);
        const old = d.id ? findPlan(wh, d.id) : null;
        const id = d.id || newId('p');
        row.created_at = old ? old.row.created_at : row.updated_at;
        if (old && old.ym !== ym) { await mergeInto(ref.planMonth(wh, old.ym), { p: { [id]: null } }, { ym: old.ym }); applyLocalPlan(wh, old.ym, id, null); }
        await mergeInto(ref.planMonth(wh, ym), { p: { [id]: row } }, { ym });
        applyLocalPlan(wh, ym, id, row);
        await log(old ? 'Sửa kế hoạch mua' : 'Thêm kế hoạch mua', `${code} x ${fmtq(row.qty)}`, '', wh);
        return { ok: true };
      }
      if (method === 'DELETE' && arg) {
        const old = findPlan(wh, arg);
        if (old) { await mergeInto(ref.planMonth(wh, old.ym), { p: { [arg]: null } }, { ym: old.ym }); applyLocalPlan(wh, old.ym, arg, null); }
        await log('Xóa kế hoạch mua', arg, '', wh);
        return { ok: true };
      }
    }

    if (res === 'docs') {
      if (method === 'GET' && arg) {
        for (const w of WAREHOUSES) { const d = (st.docs[w] || {})[arg]; if (d) return Object.assign({ id: arg, wh: w }, clone(d)); }
        throw new ApiError(404, 'Không tìm thấy');
      }
      if (method === 'GET') {
        return Object.entries(st.docs[wh] || {}).filter(([, d]) => d.kind === q.kind)
          .map(([id, d]) => ({ id, wh, kind: d.kind, date: d.date, title: d.title, created_at: d.created_at, updated_at: d.updated_at }))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at || '') < (b.created_at || '') ? 1 : -1));
      }
      if (method === 'POST' || method === 'PUT') {
        const d = body || {};
        if (!['stocktake', 'handover', 'kebab', 'routeorders'].includes(text(d.kind))) throw new ApiError(400, 'Loại biên bản không hợp lệ');
        const id = method === 'PUT' && arg ? arg : newId('d');
        const old = (st.docs[wh] || {})[id];
        const rec = { kind: d.kind, date: validDate(d.date), title: text(d.title), data: d.data || {}, created_at: old ? old.created_at : nowStr(), updated_at: nowStr() };
        if (JSON.stringify(rec).length > 240000) throw new ApiError(413, 'Biên bản quá lớn để lưu');
        await write(() => ref.doc(wh, id).set(rec));
        st.docs[wh] = Object.assign({}, st.docs[wh], { [id]: rec });
        await log(old ? 'Sửa biên bản' : 'Lưu biên bản', `${d.kind} ${rec.date}`, '', wh);
        return { ok: true, id };
      }
      if (method === 'DELETE' && arg) {
        await write(() => ref.doc(wh, arg).delete());
        const m = Object.assign({}, st.docs[wh]); delete m[arg]; st.docs[wh] = m;
        await log('Xóa biên bản', arg, '', wh);
        return { ok: true };
      }
    }

    if (res === 'log' && method === 'GET') {
      const snap = await ref.logs().orderBy('date', 'desc').limit(31).get();
      const out = [];
      snap.docs.forEach(d => live((d.data() || {}).e).forEach(([id, e]) => out.push(Object.assign({ id }, e))));
      return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 500);
    }

    if (res === 'import' && method === 'POST') {
      if (!body || !body.byteLength) throw new ApiError(400, 'Chưa chọn file');
      const opts = {};
      ['products', 'routes', 'ledger', 'plans'].forEach(k => { opts[k] = (q[k] || '1') === '1'; });
      opts.force = q.force === '1';
      return importExcel(wh, body, opts);
    }

    if (res === 'export' && method === 'GET') {
      if (arg === 'lines.csv') return exportCsv(wh, q.from, q.to);
      if (arg === 'backup') return exportBackup();
    }
    throw new ApiError(404, 'Không có chức năng này');
  }

  return {
    init, setWh, handle,
    set who(v) { st.who = v; },
    get myName() { return st.myName || ''; },
    get canWrite() { return st.canWrite; },
    onRemote(fn) { st.onRemote = fn; },
  };
})();
