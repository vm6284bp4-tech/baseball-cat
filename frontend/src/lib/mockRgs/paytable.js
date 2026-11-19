/**
 * paytable.js — all placeholder numeric tables for 棒球貓 BASEBALL CAT.
 *
 * ⚠️ EVERY NUMBER IN THIS FILE IS A PLACEHOLDER. None of it is tuned for a
 * real RTP target (GDD target: 96.30% per mode, 96.0–96.7% hard range per
 * Stake's rules). Real numbers come later from the math-SDK workstream
 * (GDD §6, item D5) using simulation + the Rust optimizer. Do not treat
 * anything here as production-ready — it exists only so the mechanic is
 * fully wired up and testable end to end.
 *
 * Source spec: docs/01_Design/GDD_BASEBALL_CAT_v0.1.md (§3 base game
 * symbols/paytable, §4 duel feature) as handed down by the PM for this task.
 */

// ---------------------------------------------------------------------------
// Symbol catalog
// ---------------------------------------------------------------------------

/** @typedef {'wild'|'scatter'|'high'|'low'} SymbolCategory */

export const SYMBOLS = {
  WILD: 'WILD', // 主角貓 (Wild) — substitutes for all 8 paytable symbols, not Scatter
  SCATTER: 'SCATTER', // 棒球 (貓掌印) — no payout, triggers Bonus Game on 3/4/5
  HIGH_OPP3: 'HIGH_OPP3', // 第三關對手貓 — highest-paying high symbol
  HIGH_OPP2: 'HIGH_OPP2', // 第二關對手貓
  HIGH_OPP1: 'HIGH_OPP1', // 第一關對手貓
  HIGH_BAT: 'HIGH_BAT', // 球棒 — lowest-paying high symbol
  LOW_JERSEY: 'LOW_JERSEY', // 球衣 — tied with glove (higher low pair)
  LOW_GLOVE: 'LOW_GLOVE', // 手套 — tied with jersey
  LOW_BASE: 'LOW_BASE', // 壘包 — tied with cap (lower low pair)
  LOW_CAP: 'LOW_CAP', // 棒球帽 — tied with base
};

/** Human-readable (Traditional Chinese) names, for debug logs / future UI labels. */
export const SYMBOL_NAMES = {
  [SYMBOLS.WILD]: '主角貓 (Wild)',
  [SYMBOLS.SCATTER]: '棒球 (Scatter)',
  [SYMBOLS.HIGH_OPP3]: '第三關對手貓',
  [SYMBOLS.HIGH_OPP2]: '第二關對手貓',
  [SYMBOLS.HIGH_OPP1]: '第一關對手貓',
  [SYMBOLS.HIGH_BAT]: '球棒',
  [SYMBOLS.LOW_JERSEY]: '球衣',
  [SYMBOLS.LOW_GLOVE]: '手套',
  [SYMBOLS.LOW_BASE]: '壘包',
  [SYMBOLS.LOW_CAP]: '棒球帽',
};

/** @type {Record<string, SymbolCategory>} */
export const SYMBOL_CATEGORY = {
  [SYMBOLS.WILD]: 'wild',
  [SYMBOLS.SCATTER]: 'scatter',
  [SYMBOLS.HIGH_OPP3]: 'high',
  [SYMBOLS.HIGH_OPP2]: 'high',
  [SYMBOLS.HIGH_OPP1]: 'high',
  [SYMBOLS.HIGH_BAT]: 'high',
  [SYMBOLS.LOW_JERSEY]: 'low',
  [SYMBOLS.LOW_GLOVE]: 'low',
  [SYMBOLS.LOW_BASE]: 'low',
  [SYMBOLS.LOW_CAP]: 'low',
};

/** The 8 symbols that participate in ways-pay evaluation (everything except Wild/Scatter). */
export const PAYABLE_SYMBOLS = [
  SYMBOLS.HIGH_OPP3,
  SYMBOLS.HIGH_OPP2,
  SYMBOLS.HIGH_OPP1,
  SYMBOLS.HIGH_BAT,
  SYMBOLS.LOW_JERSEY,
  SYMBOLS.LOW_GLOVE,
  SYMBOLS.LOW_BASE,
  SYMBOLS.LOW_CAP,
];

