/* ==========================================================================
   NMO-LAB · app.js（畫面行為與購物流程；不放任何作品資料）
   資料：data/site.json（網站設定）＋ data/works.json（作品，由 scripts/build.mjs 產生）
   結構：0 工具 → 1 設定 → 2 資料 → 3 版面（Overview/Index/專案/Archive/Prints/About）
         → 4 購物（作品抽屜/Contact Sheet/Bag/Checkout/Order）→ 5 路由與固定導覽 → 6 啟動
   網址一律用 #/路徑，所以「上一頁、重新整理、分享連結」都有效，不需要伺服器設定。
   ========================================================================== */
(function () {
const load = (u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(u + " → HTTP " + r.status); return r.json(); });
Promise.all([load("data/site.json"), load("data/works.json")])
  .then(([site, works]) => boot({ ...site, series: works.series || [] }))
  .catch((err) => {
    console.error(err);
    const p = document.createElement("p");
    p.style.cssText = "padding:96px 15px;font:14px/1.5 system-ui";
    p.textContent = "資料載入失敗（" + err.message + "）。請透過 http 開啟（例如 npm run dev），不要直接雙擊 index.html。";
    document.body.prepend(p);
  });

function boot(SHOP) {
/* ---------- 0. 工具 ---------- */
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const T = (sel, t) => { $(sel).textContent = t; };
const roman = (n) => { let r = ""; [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]].forEach(([v, s]) => { while (n >= v) { r += s; n -= v; } }); return r; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const PLUS = '(&nbsp;<span class="pl">+</span>&nbsp;)';

function ph(i, land) {
  const h = [210, 28, 150, 260, 8, 190][i % 6], w = land ? 1200 : 800, ht = land ? 800 : 1200;
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},14%,34%)"/><stop offset="1" stop-color="hsl(${h + 25},18%,74%)"/></linearGradient></defs><rect width="${w}" height="${ht}" fill="url(#g)"/><text x="${w / 2}" y="${ht / 2}" fill="#fff" fill-opacity=".8" font-family="monospace" font-size="44" text-anchor="middle">PHOTO ${i + 1}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(s);
}
function setImg(im, src, i) {
  im.classList.add("fade");
  im.onerror = () => { im.onerror = null; im.src = ph(i, i % 3 === 2); };
  im.onload = () => im.classList.add("in");
  im.src = src || ph(i, i % 3 === 2);
}

/* ---------- 1. 設定與儲存 ---------- */
const TYPES = SHOP.types && Object.keys(SHOP.types).length ? SHOP.types : {
  physical: { label: "Prints", btn: "Purchase Print", ord: "Order Print", ships: true },
  digital: { label: "Digital Files", btn: "Purchase Download", ord: "Order Download", ships: false },
};
const TYPE_KEYS = Object.keys(TYPES);
const CUR = SHOP.currency || "NT$";
const CK = Object.assign({ endpoint: "", extraFields: {}, replyWithin: "2 business days", refPrefix: "ORD", paymentInfo: "", requireTerms: true }, SHOP.checkout || {});
const ZONES = (SHOP.shipping && SHOP.shipping.zones) || [];
const POLICIES = SHOP.policies || [];
const NS = (SHOP.storageKey || "nmo-lab") + ".";
const SAVED = (SHOP.labels && SHOP.labels.saved) || "Saved";

/* 儲存在這台裝置的瀏覽器（localStorage）；被封鎖時退回記憶體，不會報錯 */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const amountOf = (p) => (typeof p === "number" ? p : Number(String(p || "").replace(/[^\d.]/g, "")) || 0);
const money = (n) => CUR + " " + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const ships = (w) => (TYPES[w.type].ships !== undefined ? !!TYPES[w.type].ships : w.type !== "digital");

/* ---------- 2. 資料模型 ---------- */
const all = [];
const model = (SHOP.series || []).filter((s) => s.works && s.works.length).map((s, si) => {
  const ts = s.works.map((w) => (TYPES[w.type] ? w.type : TYPE_KEYS[0]));
  const types = TYPE_KEYS.filter((t) => ts.includes(t));
  const slug = s.slug || slugify(s.title);
  const items = s.works.map((w, k) => {
    const type = ts[k];
    const edition = w.edition != null && w.edition !== "" ? Number(w.edition) : null;
    const sold = Number(w.sold || 0);
    const remaining = edition != null ? Math.max(0, edition - sold) : null;
    let status = ["sold", "reserved"].includes(w.status) ? w.status : "available";
    if (remaining === 0) status = "sold";
    const options = (w.options || []).filter((o) => o && o.label).map((o) => ({ label: o.label, price: amountOf(o.price), spec: o.spec || "" }));
    const base = amountOf(w.price);
    const priceLabel = w.price ? (typeof w.price === "number" ? money(w.price) : w.price)
      : options.length ? "From " + money(Math.min(...options.map((o) => o.price))) : "Price on request";
    const o = {
      ...w, type, status, edition, sold, remaining, options, base, priceLabel,
      id: w.id || `${slug}/${slugify(w.title)}-${k + 1}`,
      img: (w.imgs && w.imgs[0]) || w.img || "",
      idx: `${pad(si + 1)}.${types.indexOf(type) + 1}.${k + 1}`, no: `${si + 1}.${k + 1}`,
      sid: si, k, gi: all.length, sname: s.title, date: s.date || "", slug,
    };
    all.push(o);
    return o;
  });
  return { ...s, slug, si, types, items, num: pad(si + 1) };
});
const byId = (id) => all.find((w) => w.id === id);
const canBuy = (w) => !!w && w.status === "available" && (w.options.length ? true : w.base > 0);
const unit = (w, opt) => (w.options.length ? (w.options[opt] || w.options[0]).price : w.base);
const maxQty = (w) => (!ships(w) ? 1 : Math.max(1, Math.min(w.remaining != null ? w.remaining : 10, Number(w.maxQty) || 10)));
const statusText = (w) => (w.status === "sold" ? "Sold Out" : w.status === "reserved" ? "Reserved"
  : w.edition != null ? `Edition of ${w.edition} · ${w.remaining} remaining` : "");
const enquireURL = (w) => "mailto:" + SHOP.email + "?subject=" + encodeURIComponent("Enquiry: " + w.title + " (" + w.idx + ")");

/* 購物袋與 Contact Sheet：存在這台裝置，重新整理或隔天再來都還在 */
let bag = store.get("bag", []).filter((l) => byId(l.id) && l.qty > 0);
let folder = store.get("sheet", []).filter((id) => byId(id));
const saveBag = () => { store.set("bag", bag); updCounts(); };
const saveFolder = () => { store.set("sheet", folder); updCounts(); };
const bagCount = () => bag.reduce((n, l) => n + l.qty, 0);
const lineAmount = (l) => unit(byId(l.id), l.opt) * l.qty;
const subtotal = () => bag.reduce((n, l) => n + lineAmount(l), 0);
function shipFor(zoneId) {
  const sh = bag.filter((l) => ships(byId(l.id)));
  if (!sh.length) return { needs: false, fee: 0 };
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return { needs: true, fee: null };
  const base = sh.reduce((n, l) => n + lineAmount(l), 0);
  return { needs: true, zone, fee: zone.freeOver != null && base >= zone.freeOver ? 0 : Number(zone.fee || 0) };
}
function addToBag(w, opt) {
  const l = bag.find((x) => x.id === w.id && (x.opt || 0) === (opt || 0));
  if (l) l.qty = Math.min(maxQty(w), l.qty + 1); else bag.push({ id: w.id, opt: opt || 0, qty: 1 });
  saveBag();
  toast("Added to Bag", "View Bag", () => go("/bag"));
}

/* ---------- 3. 頂欄／頁尾／通用元件 ---------- */
document.title = SHOP.name;
T("#name", SHOP.name);
$("#mail").href = "mailto:" + SHOP.email; T("#mail", SHOP.email);
$("#nl").onsubmit = (e) => { e.preventDefault(); const m = e.target.querySelector("input").value;
  location.href = SHOP.newsletter || ("mailto:" + SHOP.email + "?subject=Subscribe&body=" + encodeURIComponent(m)); };
function clock() {
  const d = new Date(), o = { timeZone: SHOP.timezone };
  const t = d.toLocaleTimeString("en-GB", { ...o, hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
  const wd = d.toLocaleDateString("en-GB", { ...o, weekday: "long" }), day = +d.toLocaleDateString("en-GB", { ...o, day: "numeric" });
  const s = ["th", "st", "nd", "rd"][(day % 100 > 10 && day % 100 < 14) || day % 10 > 3 ? 0 : day % 10];
  T("#clock", `© ${d.getFullYear()}　${SHOP.tzLabel} ${t}, ${wd}, ${day}${s}`);
}
clock(); setInterval(clock, 30000);

let toastTimer = 0;
function toast(msg, label, fn) {
  const t = $("#toast"); t.innerHTML = "";
  t.append(el("span", "", esc(msg)));
  if (label) { const b = el("button", "up", esc(label)); b.type = "button"; b.onclick = () => { t.classList.remove("on"); fn(); }; t.append(b); }
  t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 4500);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || "Copied"); }
  catch (e) { window.prompt("Copy:", text); }
}
const mk = (w, cls, big) => {
  const im = new Image(); im.alt = w.title; im.loading = "lazy";
  if (w.width && w.height) { im.width = w.width; im.height = w.height; }
  setImg(im, big ? w.img : (w.thumb || w.img), w.gi);
  if (cls) im.className += " " + cls; return im;
};
const openWork = (w) => go("/work/" + w.id);
let qbtns = [];
const addLabel = (w) => (w.status === "sold" ? "Sold Out" : w.status === "reserved" ? "Reserved" : !canBuy(w) ? "Enquire"
  : bag.some((l) => l.id === w.id) ? "In Bag · View" : w.options.length ? "Choose Option" : "Add to Bag");
