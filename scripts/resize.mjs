/* 上傳前縮圖：npm run resize
   · 掃描 img/ 底下所有 jpg / png / webp / tiff
   · 長邊超過 2000px 或檔案超過 3MB 的圖，縮成長邊 2000px、品質 85（並移除 GPS 等 EXIF，保留正確方向）
   · 縮之前，原檔會備份到 originals/（同樣的資料夾結構，不會被 git 上傳）
   · 檔名不變，所以 _series.json 不用改；已經夠小的圖會略過，重複執行很安全
   · 只想看會處理哪些：npm run resize -- --dry */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const IMG = path.join(ROOT, "img"), BAK = path.join(ROOT, "originals");
const MAX = 2000, MAX_BYTES = 3 * 1024 * 1024, DRY = process.argv.includes("--dry");

let sharp;
try { sharp = (await import("sharp")).default; }
catch { console.error("找不到 sharp。請先在專案資料夾執行：npm install"); process.exit(1); }

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
let done = 0, skipped = 0, saved = 0;

for await (const f of walk(IMG)) {
  const ext = path.extname(f).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"].includes(ext)) continue;
  const rel = path.relative(IMG, f), size = (await fs.stat(f)).size;
  const meta = await sharp(f).metadata();
  const swap = meta.orientation && meta.orientation >= 5;
  const long = Math.max(meta.width, meta.height);
  if (long <= MAX && size <= MAX_BYTES) { skipped++; continue; }
  console.log(`${DRY ? "[預覽] " : ""}${rel}  ${swap ? meta.height : meta.width}×${swap ? meta.width : meta.height}, ${mb(size)}`);
  if (DRY) { done++; continue; }
  const dest = path.join(BAK, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try { await fs.access(dest); } catch { await fs.copyFile(f, dest); }
  let img = sharp(f).rotate().resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true });
  const outExt = (ext === ".tif" || ext === ".tiff") ? ".jpg" : ext;
  img = outExt === ".png" ? img.png({ compressionLevel: 9 }) : outExt === ".webp" ? img.webp({ quality: 85 }) : img.jpeg({ quality: 85, mozjpeg: true });
  const buf = await img.toBuffer();
  const target = outExt === ext ? f : f.slice(0, -ext.length) + outExt;
  await fs.writeFile(target, buf);
  if (target !== f) { await fs.unlink(f); console.log(`  ⚠ ${rel} 已轉成 ${path.basename(target)}，請把 _series.json 裡的檔名一起改掉`); }
  saved += size - buf.length; done++;
}
console.log(DRY ? `\n預覽：${done} 張需要縮圖，${skipped} 張已經夠小。` : `\n完成：縮了 ${done} 張（省下 ${mb(saved)}），略過 ${skipped} 張。原檔備份在 originals/。`);
