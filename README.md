# NMO-LAB 網站

靜態網站（沒有後端、沒有資料庫），託管費用為 0。
**日常維護只有一件事：把照片丟進資料夾。** 其餘（資料、縮圖、SEO、上線）都由腳本自動處理。

## 資料夾一覽

```
nmo-lab-site/
├─ index.html            結構（只放 HTML 骨架，不放資料、不放樣式）
├─ assets/
│  ├─ style.css          外觀（顏色、字體、間距；最上面 :root 是設計變數）
│  └─ app.js             行為（畫面切換、抽屜、收藏…；不放任何作品資料）
├─ data/
│  └─ site.json          網站設定：名稱、信箱、About 文字、商品類別名稱
├─ img/                  ★ 新增作品的地方
│  ├─ photo1_2.jpg         根目錄的圖：給 About 大圖等網站用圖
│  ├─ 01-harbour-studies/  一個資料夾 = 一個系列（資料夾名稱決定排序）
│  │  ├─ _series.json        這個系列的標題、日期、各作品的價格與購買連結
│  │  └─ ne02_01.jpg …       作品圖片
│  └─ 02-after-rain/
├─ scripts/
│  ├─ build.mjs          自動建置（掃描 img/、產生資料、壓縮圖片、輸出 dist/）
│  └─ serve.mjs          本機預覽
├─ .github/workflows/deploy.yml   推到 GitHub 後自動上線（選用）
└─ package.json
```

`dist/` 是建置出來的成品，會自動產生，不需要手改，也不需要放進版本控制。

## 日常維護

### 新增一件作品（最常做）
1. 把圖片丟進對應的系列資料夾，例如 `img/01-harbour-studies/`。
2. （建議）打開該資料夾的 `_series.json`，在 `works` 裡加一行，用「圖片檔名」當 key：
   ```json
   "my-new-photo.jpg": { "title": "Fog Over Water", "price": "NT$ 3,000", "desc": "海面起霧的十分鐘。", "buy": "https://你的付款連結" }
   ```
3. 推送到 GitHub（或重新部署），網站會自動更新。

不想寫資料也可以：**只丟圖片就會上架**，標題取自檔名，價格顯示「Price on request」，按鈕自動變成「Enquire by Email」，所以不會出現壞掉的購買按鈕。

### 新增一個系列
複製一個現有的系列資料夾，改名成 `03-新系列名`（數字前綴決定排序），改寫裡面的 `_series.json`，放入圖片。

### 下架、調整順序
- 下架某張：在該作品的資料加上 `"hidden": true`（圖片不用刪）。
- 下架整個系列：在 `_series.json` 最上層加 `"hidden": true`。
- 排序：`works` 裡的先後順序就是顯示順序；沒列出的圖片會排在最後（依檔名）。系列順序看資料夾名稱。

### `_series.json` 可填的欄位

| 位置 | 欄位 | 說明 |
|---|---|---|
| 系列 | `title` | 系列名稱（不填則取資料夾名稱） |
| 系列 | `date` | 例如 `"2026/06"`；Archive 會依年份分組 |
| 系列 | `layout` | `hero`（大圖加縮圖列，預設）、`grid2`、`grid3` |
| 系列 | `note` | 專案頁點 `( + )` 展開的說明 |
| 系列 | `defaults` | 這個系列所有作品的預設值（如 `type`、`spec`、`price`） |
| 系列 | `hidden` | `true` 則整個系列不顯示 |
| 作品 | `title` `price` `desc` `spec` `buy` | 標題、價格、說明、規格、購買連結 |
| 作品 | `type` | 商品類別，預設 `physical`；也可以是你在 `site.json` 新增的類別 |
| 作品 | `price` | 可寫 `"NT$ 3,200"` 或數字 `3200`（用來計算購物袋金額） |
| 作品 | `options` | 尺寸／裝裱選項，例如 `[{"label":"A3 · Framed","price":4400}]`；有選項時顧客要先選 |
| 作品 | `edition` `sold` | 限量份數與已售出份數；剩餘份數會顯示在作品上，賣完自動變 Sold Out |
| 作品 | `status` | `available`（預設）、`reserved`（保留中）、`sold`（已售完）；保留與售完都只能寄信詢問 |
| 作品 | `maxQty` | 每筆訂單最多可買幾份 |
| 作品 | `buy` | 選填。第三方結帳連結（Gumroad、Stripe 付款連結等）；有填就多一顆「Buy Now」 |
| 作品 | `hidden` | `true` 則不顯示 |