/* 有尺寸選項的作品先開抽屜選；其餘一鍵加入購物袋 */
function buyBtn(w) {
  const b = el("button", "qb"); b.type = "button"; b.dataset.id = w.id; b.textContent = addLabel(w); b.classList.toggle("off", !canBuy(w));
  b.onclick = () => { if (!canBuy(w) || w.options.length) { openWork(w); return; } if (bag.some((l) => l.id === w.id)) { go("/bag"); return; } addToBag(w, 0); };
  qbtns.push(b); return b;
}
const detailBtn = (w) => { const d = el("button", "u2 dtl", "Details"); d.type = "button"; d.onclick = () => openWork(w); return d; };
function syncBuyBtns() {
  qbtns = qbtns.filter((b) => b.isConnected);
  qbtns.forEach((b) => { const w = byId(b.dataset.id); if (w) { b.textContent = addLabel(w); b.classList.toggle("off", !canBuy(w)); } });
}

/* ---------- 4. 版面：Overview ---------- */
const ov = $("#ov");
ov.classList.toggle("flush", SHOP.thumbsInset === false);
model.forEach((s) => {
  const sec = el("section", "ov"); sec.id = "ov" + s.si;
  const open = () => go("/series/" + s.slug);
  const toWork = (w) => go("/series/" + s.slug + "?w=" + encodeURIComponent(w.id));
  if (s.layout === "grid2" || s.layout === "grid3") {
    const g = el("div", "gal g" + s.layout.slice(-1));
    s.items.forEach((w) => { const im = mk(w, null, s.layout === "grid2"); im.onclick = () => toWork(w); g.appendChild(im); });
    sec.appendChild(g);
  } else {
    const h = mk(s.items[0], null, true); h.onclick = open; sec.appendChild(h);
    if (s.items.length > 1) {
      const t = el("div", "thumbs");
      s.items.slice(1, 6).forEach((w) => { const im = mk(w); im.onclick = () => toWork(w); t.appendChild(im); });
      sec.appendChild(t);
    }
  }
  const r = el("div", "ovt", `<span class="rm">${roman(s.si + 1)}</span><button type="button" class="tt"></button>`);
  const tt = r.querySelector(".tt"); tt.textContent = s.title; tt.insertAdjacentHTML("beforeend", ' <span class="vs">View Series ↗</span>'); tt.onclick = open;
  sec.appendChild(r); ov.appendChild(sec);
});
/* ---------- Index（三欄格） ---------- */
function renderGrid() {
  const g = $("#grid"); g.innerHTML = "";
  const qj = el("nav", "qj up"); qj.setAttribute("aria-label", "Series");
  model.forEach((s) => {
    const b = el("button", "", `<span class="mono">${s.num}</span> `); b.type = "button"; b.append(s.title);
    b.onclick = () => { if (s.si === 0) scrollTo({ top: 0, behavior: "smooth" }); else document.getElementById("ix" + s.si).scrollIntoView({ behavior: "smooth" }); }; qj.appendChild(b);
  });
  g.appendChild(qj);
  model.forEach((s) => {
    const r = el("div", "row"); r.id = "ix" + s.si;
    const m = el("div", "c meta", `<span class="n mono">${s.num}</span><button type="button" class="t up"></button><ul></ul>`);
    m.querySelector(".t").textContent = s.title; m.querySelector(".t").onclick = () => go("/series/" + s.slug);
    s.types.forEach((t, k) => { const li = el("li", "", `<span class="mono">${s.num}.${k + 1}</span>`); li.append(TYPES[t].label); m.querySelector("ul").appendChild(li); });
    const y = el("li", "mute"); y.style.marginTop = "6px"; y.textContent = s.date; m.querySelector("ul").appendChild(y);
    r.appendChild(m);
    s.items.forEach((w) => {
      const c = el("div", "c btn", `<span class="n mono">${w.idx}</span>`);
      c.tabIndex = 0; c.setAttribute("role", "button");
      c.appendChild(mk(w));
      const tt = el("span", "t"); tt.textContent = w.title; c.appendChild(tt);
      c.appendChild(el("span", "cp", esc(w.status === "sold" ? "Sold Out" : w.priceLabel)));
      c.appendChild(buyBtn(w));
      c.onclick = (e) => { if (!e.target.closest(".qb")) openWork(w); }; c.onkeydown = (e) => { if (e.key === "Enter" && e.target === c) openWork(w); };
      r.appendChild(c);
    });
    for (let k = (1 + s.items.length) % 3; k && k < 3; k++) r.appendChild(el("div", "c f"));
    g.appendChild(r);
  });
}
renderGrid();
$("#grid").classList.toggle("fitcover", SHOP.gridFit === "cover");
let mode = "ovw";
function setMode(m) {
  mode = m; ov.hidden = m !== "ovw"; $("#grid").hidden = m !== "idx";
  $("#b-ovw").setAttribute("aria-pressed", m === "ovw"); $("#b-idx").setAttribute("aria-pressed", m === "idx");
}
$("#b-ovw").onclick = () => go("/"); $("#b-idx").onclick = () => go("/index");

