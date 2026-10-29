#!/usr/bin/env python3
"""Ghép giao diện (static/) + online/backend.js thành trang HTML cho bản online trên claude.ai.

    python online/build.py                        -> online/kho-antam.html      (web chính, dữ liệu dùng chung)
    python online/build.py --giao                 -> online/giao-hang-antam.html (web Giao hàng An Tâm: trang riêng cho
                                                     người giao + quản lý phân tuyến, dữ liệu riêng, không có phần kho)
    python online/build.py --hop                  -> online/an-tam.html         (trang gộp An Tâm: Đóng hàng + Kho + Giao hàng
                                                     chung 1 kho dữ liệu – đăng lên trang Kho An Tâm)
    python online/build.py --view du-lieu.json    -> online/kho-antam-xem.html  (trang xem công khai, chỉ xem,
                                                     chứa sẵn số liệu – KHÔNG commit file này)
`du-lieu.json` là file "Tải dữ liệu" ở mục Cài đặt & dữ liệu của web chính.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
MAIN_TITLE = "Kho An Tâm"
MAIN_DESC = "Web làm việc nội bộ kho Thành phẩm - Hàng hóa và Nguyên vật liệu"
VIEW_TITLE = "Sổ Kho An Tâm"
VIEW_DESC = "Trang xem công khai số liệu kho Thành phẩm - Hàng hóa và Nguyên vật liệu (chỉ xem)"
GIAO_TITLE = "Giao hàng An Tâm"
GIAO_DESC = "Web giao hàng: mỗi người giao 1 nick xem tuyến của mình, báo đã giao kèm ảnh và vị trí; quản lý phân tuyến"
# Link trang Giao hàng An Tâm trên claude.ai: web kho online ẩn Phân tuyến / Tài khoản giao hàng và trỏ sang đó
GIAO_URL = "https://claude.ai/artifact/6bVzsWLxPdkdCKF687Bnky"


def read(*p):
    with open(os.path.join(*p), encoding="utf-8") as f:
        return f.read()


def parts():
    index = read(ROOT, "static", "index.html")
    markup = re.search(r"<body>(.*?)<script src=\"app.js\"></script>", index, re.S).group(1).strip()
    css = read(ROOT, "static", "style.css")
    backend = read(HERE, "backend.js")
    app = read(ROOT, "static", "app.js")
    # web giao hàng chạy ngay trong trang (dùng chung dữ liệu): CSS nối sau, JS đặt trước app.js
    css += "\n" + read(ROOT, "static", "giao-hang.css")
    app = read(ROOT, "static", "giao-hang.js") + "\n" + app
    for name, code, tag in (("backend.js", backend, "</script"), ("app.js", app, "</script"), ("style.css", css, "</style")):
        if tag in code.lower():
            raise SystemExit("%s chứa %s – không nhúng được" % (name, tag))
    return markup, css, backend, app


def build_main(giao=False):
    markup, css, backend, app = parts()
    if giao:
        title, desc, boot = GIAO_TITLE, GIAO_DESC, "window.ANTAM_GIAO_APP=true;"
    else:
        title, desc, boot = MAIN_TITLE, MAIN_DESC, ("window.ANTAM_GIAO_URL=%s;" % json.dumps(GIAO_URL)) if "__" not in GIAO_URL else ""
    return "\n".join([
        "<title>%s</title>" % title,
        '<meta name="description" content="%s">' % desc,
        '<style id="app-style">%s</style>' % css,
        markup,
        '<script id="antam-boot">%s</script>' % boot,
        '<script src="%s"></script>' % SHEETJS,
        '<script id="antam-backend">%s</script>' % backend,
        '<script id="antam-app">%s</script>' % app,
    ])


def build_view(snapshot_path):
    markup, css, backend, app = parts()
    with open(snapshot_path, encoding="utf-8") as f:
        snap = json.load(f)
    if snap.get("format") != "kho-antam-backup":
        raise SystemExit("File số liệu không đúng định dạng kho-antam-backup")
    snap_text = json.dumps(snap, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    boot = "window.ANTAM_VIEW=true;window.ANTAM_TITLE=%s;window.ANTAM_DESC=%s;window.ANTAM_SHEETJS=%s;window.ANTAM_MARKUP=%s;" % (
        json.dumps(VIEW_TITLE, ensure_ascii=False), json.dumps(VIEW_DESC, ensure_ascii=False), json.dumps(SHEETJS),
        json.dumps(markup, ensure_ascii=False).replace("</", "<\\/"))
    # Cùng thứ tự với viewPageSource() trong app.js (trang tự đăng lại chính nó theo đúng khung này)
    return "\n".join([
        "<title>%s</title>" % VIEW_TITLE,
        '<meta name="description" content="%s">' % VIEW_DESC,
        '<style id="app-style">%s</style>' % css,
        markup,
        '<script type="application/json" id="antam-snapshot">%s</script>' % snap_text,
        '<script id="antam-boot">%s</script>' % boot,
        '<script src="%s"></script>' % SHEETJS,
        '<script id="antam-backend">%s</script>' % backend,
        '<script id="antam-app">%s</script>' % app,
    ])


HOP_TITLE = "An Tâm"
HOP_DESC = "Web làm việc An Tâm: Đóng hàng · Kho · Giao hàng dùng chung một kho dữ liệu, chuyển dữ liệu cho nhau ngay"
HOP_CSS = """
:root { --hp-bg: #f2f5f3; --hp-panel: #ffffff; --hp-ink: #17231d; --hp-muted: #5d6b64; --hp-line: #d9e1dc; --hp-brand: #0f6e5a; --hp-brand-soft: #e2f1ec; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --hp-bg: #111814; --hp-panel: #18211c; --hp-ink: #e5ece8; --hp-muted: #9aa9a1; --hp-line: #2c3a33; --hp-brand: #3fb594; --hp-brand-soft: #19362d; } }
:root[data-theme="dark"] { --hp-bg: #111814; --hp-panel: #18211c; --hp-ink: #e5ece8; --hp-muted: #9aa9a1; --hp-line: #2c3a33; --hp-brand: #3fb594; --hp-brand-soft: #19362d; }
body.hop-picking { background: var(--hp-bg); color: var(--hp-ink); }
#hop-pick { min-height: 100vh; display: grid; place-items: center; padding: 24px max(16px, env(safe-area-inset-left, 0px)); font: 18px/1.5 "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
#hop-pick .box { width: min(560px, 100%); display: grid; gap: 14px; }
#hop-pick h1 { margin: 0; font-size: 28px; }
#hop-pick p { margin: 0; color: var(--hp-muted); font-size: 16px; }
#hop-pick button { display: grid; grid-template-columns: 56px 1fr; gap: 4px 14px; align-items: center; text-align: left; font: inherit; color: inherit;
  background: var(--hp-panel); border: 1px solid var(--hp-line); border-radius: 14px; padding: 16px 18px; cursor: pointer; }
#hop-pick button:hover, #hop-pick button:focus-visible { border-color: var(--hp-brand); background: var(--hp-brand-soft); outline: none; }
#hop-pick button i { grid-row: span 2; font-style: normal; font-size: 36px; text-align: center; }
#hop-pick button b { font-size: 21px; }
#hop-pick button span { color: var(--hp-muted); font-size: 15px; }
#hop-switch { position: fixed; left: calc(10px + env(safe-area-inset-left, 0px)); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 70;
  font: 600 13px/1 system-ui, sans-serif; padding: 7px 11px; border-radius: 999px; border: 1px solid var(--hp-line); background: var(--hp-panel); color: var(--hp-muted);
  opacity: .82; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
#hop-switch:hover { opacity: 1; color: var(--hp-ink); }
"""
HOP_PICK = """<div id="hop-pick" hidden><div class="box">
  <h1>An Tâm</h1><p>Chọn bộ phận của bạn (máy này sẽ nhớ, lần sau vào thẳng):</p>
  <button type="button" data-app="dh"><i>📦</i><b>Đóng hàng</b><span>Đơn hàng ngày, tuyến kebab 123, định mức đóng hàng</span></button>
  <button type="button" data-app="kho"><i>🏭</i><b>Kho</b><span>Phiếu nhập – xuất, tồn kho, phân tuyến, tài khoản giao hàng</span></button>
  <button type="button" data-app="giao"><i>🚚</i><b>Giao hàng</b><span>Người giao: xem tuyến của mình, báo đã giao kèm ảnh</span></button>
</div></div>
<button type="button" id="hop-switch" hidden title="Chọn lại bộ phận (Đóng hàng / Kho / Giao hàng)">⇄ Bộ phận</button>"""
HOP_JS = r"""
// Trang gộp: mỗi lần mở chỉ chạy 1 web (Đóng hàng hoặc Kho; Giao hàng = web Kho ở chế độ người giao) – các web dùng chung kho dữ liệu
(function () {
  var KEY = 'antam.app', pick = document.getElementById('hop-pick'), sw = document.getElementById('hop-switch');
  var APPS = { dh: ['Đóng hàng An Tâm', 'hop-dh', hopAppDh], kho: ['Kho An Tâm', 'hop-kho', hopAppKho], giao: ['Giao hàng An Tâm', 'hop-kho', hopAppKho] };
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function put(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* trình duyệt chặn lưu */ } }
  function start(k) {
    var a = APPS[k];
    try {
      var m = JSON.parse(localStorage.getItem('mode') || 'null');
      if (k === 'giao' && m !== 'giao') localStorage.setItem('mode', JSON.stringify('giao'));
      if (k === 'kho' && m === 'giao') localStorage.setItem('mode', JSON.stringify(''));
    } catch (e) { /* bỏ qua */ }
    pick.remove(); document.body.classList.remove('hop-picking');
    document.body.appendChild(document.getElementById(a[1]).content.cloneNode(true));
    document.title = a[0];
    a[2]();
    // nút đổi bộ phận: web Kho thêm vào cuối menu trái, web Đóng hàng thêm vào hàng mục, Giao hàng để nút nổi nhỏ ở góc
    setTimeout(function () {
      var nav = k === 'kho' && document.getElementById('nav'), tabs = k === 'dh' && document.getElementById('tabs');
      if (nav) { var l = document.createElement('a'); l.href = '#'; l.textContent = '⇄ Đổi bộ phận'; l.onclick = function (e) { e.preventDefault(); sw.onclick(); }; nav.appendChild(l); }
      else if (tabs) { var t = document.createElement('button'); t.type = 'button'; t.textContent = '⇄ Bộ phận'; t.title = sw.title; t.onclick = function () { sw.onclick(); }; tabs.appendChild(t); }
      else sw.hidden = false;
    }, 300);
  }
  sw.onclick = function () { put(''); try { localStorage.setItem('mode', JSON.stringify('')); } catch (e) { /* bỏ qua */ } location.reload(); };
  var k = get();
  if (APPS[k]) return start(k);
  document.body.classList.add('hop-picking'); pick.hidden = false;
  Array.prototype.forEach.call(pick.querySelectorAll('[data-app]'), function (b) { b.onclick = function () { put(b.dataset.app); start(b.dataset.app); }; });
  pick.querySelector('button').focus();
})();
"""


def build_hop():
    """Trang gộp An Tâm: web Đóng hàng + web Kho (có chế độ Giao hàng) trong 1 trang claude.ai, chung 1 kho dữ liệu."""
    markup, css, backend, app = parts()
    dh = read(ROOT, "..", "dong-hang", "dong-hang-antam.html")
    dh_scripts = re.findall(r"<script>(.*?)</script>", dh, re.S)
    dh_rest = re.sub(r"<script>.*?</script>", "", dh, flags=re.S)
    dh_rest = re.sub(r"<title>.*?</title>\s*|<meta name=\"(?:description|claude:viewport-fit-sides)\"[^>]*>\s*", "", dh_rest)
    for name, code in (("đóng hàng", dh_rest), ("kho", markup + css)):
        if "</template" in code.lower():
            raise SystemExit("%s chứa </template – không nhúng được" % name)
    dh_js = "\n".join(dh_scripts)
    if "</script" in dh_js.lower():
        raise SystemExit("đóng hàng chứa </script")
    return "\n".join([
        "<title>%s</title>" % HOP_TITLE,
        '<meta name="description" content="%s">' % HOP_DESC,
        '<meta name="claude:viewport-fit-sides" content="cover">',
        '<style id="hop-css">%s</style>' % HOP_CSS,
        HOP_PICK,
        '<template id="hop-dh">%s</template>' % dh_rest.strip(),
        '<template id="hop-kho"><style id="app-style">%s</style>\n%s</template>' % (css, markup),
        '<script src="%s"></script>' % SHEETJS,
        '<script id="antam-hop">window.ANTAM_HOP=true;\nfunction hopAppDh() {\n%s\n}\nfunction hopAppKho() {\n%s\n%s\n}\n%s</script>' % (dh_js, backend, app, HOP_JS),
    ])


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--hop":
        page, out = build_hop(), os.path.join(HERE, "an-tam.html")
    elif len(sys.argv) >= 2 and sys.argv[1] == "--giao":
        page, out = build_main(giao=True), os.path.join(HERE, "giao-hang-antam.html")
    elif len(sys.argv) >= 3 and sys.argv[1] == "--view":
        page, out = build_view(sys.argv[2]), os.path.join(HERE, "kho-antam-xem.html")
    else:
        page, out = build_main(), os.path.join(HERE, "kho-antam.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("Đã tạo %s (%d KB)" % (out, len(page.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
