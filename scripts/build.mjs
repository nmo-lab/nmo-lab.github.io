#!/usr/bin/env node
/* ==========================================================================
   NMO-LAB · build.mjs
   把「img/ 資料夾」自動變成網站資料與可發佈的 dist/ 資料夾。

   做的事（全自動，不用手動維護清單）：
   1. 掃描 img/<系列資料夾>/ 裡的圖片，讀取同資料夾的 _series.json 補上標題、價格、連結…
   2. 沒填資料的圖片也會上架（標題取自檔名，按鈕自動變成「寄信詢問」）
   3. 讀圖片寬高（含 EXIF 轉向），讓網頁預留空間、不會跳動
   4. 若有安裝 sharp：自動壓成 1600px 與 800px 的 WebP，且「不會發佈原檔」
   5. 產生 dist/data/works.json、複製網站檔案、替 index.html 填入 SEO 清單
   6. 有 url 設定時，另外產生 sitemap.xml 與 robots.txt

   用法：node scripts/build.mjs [--strict]    （--strict：有任何警告就回報失敗）
   需求：Node 18 以上；sharp 為選配（npm install 會嘗試安裝，失敗也不影響建置）
   ========================================================================== */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'img');
const OUT = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache', 'img');
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const MAIN_PX = 1600;   // 大圖長邊
const THUMB_PX = 800;   // 縮圖長邊
const STRICT = process.argv.includes('--strict');

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const warnings = [];
const warn = (m) => warnings.push(m);

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* sharp 是選配 */ }

/* ---------- 小工具 ---------- */
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.access(p).then(() => true, () => false);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function readJSON(file, fallback) {
  try {
    return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error(`${rel(file)} 讀取失敗：${e.message}`);
  }
}
/* 檔名 → 標題：去掉副檔名與開頭編號，- _ 換空白，字首大寫 */
/* 網址用的穩定代號：小寫英數與中文，其餘換成 -（作品 id 與系列 slug 用它，換順序、改標題都不會變） */
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u3400-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const prettify = (s) =>
  s.replace(/\.[^.]+$/, '').replace(/^\d+[-_. ]+/, '').replace(/[-_]+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || s;

/* ---------- 讀圖片寬高（不用任何套件） ---------- */
function exifOrientation(b, start, end) {
  const le = b.toString('latin1', start, start + 2) === 'II';
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return 1;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 1;
}
function jpegSize(b) {
  let i = 2, orient = 1, size = null;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m === 0xe1 && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') orient = exifOrientation(b, i + 10, i + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      size = { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + len;
  }
  if (!size) return null;
  return orient >= 5 ? { width: size.height, height: size.width } : size;
}
function imageSize(b) {
  if (b.length < 30) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('latin1', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const t = b.toString('latin1', 12, 16);
    if (t === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/* ---------- 圖片處理：有 sharp 就壓縮成 WebP，沒有就原樣複製 ---------- */
const used = new Set(); // 最後只複製「真的用到」的檔案，刪掉的圖不會殘留
async function fresh(src, dst) {
  try { return (await fs.stat(dst)).mtimeMs >= (await fs.stat(src)).mtimeMs; } catch { return false; }
}
async function resize(src, dst, px) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  if (await fresh(src, dst)) {
    const dim = imageSize(await fs.readFile(dst));
    if (dim) return dim;
  }
  const info = await sharp(src).rotate()
    .resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: px > 1000 ? 82 : 78 }).toFile(dst);
  return { width: info.width, height: info.height };
}
/** relNoExt：例如 "01-harbour-studies/ne02_01"；回傳網站上的路徑與尺寸 */
async function processImage(src, relNoExt, { thumb }) {
  const orig = imageSize(await fs.readFile(src)) || {};
  if (sharp) {
    const main = `${relNoExt}.webp`;
    const dim = await resize(src, path.join(CACHE, main), MAIN_PX);
    used.add(main);
    let thumbPath = '';
    if (thumb) {
      const t = `${relNoExt}-sm.webp`;
      await resize(src, path.join(CACHE, t), THUMB_PX);
      used.add(t);
      thumbPath = `img/${t}`;
    }
    return { img: `img/${main}`, thumb: thumbPath, ...dim };
  }
  const ext = path.extname(src);
  const main = `${relNoExt}${ext}`;
  await fs.mkdir(path.dirname(path.join(CACHE, main)), { recursive: true });
  await fs.copyFile(src, path.join(CACHE, main));
  used.add(main);
  const kb = (await fs.stat(src)).size / 1024;
  if (kb > 1500 || Math.max(orig.width || 0, orig.height || 0) > 3000)
    warn(`${rel(src)} 檔案很大（${Math.round(kb)} KB, ${orig.width}×${orig.height}），而且未安裝 sharp，原檔會被公開發佈`);
  return { img: `img/${main}`, thumb: '', width: orig.width, height: orig.height };
}