/* ---------- 專案頁 ---------- */
let curProj = -1;
function buildProject(s) {
  curProj = s.si;
  const v = $("#v-project"); v.innerHTML = "";
  const pl = $("#pline");
  pl.innerHTML = `<span></span> <span class="sc">DATE</span> ${esc(s.date)} — Images (${s.items.length} …) <button type="button" aria-label="Info">${PLUS}</button>`;
  pl.children[0].textContent = s.title;
  if (s.note) { const n = el("p", "pnote"); n.hidden = true; n.textContent = s.note; v.appendChild(n); pl.querySelector("button").onclick = () => { n.hidden = !n.hidden; if (!n.hidden && scrollY > 120) scrollTo({ top: 0, behavior: "smooth" }); }; }
  else pl.querySelector("button").hidden = true;
  const th = el("div", "pthumbs");
  s.items.forEach((w) => {
    const f = el("figure"); f.appendChild(mk(w)); f.appendChild(el("span", "", esc(w.no)));
    f.firstChild.onclick = () => document.getElementById("pf" + w.gi).scrollIntoView({ behavior: "smooth" }); th.appendChild(f);
  });
  v.appendChild(th);
  s.items.forEach((w) => {
    const f = el("figure", "pfig"); f.id = "pf" + w.gi; f.appendChild(mk(w, null, true));
    f.firstChild.style.cursor = "pointer"; f.firstChild.onclick = () => openWork(w);
    f.appendChild(el("span", "bn", esc(w.no)));
    const cap = el("div", "pcap", '<div class="tt2"></div><div class="mute sp"></div><div class="pr"></div>');
    cap.children[0].textContent = w.title; cap.children[1].textContent = [w.spec, statusText(w)].filter(Boolean).join(" · "); cap.children[2].textContent = w.priceLabel;
    f.appendChild(cap);
    const acts = el("div", "pacts"); acts.append(buyBtn(w), detailBtn(w)); f.appendChild(acts);
    v.appendChild(f);
  });
  const sel = el("div", "sel", '<div class="up">Selected Projects</div>');
  model.forEach((x) => {
    const r = el("div", "r", `<span class="rm">${roman(x.si + 1)}</span><button type="button"></button>`);
    r.children[1].textContent = x.title; r.children[1].onclick = () => go("/series/" + x.slug); sel.appendChild(r);
  });
  v.appendChild(sel);
}

/* ---------- Archive ---------- */
const al = $("#alist"), arows = []; let ly = "";
all.forEach((w) => {
  const y = w.date.slice(0, 4);
  if (y && y !== ly) { al.appendChild(el("li", "yr", `(${y})`)); ly = y; }
  const li = el("li"), b = el("button", "", `<span class="mono"></span><span></span>`); b.type = "button";
  b.children[0].textContent = pad(w.gi + 1); b.children[1].textContent = `${w.title}, ${w.sname}, ${TYPES[w.type].label}`;
  b.onclick = () => pick(w.gi); li.appendChild(b); al.appendChild(li); arows.push(li);
});
function pick(n) {
  const w = all[n]; arows.forEach((li, k) => li.classList.toggle("on", k === n));
  T("#pv-n", `${pad(n + 1)}/${all.length}`); T("#pv-c", `${w.title}, ${w.sname}, ${w.idx}`);
  const im = $("#pv-img"); im.alt = w.title; im.onerror = () => { im.onerror = null; im.src = ph(n, n % 3 === 2); };
  im.src = (w.thumb || w.img) || ph(n, n % 3 === 2);
  T("#pv-p", [w.priceLabel, statusText(w)].filter(Boolean).join(" · "));
  const a = $("#pv-a"); a.innerHTML = ""; a.append(buyBtn(w), detailBtn(w));
}
if (all.length) pick(0);

