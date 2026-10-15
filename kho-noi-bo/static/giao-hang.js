'use strict';
/* Web giao hàng An Tâm – mỗi người giao hàng 1 tài khoản (nick + mã PIN, tạo ở web kho › Tài khoản giao hàng).
   Sau khi đăng nhập: chọn ngày, thấy các tuyến kho đã sắp cho mình ở mục Phân tuyến giao hàng (khách, địa chỉ,
   SĐT, số lượng từng loại bánh), đánh dấu Đã giao / Không giao được kèm ảnh chụp + vị trí lúc giao,
   lưu vị trí chính xác của khách để lần sau chỉ đường – web kho thấy ngay kết quả.
   Bản chạy máy chủ: trang /giao-hang gọi /api/gh/…; bản online: chạy trong trang Kho An Tâm, gọi Backend.handle. */
const GiaoHang = (() => {
  const ONLINE = !!window.ANTAM_ONLINE;
  const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const FAIL_REASONS = ['Khách vắng nhà', 'Khách hẹn giao lại', 'Khách không nhận', 'Sai địa chỉ / SĐT', 'Hết hàng trên xe'];
  const st = { token: '', driver: null, date: '', data: null, days: [], filter: 'all', search: '', panel: null, busy: 0, root: null, onExit: null, timer: null };

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
  const custKey = r => String(r.key || '').trim() || String(r.crm || '').trim() || String(r.code || '').trim() || String(r.cust || '').trim();
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
      ${st.onExit ? `<button class="gh-btn ghost" id="gh-exit">${esc(st.exitLabel)}</button>` : ''}
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
        <button class="gh-btn sm" id="gh-logout">Đăng xuất</button>${st.onExit && st.exitInHeader ? '<button class="gh-btn sm ghost" id="gh-exit">Web kho</button>' : ''}</div>
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
    if (st.onExit && st.exitInHeader) $('#gh-exit').onclick = () => exit();
    $('#gh-reload').onclick = () => loadDay();
    $('#gh-prev').onclick = () => setDate(addDays(st.date, -1));
    $('#gh-next').onclick = () => setDate(addDays(st.date, 1));
    $('#gh-today').onclick = () => setDate(isoDate());
    $('#gh-date').onchange = () => { if ($('#gh-date').value) setDate($('#gh-date').value); };
    await setDate(st.date || isoDate());
    startTimer();
  }
  async function setDate(d) {
    st.date = d; st.panel = null;
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
      if (document.hidden || st.busy || st.panel || !st.token || !$('#gh-main')) return;
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
    bindStops(box);
  }
  const locOf = r => (st.data.locations || {})[custKey(r)] || null;
  const coordText = g => `${g.lat},${g.lng}`;
  const gpsLink = g => 'https://www.google.com/maps/search/?api=1&query=' + coordText(g);
  const accText = g => (g && g.acc ? ` ±${Math.round(g.acc)}m` : '');
  function photoStrip(refs, removable) {
    return refs && refs.length ? `<div class="gh-photos">${refs.map((p, n) => `<span class="gh-ph"><img data-ref="${esc(p)}" alt="Ảnh giao hàng ${n + 1}">${removable ? `<button class="gh-ph-x" data-rm="${n}" aria-label="Bỏ ảnh">✕</button>` : ''}</span>`).join('')}</div>` : '';
  }
  function stopCard(g, r, i) {
    const key = custKey(r), s = statusOf(r), loc = locOf(r);
    const status = s ? (s.status === 'ok' ? `<span class="gh-badge ok">✓ Đã giao ${esc((s.at || '').slice(11, 16))}</span>`
      : `<span class="gh-badge bad">✗ Không giao được${s.note ? ': ' + esc(s.note) : ''}</span>`) : '';
    const pay = r.pay ? `<span class="gh-badge ${/chua|no/.test(noAccent(r.pay)) ? 'warn' : 'info'}">${esc(r.pay)}</span>` : '';
    const addr = r.addr || r.q;
    const panel = st.panel && st.panel.key === key ? st.panel : null;
    let actions;
    if (panel && panel.mode === 'loc') actions = locPanel(key, loc);
    else if (panel) actions = confirmPanel(key, panel, loc);
    else if (s) actions = `${photoStrip(s.photos)}${s.gps ? `<a class="gh-link gh-small" href="${gpsLink(s.gps)}" target="_blank" rel="noopener">📍 Vị trí lúc giao${accText(s.gps)}</a>` : ''}
      <div class="gh-actions"><label class="gh-btn gh-file">📷 Thêm ảnh<input type="file" accept="image/*" capture="environment" multiple data-add="${esc(key)}"></label>
      <button class="gh-btn" data-act="undo" data-key="${esc(key)}">↺ Hoàn tác</button></div>`;
    else actions = `<div class="gh-actions"><button class="gh-btn ok" data-act="ok" data-key="${esc(key)}">✓ Đã giao</button><button class="gh-btn" data-act="fail" data-key="${esc(key)}">✗ Không giao được</button></div>`;
    return `<article class="gh-stop ${s ? 'is-' + s.status : ''}" data-stop="${esc(key)}">
      <div class="gh-stop-top"><span class="gh-stt">${i + 1}</span><div class="gh-stop-name"><b>${esc(r.name || r.cust)}</b>
        <div class="gh-codes">${r.crm ? `CRM <b>${esc(r.crm)}</b>` : ''}${r.code ? ` · ${esc(r.code)}` : ''}${r.q ? ` · ${esc(r.q)}` : ''}</div></div></div>
      ${addr ? `<a class="gh-link gh-addr" href="${loc ? gpsLink(loc) : mapUrl(r)}" target="_blank" rel="noopener">📍 ${esc(addr)}</a>` : ''}
      <div class="gh-locline">${loc ? `<span class="gh-badge info">📌 Đã lưu vị trí khách</span>
        <a class="gh-link" href="https://www.google.com/maps/dir/?api=1&destination=${coordText(loc)}" target="_blank" rel="noopener">🧭 Chỉ đường</a>` : ''}
        ${panel ? '' : `<button class="gh-linkbtn" data-act="loc" data-key="${esc(key)}">${loc ? 'Sửa vị trí' : '📌 Lưu vị trí khách'}</button>`}</div>
      ${r.phone ? `<div class="gh-phones">${phoneLinks(r.phone)}</div>` : ''}
      ${r.note ? `<div class="gh-note">📝 ${esc(r.note)}</div>` : ''}
      ${qtyChips(r.qty)}
      ${status || pay ? `<div class="gh-badges">${status}${pay}</div>` : ''}
      ${actions}
    </article>`;
  }
  function gpsLine(p) {
    if (p.gpsState === 'wait') return '<span class="gh-muted">📍 Đang lấy vị trí…</span>';
    if (p.gps) return `<span>📍 Đã có vị trí${accText(p.gps)} · <a class="gh-link" href="${gpsLink(p.gps)}" target="_blank" rel="noopener">xem</a></span>`;
    return `<span class="gh-red">📍 ${esc(p.gpsErr || 'Chưa có vị trí')}</span>`;
  }
  // Trang trên claude.ai thường không được đọc định vị điện thoại: lấy tọa độ ở Google Maps rồi dán vào – web tự nhận
  function coordBox(p) {
    return `<div class="gh-coordbox">
      <a class="gh-btn" href="https://www.google.com/maps" target="_blank" rel="noopener">🗺 Mở Google Maps lấy tọa độ</a>
      <input class="gh-input" data-coords inputmode="decimal" autocomplete="off" placeholder="Dán tọa độ vào đây, vd 10.8812, 106.5934" value="${esc(p.coords || '')}">
      <details class="gh-small"><summary>Cách lấy tọa độ</summary><ol>
        <li>Bấm <b>Mở Google Maps</b>, bấm nút ◎ để hiện chấm xanh (vị trí của bạn).</li>
        <li>Nhấn giữ vào chấm xanh (hoặc cửa hàng của khách) – ô tìm kiếm hiện số dạng <b>10.88…, 106.59…</b> – chạm vào số đó để sao chép.</li>
        <li>Quay lại trang này, nhấn giữ vào ô trên → <b>Dán</b>. Web tự nhận.</li></ol></details>
    </div>`;
  }
  function confirmPanel(key, p, loc) {
    const ok = p.mode === 'ok';
    return `<div class="gh-panel ${ok ? 'ok' : 'bad'}">
      <div class="gh-panel-title">${ok ? 'Xác nhận đã giao' : 'Không giao được'}</div>
      ${photoStrip(p.photos, true)}
      <label class="gh-btn gh-file">📷 ${p.photos.length ? 'Chụp thêm ảnh' : (ok ? 'Chụp ảnh giao hàng' : 'Chụp ảnh (nếu có)')}<input type="file" accept="image/*" capture="environment" multiple data-pick="${esc(key)}"></label>
      ${p.uploading ? '<div class="gh-muted">Đang gửi ảnh…</div>' : ''}
      <div class="gh-gps">${gpsLine(p)} <button class="gh-linkbtn" data-act="gps" data-key="${esc(key)}">${st.gpsBlocked ? 'Thử lấy tự động' : '↻ Lấy lại'}</button></div>
      ${p.gps || p.gpsState === 'wait' ? '' : coordBox(p)}
      ${ok && p.gps && !loc ? `<label class="gh-check"><input type="checkbox" data-savloc ${p.saveLoc ? 'checked' : ''}> Lưu vị trí này làm vị trí của khách (lần sau chỉ đường thẳng tới đây)</label>` : ''}
      ${ok ? '' : `<div class="gh-reasons">${FAIL_REASONS.map(x => `<button class="gh-chip ${p.note === x ? 'on' : ''}" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}
      <input class="gh-input" data-note placeholder="${ok ? 'Ghi chú (không bắt buộc)…' : 'Lý do khác / ghi chú…'}" maxlength="200" value="${esc(p.note)}">
      <div class="gh-actions"><button class="gh-btn ${ok ? 'ok' : 'danger'}" data-act="save" data-key="${esc(key)}" ${p.uploading ? 'disabled' : ''}>${ok ? '✓ Xác nhận đã giao' : 'Xác nhận không giao được'}</button>
      <button class="gh-btn" data-act="cancel" data-key="${esc(key)}">Hủy</button></div>
    </div>`;
  }
  function locPanel(key, loc) {
    const p = st.panel;
    return `<div class="gh-panel">
      <div class="gh-panel-title">📌 Vị trí của khách</div>
      <p class="gh-muted gh-small">Đứng tại cửa hàng của khách, lấy tọa độ rồi dán vào ô dưới – web tự lưu.</p>
      <button class="gh-btn ${st.gpsBlocked ? '' : 'primary'}" data-act="loc-gps" data-key="${esc(key)}">📍 ${st.gpsBlocked ? 'Thử lấy vị trí tự động' : 'Dùng vị trí hiện tại'}</button>
      ${p.gpsState === 'wait' ? '<div class="gh-muted">Đang lấy vị trí…</div>' : p.gpsErr ? `<div class="gh-red gh-small">${esc(p.gpsErr)}</div>` : ''}
      ${coordBox(p)}
      <div class="gh-actions"><button class="gh-btn ok" data-act="loc-save" data-key="${esc(key)}">Lưu tọa độ đã dán</button>
      ${loc ? `<button class="gh-btn" data-act="loc-clear" data-key="${esc(key)}">Xóa vị trí</button>` : ''}
      <button class="gh-btn" data-act="cancel" data-key="${esc(key)}">Hủy</button></div>
    </div>`;
  }
  function bindStops(box) {
    $$('[data-act]', box).forEach(b => b.onclick = () => act(b.dataset.key, b.dataset.act, b));
    $$('[data-reason]', box).forEach(b => b.onclick = () => { if (!st.panel) return; st.panel.note = b.dataset.reason; redraw(); });
    $$('[data-note]', box).forEach(inp => inp.oninput = () => { if (st.panel) st.panel.note = inp.value; });
    $$('[data-coords]', box).forEach(inp => inp.oninput = e => {
      const p = st.panel;
      if (!p) return;
      p.coords = inp.value;
      const g = parseCoords(inp.value);
      // tự nhận khi dán (hoặc đã gõ đủ tọa độ chính xác), không nhận khi đang gõ dở
      if (!g || !(e.inputType === 'insertFromPaste' || /\d\.\d{4,}\D+-?\d{1,3}\.\d{4,}/.test(inp.value))) return;
      if (p.mode === 'loc') saveLocation(p.key, g); // dán xong là lưu luôn
      else { p.gps = g; p.gpsErr = ''; toast('Đã nhận tọa độ'); redraw(); }
    });
    $$('[data-savloc]', box).forEach(cb => cb.onchange = () => { if (st.panel) st.panel.saveLoc = cb.checked; });
    $$('[data-rm]', box).forEach(b => b.onclick = () => { if (!st.panel) return; st.panel.photos.splice(+b.dataset.rm, 1); redraw(); });
    $$('input[data-pick]', box).forEach(inp => inp.onchange = () => pickPhotos(inp.dataset.pick, inp.files));
    $$('input[data-add]', box).forEach(inp => inp.onchange = () => addPhotos(inp.dataset.add, inp.files));
    $$('img[data-ref]', box).forEach(img => {
      photoSrc(img.dataset.ref).then(src => { if (src) img.src = src; else img.alt = '(không tải được ảnh)'; });
      img.onclick = () => { if (img.src) viewPhoto(img.src); };
    });
  }
  function redraw() { const y = window.scrollY; drawRoutes(); window.scrollTo(0, y); }
  function rowByKey(key) { for (const g of st.data.routes) { const r = g.rows.find(x => custKey(x) === key); if (r) return r; } return null; }

  async function act(key, action, btn) {
    const p = st.panel && st.panel.key === key ? st.panel : null;
    if (action === 'ok' || action === 'fail') {
      st.panel = { key, mode: action, photos: [], note: '', gps: null, gpsState: '', gpsErr: '', saveLoc: true };
      redraw(); if (!st.gpsBlocked) fetchGps(st.panel); else { st.panel.gpsErr = 'Chưa có vị trí – lấy tọa độ ở Google Maps rồi dán vào ô dưới'; redraw(); }
      return;
    }
    if (action === 'loc') { st.panel = { key, mode: 'loc', coords: '', gpsState: '', gpsErr: '' }; redraw(); return; }
    if (action === 'cancel') { st.panel = null; redraw(); return; }
    if (action === 'gps' && p) { fetchGps(p); return; }
    if (action === 'loc-gps' && p) {
      p.gpsState = 'wait'; p.gpsErr = ''; redraw();
      try { const g = await getGps(); p.gpsState = ''; await saveLocation(key, g); } catch (e) { p.gpsState = ''; p.gpsErr = e.message; if (st.panel === p) redraw(); }
      return;
    }
    if (action === 'loc-save' && p) {
      const g = parseCoords(p.coords);
      if (!g) { toast('Không đọc được tọa độ. Dán dạng "10.88, 106.59" hoặc link Google Maps đầy đủ.', true); return; }
      await saveLocation(key, g); return;
    }
    if (action === 'loc-clear' && p) {
      if (await guard(() => call('POST', 'location', { date: st.date, key, clear: true }))) {
        const m = Object.assign({}, st.data.locations); delete m[key]; st.data.locations = m; st.panel = null; toast('Đã xóa vị trí khách'); redraw();
      }
      return;
    }
    if (action === 'save' && p) {
      if (p.mode === 'fail' && !p.note.trim()) { toast('Chọn hoặc ghi lý do không giao được', true); return; }
      if (p.mode === 'ok' && !p.photos.length && !(await confirmNoPhoto())) return;
      btn.disabled = true;
      const ok = await submit(key, { status: p.mode, note: p.note.trim(), photos: p.photos, gps: p.gps });
      if (!ok) { btn.disabled = false; return; }
      if (p.mode === 'ok' && p.saveLoc && p.gps && !locOf(rowByKey(key) || {}) && (!p.gps.acc || p.gps.acc <= 150)) await saveLocation(key, p.gps, true);
      st.panel = null;
      toast(p.mode === 'ok' ? 'Đã ghi: đã giao' : 'Đã ghi: không giao được');
      keepDraw();
      return;
    }
    if (action === 'undo') {
      btn.disabled = true;
      if (await submit(key, { status: '' })) { toast('Đã hoàn tác'); keepDraw(); } else btn.disabled = false;
    }
  }
  function keepDraw() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
  // Không có nút confirm() trong trang online: hỏi bằng ô nhỏ ngay trong trang
  function confirmNoPhoto() {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'gh-dialog';
      el.innerHTML = `<div class="gh-dialog-box"><p>Chưa có ảnh giao hàng. Vẫn xác nhận đã giao?</p>
        <div class="gh-actions"><button class="gh-btn" data-no>Quay lại chụp ảnh</button><button class="gh-btn ok" data-yes>Vẫn xác nhận</button></div></div>`;
      st.root.appendChild(el);
      const done = v => { el.remove(); resolve(v); };
      el.querySelector('[data-no]').onclick = () => done(false);
      el.querySelector('[data-yes]').onclick = () => done(true);
    });
  }
  async function submit(key, rec) {
    const date = st.date;
    const ok = await guard(() => call('POST', 'deliver', Object.assign({ date, key }, rec)));
    if (!ok || date !== st.date) return false;
    const m = Object.assign({}, st.data.deliveries);
    if (rec.status) m[key] = { status: rec.status, note: rec.note || '', at: nowStr(), photos: rec.photos || [], gps: rec.gps || null }; else delete m[key];
    st.data.deliveries = m;
    const day = st.days.find(x => x.date === date);
    if (day) day.done = Object.values(m).filter(x => x.status === 'ok').length;
    return true;
  }
  async function saveLocation(key, g, quiet) {
    const res = await guard(() => call('POST', 'location', Object.assign({ date: st.date, key }, g)));
    if (!res) return;
    st.data.locations = Object.assign({}, st.data.locations, { [key]: res.location || g });
    if (st.panel && st.panel.mode === 'loc' && st.panel.key === key) st.panel = null;
    toast(quiet ? 'Đã lưu vị trí khách' : 'Đã lưu vị trí khách' + accText(g));
    if (!quiet) redraw();
  }
  async function fetchGps(p) {
    p.gpsState = 'wait'; p.gpsErr = ''; redraw();
    try { p.gps = await getGps(); } catch (e) { p.gpsErr = e.message; }
    p.gpsState = '';
    if (st.panel === p) redraw();
  }
  // Định vị tự động: chỉ chạy được khi trình duyệt cho phép (bản chạy máy qua https). Trang trên claude.ai bị chặn –
  // lần đầu bị từ chối thì nhớ lại (st.gpsBlocked) để hiện ngay cách dán tọa độ từ Google Maps.
  function getGps() {
    const blocked = msg => { st.gpsBlocked = true; store('gpsBlocked', true); return new Error(msg); };
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) return reject(blocked('Trang này không đọc được định vị – lấy tọa độ ở Google Maps rồi dán vào'));
      if (!navigator.geolocation) return reject(blocked('Điện thoại / trình duyệt không hỗ trợ định vị – lấy tọa độ ở Google Maps rồi dán vào'));
      navigator.geolocation.getCurrentPosition(
        pos => { st.gpsBlocked = false; store('gpsBlocked', null); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); },
        e => reject(e.code === 1 ? blocked(ONLINE ? 'Trang trên claude.ai không được đọc định vị điện thoại – lấy tọa độ ở Google Maps rồi dán vào'
          : 'Chưa cho phép định vị – bật quyền Vị trí cho trình duyệt, hoặc lấy tọa độ ở Google Maps rồi dán vào')
          : new Error(e.code === 3 ? 'Lấy vị trí quá lâu – thử lại, hoặc dán tọa độ từ Google Maps' : 'Không lấy được vị trí – dán tọa độ từ Google Maps')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }
  // "10.88, 106.59", link Google Maps (…!3d10.88!4d106.59…, …@10.88,106.59…, …?q=10.88,106.59)
  function parseCoords(s) {
    const t = String(s || '');
    const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|destination|ll)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /(-?\d{1,2}\.\d{2,})\s*[,; ]\s*(-?\d{1,3}\.\d{2,})/];
    for (const re of pats) {
      const m = t.match(re);
      if (m) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, acc: null }; }
    }
    return null;
  }

  /* ---------------------------------------------------------- ảnh giao hàng */
  async function photoSrc(ref) {
    if (ONLINE) { try { return await Backend.photoUrl(ref); } catch (e) { return ''; } }
    return '/api/gh/photo?ref=' + encodeURIComponent(ref) + '&t=' + encodeURIComponent(st.token);
  }
  function viewPhoto(src) {
    const el = document.createElement('div');
    el.className = 'gh-dialog gh-viewer';
    el.innerHTML = `<img src="${esc(src)}" alt="Ảnh giao hàng"><button class="gh-btn">Đóng</button>`;
    el.onclick = () => el.remove();
    st.root.appendChild(el);
  }
  // Thu nhỏ ảnh chụp (≤1280px, JPEG) và ghi giờ chụp + khách lên góc ảnh
  async function compress(file, label) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh ' + (file.name || ''))); i.src = url; });
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const fs = Math.max(14, Math.round(c.width / 40));
      ctx.font = `bold ${fs}px sans-serif`;
      const text = `${nowStr().slice(0, 16)} · ${label}`.slice(0, 80);
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, c.height - fs * 1.8, w + fs, fs * 1.8);
      ctx.fillStyle = '#fff'; ctx.fillText(text, fs / 2, c.height - fs * 0.55);
      let q = 0.72, out = c.toDataURL('image/jpeg', q);
      while (out.length > 600000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadPhotos(key, files) {
    const r = rowByKey(key) || {};
    const label = [r.crm || r.code, r.name || r.cust].filter(Boolean).join(' ');
    const refs = [];
    for (const f of Array.from(files || []).slice(0, 6)) {
      const ref = await guard(async () => (await call('POST', 'photo', { date: st.date, key, data: await compress(f, label) })).ref);
      if (ref) refs.push(ref);
    }
    return refs;
  }
  async function pickPhotos(key, files) {
    const p = st.panel;
    if (!p || p.key !== key || !files || !files.length) return;
    p.uploading = true; redraw();
    const refs = await uploadPhotos(key, files);
    p.uploading = false;
    p.photos = p.photos.concat(refs).slice(0, 6);
    if (st.panel === p) redraw();
  }
  async function addPhotos(key, files) {
    const s = (st.data.deliveries || {})[key];
    if (!s || !files || !files.length) return;
    toast('Đang gửi ảnh…');
    const refs = await uploadPhotos(key, files);
    if (!refs.length) return;
    if (await submit(key, { status: s.status, note: s.note, photos: (s.photos || []).concat(refs).slice(0, 6), gps: s.gps })) { toast('Đã thêm ảnh'); keepDraw(); }
  }
  function nowStr() { const d = new Date(); return `${isoDate(d)} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }

  /* ---------------------------------------------------------- khởi động */
  // root: phần tử chứa web giao hàng; onExit: (bản online) quay về web kho
  async function start(root, opts = {}) {
    st.root = root; st.onExit = opts.onExit || null;
    st.gpsBlocked = !!store('gpsBlocked');
    st.exitLabel = opts.exitLabel || '← Về web kho'; st.exitInHeader = opts.exitInHeader !== false;
    document.body.classList.add('gh-mode');
    document.title = 'Giao hàng An Tâm';
    st.token = store('token') || ''; st.driver = store('driver') || null;
    st.date = isoDate();
    if (st.token) await showMain(); else drawLogin();
  }
  function onRemoteChange() { if (st.token && $('#gh-main') && !st.busy && !st.panel) loadDay(true); }
  return { start, onRemoteChange, stop: stopTimer };
})();