/* ---------- 主流程 ---------- */
const site = await readJSON(path.join(ROOT, 'data', 'site.json'));
if (!sharp) warn('未安裝 sharp：圖片不會被壓縮，也不會產生縮圖，原檔會直接公開。請執行 npm install（見 README）');

const entries = await fs.readdir(IMG_DIR, { withFileTypes: true }).catch(() => []);
const dirs = entries.filter((d) => d.isDirectory() && !/^[._]/.test(d.name)).map((d) => d.name).sort(collator.compare);
const series = [];
const seenSlugs = new Set();
const seenIds = new Set();

for (const dir of dirs) {
  const base = path.join(IMG_DIR, dir);
  const meta = await readJSON(path.join(base, '_series.json'), {});
  if (meta.hidden) continue;
  const files = (await fs.readdir(base)).filter((f) => IMG_EXT.test(f)).sort(collator.compare);
  const listed = Object.keys(meta.works || {});
  for (const f of listed) if (!files.includes(f)) warn(`${dir}/_series.json 提到「${f}」，但資料夾裡找不到這張圖`);
  const order = [...listed.filter((f) => files.includes(f)), ...files.filter((f) => !listed.includes(f))];
  const defaults = { type: 'physical', ...(meta.defaults || {}) };
  const slug = meta.slug ? slugify(meta.slug) : slugify(dir.replace(/^\d+[-_. ]+/, ''));
  if (seenSlugs.has(slug)) warn(`${dir}: 系列代號「${slug}」與其他系列重複，請在 _series.json 加上不同的 "slug"`);
  seenSlugs.add(slug);
  if (!meta.title) warn(`${dir}/_series.json 沒有 title，改用資料夾名稱`);
  if (!meta.date) warn(`${dir}/_series.json 沒有 date（例如 "2026/06"），Archive 無法依年份分組`);

  const works = [];
  for (const f of order) {
    const m = { ...defaults, ...(meta.works?.[f] || {}) };
    if (m.hidden) continue;
    if (!listed.includes(f)) warn(`${dir}/${f} 沒有填寫資料：標題取自檔名，按鈕改為「寄信詢問」`);
    
    const out = await processImage(path.join(base, f), `${dir}/${path.parse(f).name}`, { thumb: true });
    /* 商業欄位檢查：限量版、已售、狀態、選項 */
    const label = `${dir}/${f}`;
    let id = `${slug}/${slugify(path.parse(f).name)}`;
    for (let n = 2; seenIds.has(id); n++) id = `${slug}/${slugify(path.parse(f).name)}-${n}`;
    seenIds.add(id);
    if (m.edition != null && !Number.isFinite(Number(m.edition))) warn(`${label} 的 edition 要是數字`);
    if (m.sold != null && !Number.isFinite(Number(m.sold))) warn(`${label} 的 sold 要是數字`);
    if (m.edition != null && Number(m.sold || 0) > Number(m.edition)) warn(`${label} 的 sold（${m.sold}）大於 edition（${m.edition}）`);
    if (m.status && !['available', 'sold', 'reserved'].includes(m.status)) warn(`${label} 的 status 只能是 available / sold / reserved`);
    for (const o of m.options || []) if (!o || !o.label || o.price == null) warn(`${label} 的 options 每一項都需要 label 與 price`);
    if (!m.price && !(m.options || []).length) warn(`${label} 沒有 price 也沒有 options：會顯示「Price on request」，只能寄信詢問`);
    works.push({
      id, title: m.title || prettify(f), type: m.type, price: m.price ?? '', desc: m.desc || '', spec: m.spec || '', buy: m.buy || '',
      edition: m.edition ?? null, sold: m.sold ?? 0, status: m.status || 'available', options: m.options || [], maxQty: m.maxQty ?? null,
      ...out,
    });
  }
  if (!works.length) { warn(`${dir} 裡沒有圖片，已略過`); continue; }
  series.push({ slug, title: meta.title || prettify(dir), date: meta.date || '', layout: meta.layout || 'hero', note: meta.note || '', works });
}

