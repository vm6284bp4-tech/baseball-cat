/**
 * index.js — public mock-RGS API: authenticate() / play() / endRound().
 *
 * ============================================================================
 * CONTRACT — READ THIS BEFORE BUILDING THE UI LAYER (or swapping in a real RGS)
 * ============================================================================
 *
 * This module simulates what a real Stake Engine RGS would hand back from
 * `/wallet/authenticate`, `/wallet/play`, `/wallet/end-round`: a complete,
 * pre-computed round result. Per Stake's platform rules ("全部結果預先算好
 * ... RGS 不即時運算，前端不能影響輸贏" — see shared_reference/
 * STAKE_PLATFORM_GUIDE.md §3), the UI layer's only job is to PLAY BACK the
 * `events` array below, in order — it never decides outcomes itself.
 *
 * --- authenticate() return shape ---
 * {
 *   ok: true,
 *   balance: number,            // fixed-point integer, 6 decimals (1_000_000 = 1.00 unit)
 *   currency: string,           // e.g. "USD" — stubbed, real RGS derives this from launch params
 *   betLevels: number[],        // allowed bet amounts, same fixed-point integer convention
 *   modes: Array<{ name: 'pitcher'|'batter', costMultiplier: number, isDefault: boolean }>,
 *   round: { active: false, roundId: null }, // no in-flight round on fresh auth
 * }
 * costMultiplier uses the "percent of bet" integer convention from the
 * platform guide (100 = 1.00x); both modes are 1.0x per GDD §2.
 *
 * --- play() return shape (the important one) ---
 * {
 *   roundId: string,
 *   mode: 'pitcher' | 'batter',
 *   betAmount: number,              // human units, e.g. 1.5
 *   betAmountFixed: number,         // fixed-point integer (6 decimals)
 *   totalWinMultiplier: number,     // human units, e.g. 12.4 (= 12.4x bet)
 *   totalWinAmount: number,         // human units = totalWinMultiplier * betAmount
 *   totalWinAmountFixed: number,    // fixed-point integer (6 decimals)
 *   baseGame: {
 *     grid: string[][],             // grid[reelIndex][rowIndex], symbol ids from paytable.js SYMBOLS
 *     wildCells: Array<{ reel, row, form: 'single'|'expand' }>, // cosmetic only, never affects scoring
 *     scatterCount: number,
 *     wins: Array<{ symbol, length, ways, betMultiplier, winMultiplier }>,
 *     totalWinMultiplier: number,
 *     triggeredFeature: boolean,
 *   },
 *   feature: null | {              // null when the base game didn't trigger it
 *     mode, scatterCount, guaranteedSlotsAtTrigger, livesAtTrigger,
 *     events: Array<object>,       // see duelFeature.js header for per-pitch event shapes
 *     bankedBaseTotal, drawnMultipliers, finalWinMultiplier,
 *     endReason: 'full_clear' | 'early_termination',
 *     opponentsCleared, totalPitchesThrown,
 *   },
 *   // Flat, ordered event log a future UI can step through one at a time to
 *   // animate the whole round. Each event has a `type` discriminant:
 *   //   'spin_result'      -> { grid, wildCells, scatterCount }
 *   //   'base_game_win'    -> { symbol, length, ways, betMultiplier, winMultiplier }
 *   //   'scatter_trigger'  -> { scatterCount, mode, guaranteedSlotsAtTrigger, livesAtTrigger }
 *   //   'pitch'            -> (see duelFeature.js; opponentIndex, outcome, ...)
 *   //   'opponent_cleared' -> (see duelFeature.js; baseScoreAdded, drawnMultiplier, ...)
 *   //   'feature_end'      -> (see duelFeature.js; finalWinMultiplier, endReason, ...)
 *   //   'round_result'     -> { totalWinMultiplier, totalWinAmount }
 *   events: Array<{ type: string, [key: string]: any }>,
 *   debugForceApplied: object,     // echoes back whatever debugForce the caller passed, for QA visibility
 * }
 *
 * --- debugForce (passed into play()) ---
 * {
 *   seed?: number,                        // pin the PRNG seed for full reproducibility
 *   scatterCount?: 0|3|4|5,                // force the base game to land exactly this many scatters
 *   forceGrid?: string[][],                // full grid override (skips scatterCount forcing + reel spin)
 *   forceWildForms?: Record<string,'single'|'expand'>, // key "reel,row"
 *   pitchOutcomes?: boolean[],             // forces each RANDOM duel pitch outcome, in order
 * }
 * This is a deliberate manual-QA / test tool (mirrors this team's existing
 * "test RNG" / force-result pattern), not a shortcut — see rng.js header.
 *
 * --- endRound() ---
 * No-op stub. A REAL implementation must enforce the checklist rule already
 * recorded in this team's QA process: "0倍局不可呼叫 end-round；有贏的局必須
 * 呼叫" (a zero-win round must NOT call end-round; a round with any win MUST
 * call it, to settle the win with the wallet). This stub only logs a
 * warning if called in violation of that rule, so a future real-RGS swap-in
 * doesn't silently inherit a bug.
 * ============================================================================
 */

import { createRng } from './rng.js';
import * as baseGame from './baseGame.js';
import { runDuelFeature } from './duelFeature.js';
import { getScatterTriggerParams } from './paytable.js';