/* ---------- Prints（商品列表）：實體相紙與數位檔分開購買 ---------- */
function printCard(w) {
  const f = el("figure"); const tile = el("div", "tile"); const im = mk(w); im.onclick = () => openWork(w); tile.appendChild(im); f.appendChild(tile);
  const c = el("figcaption", "", `<span class="bn"></span><div class="tt2"></div><div class="mute sp"></div><div class="pr"></div><div class="pacts"></div>`);
  c.children[0].textContent = w.no; c.children[1].textContent = w.title;
  c.children[2].textContent = [w.spec, statusText(w)].filter(Boolean).join(" · ");
  c.children[3].textContent = w.priceLabel;
  c.children[4].append(buyBtn(w), detailBtn(w));
  f.appendChild(c); return f;
}
const printTypes = () => TYPE_KEYS.filter((t) => all.some((w) => w.type === t));
function renderPrints(type) {
  const tabs = $("#ptabs"); tabs.innerHTML = "";
  printTypes().forEach((t) => {
    const b = el("button", "", `${esc(TYPES[t].label)} <span class="mute">(${all.filter((w) => w.type === t).length})</span>`);
    b.type = "button"; b.setAttribute("aria-pressed", t === type); b.onclick = () => go("/prints/" + t); tabs.appendChild(b);
  });
  $("#pintro").textContent = TYPES[type].intro || "";
  const L = $("#pl"); L.innerHTML = "";
  const g = el("div", "pg" + (SHOP.printsFit === "cover" ? " cover" : ""));
  all.filter((w) => w.type === type).forEach((w) => g.appendChild(printCard(w))); L.appendChild(g);
}

/* ---------- About ---------- */
(function () {
  const A = SHOP.about || { intro: "", sections: [] }, tx = $("#a-txt");
  const ai = $("#a-img"); ai.onerror = () => { ai.onerror = null; ai.src = ph(1, false); }; ai.src = SHOP.aboutImg || ph(1, false);
  const paras = (A.intro || "").split(/\n\n+/).filter(Boolean);
  paras.forEach((p, i) => { const e = el("p", i > 0 ? "more" : ""); e.textContent = p; if (i > 0) e.hidden = true; tx.appendChild(e); });
  if (paras.length > 1) {
    const b = el("button", "rd", `${PLUS} Read More`); b.type = "button";
    b.onclick = () => { const open = b.dataset.o !== "1"; b.dataset.o = open ? "1" : ""; tx.querySelectorAll(".more").forEach((p) => { p.hidden = !open; }); b.innerHTML = open ? "( Read Less )" : `${PLUS} Read More`; };
    tx.appendChild(b);
  }
  const sections = [...(A.sections || [])];
  POLICIES.forEach((p) => {
    const t = (p.title || "").toLowerCase();
    const dup = sections.some((s) => s.title && t && (s.title.toLowerCase().includes(t) || t.includes(s.title.toLowerCase())));
    if (!dup) sections.push({ title: p.title, text: p.text });
  });
  sections.forEach((S) => {
    const d = el("div", "acc", `<div class="ah"><h3></h3><button type="button">${PLUS}</button></div><div class="ab" hidden></div>`);
    d.querySelector("h3").textContent = S.title; const ab = d.querySelector(".ab");
    if (S.text) S.text.split(/\n+/).forEach((t) => { const p = el("p"); p.textContent = t; ab.appendChild(p); });
    (S.lines || []).forEach((t) => {
      const p = el("p");
      String(t).split(/(\S+@\S+\.\S+|@[\w.]+)/).forEach((part) => {
        if (/^\S+@\S+\.\S+$/.test(part)) { const a = el("a"); a.href = "mailto:" + part; a.textContent = part; p.appendChild(a); }
        else if (/^@[\w.]+$/.test(part)) { const a = el("a"); a.href = "https://instagram.com/" + part.slice(1); a.target = "_blank"; a.rel = "noopener"; a.textContent = part; p.appendChild(a); }
        else p.append(part);
      });
      ab.appendChild(p);
    });
    (S.items || []).forEach((it, i) => {
      const r = el("div", "li", `<span class="rm">${roman(i + 1)}</span>${it.url ? '<a target="_blank" rel="noopener"></a>' : "<span></span>"}`);
      const e2 = r.children[1]; e2.textContent = it.t; if (it.url) e2.href = it.url; ab.appendChild(r);
    });
    const btn = d.querySelector("button"); d.querySelector(".ah").onclick = () => { ab.hidden = !ab.hidden; btn.innerHTML = ab.hidden ? PLUS : "( Show Less )"; };
    tx.appendChild(d);
  });
})();

