'use strict';
/* Web giao hàng An Tâm – mỗi người giao hàng 1 tài khoản (nick + mã PIN, tạo ở web kho › Tài khoản giao hàng).
   Sau khi đăng nhập: chọn ngày, thấy các tuyến kho đã sắp cho mình ở mục Phân tuyến giao hàng (khách, địa chỉ,
   SĐT, số lượng từng loại bánh), đánh dấu Đã giao / Không giao được – web kho thấy ngay kết quả.
   Bản chạy máy chủ: trang /giao-hang gọi /api/gh/…; bản online: chạy trong trang Kho An Tâm, gọi Backend.handle. */
const GiaoHang = (() => {
  const ONLINE = !!window.ANTAM_ONLINE;
  const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const FAIL_REASONS = ['Khách vắng nhà', 'Khách hẹn giao lại', 'Khách không nhận', 'Sai địa chỉ / SĐT', 'Hết hàng trên xe'];
  const st = { token: '', driver: null, date: '', data: null, days: [], filter: 'all', search: '', failing: null, busy: 0, root: null, onExit: null, timer: null };

  /* ---------------------------------------------------------- tiện ích */
  const $ = (sel, root = st.root) => root.querySelector(sel);
  const $$ = (sel, root = st.root) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem('gh.' + key));
      if (val === null) localStorage.removeItem('gh.' + key); else localStorage.setItem('gh.' + key, JSON.stringify(val));
    } catch (e) { return null; }
    return undefined;
  }
  const noAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const matches = (q, hay) => { const h = noAccent(hay); return noAccent(q).split(/\s+/).filter(Boolean).every(t => h.includes(t)); };
  const fmt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
  const z = n => String(n).padStart(2, '0');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
  const vnDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const dayLabel = iso => {
    const t = isoDate();
    const rel = iso === t ? 'Hôm nay' : iso === addDays(t, 1) ? 'Ngày mai' : iso === addDays(t, -1) ? 'Hôm qua' : WEEKDAY[new Date(iso + 'T00:00:00').getDay()];
    return `${rel}, ${vnDate(iso)}`;
  };
  // Mã khách để ghi kết quả giao (giống server.py cust_key): mã CRM, không có thì mã đầu tên khách, không có nữa thì tên
  const custKey = r => String(r.crm || '').trim() || String(r.code || '').trim() || String(r.cust || '').trim();
  function toast(msg, err) {
    const box = $('#gh-toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'gh-toast' + (err ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), err ? 5000 : 2500);
  }

  async function call(method, path, body) {
    if (ONLINE) {
      try { return await Backend.handle(method, '/gh/' + path, body, { token: st.token }); } catch (e) {
        const err = new Error(e.message || String(e)); err.status = e.status; throw err;
      }
    }
    const opt = { method, headers: { 'X-GH-Token': st.token } };
    if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    let res;
    try { res = await fetch('/api/gh/' + path, opt); } catch (e) { throw new Error('Mất kết nối tới web kho – kiểm tra wifi/mạng rồi bấm ↻.'); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* trống */ }
    if (!res.ok) { const err = new Error((data && data.error) || ('Lỗi ' + res.status)); err.status = res.status; throw err; }
    return data;
  }
  async function guard(fn) {
    st.busy++;
    try { return await fn(); } catch (e) {
      if (e.status === 401 && st.token) { logout(e.message); return undefined; }
      toast(e.message, true); return undefined;
    } finally { st.busy--; }
  }

  /* ---------------------------------------------------------- đăng nhập */
  function drawLogin(msg) {
    stopTimer();
    st.root.innerHTML = `<div class="gh-login">
      <div class="gh-logo">🚚</div><h1>Giao hàng An Tâm</h1>
      <p class="gh-muted">Đăng nhập bằng nick và mã PIN do kho cấp để xem tuyến giao của bạn.</p>
      <form id="gh-login-form" autocomplete="on">
        <label>Nick<input id="gh-nick" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(store('nick') || '')}" required></label>
        <label>Mã PIN<input id="gh-pin" name="password" type="password" inputmode="numeric" autocomplete="current-password" required></label>
        <button class="gh-btn primary big" type="submit">Đăng nhập</button>
        <p class="gh-err" id="gh-login-err">${esc(msg || '')}</p>
      </form>
      ${st.onExit ? '<button class="gh-btn ghost" id="gh-exit">← Về web kho</button>' : ''}
    </div><div id="gh-toasts" class="gh-toasts"></div>`;
    const nick = $('#gh-nick'), pin = $('#gh-pin');
    (nick.value ? pin : nick).focus();
    $('#gh-login-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
      try {
        const res = await call('POST', 'login', { nick: nick.value, pin: pin.value });
        st.token = res.token; st.driver = res.driver;
        store('token', st.token); store('driver', st.driver); store('nick', res.driver.nick);
        st.date = isoDate();
        await showMain();
      } catch (err) {
        $('#gh-login-err').textContent = err.message;
        btn.disabled = false; btn.textContent = 'Đăng nhập';
      }
    };
    if (st.onExit) $('#gh-exit').onclick = () => exit();
  }
  function logout(msg) {
    st.token = ''; st.driver = null; st.data = null;
    store('token', null); store('driver', null);
    drawLogin(msg);
  }
  function exit() { stopTimer(); if (st.onExit) st.onExit(); }

  /* ---------------------------------------------------------- màn hình chính */
  async function showMain() {
    st.root.innerHTML = `<header class="gh-top">
        <div class="gh-who"><span class="gh-avatar">🚚</span><div><b id="gh-name"></b><div class="gh-sub">Giao hàng An Tâm</div></div></div>
        <div class="gh-top-actions"><button class="gh-btn sm" id="gh-reload" title="Tải lại">↻</button>
        <button class="gh-btn sm" id="gh-logout">Đăng xuất</button>${st.onExit ? '<button class="gh-btn sm ghost" id="gh-exit">Web kho</button>' : ''}</div>
      </header>
      <nav class="gh-datebar">
        <button class="gh-btn sm" id="gh-prev" aria-label="Ngày trước">◀</button>
        <label class="gh-date"><span id="gh-day-label"></span><input type="date" id="gh-date"></label>
        <button class="gh-btn sm" id="gh-next" aria-label="Ngày sau">▶</button>
        <button class="gh-btn sm" id="gh-today">Hôm nay</button>
      </nav>
      <main id="gh-main" class="gh-main"><p class="gh-muted">Đang tải…</p></main>
      <div id="gh-toasts" class="gh-toasts"></div>`;
    $('#gh-name').textContent = st.driver ? st.driver.name || st.driver.nick : '';
    $('#gh-logout').onclick = () => logout();
    if (st.onExit) $('#gh-exit').onclick = () => exit();
    $('#gh-reload').onclick = () => loadDay();
    $('#gh-prev').onclick = () => setDate(addDays(st.date, -1));
    $('#gh-next').onclick = () => setDate(addDays(st.date, 1));
    $('#gh-today').onclick = () => setDate(isoDate());
    $('#gh-date').onchange = () => { if ($('#gh-date').value) setDate($('#gh-date').value); };
    await setDate(st.date || isoDate());
    startTimer();
  }
  async function setDate(d) {
    st.date = d; st.failing = null;
    $('#gh-date').value = d;
    $('#gh-day-label').textContent = dayLabel(d);
    await loadDay();
  }
  async function loadDay(silent) {
    const d = st.date;
    if (!silent) $('#gh-main').innerHTML = '<p class="gh-muted">Đang tải tuyến…</p>';
    const [data, days] = await Promise.all([guard(() => call('GET', 'day?date=' + d)), guard(() => call('GET', 'days'))]);
    if (d !== st.date || !st.token) return;
    if (days) st.days = days;
    if (!data) { if (!silent) $('#gh-main').innerHTML = '<p class="gh-muted">Không tải được dữ liệu. Bấm ↻ để thử lại.</p>'; return; }
    st.data = data;
    if (data.driver) { st.driver = data.driver; store('driver', st.driver); $('#gh-name').textContent = st.driver.name || st.driver.nick; }
    draw();
  }
  function startTimer() {
    stopTimer();
    // tự cập nhật khi kho sửa phân tuyến (không làm gián đoạn lúc đang nhập lý do)
    st.timer = setInterval(() => {
      if (document.hidden || st.busy || st.failing || !st.token || !$('#gh-main')) return;
      const y = window.scrollY;
      loadDay(true).then(() => window.scrollTo(0, y));
    }, 90000);
  }
  function stopTimer() { if (st.timer) clearInterval(st.timer); st.timer = null; }

  const statusOf = r => (st.data.deliveries || {})[custKey(r)] || null;
  function sumQty(rows) {
    const s = {};
    rows.forEach(r => Object.entries(r.qty || {}).forEach(([k, n]) => { s[k] = (s[k] || 0) + Number(n || 0); }));
    return s;
  }
  function qtyChips(q, cls = '') {
    const cols = st.data.cols || [];
    const items = Object.entries(q || {}).filter(([, n]) => Number(n)).sort((a, b) => a[0] - b[0]);
    return items.length ? `<div class="gh-qty ${cls}">${items.map(([k, n]) => `<span><small>${esc(cols[k] || 'SP ' + (+k + 1))}</small><b>${fmt(n)}</b></span>`).join('')}</div>` : '';
  }
  function phoneLinks(s) {
    const parts = String(s || '').split(/[\/,;|]|\s[-–]\s|\s{2,}/).map(x => x.trim()).filter(Boolean);
    return parts.map(p => {
      const digits = p.replace(/[^\d+]/g, '');
      return digits.replace(/\D/g, '').length >= 8 ? `<a class="gh-link" href="tel:${esc(digits)}">📞 ${esc(p)}</a>` : `<span>${esc(p)}</span>`;
    }).join(' ');
  }
  const mapUrl = r => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([r.addr || r.name || r.cust, r.q].filter(Boolean).join(', '));

  function draw() {
    const main = $('#gh-main');
    const D = st.data;
    const all = D.routes.flatMap(g => g.rows);
    const done = all.filter(r => (statusOf(r) || {}).status === 'ok').length;
    const fail = all.filter(r => (statusOf(r) || {}).status === 'fail').length;
    const others = st.days.filter(x => x.date !== st.date).slice(0, 10);
    const otherDays = others.length ? `<section class="gh-card"><h3>Các ngày có tuyến của bạn</h3><div class="gh-days">
      ${others.map(x => `<button class="gh-day" data-date="${x.date}"><b>${esc(dayLabel(x.date))}</b><span>${esc(x.routes.join(', '))} · ${x.done}/${x.count} đã giao</span></button>`).join('')}
      </div></section>` : '';
    if (!D.routes.length) {
      main.innerHTML = `<section class="gh-empty"><div class="gh-empty-ico">${D.planned ? '🛵' : '🗓'}</div>
        <p><b>${D.planned ? 'Ngày này bạn chưa được sắp tuyến nào.' : 'Kho chưa phân tuyến cho ngày này.'}</b></p>
        <p class="gh-muted">${D.planned ? 'Nếu cần, nhắn kho chọn bạn ở cột <b>Người giao</b> trong Phân tuyến giao hàng.' : 'Khi kho lưu Phân tuyến giao hàng của ngày này, tuyến của bạn sẽ hiện ở đây.'}</p></section>${otherDays}`;
      bindDays();
      return;
    }
    const tabs = [['all', `Tất cả ${all.length}`], ['todo', `Chưa giao ${all.length - done - fail}`], ['ok', `Đã giao ${done}`], ['fail', `Không giao được ${fail}`]];
    main.innerHTML = `<section class="gh-summary">
        <div class="gh-progress"><div style="width:${all.length ? Math.round(done * 100 / all.length) : 0}%"></div></div>
        <div class="gh-sum-line"><b>${done}/${all.length}</b> khách đã giao${fail ? ` · <span class="gh-red">${fail} không giao được</span>` : ''} · ${D.routes.length} tuyến</div>
      </section>
      <div class="gh-tabs">${tabs.map(([k, l]) => `<button class="gh-tab ${st.filter === k ? 'on' : ''}" data-f="${k}">${esc(l)}</button>`).join('')}</div>
      <input class="gh-search" id="gh-search" placeholder="Tìm khách, mã CRM, địa chỉ, SĐT…" value="${esc(st.search)}">
      <div id="gh-routes"></div>${otherDays}`;
    $$('.gh-tab').forEach(b => b.onclick = () => { st.filter = b.dataset.f; draw(); });
    let t;
    $('#gh-search').oninput = () => { clearTimeout(t); t = setTimeout(() => { st.search = $('#gh-search').value; drawRoutes(); }, 200); };
    bindDays();
    drawRoutes();
  }
  function bindDays() { $$('.gh-day').forEach(b => b.onclick = () => { setDate(b.dataset.date); window.scrollTo(0, 0); }); }
  function visible(r) {
    const s = (statusOf(r) || {}).status || '';
    if (st.filter === 'todo' && s) return false;
    if (st.filter === 'ok' && s !== 'ok') return false;
    if (st.filter === 'fail' && s !== 'fail') return false;
    return !st.search || matches(st.search, [r.crm, r.cust, r.q, r.addr, r.phone, r.note].join(' '));
  }
  function drawRoutes() {
    const box = $('#gh-routes');
    box.innerHTML = st.data.routes.map(g => {
      const rows = g.rows.map((r, i) => [r, i]).filter(([r]) => visible(r));
      const done = g.rows.filter(r => (statusOf(r) || {}).status === 'ok').length;
      return `<section class="gh-route">
        <div class="gh-route-head"><div><div class="gh-route-code">${esc(g.code)}</div><div class="gh-route-name">${esc(g.name || 'Tuyến ' + g.code)}</div></div>
          <div class="gh-route-count"><b>${done}/${g.rows.length}</b><small>đã giao</small></div></div>
        <details class="gh-load"><summary>Hàng cần mang theo tuyến</summary>${qtyChips(sumQty(g.rows), 'big') || '<p class="gh-muted">Không có số lượng.</p>'}</details>
        ${rows.map(([r, i]) => stopCard(g, r, i)).join('') || '<p class="gh-muted gh-pad">Không có khách nào ở mục đang xem.</p>'}
      </section>`;
    }).join('');
    $$('[data-act]', box).forEach(b => b.onclick = () => act(b.dataset.key, b.dataset.act, b));
  }
  function stopCard(g, r, i) {
    const key = custKey(r), s = statusOf(r);
    const status = s ? (s.status === 'ok' ? `<span class="gh-badge ok">✓ Đã giao ${esc((s.at || '').slice(11, 16))}</span>`
      : `<span class="gh-badge bad">✗ Không giao được${s.note ? ': ' + esc(s.note) : ''}</span>`) : '';
    const pay = r.pay ? `<span class="gh-badge ${/chua|no/.test(noAccent(r.pay)) ? 'warn' : 'info'}">${esc(r.pay)}</span>` : '';
    const failing = st.failing === key;
    return `<article class="gh-stop ${s ? 'is-' + s.status : ''}">
      <div class="gh-stop-top"><span class="gh-stt">${i + 1}</span><div class="gh-stop-name"><b>${esc(r.name || r.cust)}</b>
        <div class="gh-codes">${r.crm ? `CRM <b>${esc(r.crm)}</b>` : ''}${r.code ? ` · ${esc(r.code)}` : ''}${r.q ? ` · ${esc(r.q)}` : ''}</div></div></div>
      ${r.addr || r.q ? `<a class="gh-link gh-addr" href="${mapUrl(r)}" target="_blank" rel="noopener">📍 ${esc(r.addr || r.q)}</a>` : ''}
      ${r.phone ? `<div class="gh-phones">${phoneLinks(r.phone)}</div>` : ''}
      ${r.note ? `<div class="gh-note">📝 ${esc(r.note)}</div>` : ''}
      ${qtyChips(r.qty)}
      ${status || pay ? `<div class="gh-badges">${status}${pay}</div>` : ''}
      ${failing ? `<div class="gh-fail-box"><div class="gh-reasons">${FAIL_REASONS.map(x => `<button class="gh-chip" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <input id="gh-fail-note" placeholder="Lý do khác / ghi chú…" maxlength="200">
        <div class="gh-actions"><button class="gh-btn danger" data-act="fail-save" data-key="${esc(key)}">Xác nhận không giao được</button>
        <button class="gh-btn" data-act="fail-cancel" data-key="${esc(key)}">Hủy</button></div></div>`
      : `<div class="gh-actions">${s ? `<button class="gh-btn" data-act="undo" data-key="${esc(key)}">↺ Hoàn tác</button>`
        : `<button class="gh-btn ok" data-act="ok" data-key="${esc(key)}">✓ Đã giao</button><button class="gh-btn" data-act="fail" data-key="${esc(key)}">✗ Không giao được</button>`}</div>`}
    </article>`;
  }
  async function act(key, action, btn) {
    const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
    if (action === 'fail') { st.failing = key; keepScroll(drawRoutes); bindReasons(); return; }
    if (action === 'fail-cancel') { st.failing = null; keepScroll(drawRoutes); return; }
    const status = action === 'ok' ? 'ok' : action === 'fail-save' ? 'fail' : '';
    const note = status === 'fail' ? ($('#gh-fail-note') ? $('#gh-fail-note').value.trim() : '') : '';
    if (status === 'fail' && !note) { toast('Chọn hoặc ghi lý do không giao được', true); return; }
    btn.disabled = true;
    const date = st.date;
    const ok = await guard(() => call('POST', 'deliver', { date, key, status, note }));
    if (!ok || date !== st.date) { btn.disabled = false; return; }
    const m = Object.assign({}, st.data.deliveries);
    if (status) m[key] = { status, note, at: nowStr() }; else delete m[key];
    st.data.deliveries = m;
    st.failing = null;
    const day = st.days.find(x => x.date === date);
    if (day) day.done = Object.values(m).filter(x => x.status === 'ok').length;
    toast(status === 'ok' ? 'Đã ghi: đã giao' : status === 'fail' ? 'Đã ghi: không giao được' : 'Đã hoàn tác');
    keepScroll(draw);
  }
  function bindReasons() {
    $$('[data-reason]').forEach(b => b.onclick = () => { $('#gh-fail-note').value = b.dataset.reason; });
    $$('[data-act]', $('#gh-routes')).forEach(b => b.onclick = () => act(b.dataset.key, b.dataset.act, b));
    const inp = $('#gh-fail-note');
    if (inp) inp.focus({ preventScroll: true });
  }
  function nowStr() { const d = new Date(); return `${isoDate(d)} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }

  /* ---------------------------------------------------------- khởi động */
  // root: phần tử chứa web giao hàng; onExit: (bản online) quay về web kho
  async function start(root, opts = {}) {
    st.root = root; st.onExit = opts.onExit || null;
    document.body.classList.add('gh-mode');
    document.title = 'Giao hàng An Tâm';
    st.token = store('token') || ''; st.driver = store('driver') || null;
    st.date = isoDate();
    if (st.token) await showMain(); else drawLogin();
  }
  function onRemoteChange() { if (st.token && $('#gh-main') && !st.busy && !st.failing) loadDay(true); }
  return { start, onRemoteChange, stop: stopTimer };
})();