const FIXED_POINT_SCALE = 1_000_000; // 6 decimals, per Stake platform guide §3
const MULTIPLIER_INT_SCALE = 100; // "percent of bet" integer convention (100 = 1.00x)

export function toFixedPointAmount(amount) {
  return Math.round(amount * FIXED_POINT_SCALE);
}

export function toMultiplierInt(multiplier) {
  return Math.round(multiplier * MULTIPLIER_INT_SCALE);
}

let roundCounter = 0;
function generateRoundId() {
  roundCounter++;
  return `mock-round-${Date.now()}-${roundCounter}`;
}

/**
 * Stub for /wallet/authenticate. Shape is a best-effort reading of
 * shared_reference/STAKE_PLATFORM_GUIDE.md (§3 technical architecture, §4.3
 * front-end rules re: bet levels / balance display) — NOT verified against
 * Stake's actual RGS Client / API docs. Whoever wires up a real RGS must
 * check the official contract (`github.com/engineio/ts-client` per the
 * guide) before relying on this shape.
 */
export function authenticate() {
  return {
    ok: true,
    balance: toFixedPointAmount(1000), // fake starting balance, 1000.00 units
    currency: 'USD',
    betLevels: [0.2, 0.5, 1, 2, 5, 10, 25, 50, 100].map(toFixedPointAmount),
    modes: [
      { name: 'pitcher', costMultiplier: toMultiplierInt(1.0), isDefault: true },
      { name: 'batter', costMultiplier: toMultiplierInt(1.0), isDefault: false },
    ],
    round: { active: false, roundId: null },
  };
}

/**
 * Stub for /wallet/play — runs one full round (base game, plus the duel
 * feature if triggered) and returns the complete pre-computed result.
 *
 * @param {object} params
 * @param {'pitcher'|'batter'} [params.mode='pitcher']
 * @param {number} [params.betAmount=1]
 * @param {object} [params.debugForce] - see file header.
 */
export function play({ mode = 'pitcher', betAmount = 1, debugForce = {} } = {}) {
  if (mode !== 'pitcher' && mode !== 'batter') {
    throw new Error(`play(): unknown mode "${mode}", expected "pitcher" or "batter"`);
  }

  const rng = createRng(debugForce.seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  const spinResult = baseGame.spin(rng, {
    forceGrid: debugForce.forceGrid,
    forceScatterCount: debugForce.scatterCount,
    forceWildForms: debugForce.forceWildForms,
  });

  const triggeredFeature = Boolean(getScatterTriggerParams(spinResult.scatterCount));

  const events = [
    {
      type: 'spin_result',
      grid: spinResult.grid,
      wildCells: spinResult.wildCells,
      scatterCount: spinResult.scatterCount,
    },
    ...spinResult.wins.map((win) => ({ type: 'base_game_win', ...win })),
  ];

  let feature = null;
  if (triggeredFeature) {
    const triggerParams = getScatterTriggerParams(spinResult.scatterCount);
    events.push({
      type: 'scatter_trigger',
      scatterCount: spinResult.scatterCount,
      mode,
      guaranteedSlotsAtTrigger: triggerParams.guaranteedSlots,
      livesAtTrigger: triggerParams.lives,
    });

    feature = runDuelFeature({
      mode,
      scatterCount: spinResult.scatterCount,
      rng,
      forcePitchOutcomes: debugForce.pitchOutcomes,
    });
    events.push(...feature.events);
  }

  const totalWinMultiplier = spinResult.totalWinMultiplier + (feature ? feature.finalWinMultiplier : 0);
  const totalWinAmount = totalWinMultiplier * betAmount;

  events.push({ type: 'round_result', totalWinMultiplier, totalWinAmount });

  return {
    roundId: generateRoundId(),
    mode,
    betAmount,
    betAmountFixed: toFixedPointAmount(betAmount),
    totalWinMultiplier,
    totalWinAmount,
    totalWinAmountFixed: toFixedPointAmount(totalWinAmount),
    baseGame: {
      grid: spinResult.grid,
      wildCells: spinResult.wildCells,
      scatterCount: spinResult.scatterCount,
      wins: spinResult.wins,
      totalWinMultiplier: spinResult.totalWinMultiplier,
      triggeredFeature,
    },
    feature,
    events,
    debugForceApplied: debugForce,
  };
}

/**
 * Stub for /wallet/end-round. Real behaviour TODO once a real RGS is wired
 * up (see file header). For now: no-op, but warns on the one rule we
 * already know matters so it's not silently forgotten.
 *
 * @param {{ roundId: string, totalWinMultiplier: number }} params
 */
export function endRound({ roundId, totalWinMultiplier } = {}) {
  if (totalWinMultiplier === 0) {
    console.warn(
      `endRound(): called for round ${roundId} with totalWinMultiplier === 0. ` +
        'Per this team\'s checklist, a 0x round must NOT call end-round — only ' +
        'wins need settling. This mock is a no-op either way, but a real RGS ' +
        'integration must not make this call for 0x rounds.'
    );
  }
  return { ok: true, roundId, note: 'mock endRound() no-op — see index.js header for the real contract.' };
}