### 新增「商品類別」（例如書、明信片）
編輯 `data/site.json` 的 `types`，加一組即可，不用改程式：
```json
"book": { "label": "Books", "btn": "Purchase Book", "ord": "Order Book" }
```
然後在作品或 `defaults` 裡寫 `"type": "book"`。

## 購物流程（零成本、沒有後端）

顧客看到的流程：**作品 → 加入購物袋（Bag）→ 結帳（Checkout）→ 訂單確認（Order）**。
這是藝術品與限量版畫常見的「訂單申請」模式：顧客送出訂單，**你確認庫存與運費後，再寄付款方式給對方**。不會有人在網站上被自動扣款，也不會超賣。

- **加入購物袋**：作品抽屜有尺寸選項、限量份數、售完狀態與運送／退換貨說明。數位商品固定一份，實體商品依剩餘份數限制數量。
- **運費**：在 `data/site.json` 的 `shipping.zones` 設定地區與費用，可設 `freeOver`（滿額免運）。純數位訂單沒有運費。
- **訂單送到哪裡**（`site.json` 的 `checkout`）：
  - `endpoint` 留空（預設）：顧客在確認頁按「Send Order by Email」，用他自己的信箱寄訂單給你。最簡單，但要靠顧客按寄出，購物袋會在按下後才清空。
  - `endpoint` 填入表單服務的網址：訂單會自動送出，你的信箱直接收到，購物袋隨即清空。可使用任何接受 JSON POST 的服務（例如 Formspree、Web3Forms，網址與必填欄位請依該服務說明；需要的金鑰放在 `extraFields`）。送出失敗時會保留購物袋並提供改用 Email。
- **付款說明**：`checkout.paymentInfo` 會顯示在確認頁（匯款帳號、PayPal 等）。**範例文字請務必換成你的實際內容**。
- **政策文字**：`site.json` 的 `policies`（運送、退換貨、真品保證）會出現在作品抽屜、結帳頁與 About。範例文字僅供參考，請依你的實際做法與當地法規調整；我不是律師。
- **立刻付款的捷徑**：作品有填 `buy` 時，抽屜會多一顆「Buy Now」，直接前往第三方結帳。Stripe 在台灣能否開通，請自行查最新規定。

### 資料存在哪裡
- **購物袋、Contact Sheet、最近訂單**都存在顧客這台裝置的瀏覽器（localStorage），重新整理或隔天再來都還在。**不會跨裝置同步，清除瀏覽資料就會消失**。
- 「Saved（印樣／Contact Sheet）」是收藏夾，不是購物車；真正結帳的是 **Bag**。Saved 可按 **Copy Link** 複製連結，在另一台裝置打開就能還原同一份選擇，也能 **Contact Sheet (PDF)** 或 **Enquire by Email**。
- 真正的訂單只存在你收到的 Email 裡。如果需要訂單管理、庫存同步，之後再升級到 Shopify、Stripe 或自架後端。
- 庫存是手動管理：賣出後把該作品的 `sold` 加一，推送後前台就會更新剩餘份數。

## 導覽設計
- 頂欄、底部導覽（含 Bag 數量）、Back 按鈕、Top 按鈕都固定在畫面上，捲動時不會消失。
- 每個畫面都有網址（`#/series/…`、`#/work/…`、`#/bag`、`#/checkout`…），所以瀏覽器的上一頁、重新整理、分享連結都有效，也會還原捲動位置。
- 點左上角的名稱回到首頁；Overview 頂部清單顯示所有系列，目前所在的較亮，點了會跳過去。

## 按鈕與版面說明（v2）

- **按鈕語意**：實心「Add to Bag」＝加入購物袋；有尺寸選項的作品顯示「Choose Option」（開啟抽屜選擇）；已在袋中顯示「In Bag · View」；售完／保留顯示灰色外框。`( + )` 只用在展開資訊（About、專案說明）。
- **看作品到買作品**：Work 專案頁、Index 格、Archive 預覽、Prints 都有同一顆購買按鈕與「Details」。
- **Prints / Digital Files 分頁**：`/#/prints/physical`、`/#/prints/digital`；分頁下方的說明文字來自 `data/site.json` 的 `types.<類別>.intro`。
- **統一圖框**：商品圖固定 4:5 框內完整顯示（不裁切），名稱、規格、價格、按鈕對齊。想改成裁切填滿，在 `site.json` 加 `"printsFit": "cover"`。
- **Saved 名稱**：預設顯示 Saved；想改回 Contact Sheet，在 `site.json` 加 `"labels": { "saved": "Contact Sheet" }`。
- **頂欄與切換列**為實心白底；頁尾只留 Newsletter、版權與時間戳記（站名、Enquiries、Instagram 在頂欄與 About 的 Contact），「↑ Top」放在頁尾右側，浮動按鈕捲到底部會自動收起。
- **Printing & Shipping** 只保留一項（在 `site.json` 的 `policies`）。