// ---------------------------------------------------------------------------
// Ways-pay table — placeholder multipliers of TOTAL BET, per matching way.
// ---------------------------------------------------------------------------
// GDD §3 only gives a relative payout ORDER (OPP3 > OPP2 > OPP1 > BAT >
// JERSEY=GLOVE > BASE=CAP); the actual numbers below are placeholders this
// task invented to realize that order, loosely modelled on typical ways-pay
// slot paytables. Flagged for D5 re-calibration.
export const WAYS_PAYTABLE = {
  [SYMBOLS.LOW_CAP]: { 3: 0.1, 4: 0.2, 5: 0.4 },
  [SYMBOLS.LOW_BASE]: { 3: 0.1, 4: 0.2, 5: 0.4 },
  [SYMBOLS.LOW_GLOVE]: { 3: 0.15, 4: 0.3, 5: 0.6 },
  [SYMBOLS.LOW_JERSEY]: { 3: 0.15, 4: 0.3, 5: 0.6 },
  [SYMBOLS.HIGH_BAT]: { 3: 0.3, 4: 0.6, 5: 1.2 },
  [SYMBOLS.HIGH_OPP1]: { 3: 0.5, 4: 1.0, 5: 2.0 },
  [SYMBOLS.HIGH_OPP2]: { 3: 0.8, 4: 1.6, 5: 3.2 },
  [SYMBOLS.HIGH_OPP3]: { 3: 1.2, 4: 2.5, 5: 5.0 },
};

// ---------------------------------------------------------------------------
// Reel strips — 5 reels x 5 visible rows, fixed strips (not Megaways).
// ---------------------------------------------------------------------------
// Placeholder weighting: low symbols common, high symbols rarer, Wild rare,
// and — DELIBERATELY, as a testing convenience, NOT realistic math — Scatter
// is weighted higher than any real game would ship, so a human manually
// clicking "spin" sees the Bonus Game trigger within a reasonable number of
// spins rather than hundreds. This is documented here and in DEVLOG.md; D5
// will replace these strips entirely with optimizer output.
//
// Two structural rules, now part of the GDD (§3, 2026-11-19 PM decision),
// not just this placeholder layer — enforced directly in the strip content
// below so they hold for every future reel-strip revision too, not just as
// a runtime guard:
//   1. Scatter appears AT MOST ONCE per reel strip (so a spin can land at
//      most 1 scatter per reel, i.e. at most 5 total across the grid — "one
//      per axis"). This replaces the earlier runtime clamp
//      (`getScatterTriggerParams`, still kept as defense-in-depth) with a
//      structural guarantee that 6+ scatters can never occur from a natural
//      spin at all.
//   2. Reel 1 (reelIndex 0, leftmost) NEVER contains Wild. Since ways
//      evaluation requires reel 0 to match-or-be-wild for a symbol to pay at
//      all, banning Wild there bounds how many *distinct* symbols can pay
//      simultaneously to at most 5 (reel 0's row count) instead of being
//      able to hit all 8 just because reel 0 happened to be entirely Wild.
//      This directly addresses the review finding about all-Wild runs
//      stacking every symbol's payout at once.
//
// Built by repeating each symbol `weight` times, in a fixed hand-arranged
// (not shuffled-at-runtime) order — reel strip *content* is static; the only
// randomness at spin time is which stop index each reel starts from.
const STRIP_SYMBOL_WEIGHTS = [
  [SYMBOLS.WILD, 1],
  [SYMBOLS.SCATTER, 1], // <-- exactly 1 per strip, see rule 1 above (was 2)
  [SYMBOLS.HIGH_OPP3, 1],
  [SYMBOLS.HIGH_OPP2, 1],
  [SYMBOLS.HIGH_OPP1, 2],
  [SYMBOLS.HIGH_BAT, 3],
  [SYMBOLS.LOW_JERSEY, 4],
  [SYMBOLS.LOW_GLOVE, 4],
  [SYMBOLS.LOW_BASE, 5],
  [SYMBOLS.LOW_CAP, 5],
];

