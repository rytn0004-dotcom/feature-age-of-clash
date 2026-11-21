# 大型會戰壓力測試

這套測試只在 Vite 開發模式啟用，不會改變一般對局。

## 啟動方式

啟動開發伺服器後，在網址加入以下參數：

- `?battleStress=100&seed=20261122`
- `?battleStress=200&seed=20261122`
- `?battleStress=400&seed=20261122`

可選擇地圖：`&map=highland_basin`、`&map=river_valley` 或 `&map=twin_lakes`。

範例：`http://localhost:3000/?battleStress=400&seed=20261122&map=highland_basin`

場景會建立四方全 AI 混戰，涵蓋 Medieval、Anime、Fantasy 三種文明，以及 easy、standard、hard、defensive 四種 AI 人格。單位配置包含近戰、遠程、騎兵、攻城與特殊兵種。固定 seed 可重現相同的初始生成計畫。

## 量測方式

1. 使用相同瀏覽器、視窗尺寸、縮放比例、地圖與 seed。
2. 載入後先暖機 30 秒，再按 F3 開啟效能監視器。
3. 每個規模至少觀察 3 分鐘；另做一次 10 分鐘長時間混戰觀察。
4. 記錄 FPS、平均 frame time、P95 frame time、最大 hitch、Draw Calls、Triangles、Geometries、Textures、存活單位、投射物與粒子數。
5. 每個規模至少重跑兩次；比較時不要混用不同硬體或不同畫質設定。

## 判讀與限制

- 目前 F3 顯示的是即時渲染與影格資料；它不是跨場次歷史資料庫。
- Draw Calls / Triangles 是監視器更新當下讀取的 renderer 統計，不應誤稱為整場平均值。
- 瀏覽器分頁背景節流、視窗失焦、GPU 軟體渲染會使數據失真，必須註明。
- CI 的 TypeScript、單元測試與 production build 不能取代實際瀏覽器會戰。
- AI 是否停滯仍須透過長時間實戰觀察；本測試計畫與回歸測試本身不構成 AI 無停滯的證明。

## 本次回歸測試

`npm test` 會同時執行既有規則測試與 `battleStress.test.ts`，驗證規模限制、固定 seed 可重現性、文明與 AI 人格覆蓋、兵種角色覆蓋、座標有效性及非法 seed 防護。