/* ---------- 5. 購物：作品抽屜 ---------- */
const scrim = $("#scrim");
let cur = null, sheetNav = false, sheetOpen = false;
function policiesHTML() {
  return POLICIES.map((p) => `<details><summary class="up">${esc(p.title)}</summary><p>${esc(p.text).replace(/\n/g, "<br>")}</p></details>`).join("");
}
function openSheetUI(w) {
  cur = w; sheetOpen = true;
  T("#s-idx", w.idx); T("#s-title", w.title); T("#s-desc", w.desc || "—"); T("#s-spec", w.spec || "—");
  const st = statusText(w); const sEl = $("#s-stat"); sEl.textContent = st; sEl.hidden = !st; sEl.dataset.s = w.status;
  const sel = $("#s-opt"); sel.innerHTML = "";
  w.options.forEach((o, i) => { const op = el("option"); op.value = i; op.textContent = `${o.label} — ${money(o.price)}`; sel.appendChild(op); });
  $("#s-optrow").hidden = !w.options.length;
  $("#s-pol").innerHTML = policiesHTML();
  syncSheet();
  $("#sheet").classList.add("on"); scrim.classList.add("on"); $("#sheet .cl").focus();
}
function syncSheet() {
  const w = cur; if (!w) return;
  const opt = +$("#s-opt").value || 0, buyable = canBuy(w);
  T("#s-price", w.options.length ? money(unit(w, opt)) : w.priceLabel);
  const inBag = bag.some((l) => l.id === w.id && (l.opt || 0) === opt);
  const b = $("#s-bag"); b.hidden = !buyable; b.textContent = inBag ? "View Bag" : "Add to Bag";
  const q = $("#s-enq"); q.hidden = buyable; q.href = enquireURL(w);
  q.textContent = w.status === "sold" ? "Sold Out — Enquire" : w.status === "reserved" ? "Reserved — Enquire" : "Price on Request — Enquire";
  const n = $("#s-now"); n.hidden = !(w.buy && buyable); n.href = w.buy || "#"; n.textContent = "Buy Now ↗";
  T("#s-add", folder.includes(w.id) ? SAVED + " · Remove" : "Save for Later");
}
$("#s-opt").onchange = syncSheet;
$("#s-bag").onclick = () => {
  const w = cur, opt = +$("#s-opt").value || 0;
  if (bag.some((l) => l.id === w.id && (l.opt || 0) === opt)) { go("/bag"); return; }
  addToBag(w, opt); syncSheet();
};
$("#s-add").onclick = () => { toggleFolder(cur.id); syncSheet(); };
function closeSheetUI() { sheetOpen = false; $("#sheet").classList.remove("on"); scrim.classList.remove("on"); }
function closeSheet() { if (!sheetOpen) return; if (sheetNav) { sheetNav = false; history.back(); } else { closeSheetUI(); go(baseHash.slice(1) || "/"); } }
document.querySelectorAll(".cl").forEach((b) => { b.onclick = closeSheet; });
scrim.onclick = closeSheet;
addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* ---------- Contact Sheet（收藏）：存在這台裝置，可複製連結帶到別的裝置 ---------- */
function toggleFolder(id) {
  const i = folder.indexOf(id);
  if (i < 0) { folder.push(id); toast("Saved for later", "View", () => go("/sheet")); } else folder.splice(i, 1);
  saveFolder();
}
function importSheet(r) {
  const q = r.q.get("i"); if (!q) return;
  const ids = q.split(",").filter((id) => byId(id) && !folder.includes(id));
  if (ids.length) { folder.push(...ids); saveFolder(); toast(`${ids.length} work${ids.length > 1 ? "s" : ""} added to ${SAVED}`); }
  history.replaceState(history.state, "", "#/sheet");
}
function renderSheetPage() {
  const v = $("#v-sheet"); v.innerHTML = "";
  const items = folder.map(byId).filter(Boolean);
  const inner = el("div", "shopv", `<h1 class="vh up">${esc(SAVED)} Works (${items.length})</h1>
    <p class="vnote serif">Works you save for later are kept on this device. Use Copy Link to open the same selection on another device, or download it as a contact sheet (PDF). Ready to buy? Add works to your Bag.</p>`);
  v.appendChild(inner);
  if (!items.length) {
    inner.appendChild(el("p", "vnote serif", "Nothing saved yet. Open any work and choose Save for Later."));
    const a = el("a", "buy lnk", "Browse Prints"); a.href = "#/prints"; inner.appendChild(a); return;
  }
  const act = el("div", "act tools");
  const mkb = (label, fn) => { const b = el("button", "", esc(label)); b.type = "button"; b.onclick = fn; act.appendChild(b); return b; };
  mkb("Copy Link", () => copyText(location.origin + location.pathname + "#/sheet?i=" + encodeURIComponent(folder.join(",")), "Link copied"));
  mkb("Contact Sheet (PDF)", () => printSheet(items));
  const em = el("a", "", "Enquire by Email");
  em.href = "mailto:" + SHOP.email + "?subject=" + encodeURIComponent("Enquiry about saved works") + "&body=" + encodeURIComponent(items.map((w) => `${w.idx} ${w.title} (${w.priceLabel})`).join("\n"));
  act.appendChild(em);
  mkb("Clear", () => { folder = []; saveFolder(); renderSheetPage(); });
  inner.appendChild(act);
  const g = el("div", "pg cs");
  items.forEach((w) => {
    const f = printCard(w);
    const rm = el("button", "u2", "Remove"); rm.type = "button"; rm.onclick = () => { toggleFolder(w.id); renderSheetPage(); };
    f.querySelector("figcaption").appendChild(rm); g.appendChild(f);
  });
  inner.appendChild(g);
}
function printSheet(items) {
  const P = $("#psheet"); P.innerHTML = "";
  items.forEach((w) => {
    const f = el("figure"); const im = new Image(); im.src = (w.thumb || w.img) || ph(w.gi, w.gi % 3 === 2); f.appendChild(im);
    f.appendChild(el("div", "", esc(`${w.idx}  ${w.title}`))); P.appendChild(f);
  });
  setTimeout(() => print(), 150);
}

/* ---------- 5. 購物：Bag ---------- */
function shopView(id, title) {
  const v = $(id); v.innerHTML = "";
  const inner = el("div", "shopv"); v.appendChild(inner);
  if (title) inner.appendChild(el("h1", "vh up", esc(title)));
  return inner;
}
const noteHTML = () => {
  const z = ZONES.find((x) => x.freeOver != null);
  return z ? `Free shipping to ${esc(z.label)} on prints over ${money(z.freeOver)}.` : "";
};
function renderBag() {
  bag = bag.filter((l) => canBuy(byId(l.id))); saveBag();
  const inner = shopView("#v-bag", `Bag (${bagCount()})`);
  if (!bag.length) {
    const em = el("div", "empty"); inner.appendChild(em);
    em.appendChild(el("p", "vnote serif", "Your bag is empty. Pick a print or digital file and it will wait here until you check out."));
    const act = el("div", "act");
    const a1 = el("a", "buy", "Browse Prints"); a1.href = "#/prints"; act.appendChild(a1);
    if (folder.length) { const a2 = el("a", "", `${esc(SAVED)} (${folder.length})`); a2.href = "#/sheet"; act.appendChild(a2); }
    em.appendChild(act);
    const pick = all.filter(canBuy).slice(0, 4);
    if (pick.length) { em.appendChild(el("h2", "", "Available now")); const g = el("div", "pg"); pick.forEach((w) => g.appendChild(printCard(w))); em.appendChild(g); }
    return;
  }
  const list = el("div", "bagl");
  bag.forEach((l, i) => {
    const w = byId(l.id);
    const row = el("article", "bl", `<a class="bi" href="#/work/${esc(w.id)}"></a>
      <div class="bm"><div class="bt serif"></div><div class="mute bs"></div><div class="bo"></div>
        <div class="bq"><button type="button" aria-label="Decrease">−</button><span>${l.qty}</span><button type="button" aria-label="Increase">+</button></div></div>
      <div class="bp"><div class="lp"></div><button type="button" class="u2">Remove</button></div>`);
    row.querySelector(".bi").appendChild(mk(w));
    row.querySelector(".bt").textContent = w.title;
    row.querySelector(".bs").textContent = `${w.sname} · ${TYPES[w.type].label}${w.spec ? " · " + w.spec : ""}`;
    row.querySelector(".lp").textContent = money(lineAmount(l));
    if (w.options.length) {
      const sel = el("select"); sel.setAttribute("aria-label", "Option");
      w.options.forEach((o, k) => { const op = el("option"); op.value = k; op.textContent = `${o.label} — ${money(o.price)}`; if (k === (l.opt || 0)) op.selected = true; sel.appendChild(op); });
      sel.onchange = () => {
        const nopt = +sel.value, dup = bag.find((x, j) => j !== i && x.id === l.id && (x.opt || 0) === nopt);
        if (dup) { dup.qty = Math.min(maxQty(w), dup.qty + l.qty); bag.splice(i, 1); } else l.opt = nopt;
        saveBag(); renderBag();
      };
      row.querySelector(".bo").appendChild(sel);
    }
    const [minus, plus] = row.querySelectorAll(".bq button");
    const mx = maxQty(w);
    minus.onclick = () => { if (l.qty > 1) { l.qty--; saveBag(); renderBag(); } };
    plus.onclick = () => { if (l.qty < mx) { l.qty++; saveBag(); renderBag(); } else toast(mx === 1 ? "Limited to one per order" : `Only ${mx} available`); };
    if (mx === 1) { minus.disabled = plus.disabled = true; }
    row.querySelector(".bp .u2").onclick = () => { bag.splice(i, 1); saveBag(); renderBag(); };
    list.appendChild(row);
  });
  const needsShip = bag.some((l) => ships(byId(l.id)));
  const side = el("aside", "bsum", `<h2 class="up">Order summary</h2>
    <div class="srow"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    <div class="srow mute"><span>Shipping</span><span>${needsShip ? "Calculated at checkout" : "None (digital)"}</span></div>`);
  if (needsShip && noteHTML()) side.appendChild(el("p", "vnote", noteHTML()));
  const act = el("div", "act");
  const co = el("a", "buy", "Checkout"); co.href = "#/checkout"; act.appendChild(co);
  const more = el("a", "", "Continue Browsing"); more.href = "#/prints"; act.appendChild(more);
  side.appendChild(act);
  side.appendChild(el("p", "vnote", esc(CK.requestNote || "Limited editions are held for you once your order request is confirmed. You will not be charged at this step.")));
  const wrap = el("div", "bagwrap"); wrap.append(list, side); inner.appendChild(wrap);
}

