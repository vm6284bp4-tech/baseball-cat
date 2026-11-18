> ⚠️ **參考副本**：複製自主專案資料夾 `stake-slot/shared/`，供本 repo 單獨 clone 時快速上手，**非正式來源**。原始版有更新時請手動同步。

# 審核自查清單（源自官方 `prompt.md`，條目編號 = 官方 guideline ID）

> 官方原文：`https://stake-engine.com/docs-content/prompt.md`（公開）。提交前把它下載到遊戲資料夾，用 Claude Code 跑：`claude "Follow the instructions in prompt.md and review this game."`
> 狀態：⏳ 未做　🔄 進行中　✅ 通過

## 啟動與 RGS
| ID | 要求 | 狀態 |
|---|---|---|
| 181 | 啟動時對 `rgs_url` 呼叫 `/wallet/authenticate`（host 只能來自 `rgs_url`，缺 `https://` 要補；不得硬編碼主機） | ⏳ |
| 274 | `rgs_url` 無效時顯示明確錯誤，不得繼續 | ⏳ |
| 183 | 按下注 → `/wallet/play` `{sessionID, amount, mode}` 並播放回傳的局 | ⏳ |
| 275 | 不得出現 Stake Engine 載入器/Logo | ⏳ |
| 242 | 下注額、級距、預設值**全部**來自 authenticate；不可硬編碼 | ⏳ |
| 187 | 有進行中的局時，下注額 = `round.amount`，不是預設值 | ⏳ |
| 221 | 0 倍局**不可**呼叫 end-round；有贏的局**必須**呼叫 | ⏳ |
| 222 | 餘額 < 下注（用「下注 × 模式成本」算）時**不可送出 play**，並提示玩家（空白鍵/自動玩/購買都要擋） | ⏳ |

## 合規
| ID | 要求 | 狀態 |
|---|---|---|
| 213 | 標題唯一、不含禁用詞（Megaways/XWays/Enhanced/Boosted/RTP/Gates of…/…bonanza/Olympus/Rush/Kraken/Waylanders） | ⏳ |
| 217 | 無冒犯內容、**無未成年人/兒童形象** | ⏳ |
| 253 | 與既有遊戲不近似（標題、Logo、主角/符號、美術、機制、呈現） | ⏳ |

## 前端
| ID | 要求 | 狀態 |
|---|---|---|
| 228 | 空白鍵 = 下注（`window` 監聽、`preventDefault`） | ⏳ |
| 227 | 整頁不可捲動（`html, body {margin:0; overflow:hidden; height:100%}`） | ⏳ |
| 104 | 自動玩需先開設定面板確認 | ⏳ |
| 31 | 成本 > 2× 的模式需確認（顯示成本）或「切換模式」式設計 | ⏳ |
| 107 | 靜音鈕關閉**所有**音源（含紅利、大贏） | ⏳ |
| 193/194/195 | 1024×576、手機 425×812（觸控）、Popout 400×225 與 800×450 都能玩、不重疊 | 🔄 已實作（本機測試），待 Studio 實機驗證 |
| 223 | 手機 viewport 要 `maximum-scale=1, user-scalable=no`（只有 `width=device-width` 會失敗） | ⏳ |

## 規則頁（資訊/說明）
| ID | 要求 | 狀態 |
|---|---|---|
| 25 | 各模式 **RTP** 與**最大贏分**（需與數學檔計算一致） | ⏳ |
| 24 | 每個符號各數量的賠付 | ⏳ |
| 26 | 贏分形成方式（cluster 大小、連鎖、倍率…）與實際一致 | ⏳ |
| 27 | 每個模式的說明與成本（與 index.json 一致） | ⏳ |
| 29 | 免費遊戲觸發、各數量給幾次、再觸發規則 | ⏳ |
| 235 | 操作說明涵蓋**每一個按鈕** | ⏳ |
| 185 | 通用免責聲明（全文見下） | ⏳ |
| 266 | 若顯示機率/機會，必須與數學一致 | N/A |

**通用免責聲明（官方範本）**：Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. TM and © 2026 Engine.

## 幣別
| ID | 要求 | 狀態 |
|---|---|---|
| 219 | USD、EUR、CAD、MXN、JPY（0 位小數）、USDT、BTC（6 位小數）顯示正確；**不可用 `Intl.NumberFormat` currency style 而無回退**（USDT 會丟錯）；`CA$`/`MX$`/`USDT` 不可被裁切 | ⏳ |
| 273 | < 0.01 的派彩要顯示足夠位數，不可四捨五入成 0.00 或 0.01 | ⏳ |

## 語言
| ID | 要求 | 狀態 |
|---|---|---|
| 239 | `lang=en` 全英文，無 key / `undefined` / `NaN` / `{placeholder}` | ⏳ |
| 240 | 未知語言碼（如 `zz`）回退英文，不破版 | ⏳ |

## 社交模式（`social=true`）
| ID | 要求 | 狀態 |
|---|---|---|
| 77 | 所有玩家可見文字不得含受限詞（含圖片中烘焙的文字） | ⏳ |
| 78 | `currency=XSC/XGC` 顯示 `10.00 SC/GC`，無 `$` | ⏳ |
| 225 | **模式名稱**不得含受限詞，且遊戲內/規則/重播/math 檔一致 | ⏳ |
| 188 | 重播視窗無受限詞 | ⏳ |

**受限詞 → 替換**：bet/bets/betting → play/plays/playing；buy/purchase → play；bonus buy → bonus/feature；buy bonus → get bonus；bought → instantly triggered；cash/money → coins；credit/fund → balance；currency → token；deposit → get coins；withdraw → redeem；gamble → play；pay/pays → win/wins；paid → won；paid out → win；pay out → win/won；payer → winner；place your bets → come and play；rebet → respin；stake → play amount；total bet → total play；wager → play；win feature → play feature；cost of → can be played for；at the cost of → for；**Paytable → 不可用（改叫 Symbol wins）**。

## 重播 Replay
| ID | 要求 | 狀態 |
|---|---|---|
| 171 | `replay=true&game=&version=&mode=&event=` → `GET {rgs_url}/bet/replay/...`；**不得呼叫錢包 API**；顯示 Play 鈕；結果留在畫面；無法進入真實遊玩 | 🔄 已實作（本機測試），待 Studio 實機驗證 |
| 172 | 套用 `currency`/`lang`/`amount`；**完全沒顯示下注額 = 失敗** | 🔄 已實作（本機測試），待 Studio 實機驗證 |
| 173 | 結束後可再次重播 | 🔄 已實作（本機測試），待 Studio 實機驗證 |
| 174 | 顯示下注額；成本 > 1× 的模式要顯示倍數與實際成本（`amount × costMultiplier`） | 🔄 已實作（本機測試），待 Studio 實機驗證 |
| 243 | 400×225 小視窗下重播可用 | 🔄 已實作（本機測試），待 Studio 實機驗證 |

## 其他常見被退件原因
- 建置結果不得載入任何外部主機（Google Fonts、CDN、分析）；用 `http(s)://` 搜尋建置產物
- 實際玩幾局確認「顯示贏分 = 下注 × 倍率」且與賠付表一致
- 啟動、遊玩、重播時 console 不得有錯誤；network 不得輸出遊戲資訊
- 提交前需有：3:4 遊戲圖塊（設為封面）＋ 16:9 封面圖；已發布前端版本與數學版本
