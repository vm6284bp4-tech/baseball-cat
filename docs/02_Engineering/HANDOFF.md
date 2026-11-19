# 交接文件 HANDOFF — 棒球貓 BASEBALL CAT 前端初版

> 2026-11-19 · 給接手這個專案的團隊（企劃/PM/前端/QA）快速理解現況用。細節的開發紀錄、每個判斷為什麼這樣做、每個指令怎麼跑，都在 [`frontend/DEVLOG.md`](../../frontend/DEVLOG.md)（新的在最上面）——這份文件只整理「現在是什麼狀態、怎麼接手」，不重複 DEVLOG 的內容。

## 1. 一句話現況

企劃階段的機制設計（GDD D1–D4、D6）已定案；前端有一版**可實際互動的初版**（Step 1–4 全部完成，兩輪企劃驗收都通過），可以在本機跑起來點、切模式、觸發特色、看對決演出跟結算。**所有數值（賠付表、機率、倍數池）都是假的佔位值**，真正的數學要等 D5 進數學階段（Rust 優化器）才會有正式數字——這份前端不是在等數學，是刻意先把「玩法流程對不對、手感如何」驗證掉，換數值時幾乎不用動到流程/UI 程式碼。

## 2. 怎麼跑起來

```bash
cd frontend
pnpm install      # 若遇到 pnpm build-script approval 擋住，見 DEVLOG「pnpm/corepack setup」章節
pnpm run dev      # http://localhost:5173
pnpm test         # vitest，58 個測試
pnpm run build    # production build -> frontend/dist/
```

**環境注意**：這台機器是 Node 18.12.1（不是 Stake 官方建議的 22.16），pnpm 是用 `npm install -g pnpm` 裝的（不是 corepack，corepack 在這台機器因權限問題失敗）。細節與完整指令序列見 DEVLOG「Environment / pnpm / corepack setup」。**如果你在別台機器上重新 clone**，照 DEVLOG 那段的指令走一遍，別直接假設 `pnpm create vite@latest` 能動（Node < 20 會直接 crash）。

## 3. 架構總覽

```
frontend/src/lib/
  mockRgs/              <- 假 RGS 層（最重要，先讀這裡）
    index.js              authenticate()/play()/endRound()，公開契約 + events 陣列格式都寫在檔頭註解
    baseGame.js            普通玩法：5x5 ways-pay、Wild/Scatter 邏輯（真實規格，假數字）
    duelFeature.js         特色對決：投手(保底額度/全中3次) vs 打手(生命值/2次命中)引擎
    paytable.js            所有假數值集中在這裡（符號賠付表、輪帶、對決底分/倍數池...）
    rng.js                 可seed的PRNG + debug強制結果機制（QA test RNG工具）
  player/roundPlayer.svelte.js   事件播放狀態機（純邏輯，不含PixiJS/DOM，未來換渲染引擎不用動這層）
  gameController.svelte.js       唯一呼叫 mockRgs 的地方；之後換真的RGS只改這裡
  pixi/                 PixiJS渲染（網格、特色對決畫面），目前全是佔位色塊+文字，沒有真美術
  components/           Svelte UI外殼（下注面板/模式切換/QA debug面板）
```

**資料流**：`App.svelte` → 使用者按 SPIN → `gameController.spin()` → 呼叫 `mockRgs.play()` 拿到完整預先算好的一局結果（含 events 陣列）→ `roundPlayer` 逐一播放 events → `GameCanvas`(PixiJS) 依照 `roundPlayer` 當下狀態畫面。**前端任何地方都不自己決定輸贏**，完全照 Stake「結果預先算好、前端只播放」的平台規則設計，這是為了之後換真的 RGS 時這一層完全不用改。

## 4. 之後要換成真的 RGS 時