/* ---------- 5. 購物：Checkout ---------- */
const orderRef = () => {
  const d = new Date(); const s = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
  return `${CK.refPrefix}-${s}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};
function summaryHTML(zoneId) {
  const s = shipFor(zoneId), sub = subtotal();
  const rows = bag.map((l) => { const w = byId(l.id);
    return `<div class="srow"><span>${esc(w.title)}${w.options.length ? " (" + esc(w.options[l.opt || 0].label) + ")" : ""} × ${l.qty}</span><span>${money(lineAmount(l))}</span></div>`; }).join("");
  const shipTxt = !s.needs ? "None (digital)" : s.fee == null ? (ZONES.length ? "Select region" : "To be confirmed") : s.fee === 0 ? "Free" : money(s.fee);
  const total = s.fee == null ? `${money(sub)} + shipping` : money(sub + s.fee);
  return `${rows}<div class="srow"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="srow"><span>Shipping</span><span>${shipTxt}</span></div>
    <div class="srow tot"><span>Total</span><span>${total}</span></div>`;
}
const totalText = (zoneId) => { const s = shipFor(zoneId), sub = subtotal(); return s.fee == null ? `${money(sub)} + shipping` : money(sub + s.fee); };
function renderCheckout() {
  const inner = shopView("#v-checkout", "Checkout");
  const saved = store.get("customer", {});
  const needsShip = bag.some((l) => ships(byId(l.id)));
  const field = (label, name, attrs, tag) => `<label class="f"><span class="up">${label}</span>${tag === "textarea" ? `<textarea name="${name}" ${attrs || ""}>${esc(saved[name] || "")}</textarea>` : `<input name="${name}" value="${esc(saved[name] || "")}" ${attrs || ""}>`}</label>`;
  const emailMode = !CK.endpoint;
  const wrap = el("div", "co");
  wrap.innerHTML = `<details class="cosm"><summary><span>Order summary (${bagCount()})</span><span id="co-tot"></span></summary><div id="co-sum-m"></div></details>
  <form id="co" class="cof">
    <fieldset><legend class="up">1 · Contact</legend>
      ${field("Name *", "name", 'required autocomplete="name"')}
      ${field("Email *", "email", 'type="email" required autocomplete="email"')}
      ${field("Phone", "phone", 'type="tel" autocomplete="tel"')}
    </fieldset>
    ${needsShip ? `<fieldset><legend class="up">2 · Delivery</legend>
      <label class="f"><span class="up">Region *</span><select name="zone" required>
        <option value="">Select…</option>${ZONES.map((z) => `<option value="${esc(z.id)}"${saved.zone === z.id ? " selected" : ""}>${esc(z.label)}</option>`).join("")}
      </select></label>
      ${field("Address *", "address", "required autocomplete=\"street-address\" rows=\"2\"", "textarea")}
      ${field("City *", "city", 'required autocomplete="address-level2"')}
      ${field("Postal code *", "postal", 'required autocomplete="postal-code"')}
    </fieldset>` : `<fieldset><legend class="up">2 · Delivery</legend><p class="vnote serif">Digital files are delivered by email after payment is confirmed.</p></fieldset>`}
    <fieldset><legend class="up">3 · Notes</legend>
      <label class="f"><span class="up">Message (optional)</span><textarea name="note" rows="3" placeholder="Framing, gift note, deadline…"></textarea></label>
    </fieldset>
    ${CK.requireTerms && POLICIES.length ? `<label class="chk"><input type="checkbox" name="terms" required> <span>I have read the shipping and returns information.</span></label><div class="pol">${policiesHTML()}</div>` : ""}
    <div class="cosb"><h2 class="up">Order summary</h2><div id="co-sum-b"></div></div>
    <button type="submit" class="buy sub">${emailMode ? "Continue — Send by Email" : "Place Order Request"}</button>
    <p class="vnote" id="co-msg" role="status" aria-live="polite">${esc(CK.requestNote || "You will not be charged yet.")} We reply within ${esc(CK.replyWithin)} to confirm availability and send payment instructions.</p>
  </form>
  <aside class="cos"><h2 class="up">Order summary</h2><div id="co-sum"></div><a class="u2" href="#/bag">Edit Bag</a></aside>`;
  inner.appendChild(wrap);
  const form = $("#co"), sumEl = $("#co-sum");
  const upd = () => {
    const z = form.elements.zone ? form.elements.zone.value : "", h = summaryHTML(z);
    sumEl.innerHTML = h; $("#co-sum-m").innerHTML = h; $("#co-sum-b").innerHTML = h; $("#co-tot").textContent = totalText(z);
  };
  upd(); if (form.elements.zone) form.elements.zone.onchange = upd;
  form.onsubmit = (e) => { e.preventDefault(); placeOrder(form); };
}
function buildOrder(data) {
  const s = shipFor(data.zone), sub = subtotal();
  return {
    ref: orderRef(), createdAt: new Date().toISOString(), currency: CUR, sent: false,
    items: bag.map((l) => { const w = byId(l.id); const u = unit(w, l.opt);
      return { id: w.id, no: w.idx, title: w.title, series: w.sname, type: w.type, option: w.options.length ? w.options[l.opt || 0].label : "", spec: w.spec, qty: l.qty, unit: u, line: u * l.qty }; }),
    subtotal: sub, shipping: s.fee, shippingZone: s.zone ? s.zone.label : "", total: s.fee == null ? null : sub + s.fee,
    customer: { name: data.name, email: data.email, phone: data.phone || "" },
    delivery: s.needs ? { address: data.address, city: data.city, postal: data.postal, region: s.zone ? s.zone.label : "" } : null,
    note: data.note || "",
  };
}
function orderText(o) {
  const L = [`Order request ${o.ref}`, `Date: ${new Date(o.createdAt).toLocaleString("en-GB", { timeZone: SHOP.timezone })}`, "",
    `Customer: ${o.customer.name} <${o.customer.email}>${o.customer.phone ? " · " + o.customer.phone : ""}`];
  if (o.delivery) L.push(`Ship to: ${o.delivery.address}, ${o.delivery.city} ${o.delivery.postal} (${o.delivery.region})`);
  L.push("", "Items:");
  o.items.forEach((it, i) => L.push(`${i + 1}. ${it.title}${it.option ? " [" + it.option + "]" : ""} (${it.no}) × ${it.qty} — ${money(it.line)}`));
  L.push("", `Subtotal: ${money(o.subtotal)}`, `Shipping: ${o.shipping == null ? "to be confirmed" : o.shipping === 0 ? "Free" : money(o.shipping)}`,
    `Total: ${o.total == null ? money(o.subtotal) + " + shipping" : money(o.total)}`);
  if (o.note) L.push("", `Note: ${o.note}`);
  return L.join("\n");
}
const mailtoOrder = (o) => "mailto:" + SHOP.email + "?subject=" + encodeURIComponent(`Order request ${o.ref}`) + "&body=" + encodeURIComponent(orderText(o));
function saveOrder(o) {
  const list = store.get("orders", []).filter((x) => x.ref !== o.ref); list.unshift(o); store.set("orders", list.slice(0, 10));
}
async function placeOrder(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const o = buildOrder(data), btn = form.querySelector(".sub"), msg = $("#co-msg");
  store.set("customer", { name: data.name, email: data.email, phone: data.phone || "", zone: data.zone || "", address: data.address || "", city: data.city || "", postal: data.postal || "" });
  if (!CK.endpoint) { saveOrder(o); go("/order/" + o.ref); return; }   // 無後端：到確認頁，由顧客按一下寄出 Email
  btn.disabled = true; msg.textContent = "Sending…";
  try {
    const res = await fetch(CK.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...CK.extraFields, subject: `Order request ${o.ref}`, _subject: `Order request ${o.ref}`, name: o.customer.name, email: o.customer.email, message: orderText(o), order: o }) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    o.sent = true; saveOrder(o); bag = []; saveBag(); go("/order/" + o.ref);
  } catch (err) {
    console.error(err); btn.disabled = false;
    msg.innerHTML = `We could not send your request automatically. <a class="u2" href="${esc(mailtoOrder(o))}">Send it by email instead</a>.`;
  }
}

/* ---------- 5. 購物：Order 確認頁 ---------- */
function renderOrder(ref) {
  const o = store.get("orders", []).find((x) => x.ref === ref);
  const inner = shopView("#v-order", o ? (o.sent ? "Order request received" : "One last step") : "Order not found");
  if (!o) {
    inner.appendChild(el("p", "vnote serif", "We could not find this order on this device."));
    const a = el("a", "buy lnk", "Back to Work"); a.href = "#/"; inner.appendChild(a); return;
  }
  inner.appendChild(el("p", "ref mono", esc(o.ref)));
  inner.appendChild(el("p", "vnote serif", o.sent
    ? `Thank you, ${esc(o.customer.name)}. A copy of this request is kept on this device. We will email ${esc(o.customer.email)} within ${esc(CK.replyWithin)}.`
    : "Your order request is ready. Send it by email so we can confirm availability and reply with payment instructions."));
  if (!o.sent) {
    const act = el("div", "act");
    const send = el("a", "buy", "Send Order by Email"); send.href = mailtoOrder(o);
    send.onclick = () => { o.sent = true; saveOrder(o); bag = []; saveBag(); setTimeout(() => renderOrder(ref), 400); };
    const cp = el("button", "", "Copy Order Summary"); cp.type = "button"; cp.onclick = () => copyText(orderText(o), "Order summary copied");
    act.append(send, cp); inner.appendChild(act);
  }
  inner.appendChild(el("pre", "ordtxt", esc(orderText(o))));
  const steps = el("ol", "steps serif", `<li>We confirm availability and the final shipping cost.</li><li>You receive payment instructions${CK.paymentInfo ? "" : " by email"}.</li><li>${o.items.some((i) => i.type !== "digital") ? "We pack and ship your order, or send your digital files." : "We send your digital files after payment."}</li>`);
  inner.appendChild(steps);
  if (CK.paymentInfo) inner.appendChild(el("div", "vnote", `<div class="up mute">Payment</div>${esc(CK.paymentInfo).replace(/\n/g, "<br>")}`));
  const act2 = el("div", "act"); const a1 = el("a", "", "Continue Browsing"); a1.href = "#/"; act2.appendChild(a1); inner.appendChild(act2);
}

/* ---------- 6. 路由與固定導覽（Header / Back / Dock / Top 永遠可見） ---------- */
const VIEWS = ["work", "project", "archive", "prints", "about", "sheet", "bag", "checkout", "order"];
const TITLES = { "": "Work", index: "Index", archive: "Archive", prints: "Prints", about: "About", sheet: "Saved", bag: "Bag", checkout: "Checkout", order: "Order" };
let curKey = null, baseHash = "#/", navFlag = false, depth = 0, curTop = "";
const scrollMap = {};
history.scrollRestoration = "manual";

function parse(h) {
  h = String(h || "").replace(/^#/, ""); if (h[0] !== "/") h = "/" + h;
  const i = h.indexOf("?"), path = i < 0 ? h : h.slice(0, i);
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  return { parts: path.split("/").filter(Boolean).map(dec), q: new URLSearchParams(i < 0 ? "" : h.slice(i + 1)), path };
}
function go(path) {
  const h = "#" + path;
  navFlag = true;
  if (location.hash === h || (path === "/" && (location.hash === "" || location.hash === "#"))) { navFlag = false; showBase(parse(h), true); return; }
  location.hash = h;
}
function onRoute() {
  $("#toast").classList.remove("on");
  const wasNav = navFlag; navFlag = false;
  depth = wasNav ? depth + 1 : ((history.state && history.state.d) || 0);
  if (wasNav) history.replaceState({ d: depth }, "");
  const r = parse(location.hash);
  if (r.parts[0] === "work") { showWork(r.parts.slice(1).join("/"), wasNav); return; }
  if (sheetOpen) closeSheetUI();
  showBase(r, wasNav);
}
function showWork(id, wasNav) {
  const w = byId(id); if (!w) { location.replace("#/"); return; }
  if (curKey === null) showBase({ parts: ["series", w.slug], q: new URLSearchParams("w=" + encodeURIComponent(w.id)), path: "/series/" + w.slug }, true);
  sheetNav = wasNav; openSheetUI(w);
  document.title = w.title + " — " + SHOP.name;
}
function showBase(r, fresh) {
  const top = r.parts[0] || "";
  const key = top === "series" || top === "order" || top === "prints" ? top + ":" + (r.parts[1] || "") : top === "" ? "work:ovw" : top === "index" ? "work:idx" : top;
  if (curKey && curKey !== key) scrollMap[curKey] = scrollY;
  const same = key === curKey;
  let view = top;
  switch (top) {
    case "": case "index": view = "work"; setMode(top === "index" ? "idx" : "ovw"); break;
    case "series": { const s = model.find((x) => x.slug === r.parts[1]); if (!s) { location.replace("#/"); return; }
      view = "project"; if (!same || curProj !== s.si) buildProject(s); break; }
    case "prints": renderPrints(TYPES[r.parts[1]] && printTypes().includes(r.parts[1]) ? r.parts[1] : printTypes()[0] || TYPE_KEYS[0]); break;
    case "archive": case "about": break;
    case "sheet": view = "sheet"; importSheet(r); renderSheetPage(); break;
    case "bag": renderBag(); break;
    case "checkout": if (!bag.length) { location.replace("#/bag"); return; } renderCheckout(); break;
    case "order": renderOrder(r.parts[1]); break;
    default: location.replace("#/"); return;
  }
  VIEWS.forEach((x) => { $("#v-" + x).hidden = x !== view; });
  curKey = key; curTop = top; baseHash = top === "sheet" ? "#/sheet" : "#" + r.path + (r.q.toString() ? "?" + r.q.toString() : "");
  chrome(top, r);
  const wid = r.q.get("w"), target = wid && byId(wid);
  requestAnimationFrame(() => {
    if (top === "series" && target && (!same || fresh)) { const t = document.getElementById("pf" + target.gi); if (t) { t.scrollIntoView(); return; } }
    if (same && !fresh) return;
    if (!fresh && scrollMap[key] != null) scrollTo(0, scrollMap[key]); else scrollTo(0, 0);
  });
}
const PARENT = { series: "/", sheet: "/", bag: "/prints", checkout: "/bag", order: "/" };
function chrome(top, r) {
  $("#ctr").hidden = !(top === "" || top === "index");
  document.querySelector("footer").hidden = ["bag", "checkout", "order"].includes(top);
  $("#pline").hidden = top !== "series";
  const showBack = top in PARENT; $("#back").hidden = !showBack;
  const tab = top === "" || top === "index" || top === "series" ? "work" : ["bag", "checkout", "order"].includes(top) ? "bag" : top;
  document.querySelectorAll("#dock button").forEach((b) => { if (b.dataset.k === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  let t = TITLES[top] || SHOP.name;
  if (top === "series") { const s = model.find((x) => x.slug === r.parts[1]); t = s ? s.title : t; }
  document.title = top === "" ? SHOP.name : t + " — " + SHOP.name;
  onScroll();
}
$("#back").onclick = () => { if (depth > 0) history.back(); else go(PARENT[curTop] || "/"); };
$("#name").onclick = (e) => { e.preventDefault(); if (sheetOpen) closeSheetUI(); go("/"); };
/* 站內連結一律走 go()，讓「返回」與捲動位置還原維持一致 */
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (a && !e.defaultPrevented && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (sheetOpen) closeSheetUI(); go(a.getAttribute("href").slice(1)); }
});
addEventListener("hashchange", onRoute);

/* Dock：永遠固定在畫面底部 */
const TABS = [["work", "Work", "/"], ["archive", "Archive", "/archive"], ["prints", "Prints", "/prints"], ["about", "About", "/about"], ["bag", "Bag", "/bag"]];
const dock = $("#dock");
TABS.forEach(([k, l, p], i) => {
  const b = el("button"); b.type = "button"; b.dataset.k = k; b.dataset.l = l;
  b.onclick = () => { if (sheetOpen) closeSheetUI(); go(p); }; dock.appendChild(b);
});
$("#f-top").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
document.querySelectorAll(".fbtn").forEach((b) => { b.onclick = () => go("/sheet"); });
function updCounts() {
  document.querySelectorAll(".fbtn").forEach((b) => { b.textContent = `${SAVED} (${folder.length})`; });
  dock.querySelectorAll("button").forEach((b) => { b.textContent = b.dataset.k === "bag" ? `Bag (${bagCount()})` : b.dataset.l; b.classList.toggle("has", b.dataset.k === "bag" && bagCount() > 0); });
  syncBuyBtns();
  if (sheetOpen) syncSheet();
}

/* 回到頂端 */
const topBtn = $("#top");
function onScroll() {
  const nearBottom = scrollY + innerHeight > document.documentElement.scrollHeight - 220;
  topBtn.classList.toggle("on", scrollY > 500 && !nearBottom);   // 捲到頁尾就收起，不蓋住頁尾文字
}
let tk = false;
addEventListener("scroll", () => { if (!tk) { tk = true; requestAnimationFrame(() => { tk = false; onScroll(); }); } }, { passive: true });
topBtn.onclick = () => scrollTo({ top: 0, behavior: "smooth" });

/* ---------- 啟動 ---------- */
updCounts();
if (!location.hash || location.hash === "#") history.replaceState({ d: 0 }, "");
onRoute();
}
})();