## 修改外觀與文字
- **顏色、字體、間距**：`assets/style.css` 最上面的 `:root`。
- **版面細節**：同一個檔案，依區塊排列（頂欄、Overview、Index、專案頁、Archive、Prints、About、頁尾、導覽、抽屜）。
- **網站名稱、信箱、About 文字、商品類別名稱、貨幣、運費、結帳與政策文字**：`data/site.json`。
- **頂欄高度**：`style.css` 的 `--hdh`，其他區塊都以它定位。
- **頁面固定文字**（頁尾說明、電子報文案）：`index.html`。
- **Index 格子的圖片顯示**：`site.json` 的 `gridFit`（`contain` 完整顯示／`cover` 裁切填滿）。
- **Overview 縮圖列**：`site.json` 的 `thumbsInset`（`false` 與大圖同寬／`true` 內縮）。

## 上傳前縮圖（避免 GitHub 檔案太大）

`npm run resize`：把 `img/` 裡長邊超過 2000px 或超過 3MB 的圖縮成長邊 2000px、品質 85，並移除 GPS 等 EXIF。縮之前會把原檔備份到 `originals/`（已加入 `.gitignore`，不會上傳）。檔名不變，`_series.json` 不用改；重複執行很安全。只想預覽：`npm run resize -- --dry`。TIFF 會轉成 JPG，檔名會變，腳本會提醒你同步修改 `_series.json`。


## 本機預覽
需要 Node.js 18 以上。
```bash
npm install      # 安裝 sharp（圖片自動壓縮，選配；失敗也不影響）
npm run dev      # 建置並開啟 http://localhost:8080
```
不能直接雙擊 `index.html` 開啟，因為網頁要讀取 `data/*.json`，必須透過 http。

`npm run build` 結束時會列出「提醒」，例如某張圖沒填資料、沒有購買連結、`_series.json` 提到的圖片找不到。看到就順手補上。`npm run check` 則是「有任何提醒就視為失敗」，適合想要嚴格把關時使用。

## 部署（零成本）
**推薦：Cloudflare Pages**（可連私人 repo，不限流量）
- 建立專案 → 連結 Git repo
- Build command：`npm run build`　Output directory：`dist`
- 若建置的 Node 版本太舊，在環境變數加 `NODE_VERSION` = `22`
- 之後每次 push 就會自動建置與上線

**替代：GitHub Pages**
- Repo → Settings → Pages → Source 選「GitHub Actions」，推到 `main` 即可，工作流程已附在 `.github/workflows/deploy.yml`
- 免費方案需要公開 repo；請以 GitHub 官方目前的說明為準

## 重要：原檔與數位商品
- 安裝 sharp（package.json 已指定 0.35 以上，避開舊版 libvips 的已知漏洞）後，網站只發佈 1600px 與 800px 的 WebP，**不會公開原始大圖**。沒安裝時原檔會被原樣發佈，建置時會提醒你。
- 原始高解析檔和數位商品請放在付款平台（Gumroad、Ko-fi 等），由平台在付款後交付，不要放進這個專案。
- 如果 repo 是公開的，`img/` 裡的原檔也會公開，所以請先把原圖縮到 2000px 內，或改用私人 repo 搭配 Cloudflare Pages。

## 從舊的單檔 index.html 搬過來
原本的作品資料已經轉進兩個 `_series.json`，並且用你現有的檔名當 key：
- `ne02_01.jpg`、`nn01_02.jpg`、`nn04.jpg`、`nn03_02.jpg`、`nn02_01.jpg` → 放進 `img/01-harbour-studies/`
- `c05-01.jpg`、`c02-01.jpg`、`c09-01.jpg` → 放進 `img/02-after-rain/`
- `photo1_2.jpg` → 放在 `img/` 根目錄（About 大圖）

## 已知限制
- 沒有會員帳號、沒有線上金流、沒有自動庫存；這是刻意取捨，換來零成本與零維護。
- 圖片壓縮（sharp）的程式部分，我在沒有網路的環境只用替身測過流程，真正的壓縮效果請你第一次建置後確認。
- 作品內容由 JavaScript 載入；建置時會另外寫入一份純文字清單（`<noscript>`）給無 JavaScript 的環境與搜尋引擎。
- 新增全新的版面樣式（例如 `grid4`）需要同時改 `style.css` 與 `app.js`。
