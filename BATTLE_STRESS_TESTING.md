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
2. 載入後先暖機 30 秒，再按 F3 開啟效能監視器；F3 開啟時開始新的量測區段。
3. 每個規模至少觀察 3 分鐘；另做一次 10 分鐘長時間混戰觀察。
4. 量測中可隨時按 F4 匯出 CSV；每 0.5 秒記錄 FPS、平均/P95 frame time、最大 hitch、Draw Calls、Triangles、Geometries、Textures、存活單位、AI 各行為狀態、AI 決策心跳/累積器、生產佇列、研發數、投射物、粒子、畫質、速度、文明/AI 人數及視窗尺寸。單次擷取最多保留 3,600 筆（約 30 分鐘），超出時保留最近資料。
5. 每個規模至少重跑兩次；比較時不要混用不同硬體或不同畫質設定。

## 判讀與限制

- F3 顯示即時資料；F4 匯出本次 F3 開啟後收集的逐段 CSV，不會自動上傳或跨場次保存。
- Draw Calls / Triangles 是監視器更新當下讀取的 renderer 統計，不應誤稱為整場平均值。
- 瀏覽器分頁背景節流、視窗失焦、GPU 軟體渲染會使數據失真，必須註明。
- CI 的 TypeScript、單元測試與 production build 不能取代實際瀏覽器會戰。
- AI 心跳每次呼叫決策評估器時遞增；狀態統計涵蓋 idle、moving、attacking、gathering、returning_resource、building、assembling、garrisoning。這些數字是診斷線索，不把閒置單位直接判定為卡死；若整個主迴圈同步阻塞，瀏覽器也可能無法輸出最後一筆樣本。AI 是否停滯仍須透過長時間實戰觀察。

## CI

此壓測回歸分支以 PR #53 的功能分支為基底；CI 工作流程已允許針對該整合分支的 pull request 執行驗證。

## 本次回歸測試

`npm test` 會執行規則、壓測計畫與效能 CSV 測試，涵蓋規模限制、固定 seed 可重現性、文明/AI 人格/兵種角色覆蓋、座標有效性、非法 seed 防護、欄位順序、CSV 跳脫與試算表公式注入防護。
