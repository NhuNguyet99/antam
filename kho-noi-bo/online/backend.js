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
     kho/TP/giao/<yyyy-mm-dd>     {date, d: {mã khách: kết quả giao|null}}  – web giao hàng ghi (kèm ảnh, vị trí lúc giao)
     kho/TP/meta/vitri            {v: {mã khách: {lat, lng, acc, name, driver, at}|null}}  – vị trí khách người giao đã lưu
     kho/TP/anh/<id>              {date, key, data}  – ảnh giao hàng khi trang không lưu được vào kho ảnh (assets)
     log/<yyyy-mm-dd>             {date, e: {id: thao tác}}
   Tài khoản giao hàng nằm trong cài đặt: s.drivers {id: {nick, name, phone, routes, active, salt, pin}|null}
   null = đã xóa (ghi gộp từng phần nên mỗi người sửa phiếu riêng không đè lên nhau). */
window.ANTAM_ONLINE = true;

const Backend = (() => {
  // Trang xem công khai (build --view): đọc số liệu chụp sẵn trong trang, không ghi được
  const VIEW = !!window.ANTAM_VIEW;
  const SKELETON_RESET = (() => { const el = document.head && document.head.querySelector('style'); return el ? el.textContent : ''; })();
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
    routing: { rules: [], memory: {} },
    drivers: {},
    admin: {}, // web Giao hàng An Tâm: mật khẩu quản lý {salt, pin}
    staff_accounts: {}, // tài khoản nhân viên web kho {id: {user, name, admin, active, salt, pw}}
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
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`; };
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
  const READONLY_MSG = 'Đây là trang chỉ xem. Muốn nhập hoặc sửa phiếu, hãy dùng web chính (cần được mời).';
  const dbx = () => { if (VIEW || !st.db) throw new ApiError(403, VIEW ? READONLY_MSG : 'Chưa kết nối dữ liệu.'); return st.db; };
  const ref = {
    settings: () => dbx().doc('config/settings'),
    routes: () => dbx().doc('config/routes'),
    products: wh => dbx().doc(`kho/${wh}/meta/products`),
    days: wh => dbx().collection(`kho/${wh}/days`),
    day: (wh, d) => dbx().doc(`kho/${wh}/days/${d}`),
    docs: wh => dbx().collection(`kho/${wh}/docs`),
    doc: (wh, id) => dbx().doc(`kho/${wh}/docs/${id}`),
    plans: wh => dbx().collection(`kho/${wh}/plans`),
    planMonth: (wh, ym) => dbx().doc(`kho/${wh}/plans/${ym}`),
    giao: d => dbx().doc(`kho/TP/giao/${d}`),
    giaoAll: () => dbx().collection('kho/TP/giao'),
    vitri: () => dbx().doc('kho/TP/meta/vitri'),
    anh: id => dbx().doc(`kho/TP/anh/${id}`),
    logs: () => dbx().collection('log'),
    logDay: d => dbx().doc('log/' + d),
    notice: sid => dbx().doc('notice/' + sid), // thông báo cho từng tài khoản nhân viên
  };
  function dbError(e) {
    const code = e && e.code;
    if (code === 'invalid_argument') return new ApiError(403, 'Không lưu được: bạn đang chỉ có quyền xem trang này. Nếu đã được mời làm Editor, nhờ chủ trang tắt chia sẻ "Anyone with the link" rồi tải lại trang.');
    if (code === 'quota_exceeded') return new ApiError(507, 'Kho dữ liệu đã đầy: ' + (e.message || ''));
    if (code === 'resource_exhausted') return new ApiError(429, 'Thao tác quá nhanh, hãy thử lại sau vài giây.');
    return new ApiError(503, 'Mất kết nối dữ liệu, hãy thử lại. ' + (e && e.message ? '(' + e.message + ')' : ''));
  }
  async function write(fn) {
    if (VIEW) throw new ApiError(403, READONLY_MSG);
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

  function loadSnapshot(snap) {
    st.settings = snap.settings || {}; st.routes = snap.routes || {};
    for (const w of WAREHOUSES) {
      const d = (snap.warehouses || {})[w] || {};
      st.products[w] = d.products || {}; st.days[w] = d.days || {}; st.docs[w] = d.docs || {}; st.plans[w] = d.plans || {};
      bump(w);
    }
    st.snapshotAt = snap.at || '';
  }
  // gọi nhiều lần được (web giao hàng → web kho): chỉ kết nối 1 lần
  function init() {
    if (!st.initP) st.initP = doInit().then(() => { st.ready = true; }, e => { st.initP = null; throw e; });
    return st.initP;
  }
  async function doInit() {
    if (VIEW) {
      const el = document.getElementById('antam-snapshot');
      loadSnapshot(JSON.parse(el ? el.textContent : '{}'));
      st.user = window.claude && window.claude.use ? await window.claude.use('user') : null;
      return;
    }
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
    if (VIEW) { st.wh = wh; st.loaded = true; return; }
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
  // phiếu điều chỉnh chờ duyệt / bị từ chối chưa tính vào tồn kho
  const posted = wh => vouchers(wh).filter(v => !v.status);
  function stockMap(wh, { until, before, exclude } = {}) {
    const res = {};
    products(wh).forEach(p => { res[p.code] = p.opening_qty || 0; });
    for (const v of posted(wh)) {
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
    for (const v of posted(wh)) {
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
    for (const v of posted(wh)) {
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
      ...Object.fromEntries(APPROVAL_COLS.map(k => [k, v[k] || ''])),
      lines: v.lines.map(l => ({ c: l.product_code, q: l.qty, p: l.price || 0, n: l.note || '' })) };
  }
  function applyLocalVoucher(wh, date, id, stored) {
    st.days[wh] = st.days[wh] || {};
    const doc = st.days[wh][date] = Object.assign({ date, v: {} }, st.days[wh][date] || {});
    doc.v = Object.assign({}, doc.v, { [id]: stored });
    bump(wh);
  }
  // Duyệt phiếu điều chỉnh (giống server.py): me = [id, tài khoản] đang đăng nhập; null khi chưa dùng tài khoản nhân viên
  const APPROVAL_COLS = ['status', 'created_by', 'approved_by', 'approved_at', 'review_note', 'created_by_id'];
  const lockedFor = (v, me) => v.type === 'D' && !v.status && me && !me[1].admin;
  function approvalOf(old, type, me) {
    const cur = Object.fromEntries(APPROVAL_COLS.map(k => [k, (old && old[k]) || '']));
    if (old && lockedFor(old, me)) throw new ApiError(403, `Phiếu điều chỉnh ${old.no} đã được duyệt – chỉ Quản lý sửa / xóa được`);
    if (!old) Object.assign(cur, { created_by: st.who || '', created_by_id: me ? me[0] : '' });
    if (type !== 'D' || !me) return Object.assign(cur, { status: '', review_note: '' });
    if (me[1].admin) {
      if (!old) Object.assign(cur, { approved_by: st.who || '', approved_at: nowStr() }); // Quản lý tự lập: duyệt luôn
      return cur;
    }
    return Object.assign(cur, { status: 'pending', approved_by: '', approved_at: '' }); // nhân viên lập / sửa: gửi (lại) Quản lý duyệt
  }
  async function reviewVoucher(id, ok, note, me) {
    if (!me || !me[1].admin) throw new ApiError(403, 'Chỉ tài khoản Quản lý mới duyệt phiếu điều chỉnh');
    const v = voucherFull(id);
    if (v.type !== 'D') throw new ApiError(400, 'Chỉ phiếu điều chỉnh cần duyệt');
    if (ok && !v.status) throw new ApiError(400, `Phiếu ${v.no} đã được duyệt`);
    note = text(note).slice(0, 300);
    if (!ok && !note) throw new ApiError(400, 'Hãy ghi lý do từ chối để người lập phiếu sửa lại');
    const stored = storeVoucher(Object.assign({}, v, { status: ok ? '' : 'rejected', approved_by: st.who || '', approved_at: nowStr(), review_note: note }));
    stored.updated_at = v.updated_at || stored.updated_at;
    await mergeInto(ref.day(v.wh, v.date), { v: { [id]: stored } }, { date: v.date });
    applyLocalVoucher(v.wh, v.date, id, stored);
    await log(ok ? 'Duyệt phiếu điều chỉnh' : 'Từ chối phiếu điều chỉnh', v.no, note, v.wh);
    // báo cho người lập phiếu (phiếu lập trước khi có created_by_id: tìm theo tên)
    const to = v.created_by_id || (live(settings().staff_accounts).find(([, a]) => v.created_by && a.name === v.created_by) || [''])[0];
    if (to && to !== me[0]) {
      const msg = ok ? `✔ Phiếu điều chỉnh ${v.no} đã được ${st.who || 'Quản lý'} duyệt – đã tính vào tồn kho.`
        : `✖ Phiếu điều chỉnh ${v.no} bị ${st.who || 'Quản lý'} từ chối: ${note}. Hãy sửa lại rồi Lưu & gửi duyệt lại.`;
      try { await addNotice(to, { at: nowStr(), text: msg, link: '#/phieu/' + id, wh: v.wh, ok, read: false }); } catch (e) { console.warn('notice', e); }
    }
    return voucherFull(id);
  }
  async function addNotice(to, rec) {
    const old = docData(await ref.notice(to).get()) || {};
    const keep = live(old.n).sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(49).map(([k]) => [k, null]); // giữ 50 thông báo gần nhất
    await mergeInto(ref.notice(to), { n: Object.assign(Object.fromEntries(keep), { [newId('n')]: rec }) }, {});
  }
  async function noticesApi(method, action, body, me) {
    if (!me || !me[0]) return { unread: 0, list: [] };
    const all = live((docData(await ref.notice(me[0]).get()) || {}).n);
    if (method === 'POST' && action === 'read') {
      const ids = (body.ids || []).map(String);
      const patch = Object.fromEntries(all.filter(([k, n]) => !n.read && (!ids.length || ids.includes(k))).map(([k, n]) => [k, Object.assign({}, n, { read: true })]));
      if (Object.keys(patch).length) await mergeInto(ref.notice(me[0]), { n: patch }, {});
      return { ok: true };
    }
    const list = all.map(([id, n]) => Object.assign({ id }, n)).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 50);
    return { unread: list.filter(n => !n.read).length, list };
  }
  async function saveVoucher(wh, data, vid, me) {
    const type = text(data.type);
    if (!TYPE_PREFIX[type]) throw new ApiError(400, 'Loại phiếu không hợp lệ');
    let old = null;
    if (vid) {
      for (const w of WAREHOUSES) { if (st.days[w]) { old = voucherById(w, vid); if (old) { wh = w; break; } } }
      if (!old) throw new ApiError(404, 'Không tìm thấy phiếu');
    }
    const ap = approvalOf(old, type, me);
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
    const v = Object.assign({ no, type, date: d, lines: clean, created_at: old ? old.created_at : nowStr() }, ap);
    ['route', 'from_party', 'to_party', 'giver', 'receiver', 'reason', 'bill_count', 'doc_ref', 'note'].forEach(k => { v[k] = text(data[k]); });
    const stored = storeVoucher(v);
    if (old && old.date !== d) {
      await mergeInto(ref.day(wh, old.date), { v: { [id]: null } }, { date: old.date });
      applyLocalVoucher(wh, old.date, id, null);
    }
    await mergeInto(ref.day(wh, d), { v: { [id]: stored } }, { date: d });
    applyLocalVoucher(wh, d, id, stored);
    const summ = clean.map(l => `${l.product_code} x ${fmtq(l.qty)}`);
    await log(old ? 'Sửa phiếu' : 'Lập phiếu' + (ap.status === 'pending' ? ' (chờ duyệt)' : ''), no,
      old ? { 'trước': { 'ngày': old.date, 'dòng': old.lines.map(l => `${l.product_code} x ${fmtq(l.qty)}`) }, 'sau': summ } : summ, wh);
    return id;
  }
  async function deleteVoucher(id, me) {
    const v = voucherFull(id);
    if (lockedFor(v, me)) throw new ApiError(403, `Phiếu điều chỉnh ${v.no} đã được duyệt – chỉ Quản lý sửa / xóa được`);
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
    for (const v of posted(wh)) {
      if ((from && v.date < from) || (to && v.date > to)) continue;
      const d = `${v.date.slice(8, 10)}/${v.date.slice(5, 7)}/${v.date.slice(0, 4)}`;
      for (const l of v.lines) {
        const p = pm[l.product_code] || {};
        out.push([v.no, d, TYPE_LABEL[v.type], v.from_party, v.to_party, l.product_code, p.name || '', l.note, p.unit || '', fmtq(l.qty), fmtq(l.price), fmtq(l.qty * l.price), v.reason, v.giver, v.receiver]);
      }
    }
    return '﻿' + out.map(r => r.map(csvCell).join(',')).join('\r\n');
  }
  // Toàn bộ dữ liệu 2 kho (đọc mới từ kho dữ liệu): dùng để sao lưu và để cập nhật trang xem công khai
  async function exportBackup() {
    const out = { format: 'kho-antam-backup', version: 1, at: nowStr(), settings: st.settings, routes: st.routes, warehouses: {}, deliveries: {} };
    const asMap = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    if (!VIEW) {
      out.deliveries = asMap(await ref.giaoAll().orderBy('date', 'desc').limit(400).get());
      out.locations = { v: await locationsAll() };
    }
    for (const w of WAREHOUSES) {
      if (VIEW) { out.warehouses[w] = { products: st.products[w], days: st.days[w], docs: st.docs[w], plans: st.plans[w] }; continue; }
      const [p, days, docs, plans] = await Promise.all([ref.products(w).get(), ref.days(w).orderBy('date', 'desc').limit(1000).get(),
        ref.docs(w).orderBy('date', 'desc').limit(500).get(), ref.plans(w).orderBy('ym', 'desc').limit(240).get()]);
      out.warehouses[w] = { products: (docData(p) || {}).p || {}, days: asMap(days), docs: asMap(docs), plans: asMap(plans) };
    }
    return JSON.stringify(out);
  }

  /* ---------------------------------------------------------- web giao hàng (mỗi người giao 1 nick + mã PIN) */
  // Giống server.py: pin = sha256("salt:PIN"), người giao của tuyến = chọn ở phân tuyến ngày đó, không thì người có tuyến thường chạy
  async function pinHash(salt, pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
  const normNick = v => text(v).replace(/\s+/g, '').toLowerCase();
  const drivers = () => Object.fromEntries(live(settings().drivers));
  const publicDriver = (id, d) => ({ id, nick: d.nick || '', name: d.name || '', phone: d.phone || '', routes: d.routes || [],
    active: d.active !== false, has_pin: !!d.pin });
  // mã dòng khách (ghi kết quả giao): mã CRM / mã khách / tên; khách có nhiều dòng trong ngày thì thêm #2, #3… (key gán ở mergeRouting)
  const custKey = r => text(r.key) || text(r.crm) || text(r.code) || text(r.cust);
  // Một ngày có thể có nhiều bảng phân tuyến (tuyến lẻ, khách tuyến 1-2-3…): gộp lại, cột sản phẩm trùng tên thì cộng chung
  function mergeRouting(list) {
    const cols = [], idx = {}, rows = [], assign = {}, seen = {};
    for (const data of list) {
      const map = (data.cols || []).map(c => { const k = String(c).toLowerCase().replace(/\s+/g, ''); if (!(k in idx)) { idx[k] = cols.length; cols.push(c); } return idx[k]; });
      Object.assign(assign, data.assign || {});
      for (const r of data.rows || []) {
        const qty = {};
        Object.entries(r.qty || {}).forEach(([k, n]) => { const j = map[+k]; if (j !== undefined) qty[j] = (qty[j] || 0) + Number(n || 0); });
        const base = text(r.crm) || text(r.code) || text(r.cust);
        seen[base] = (seen[base] || 0) + 1;
        rows.push(Object.assign({}, r, { qty, key: seen[base] > 1 ? `${base}#${seen[base]}` : base }));
      }
    }
    return { cols, rows, assign };
  }
  function routingDoc(d) {
    const list = Object.values(st.docs.TP || {}).filter(doc => doc && doc.kind === 'routing' && doc.date === d)
      .sort((a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1 : 0));
    return list.length ? mergeRouting(list.map(x => x.data || {})) : null;
  }
  function routeDriver(data, code, drv) {
    const a = (data && data.assign) || {};
    if (code in a) return a[code] || '';
    const hit = Object.entries(drv).find(([, d]) => d.active !== false && (d.routes || []).some(c => text(c).toLowerCase() === code.toLowerCase()));
    return hit ? hit[0] : '';
  }
  function myRoutes(id, d, drv) {
    const data = routingDoc(d);
    if (!data) return { data: null, routes: [] };
    const names = {}, order = [];
    live(st.routes).map(([, r]) => r).sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach(r => {
      const c = text(r.code).replace(/\s+/g, '').toLowerCase();
      if (c && !(c in names)) { names[c] = r.name || ''; order.push(c); }
    });
    const groups = new Map();
    for (const row of data.rows || []) {
      const code = text(row.route);
      if (code && routeDriver(data, code, drv) === id) { if (!groups.has(code)) groups.set(code, []); groups.get(code).push(row); }
    }
    const pos = c => { const i = order.indexOf(c.toLowerCase()); return i < 0 ? 999 : i; };
    const routes = Array.from(groups, ([code, rows]) => ({ code, name: names[code.toLowerCase()] || '', rows }))
      .sort((a, b) => pos(a.code) - pos(b.code) || a.code.localeCompare(b.code));
    return { data, routes };
  }
  async function deliveriesOf(d) {
    if (VIEW) return {};
    try { return Object.fromEntries(live((docData(await ref.giao(d).get()) || {}).d)); } catch (e) { throw dbError(e); }
  }
  function cleanGps(v) {
    if (!v || typeof v !== 'object') return null;
    const lat = Number(v.lat), lng = Number(v.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    const acc = typeof v.acc === 'number' && isFinite(v.acc) ? Math.round(v.acc * 10) / 10 : null;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc };
  }
  const MAPS_URL = /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^\s"'<>]*$/i;
  async function locationsAll() {
    if (VIEW) return {};
    try { return Object.fromEntries(live((docData(await ref.vitri().get()) || {}).v)); } catch (e) { throw dbError(e); }
  }
  // Ảnh giao hàng: ưu tiên kho ảnh của trang (assets), không được thì lưu ảnh (đã thu nhỏ) vào dữ liệu chung
  async function savePhoto(d, key, dataUrl) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(text(dataUrl));
    if (!m) throw new ApiError(400, 'Ảnh không hợp lệ (cần ảnh JPEG)');
    let assets = null;
    try { assets = await window.claude.use('assets'); } catch (e) { assets = null; }
    if (assets) {
      try {
        const bin = atob(m[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const res = await assets.upload(new Blob([bytes], { type: 'image/jpeg' }), { type: 'image/jpeg' });
        return 'a:' + res.id;
      } catch (e) {
        if (e && e.code === 'rate_limited') throw new ApiError(429, 'Gửi ảnh quá nhanh, hãy thử lại sau vài giây.');
        if (e && e.code === 'quota_or_state') throw new ApiError(507, 'Kho ảnh của trang đã đầy – báo kho xóa bớt ảnh cũ.');
        console.warn('assets.upload', e);
      }
    }
    if (dataUrl.length > 900000) throw new ApiError(413, 'Ảnh quá lớn để lưu');
    const id = newId('a');
    await write(() => ref.anh(id).set({ date: d, key, data: dataUrl, at: nowStr() }));
    return 'd:' + id;
  }
  const photoCache = {};
  async function photoUrl(ref_) {
    const r = text(ref_);
    if (r.startsWith('a:')) return '/_blob/' + r.slice(2);
    if (!r.startsWith('d:') || VIEW) return '';
    if (!photoCache[r]) photoCache[r] = ref.anh(r.slice(2)).get().then(s => ((docData(s) || {}).data || ''), () => '');
    return photoCache[r];
  }
  const PHOTO_REF = /^[ad]:[A-Za-z0-9_-]{4,64}$/;
  // dữ liệu phân tuyến kho TP (điện thoại người giao chỉ tải phần này)
  async function ensureGiaoData() {
    if (VIEW || st.giaoLive || (st.wh === 'TP' && st.loaded)) return;
    st.giaoLive = true;
    await subscribe(st.globalSubs, ref.docs('TP').orderBy('date', 'desc').limit(500), s => {
      const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); st.docs.TP = m;
    }, 'giao-docs');
    st.loaded = true;
  }
  function ghAuth(token) {
    const [id, sig] = text(token).split('.');
    const d = drivers()[id];
    if (!d || d.active === false || !sig || sig !== String(d.pin || '').slice(0, 24)) throw new ApiError(401, 'Phiên đăng nhập đã hết hạn hoặc tài khoản bị khóa – hãy đăng nhập lại');
    return [id, d];
  }
  async function ghApi(method, action, q, body, token) {
    if (action === 'login' && method === 'POST') {
      const nick = normNick(body.nick), pin = text(body.pin);
      const hit = Object.entries(drivers()).find(([, d]) => normNick(d.nick) === nick && d.active !== false && d.pin);
      if (!hit || (await pinHash(hit[1].salt || '', pin)) !== hit[1].pin) { await sleep(500); throw new ApiError(401, 'Sai nick hoặc mã PIN'); }
      return { token: `${hit[0]}.${hit[1].pin.slice(0, 24)}`, driver: publicDriver(hit[0], hit[1]) };
    }
    const [id, me] = ghAuth(token);
    await ensureGiaoData();
    const drv = drivers();
    if (action === 'day' && method === 'GET') {
      const d = validDate(q.date || today());
      const { data, routes } = myRoutes(id, d, drv);
      const [done, locs] = routes.length ? await Promise.all([deliveriesOf(d), locationsAll()]) : [{}, {}];
      const keys = new Set(routes.flatMap(g => g.rows.map(custKey)));
      const mine = m => Object.fromEntries(Object.entries(m).filter(([k]) => keys.has(k)));
      return { date: d, driver: publicDriver(id, me), planned: !!data, cols: (data && data.cols) || [], routes,
        deliveries: mine(done), locations: mine(locs) };
    }
    if (action === 'days' && method === 'GET') {
      const dates = Array.from(new Set(Object.values(st.docs.TP || {}).filter(x => x && x.kind === 'routing').map(x => x.date))).sort().reverse().slice(0, 45);
      const mine = dates.map(d => [d, myRoutes(id, d, drv).routes]).filter(([, r]) => r.length);
      let done = {};
      if (mine.length && !VIEW) {
        try { (await ref.giaoAll().orderBy('date', 'desc').limit(60).get()).docs.forEach(x => { done[x.id] = Object.fromEntries(live((x.data() || {}).d)); }); }
        catch (e) { done = {}; }
      }
      return mine.map(([d, routes]) => {
        const keys = routes.flatMap(g => g.rows.map(custKey));
        return { date: d, routes: routes.map(g => g.code), count: keys.length, done: keys.filter(k => ((done[d] || {})[k] || {}).status === 'ok').length };
      });
    }
    const myRow = (d, key) => {
      for (const g of myRoutes(id, d, drv).routes) { const r = g.rows.find(x => custKey(x) === key); if (key && r) return [g, r]; }
      throw new ApiError(403, `Khách này không thuộc tuyến của bạn ngày ${d}`);
    };
    const asDriver = async (action_, target, detail) => { const who = st.who; st.who = '🚚 ' + (me.name || me.nick); await log(action_, target, detail, 'TP'); st.who = who; };
    if (action === 'photo' && method === 'POST') {
      const d = validDate(body.date), key = text(body.key);
      myRow(d, key);
      return { ref: await savePhoto(d, key, body.data) };
    }
    if (action === 'location' && method === 'POST') {
      const d = validDate(body.date), key = text(body.key);
      const [, row] = myRow(d, key);
      if (body.clear) {
        await mergeInto(ref.vitri(), { v: { [key]: null } }, { v: {} });
        await asDriver('Xóa vị trí khách', key, '');
        return { ok: true };
      }
      // tọa độ, hoặc link chia sẻ Google Maps (maps.app.goo.gl…) khi không có tọa độ
      const url = text(body.url);
      const g = cleanGps(body) || (MAPS_URL.test(url) && url.length < 500 ? { lat: null, lng: null, acc: null, url } : null);
      if (!g) throw new ApiError(400, 'Vị trí không hợp lệ – dán link Google Maps hoặc tọa độ');
      const rec = Object.assign(g, { name: text(row.name) || text(row.cust), driver: id, at: nowStr() });
      await mergeInto(ref.vitri(), { v: { [key]: rec } }, { v: {} });
      await asDriver('Lưu vị trí khách', key, g.url || `${g.lat},${g.lng}`);
      return { ok: true, location: rec };
    }
    if (action === 'deliver' && method === 'POST') {
      const d = validDate(body.date), key = text(body.key), status = text(body.status), note = text(body.note).slice(0, 300);
      const [g, row] = myRow(d, key);
      if (!['ok', 'fail', ''].includes(status)) throw new ApiError(400, 'Trạng thái không hợp lệ');
      const rec = status ? { status, note, at: nowStr(), driver: id, route: g.code, name: text(row.name) || text(row.cust),
        photos: (body.photos || []).map(text).filter(x => PHOTO_REF.test(x)).slice(0, 6), gps: cleanGps(body.gps) } : null;
      await mergeInto(ref.giao(d), { d: { [key]: rec } }, { date: d });
      const who = st.who; st.who = '🚚 ' + (me.name || me.nick);
      await log({ ok: 'Đã giao', fail: 'Không giao được', '': 'Bỏ đánh dấu giao' }[status], `${key} ${d}`, note, 'TP');
      st.who = who;
      return { ok: true };
    }
    throw new ApiError(404, 'Không có chức năng này');
  }
  // Chuyển dữ liệu Phân tuyến (web kho) sang trang Giao hàng An Tâm: 2 trang claude.ai không đọc dữ liệu của nhau được,
  // nên web kho đóng gói (GET) để người dùng dán vào trang giao hàng (POST).
  const SYNC_FORMAT = 'antam-giao-sync';
  // Tự chuyển phân tuyến: web kho để gói dữ liệu ở "giaoout" (dữ liệu của trang kho); tác vụ định kỳ chép sang "giaoin"
  // của trang Giao hàng An Tâm; trang giao hàng tự nhận khi có người mở (ghi đã nhận vào "giaodone/index").
  const srcOf = v => text(v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
  async function giaoOutbox(q) {
    const pkg = await giaoSync('GET', q, {});
    const src = srcOf(pkg.src);
    const stamp = nowStr() + ' ' + randHex(3);
    await write(() => dbx().doc('giaoout/' + src).set({ stamp, date: pkg.date, pkg }));
    const idx = docData(await dbx().doc('giaoout/index').get()) || { s: {} };
    const s_ = Object.assign({}, idx.s || {});
    const old = addDays(today(), -7);
    for (const [k, e] of Object.entries(s_)) if (e && e.date < old) { s_[k] = null; await write(() => dbx().doc('giaoout/' + k).delete()).catch(() => {}); }
    s_[src] = { stamp, date: pkg.date, rows: (pkg.doc.data.rows || []).length, at: nowStr() };
    await mergeInto(dbx().doc('giaoout/index'), { s: s_ }, { s: {} });
    return { ok: true, stamp, src };
  }
  async function giaoInbox() {
    await ensureGiaoData();
    const snap = await dbx().collection('giaoin').limit(100).get();
    const done = (docData(await dbx().doc('giaodone/index').get()) || {}).s || {};
    const got = [];
    for (const d of snap.docs) {
      const x = d.data() || {};
      if (!x.pkg || !x.stamp || done[d.id] === x.stamp) continue;
      try {
        const r = await giaoSync('POST', {}, x.pkg);
        await mergeInto(dbx().doc('giaodone/index'), { s: { [d.id]: x.stamp } }, { s: {} });
        got.push(r);
      } catch (e) { console.warn('giaoin', d.id, e); }
    }
    return { got };
  }
  async function giaoSync(method, q, body, arg) {
    if (arg === 'out' && method === 'POST') return giaoOutbox(q);
    if (arg === 'inbox' && method === 'POST') return giaoInbox();
    if (method === 'GET') {
      const doc = (st.docs.TP || {})[q.id];
      if (!doc || doc.kind !== 'routing') throw new ApiError(404, 'Không tìm thấy bảng phân tuyến (hãy Lưu trước).');
      const routes = live(st.routes).map(([, r]) => r).sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map(r => ({ code: text(r.code), name: text(r.name) })).filter(r => r.code);
      return { format: SYNC_FORMAT, version: 1, at: nowStr(), date: doc.date, src: text(q.id),
        doc: { date: doc.date, title: doc.title || '', data: { cols: doc.data.cols || [], rows: doc.data.rows || [], assign: doc.data.assign || {} } },
        routes, drivers: drivers() };
    }
    if (method === 'POST') {
      if (body.format !== SYNC_FORMAT || !body.doc || !Array.isArray((body.doc.data || {}).rows)) throw new ApiError(400, 'Dữ liệu không đúng. Hãy bấm "📤 Gửi sang Giao hàng An Tâm" ở web kho rồi dán lại.');
      const d = validDate(body.doc.date);
      // tài khoản người giao: thay bằng danh sách của web kho (tài khoản đã xóa bên kho thì xóa ở đây)
      const patch = {};
      Object.keys(drivers()).forEach(k => { patch[k] = null; });
      for (const [k, v] of Object.entries(body.drivers || {})) if (v && typeof v === 'object' && v.nick && v.pin) {
        patch[k] = { nick: text(v.nick), name: text(v.name), phone: text(v.phone), routes: (v.routes || []).map(text), active: v.active !== false, salt: text(v.salt), pin: text(v.pin) };
      }
      await mergeInto(ref.settings(), { s: { drivers: patch } }, { s: {} });
      st.settings = deepMerge(clone(st.settings || {}), { drivers: patch });
      const routes = Object.fromEntries((body.routes || []).map((r, i) => ['r' + i, { name: text(r.name), code: text(r.code), note: '', sort: i + 1 }]));
      await write(() => ref.routes().set({ r: routes }));
      st.routes = routes;
      // mỗi bảng phân tuyến của web kho (tuyến lẻ, tuyến 1-2-3…) là 1 bảng ở đây; gửi lại cùng bảng thì thay bản cũ
      const src = srcOf(body.src);
      const id = `rt-${d}-${src}`;
      const old = (st.docs.TP || {})[id];
      const rec = { kind: 'routing', date: d, src, title: text(body.doc.title), data: body.doc.data, created_at: old ? old.created_at : nowStr(), updated_at: nowStr() };
      if (JSON.stringify(rec).length > 240000) throw new ApiError(413, 'Bảng phân tuyến quá lớn để lưu');
      await write(() => ref.doc('TP', id).set(rec));
      // bảng cũ của chính bảng này (nhận trước khi có mã nguồn) thì bỏ
      const stale = ([k, x]) => k !== id && x && x.kind === 'routing' && x.date === d && (!x.src || x.src === src);
      for (const e of Object.entries(st.docs.TP || {})) if (stale(e)) await write(() => ref.doc('TP', e[0]).delete());
      st.docs.TP = Object.fromEntries(Object.entries(Object.assign({}, st.docs.TP, { [id]: rec })).filter(e => !stale(e)));
      const n = body.doc.data.rows.length;
      await log('Nhận phân tuyến từ web kho', d, `${n} khách`, 'TP');
      return { date: d, rows: n, routes: new Set(body.doc.data.rows.map(r => r.route).filter(Boolean)).size, drivers: Object.values(patch).filter(Boolean).length };
    }
    throw new ApiError(404, 'Không có chức năng này');
  }
  // Tài khoản nhân viên web kho (giống staff_api của server.py). Bản online kiểm tra ở trình duyệt: để biết ai làm gì,
  // không thay được phân quyền của claude.ai.
  const tokenOf = (id, a) => `${id}.${String(a.pw || '').slice(0, 24)}`;
  function staffMe(token, accounts = Object.fromEntries(live(settings().staff_accounts))) {
    const [id] = text(token).split('.'); const a = accounts[id];
    return a && a.active !== false && a.pw && text(token) === tokenOf(id, a) ? [id, a] : null;
  }
  async function staffApi(method, action, body, token) {
    const accounts = Object.fromEntries(live(settings().staff_accounts));
    const me = staffMe(token, accounts);
    const pub = (id, a) => ({ id, user: a.user || '', name: a.name || '', admin: !!a.admin, active: a.active !== false });
    const put = async (id, rec) => {
      await mergeInto(ref.settings(), { s: { staff_accounts: { [id]: rec } } }, { s: {} });
      st.settings = deepMerge(clone(st.settings || {}), { staff_accounts: { [id]: rec } });
    };
    if (action === 'status' && method === 'GET') return { count: Object.keys(accounts).length, me: me ? pub(...me) : null };
    if (action === 'login' && method === 'POST') {
      const user = normNick(body.user);
      const hit = Object.entries(accounts).find(([, a]) => normNick(a.user) === user && a.active !== false);
      if (!hit || (await pinHash(hit[1].salt || '', text(body.password))) !== hit[1].pw) { await sleep(500); throw new ApiError(401, 'Sai tên đăng nhập hoặc mật khẩu'); }
      st.who = hit[1].name; await log('Đăng nhập', user, '');
      return { token: tokenOf(...hit), account: pub(...hit) };
    }
    if (method === 'GET' && !action) {
      if (Object.keys(accounts).length && !me) throw new ApiError(401, 'Hãy đăng nhập');
      return Object.entries(accounts).map(([k, a]) => pub(k, a));
    }
    if (action === 'password' && method === 'POST') {
      if (!me) throw new ApiError(401, 'Hãy đăng nhập');
      const [id, a] = me;
      if ((await pinHash(a.salt || '', text(body.old))) !== a.pw) throw new ApiError(400, 'Mật khẩu cũ không đúng');
      const pw = text(body.password);
      if (pw.length < 4 || pw.length > 40) throw new ApiError(400, 'Mật khẩu 4–40 ký tự');
      const rec = Object.assign({}, a, { salt: randHex(8) });
      rec.pw = await pinHash(rec.salt, pw);
      await put(id, rec);
      await log('Đổi mật khẩu', a.user, '');
      return { token: tokenOf(id, rec) };
    }
    // tạo / sửa / xóa: tài khoản Quản lý; lần đầu (chưa có tài khoản nào) ai cũng tạo được tài khoản Quản lý đầu tiên
    const n = Object.keys(accounts).length;
    if (n && !(me && me[1].admin)) throw new ApiError(403, 'Chỉ tài khoản Quản lý mới tạo / sửa / xóa tài khoản');
    if (method === 'POST') {
      const id = text(body.id) || newId('s');
      const user = normNick(body.user);
      if (!/^[a-z0-9._-]{2,30}$/.test(user)) throw new ApiError(400, 'Tên đăng nhập 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch');
      if (Object.entries(accounts).some(([k, a]) => normNick(a.user) === user && k !== id)) throw new ApiError(409, `Tên đăng nhập ${user} đã có người dùng`);
      const old = accounts[id] || {};
      const rec = { user, name: text(body.name) || user, admin: !!body.admin || !n, active: body.active !== false, salt: old.salt || '', pw: old.pw || '' };
      const pw = text(body.password);
      if (pw) {
        if (pw.length < 4 || pw.length > 40) throw new ApiError(400, 'Mật khẩu 4–40 ký tự');
        rec.salt = randHex(8); rec.pw = await pinHash(rec.salt, pw);
      }
      if (!rec.pw) throw new ApiError(400, 'Cần đặt mật khẩu cho tài khoản mới');
      if (me && id === me[0] && (!rec.admin || !rec.active)) throw new ApiError(400, 'Không tự bỏ quyền Quản lý hoặc tự khóa tài khoản đang đăng nhập');
      await put(id, rec);
      if (!n) st.who = rec.name; // tài khoản đầu tiên: người tạo chính là người này
      await log('Lưu tài khoản nhân viên', user, pw && old.pw ? 'đổi mật khẩu' : '');
      const out = { account: pub(id, rec) };
      if (!n) out.token = tokenOf(id, rec); // tài khoản đầu tiên: đăng nhập luôn
      return out;
    }
    if (method === 'DELETE' && action) {
      if (me && action === me[0]) throw new ApiError(400, 'Không tự xóa tài khoản đang đăng nhập');
      const a = accounts[action];
      await mergeInto(ref.settings(), { s: { staff_accounts: { [action]: null } } }, { s: {} });
      st.settings = deepMerge(clone(st.settings || {}), { staff_accounts: { [action]: null } });
      await log('Xóa tài khoản nhân viên', (a && a.user) || action, '');
      return { ok: true };
    }
    throw new ApiError(404, 'Không có chức năng này');
  }
  // Mật khẩu quản lý của web Giao hàng An Tâm: người giao (cũng là Editor của trang) không vào được phần quản lý.
  // Kiểm tra ở trình duyệt – là khóa giao diện, không thay được phân quyền của claude.ai.
  async function adminApi(method, action, body) {
    const a = settings().admin || {};
    const tok = () => (a.pin ? 'adm.' + a.pin.slice(0, 24) : '');
    const isOwner = async () => { try { return !!(st.user && await st.user.isOwner()); } catch (e) { return false; } };
    if (method === 'GET') return { set: !!a.pin, owner: await isOwner() };
    if (action === 'check') return { ok: !!a.pin && text(body.token) === tok() };
    if (action === 'login') {
      if (!a.pin) throw new ApiError(400, 'Chưa đặt mật khẩu quản lý – chủ trang mở trang này để đặt.');
      if ((await pinHash(a.salt || '', text(body.pin))) !== a.pin) { await sleep(500); throw new ApiError(401, 'Sai mật khẩu quản lý'); }
      return { token: tok() };
    }
    if (action === 'set') {
      if (!(a.pin ? text(body.token) === tok() : await isOwner())) throw new ApiError(403, 'Chỉ chủ trang (lần đầu) hoặc người đang quản lý mới đặt được mật khẩu quản lý.');
      const pin = text(body.pin);
      if (pin.length < 4 || pin.length > 40) throw new ApiError(400, 'Mật khẩu quản lý 4–40 ký tự');
      const rec = { salt: randHex(8) };
      rec.pin = await pinHash(rec.salt, pin);
      await mergeInto(ref.settings(), { s: { admin: rec } }, { s: {} });
      st.settings = deepMerge(clone(st.settings || {}), { admin: rec });
      await log('Đặt mật khẩu quản lý web giao hàng', '', '');
      return { token: 'adm.' + rec.pin.slice(0, 24) };
    }
    throw new ApiError(404, 'Không có chức năng này');
  }
  async function saveDriver(data) {
    const all = drivers();
    const id = text(data.id) || newId('g');
    const nick = normNick(data.nick);
    if (!/^[a-z0-9._-]{2,30}$/.test(nick)) throw new ApiError(400, 'Tên đăng nhập (nick) 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch');
    if (Object.entries(all).some(([k, d]) => normNick(d.nick) === nick && k !== id)) throw new ApiError(409, `Nick ${nick} đã có người dùng`);
    const old = all[id] || {};
    const rec = { nick, name: text(data.name) || nick, phone: text(data.phone), routes: (data.routes || []).map(c => text(c).replace(/\s+/g, '')).filter(Boolean),
      active: data.active !== false, salt: old.salt || '', pin: old.pin || '' };
    const pin = text(data.pin);
    if (pin) {
      if (!/^\d{4,8}$/.test(pin)) throw new ApiError(400, 'Mã PIN gồm 4–8 chữ số');
      rec.salt = randHex(8); rec.pin = await pinHash(rec.salt, pin);
    }
    if (!rec.pin) throw new ApiError(400, 'Cần đặt mã PIN cho tài khoản mới');
    await mergeInto(ref.settings(), { s: { drivers: { [id]: rec } } }, { s: {} });
    st.settings = deepMerge(clone(st.settings || {}), { drivers: { [id]: rec } });
    await log('Lưu tài khoản giao hàng', nick, pin && old.pin ? 'đổi PIN' : '', 'TP');
    return publicDriver(id, rec);
  }

  /* ---------------------------------------------------------- bộ định tuyến API (giống server.py) */
  async function handle(method, fullPath, body, opts = {}) {
    const [pathPart, qs] = fullPath.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const parts = pathPart.replace(/^\/+|\/+$/g, '').split('/');
    const res = parts[0], arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    const wh = q.wh || st.wh;
    if (!WAREHOUSES.includes(wh)) throw new ApiError(400, 'Kho không hợp lệ: ' + wh);
    if (res === 'gh') return ghApi(method, arg, q, body || {}, opts.token || '');
    if (res === 'admin') return adminApi(method, arg, body || {});
    if (res === 'staff') return staffApi(method, arg, body || {}, opts.token || '');
    // đã có tài khoản nhân viên: người chưa đăng nhập được coi như nhân viên thường (phiếu điều chỉnh phải chờ duyệt)
    const hasStaff = live(settings().staff_accounts).length > 0;
    const me = hasStaff ? (staffMe(opts.token || '') || ['', {}]) : null;
    if (res === 'giao-sync') return giaoSync(method, q, body || {}, arg);
    if (res === 'drivers') {
      if (method === 'GET') return Object.entries(drivers()).map(([k, d]) => publicDriver(k, d));
      if (method === 'POST') return saveDriver(body || {});
      if (method === 'DELETE' && arg) {
        const d = drivers()[arg];
        await mergeInto(ref.settings(), { s: { drivers: { [arg]: null } } }, { s: {} });
        st.settings = deepMerge(clone(st.settings || {}), { drivers: { [arg]: null } });
        await log('Xóa tài khoản giao hàng', (d && d.nick) || arg, '', 'TP');
        return { ok: true };
      }
    }
    if (res === 'deliveries' && method === 'GET') return deliveriesOf(validDate(q.date));
    if (res === 'locations' && method === 'GET') return locationsAll();
    if (!st.days[wh] && !VIEW && res !== 'meta' && res !== 'settings' && res !== 'routes') throw new ApiError(400, 'Chưa tải dữ liệu kho ' + wh);

    if (res === 'meta' && method === 'GET') {
      const s = settings();
      const people = new Set(s.staff || []), parties = new Set(s.warehouses[wh].parties || []);
      for (const v of vouchers(wh)) {
        [v.giver, v.receiver].forEach(x => { if (x && x.trim()) people.add(x.trim()); });
        [v.from_party, v.to_party].forEach(x => { if (x && x.trim()) parties.add(x.trim()); });
      }
      planRows(wh).forEach(r => { if (r.proposer) people.add(r.proposer.trim()); });
      const sortVi = a => [...a].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), 'vi'));
      const drv = drivers();
      delete s.drivers; delete s.admin; delete s.staff_accounts;
      return {
        wh, settings: s, warehouse: s.warehouses[wh], products: products(wh),
        drivers: Object.entries(drv).map(([k, d]) => publicDriver(k, d)),
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
        } else if (k in DEFAULT_SETTINGS && !['drivers', 'admin', 'staff_accounts'].includes(k)) next[k] = v; // tài khoản giao hàng / mật khẩu quản lý sửa ở API riêng
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
        const st_ = ['pending', 'rejected'].includes(q.status) ? q.status : ''; // việc cần duyệt: mọi ngày
        const list = vouchers(wh).filter(v => (st_ ? v.status === st_ : (!q.from || v.date >= q.from) && (!q.to || v.date <= q.to)) && (!TYPE_PREFIX[q.type] || v.type === q.type) &&
          (!qq || like(qq, v.no, v.reason, v.route, v.giver, v.receiver, v.to_party) || v.lines.some(l => like(qq, l.product_code, (pm[l.product_code] || {}).name, l.note))));
        list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.type < b.type ? -1 : a.type > b.type ? 1 : a.no < b.no ? 1 : a.no > b.no ? -1 : 0));
        return list.slice(0, parseInt(q.limit || '1000', 10)).map(voucherSummaryRow);
      }
      if (method === 'POST') return voucherFull(await saveVoucher(wh, body || {}, null, me));
      if (method === 'PUT' && arg) return voucherFull(await saveVoucher(wh, body || {}, arg, me));
      if (method === 'DELETE' && arg) { await deleteVoucher(arg, me); return { ok: true }; }
    }
    if (res === 'notices') return noticesApi(method, arg, body || {}, me);
    if (res === 'review' && method === 'POST' && arg) return reviewVoucher(arg, !!(body || {}).ok, (body || {}).note, me);
    if (res === 'pending' && method === 'GET') {
      const n = s_ => vouchers(wh).filter(v => v.status === s_).length;
      return { count: n('pending'), rejected: n('rejected') };
    }

    if (res === 'lines' && method === 'GET') {
      const pm = productMap(wh);
      const out = [];
      const list = posted(wh).filter(v => (!q.from || v.date >= q.from) && (!q.to || v.date <= q.to) && (!TYPE_PREFIX[q.type] || v.type === q.type));
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
        if (!['stocktake', 'handover', 'kebab', 'routeorders', 'routing'].includes(text(d.kind))) throw new ApiError(400, 'Loại biên bản không hợp lệ');
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
      if (VIEW) return [];
      const snap = await ref.logs().orderBy('date', 'desc').limit(31).get();
      const out = [];
      snap.docs.forEach(d => live((d.data() || {}).e).forEach(([id, e]) => out.push(Object.assign({ id }, e))));
      return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 500);
    }

    if (res === 'import-backup' && method === 'POST') {
      const snap = body || {};
      if (snap.format !== 'kho-antam-backup' || !snap.warehouses) throw new ApiError(400, "File không đúng: hãy dùng file 'Tải dữ liệu' (.json) của web Kho An Tâm");
      const summary = {};
      if (snap.settings && Object.keys(snap.settings).length) { await write(() => ref.settings().set({ s: snap.settings })); st.settings = snap.settings; }
      await write(() => ref.routes().set({ r: snap.routes || {} })); st.routes = snap.routes || {};
      if (snap.deliveries) {
        const oldG = (await ref.giaoAll().limit(1000).get()).docs.map(x => x.id);
        for (const id of oldG) if (!snap.deliveries[id]) await write(() => ref.giao(id).delete());
        for (const [id, doc] of Object.entries(snap.deliveries)) if (doc) await write(() => ref.giao(id).set(doc));
      }
      if (snap.locations) await write(() => ref.vitri().set({ v: snap.locations.v || {} }));
      for (const w of WAREHOUSES) {
        const d = snap.warehouses[w];
        if (!d) continue;
        // đọc mới danh sách tài liệu hiện có để xóa cả những ngày/tháng chưa tải vào bộ nhớ
        const asIds = s => s.docs.map(x => x.id);
        const [oldDays, oldDocs, oldPlans] = await Promise.all([ref.days(w).limit(1000).get(), ref.docs(w).limit(1000).get(), ref.plans(w).limit(1000).get()]).then(r => r.map(asIds));
        await write(() => ref.products(w).set({ p: d.products || {} }));
        for (const id of oldDays) if (!(d.days || {})[id]) await write(() => ref.day(w, id).delete());
        for (const [id, doc] of Object.entries(d.days || {})) await write(() => ref.day(w, id).set(doc));
        for (const id of oldDocs) if (!(d.docs || {})[id]) await write(() => ref.doc(w, id).delete());
        for (const [id, doc] of Object.entries(d.docs || {})) await write(() => ref.doc(w, id).set(doc));
        for (const id of oldPlans) if (!(d.plans || {})[id]) await write(() => ref.planMonth(w, id).delete());
        for (const [id, doc] of Object.entries(d.plans || {})) await write(() => ref.planMonth(w, id).set(doc));
        st.products[w] = d.products || {}; st.days[w] = clone(d.days || {}); st.docs[w] = clone(d.docs || {}); st.plans[w] = clone(d.plans || {}); bump(w);
        summary[w] = { 'Phiếu': vouchers(w).length };
      }
      await log('Nhập file dữ liệu .json', '', summary);
      return summary;
    }

    // đọc 1 sheet của file Excel (Phân tuyến: danh sách khách theo ngày)
    if (res === 'sheet-rows' && method === 'POST') {
      if (!body || !body.byteLength) throw new ApiError(400, 'Chưa chọn file');
      if (!window.XLSX) throw new ApiError(500, 'Chưa tải được thư viện đọc Excel, hãy tải lại trang.');
      const data = new Uint8Array(body);
      let names;
      try { names = window.XLSX.read(data, { type: 'array', bookSheets: true }).SheetNames; } catch (e) {
        throw new ApiError(400, 'File không phải định dạng .xlsx (hãy lưu lại file bằng Excel dạng .xlsx)');
      }
      const name = names.includes(q.sheet) ? q.sheet : names[names.length - 1];
      if (!name) return { sheets: [], sheet: null, rows: [] };
      const ws = window.XLSX.read(data, { type: 'array', sheets: name, cellDates: true }).Sheets[name];
      const rows = ws ? window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true }) : [];
      const z = n => String(n).padStart(2, '0');
      return { sheets: names, sheet: name, rows: rows.map(r => r.map(v => (v instanceof Date ? `${z(v.getDate())}/${z(v.getMonth() + 1)}/${v.getFullYear()}` : v))) };
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
      if (arg === 'backup') return await exportBackup();
    }
    throw new ApiError(404, 'Không có chức năng này');
  }

  return {
    init, setWh, handle,
    get ready() { return !!st.ready; },
    photoUrl,
    set who(v) { st.who = v; },
    get myName() { return st.myName || ''; },
    get canWrite() { return VIEW ? false : st.canWrite; },
    get isView() { return VIEW; },
    get snapshotAt() { return st.snapshotAt || ''; },
    get skeletonReset() { return SKELETON_RESET; },
    async canEditPage() { try { return !!(st.user && await st.user.canEdit()); } catch (e) { return false; } },
    checkSnapshot(text) {
      let snap;
      try { snap = JSON.parse(text); } catch (e) { throw new Error('File không đọc được (không phải file dữ liệu tải từ web chính).'); }
      if (!snap || snap.format !== 'kho-antam-backup' || !snap.warehouses || !snap.warehouses.TP || !snap.warehouses.NVL) {
        throw new Error('File không đúng: hãy dùng file "Tải dữ liệu" ở mục Cài đặt & dữ liệu của web chính.');
      }
      return snap;
    },
    onRemote(fn) { st.onRemote = fn; },
  };
})();