/* img/ 根目錄的圖片（例如 About 大圖）：處理後改寫 site.json 裡的路徑 */
const outSite = { ...site };
for (const key of ['aboutImg']) {
  const v = outSite[key];
  if (!v) continue;
  const m = v.match(/^img\/([^/]+)$/);
  const src = m && path.join(IMG_DIR, m[1]);
  if (src && IMG_EXT.test(m[1]) && (await exists(src))) {
    outSite[key] = (await processImage(src, path.parse(m[1]).name, { thumb: false })).img;
  } else if (v.startsWith('img/')) warn(`site.json 的 ${key} 指向「${v}」，但找不到這個檔案`);
}

/* ---------- 輸出 dist/ ---------- */
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, 'data'), { recursive: true });
for (const r of used) {
  await fs.mkdir(path.dirname(path.join(OUT, 'img', r)), { recursive: true });
  await fs.copyFile(path.join(CACHE, r), path.join(OUT, 'img', r));
}
await fs.cp(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
for (const f of ['favicon.ico', 'favicon.svg', 'og.jpg', 'CNAME']) {
  if (await exists(path.join(ROOT, f))) await fs.copyFile(path.join(ROOT, f), path.join(OUT, f));
}
await fs.writeFile(path.join(OUT, 'data', 'site.json'), JSON.stringify(outSite, null, 2));
await fs.writeFile(path.join(OUT, 'data', 'works.json'), JSON.stringify({ generated: new Date().toISOString(), series }, null, 2));

/* index.html：填入標題、描述，以及無 JS／搜尋引擎用的作品清單 */
let html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
const items = series.flatMap((s) => s.works.map((w) =>
  `<li>${esc(w.title)} (${esc(s.title)}${s.date ? ', ' + esc(s.date) : ''})${w.price ? ' — ' + esc(w.price) : ''}${w.buy ? ` <a href="${esc(w.buy)}">${esc(w.type)}</a>` : ''}</li>`));
const seo = `<noscript><h1>${esc(site.name)}</h1><ul>${items.join('')}</ul></noscript>`;
html = html.replace(/<!-- build:seo:start -->[\s\S]*?<!-- build:seo:end -->/,
  () => `<!-- build:seo:start -->\n${seo}\n<!-- build:seo:end -->`);
html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(site.name)}, Photography</title>`);
if (site.description) html = html.replace(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => a + esc(site.description) + b);
await fs.writeFile(path.join(OUT, 'index.html'), html);

if (site.url) {
  const base = site.url.replace(/\/$/, '');
  await fs.writeFile(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(base)}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url></urlset>\n`);
  await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

/* ---------- 報告 ---------- */
const total = series.reduce((n, s) => n + s.works.length, 0);
console.log(`✔ ${series.length} 個系列、${total} 件作品 → dist/   （圖片壓縮：${sharp ? '開' : '關，未安裝 sharp'}）`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} 個提醒：`);
  for (const w of warnings) console.log('  · ' + w);
}
if (STRICT && warnings.length) process.exit(1);