function buildPlaceholderStrip({ excludeWild = false } = {}) {
  /** @type {string[]} */
  const strip = [];
  for (const [symbol, weight] of STRIP_SYMBOL_WEIGHTS) {
    if (excludeWild && symbol === SYMBOLS.WILD) continue; // rule 2 above
    for (let i = 0; i < weight; i++) strip.push(symbol);
  }
  // Interleave with a fixed round-robin-ish shuffle so identical symbols
  // aren't clumped together on the strip. Deterministic (no RNG involved) —
  // same strip every time the module loads.
  const interleaved = [];
  const buckets = [...strip];
  let offset = 0;
  while (buckets.length) {
    const idx = offset % buckets.length;
    interleaved.push(buckets[idx]);
    buckets.splice(idx, 1);
    offset += 7; // arbitrary odd stride, just to avoid obvious clumping
  }
  return interleaved;
}

// All 5 reels share the same placeholder strip shape EXCEPT reel 0, which
// drops Wild entirely (rule 2 above). A real math pass would very likely
// give each reel its own independently-tuned strip; sharing one template
// (minus reel 0's Wild) is a deliberate simplification for this placeholder
// layer, not a final design.
export const REEL_STRIPS = [0, 1, 2, 3, 4].map((reelIndex) =>
  buildPlaceholderStrip({ excludeWild: reelIndex === 0 })
);

export const GRID_REELS = 5;
export const GRID_ROWS = 5;

// ---------------------------------------------------------------------------
// Bonus Game ("獎金遊戲") duel feature config
// ---------------------------------------------------------------------------

/**
 * Scatter count -> bonus parameter, per mode. (GDD §4.1 table.)
 * pitcher: guaranteedSlots (保底額度). batter: lives (生命值).
 */
export const SCATTER_TRIGGER_TABLE = {
  3: { guaranteedSlots: 0, lives: 0 },
  4: { guaranteedSlots: 1, lives: 1 },
  5: { guaranteedSlots: 2, lives: 2 },
};

/**
 * Look up trigger params for a given scatter count, clamping to the 5-tier.
 * GDD §4.1 only defines 3/4/5; the grid is 5x5 so 6+ scatters is a real
 * (if rare/forced) edge case. A raw lookup would silently return undefined
 * and the feature would fail to trigger at all despite MORE scatters landing
 * than the 5 tier — the opposite of intended ("more scatters = stronger
 * trigger"). Clamping to 5 treats 6+ the same as 5 rather than worse.
 */
export function getScatterTriggerParams(scatterCount) {
  return SCATTER_TRIGGER_TABLE[Math.min(scatterCount, 5)] ?? null;
}

/** Placeholder base success probabilities — flagged fake/needs-recalibration (GDD D5/D6). */
export const DUEL_BASE_SUCCESS_PROB = {
  pitcher: 0.65,
  batter: 0.5,
};

/** Pitches needed to clear one opponent, per mode. */
export const DUEL_PITCHES_TO_CLEAR_OPPONENT = {
  pitcher: 3, // all-of-3 (every pitch must succeed)
  batter: 2, // first-to-2 successes
};

export const DUEL_OPPONENT_COUNT = 3;

/**
 * Placeholder base scores + multiplier pools per opponent position (index
 * 0/1/2 = 1st/2nd/3rd opponent), per mode. Feeds D2's eventual max-win
 * target but is NOT tuned to it yet — see GDD §4.3 / §6 D2/D5.
 *
 * Multiplier pool weights are chosen so the lowest value in each pool is
 * heaviest (small wins common, big wins rare), per spec.
 */
export const DUEL_SCORING = {
  pitcher: {
    // flatter, low-volatility shape
    baseScores: [1.0, 1.3, 1.7],
    multiplierPools: [
      [
        { value: 1, weight: 5 },
        { value: 1, weight: 3 },
        { value: 1.2, weight: 2 },
      ],
      [
        { value: 1, weight: 5 },
        { value: 1.2, weight: 3 },
        { value: 1.5, weight: 2 },
      ],
      [
        { value: 1, weight: 5 },
        { value: 1.5, weight: 3 },
        { value: 2, weight: 2 },
      ],
    ],
  },
  batter: {
    // steeper, high-volatility shape
    baseScores: [1.0, 3.0, 8.0],
    multiplierPools: [
      [
        { value: 1, weight: 5 },
        { value: 1.5, weight: 3 },
        { value: 3, weight: 2 },
      ],
      [
        { value: 1, weight: 5 },
        { value: 2, weight: 3 },
        { value: 5, weight: 2 },
      ],
      [
        { value: 1, weight: 5 },
        { value: 3, weight: 3 },
        { value: 10, weight: 2 },
      ],
    ],
  },
};
