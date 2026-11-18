"""
BASEBALL CAT —— 特色機制邏輯原型 (v0.1)

用途：
  驗證「觸發分層（3/4/5 scatter）→ 保底額度 → 對決流程（3-for-3 / 1-of-3）
  → 階梯分數 → 全通關加成」這套引擎的邏輯是否正確，確認投手(pitcher)/
  打手(batter) 兩個模式共用同一套引擎、只是參數方向相反，流程能不能跑通。

!!! 重要：本檔案所有數值（機率、分數、倍率、scatter 權重）都是隨便先填的
佔位數字，純粹讓邏輯能跑起來，完全不代表最終 RTP / 波動度，也還沒有經過
模擬優化。正式數值要等 D1（基礎符號賠付表）定案、整體進數學階段後，由
Rust 優化器重新調整。這個腳本也**不包含基礎遊戲**（還沒設計），只模擬
「已經觸發特色之後」的流程本身。

對應文件：docs/01_Design/GDD_BASEBALL_CAT_v0.1.md 第 4 節

!!! 2026-11-18 更新：GDD 第 4.3 節計分機制已改版為 v2（每關底分＋各關獨立倍數池相乘，
取代這支腳本裡「階梯分數＋全通關加成」的舊模型）。這支腳本的計分部分（ladder_scores /
clear_bonus_mult）還沒跟著重寫，先當作「對決流程/保底額度/過關判定」邏輯的參考即可，
分數計算部分請改看 GDD 第4.3節 v2。

也是透過重跑這支腳本的邏輯才發現：保底額度對打手模式（clear_rule="any"）的效果遠大於
投手模式（clear_rule="all"）——1 個保底額度對打手＝直接清掉一整位對手，對投手只墊 1 球。
用這支腳本現在的佔位機率實測，5 顆 scatter（2 個保底額度）下，打手全通關機率約 72.5%，
投手僅約 4.9%，相差約 15 倍。此問題記錄在 GDD 第6節 D6，待後續處理。

執行：python tools/baseball_cat_proto.py
"""

import random
from dataclasses import dataclass
from collections import Counter

random.seed(42)  # 固定種子，方便重跑比對、除錯

# ---------------------------------------------------------------------------
# 佔位參數（PLACEHOLDER —— 之後一定會被模擬/優化器覆蓋，現在只是邏輯測試用）
# ---------------------------------------------------------------------------

MODES = {
    "pitcher": {
        "label": "投手模式（低波動）",
        "opponents": 3,
        "pitches_per_opponent": 3,
        "clear_rule": "all",        # 3 球全中才過關這位打者
        "base_success_prob": 0.65,  # 單球基礎成功機率（佔位）
        "ladder_scores": [1.0, 1.3, 1.7],  # 第1/2/3位對手分數，階梯平緩
        "clear_bonus_mult": 1.15,          # 全通關加成，幅度小
        "skill_names": {4: "分身球", 5: "高速球"},
    },
    "batter": {
        "label": "打手模式（高波動）",
        "opponents": 3,
        "pitches_per_opponent": 3,
        "clear_rule": "any",        # 3 球內任1命中即過關這位投手
        "base_success_prob": 0.35,  # 單球基礎命中機率（佔位）
        "ladder_scores": [1.0, 3.0, 8.0],  # 第1/2/3位對手分數，階梯陡峭
        "clear_bonus_mult": 4.0,           # 全通關加成，幅度大
        "skill_names": {4: "預測球路", 5: "多重打擊"},
    },
}

# 觸發時 3/4/5 個 scatter 各自的相對權重（佔位：假設 3 最常見、5 最罕見）
TRIGGER_WEIGHTS = {3: 70, 4: 25, 5: 5}
GUARANTEED_SLOTS = {3: 0, 4: 1, 5: 2}


@dataclass
class EncounterResult:
    opponent_index: int  # 0-based
    pitches: list         # 每球結果標記："guarantee" / "random_success" / "random_fail"
    cleared: bool
    score: float


@dataclass
class RoundResult:
    mode: str
    scatter_count: int
    guaranteed_slots: int
    encounters: list
    full_clear: bool
    total_score: float


def roll_scatter_count():
    choices, weights = zip(*TRIGGER_WEIGHTS.items())
    return random.choices(choices, weights=weights, k=1)[0]