只要有一個東西實作出跟 `mockRgs/index.js` 檔頭註解一樣的回傳格式（`authenticate()`/`play()`/`endRound()` 的 shape、`events` 陣列的每種 `type`），把 `gameController.svelte.js` 裡 import `mockRgs` 的地方換成呼叫真的 `/wallet/authenticate`、`/wallet/play`、`/wallet/end-round` 就好——`roundPlayer`、PixiJS、所有 UI 元件都只依賴這個 events 格式，不依賴 mockRgs 內部怎麼算的。**但這個 events 格式是這個專案自己發明的（Stake 官方文件沒給出字面上的 JSON schema，只給語意），不是跟 Stake 官方 RGS Client（`github.com/engineio/ts-client`）驗證過的——真的要串接時要先核對官方 contract，不能照抄這裡的格式。**

## 5. 所有佔位值清單（進數學階段/D5 前必須全部替換）

全部在 `frontend/src/lib/mockRgs/paytable.js`：
- 普通玩法賠付表（6種符號 × 3種連線數 = 18個數字）
- 5條輪帶的符號權重/組成（目前5條共用同一套模板，只有第一軸排除Wild）
- 對決單球成功率：投手 0.65、打手 0.5
- 對決底分：投手 `[1.0, 1.3, 1.7]`、打手 `[1.0, 3.0, 8.0]`
- 對決倍數池（6個池 × 3檔 × 權重 `{5,3,2}`）
- `index.js` 裡的假起始餘額（1000.00）跟下注級距（這兩個純粹是隨便填的，不是規格）

以及 GDD 第6節 D2 的暫定最大贏分目標（投手3,000×/打手15,000×）——這是目標值不是最終數字，D5 的 Rust 優化器要把上面所有佔位值調整到同時滿足這個目標、RTP 96.0–96.7%、標準差門檻等條件。

## 6. 已知跳過/待辦的平台合規項目（不是bug，是刻意範圍外）

- Popout 尺寸（400×225/800×450）、1024×576筆電目標 — 目前畫布是固定960×700
- 多幣別格式化（JPY 0位小數、BTC 6位小數、<0.01顯示）
- 社交模式（`social=true`）受限詞檢查 — 目前UI文案沒系統性檢查過
- Replay（`replay=true`）支援
- 完整規則/說明頁（賠付表、RTP、最大贏分、按鈕說明、免責聲明）
- Autoplay（本來就沒做，之後要做要先做確認步驟）
- `pixi.js` 套件附帶的 Claude Skill 還沒 approve（`pnpm approve pixi.js`，互動式指令，不影響目前功能）

## 7. 這次的角色分工紀錄（供流程參考）

這版前端是照「PM把關＋前端開發＋企劃驗收」三角色分工做的：
- 企劃決策（D1–D6）都在 [`docs/01_Design/GDD_BASEBALL_CAT_v0.1.md`](../01_Design/GDD_BASEBALL_CAT_v0.1.md) 第6節
- 每次前端開發跟企劃驗收的往來記錄，都依時間序寫在 [`frontend/DEVLOG.md`](../../frontend/DEVLOG.md)——包含兩輪驗收報告的結論、發現的問題、PM怎麼決定、怎麼修的，全部都在那裡，不是只有「做完了」這種空泛結論

## 8. 相關文件索引

- 遊戲設計規格：[`docs/01_Design/GDD_BASEBALL_CAT_v0.1.md`](../01_Design/GDD_BASEBALL_CAT_v0.1.md)
- 開發紀錄（最詳細，遇到問題先查這裡）：[`frontend/DEVLOG.md`](../../frontend/DEVLOG.md)
- Stake 平台規則參考（非正式來源，複製自主專案）：[`shared_reference/STAKE_PLATFORM_GUIDE.md`](../../shared_reference/STAKE_PLATFORM_GUIDE.md)、[`shared_reference/APPROVAL_CHECKLIST.md`](../../shared_reference/APPROVAL_CHECKLIST.md)
- 專案總覽：[`README.md`](../../README.md)