def resolve_pitch(base_prob, slots_left):
    """回傳 (是否成功, 這球的類型標記, 剩餘保底額度)。

    保底額度用掉的順序是「先到先用」（遇到的第一球開始扣），這是為了讓這個
    原型簡單好讀；正式實作順序可以不同，不影響整體機率結構（保底額度的設計
    是「總結果裡保證有N次成功」，不是「在快輸的那一刻才跳出來救」）。
    """
    if slots_left > 0:
        return True, "guarantee", slots_left - 1
    success = random.random() < base_prob
    return success, ("random_success" if success else "random_fail"), slots_left


def simulate_round(mode_key):
    cfg = MODES[mode_key]
    scatter_count = roll_scatter_count()
    slots = GUARANTEED_SLOTS[scatter_count]
    encounters = []
    total_score = 0.0
    full_clear = True

    for opp_idx in range(cfg["opponents"]):
        pitches = []
        cleared = False
        for _ in range(cfg["pitches_per_opponent"]):
            success, tag, slots = resolve_pitch(cfg["base_success_prob"], slots)
            pitches.append(tag)
            if cfg["clear_rule"] == "any" and success:
                cleared = True
                break  # 打手：命中1球即過關，不用打完剩餘球數
            if cfg["clear_rule"] == "all" and not success:
                break  # 投手：沒被救回的失敗，這個對決（也等於整輪）直接結束

        if cfg["clear_rule"] == "all":
            cleared = (
                len(pitches) == cfg["pitches_per_opponent"]
                and all(p in ("guarantee", "random_success") for p in pitches)
            )

        stage_score = cfg["ladder_scores"][opp_idx] if cleared else 0.0
        total_score += stage_score
        encounters.append(EncounterResult(opp_idx, pitches, cleared, stage_score))

        if not cleared:
            full_clear = False
            break  # 任一位對手沒過，整輪結束

    if full_clear:
        total_score *= cfg["clear_bonus_mult"]

    return RoundResult(
        mode_key, scatter_count, GUARANTEED_SLOTS[scatter_count],
        encounters, full_clear, total_score,
    )


def run_simulation(mode_key, n=200_000):
    rounds = [simulate_round(mode_key) for _ in range(n)]
    scores = [r.total_score for r in rounds]
    avg = sum(scores) / n
    variance = sum((s - avg) ** 2 for s in scores) / n
    std = variance ** 0.5
    full_clear_rate = sum(r.full_clear for r in rounds) / n
    scatter_dist = Counter(r.scatter_count for r in rounds)
    cleared_opponents = Counter(
        sum(1 for e in r.encounters if e.cleared) for r in rounds
    )

    print(f"\n=== {MODES[mode_key]['label']} ({mode_key}) — {n:,} 輪模擬（佔位數值，非最終數字）===")
    print(f"scatter 觸發分布: {dict(sorted(scatter_dist.items()))}")
    print(f"平均分數: {avg:.3f} ｜ 標準差: {std:.3f} ｜ 變異係數(std/avg): {std/avg:.2f}")
    print(f"全通關率: {full_clear_rate*100:.2f}%")
    print(f"過關對手數分布(0/1/2/3位): {dict(sorted(cleared_opponents.items()))}")
    return rounds


def print_sample_traces(mode_key, n=5):
    print(f"\n--- {MODES[mode_key]['label']} 範例流程（{n} 輪） ---")
    for i in range(n):
        r = simulate_round(mode_key)
        trace = " | ".join(
            f"對手{e.opponent_index+1}:{e.pitches}->{'過' if e.cleared else '敗'}(+{e.score:.2f})"
            for e in r.encounters
        )
        tag = "🏆全通關" if r.full_clear else "淘汰"
        print(f"[{i+1}] scatter={r.scatter_count} 保底額度={r.guaranteed_slots} | {trace} | {tag} 總分={r.total_score:.2f}")


if __name__ == "__main__":
    for mode_key in MODES:
        print_sample_traces(mode_key, n=5)
        run_simulation(mode_key, n=200_000)

    print(
        "\n(提醒：以上數字只驗證邏輯流程跑得通、方向合理，"
        "不是正式 RTP/波動度結果；基礎遊戲還沒設計，這裡只模擬「已觸發特色之後」的部分。)"
    )
