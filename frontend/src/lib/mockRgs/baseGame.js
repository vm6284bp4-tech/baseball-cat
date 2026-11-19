/**
 * baseGame.js — 5x5 fixed-reel ways-pay base game spin + evaluation.
 *
 * Grid addressing convention used throughout this file and its callers:
 *   grid[reelIndex][rowIndex], reelIndex/rowIndex both 0-based, 0..4.
 *   reelIndex 0 is the leftmost reel (ways runs start here, per spec).
 *
 * All payout numbers come from paytable.js and are explicit placeholders.
 */

import {
  SYMBOLS,
  PAYABLE_SYMBOLS,
  WAYS_PAYTABLE,
  REEL_STRIPS,
  GRID_REELS,
  GRID_ROWS,
} from './paytable.js';

/**
 * Spin the base game grid.
 *
 * @param {import('./rng.js').createRng extends (...a: any) => infer R ? R : never} rng
 * @param {{
 *   forceGrid?: string[][],          // full [reel][row] override, skips strip spinning entirely
 *   forceScatterCount?: 0|3|4|5,     // adjust the generated grid to land exactly this many scatters
 *                                    // (ignored if forceGrid is also provided — forceGrid wins outright,
 *                                    // its own scatter count is whatever the caller put in it)
 *   forceWildForms?: Record<string, 'single'|'expand'>, // key "reel,row" -> forced form
 * }} [debugForce]
 * @returns {{
 *   grid: string[][],
 *   wildCells: Array<{ reel: number, row: number, form: 'single'|'expand' }>,
 *   scatterCount: number,
 *   wins: Array<{ symbol: string, length: number, ways: number, betMultiplier: number, winMultiplier: number }>,
 *   totalWinMultiplier: number, // sum of all wins' winMultiplier (multiplier of total bet)
 * }}
 */
export function spin(rng, debugForce = {}) {
  const grid = debugForce.forceGrid
    ? cloneGrid(debugForce.forceGrid)
    : generateGrid(rng);

  if (!debugForce.forceGrid && debugForce.forceScatterCount !== undefined) {
    forceScatterCount(grid, rng, debugForce.forceScatterCount);
  }

  const wildCells = resolveWildForms(grid, rng, debugForce.forceWildForms);
  const scatterCount = countScatters(grid);
  const wins = evaluateWays(grid);
  const totalWinMultiplier = wins.reduce((sum, w) => sum + w.winMultiplier, 0);

  return { grid, wildCells, scatterCount, wins, totalWinMultiplier };
}

/** Deep-clone a grid so callers' forceGrid arrays are never mutated by forceScatterCount etc. */
function cloneGrid(grid) {
  return grid.map((reel) => [...reel]);
}

/** Generate a grid by spinning each reel strip to a random stop and reading 5 consecutive symbols. */
function generateGrid(rng) {
  const grid = [];
  for (let reelIndex = 0; reelIndex < GRID_REELS; reelIndex++) {
    const strip = REEL_STRIPS[reelIndex];
    const stop = rng.nextInt(strip.length);
    const column = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      column.push(strip[(stop + row) % strip.length]);
    }
    grid.push(column);
  }
  return grid;
}

function countScatters(grid) {
  let count = 0;
  for (const reel of grid) {
    for (const cell of reel) {
      if (cell === SYMBOLS.SCATTER) count++;
    }
  }
  return count;
}

/**
 * Adjust `grid` in place so it has exactly `targetCount` scatters (used by
 * the debugForce.forceScatterCount manual-QA / test override). Only ever
 * touches non-Wild cells, since Wild never co-exists with Scatter duty.
 * This is a test/QA convenience, not part of the "real" math — a real RGS
 * would have pre-computed books per forced scatter bucket instead.
 */
function forceScatterCount(grid, rng, targetCount) {
  const positions = [];
  for (let reel = 0; reel < grid.length; reel++) {
    for (let row = 0; row < grid[reel].length; row++) {
      if (grid[reel][row] !== SYMBOLS.WILD) positions.push([reel, row]);
    }
  }
  shuffleInPlace(positions, rng);

  let current = countScatters(grid);
  for (const [reel, row] of positions) {
    if (current === targetCount) break;
    const isScatter = grid[reel][row] === SYMBOLS.SCATTER;
    if (current < targetCount && !isScatter) {
      grid[reel][row] = SYMBOLS.SCATTER;
      current++;
    } else if (current > targetCount && isScatter) {
      // Replace with a neutral low symbol so we don't accidentally change wins.
      grid[reel][row] = SYMBOLS.LOW_CAP;
      current--;
    }
  }
}

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Decide the (purely cosmetic) single-cell vs full-reel-expand form for
 * every landed Wild. Per GDD §3 "Wild 行為規格": this NEVER changes scoring,
 * it only tells the (future) UI which animation to play. `forceWildForms`
 * lets a caller/test pin specific forms down, keyed by "reel,row".
 */
function resolveWildForms(grid, rng, forceWildForms) {
  const wildCells = [];
  for (let reel = 0; reel < grid.length; reel++) {
    for (let row = 0; row < grid[reel].length; row++) {
      if (grid[reel][row] !== SYMBOLS.WILD) continue;
      const key = `${reel},${row}`;
      const form = forceWildForms && forceWildForms[key]
        ? forceWildForms[key]
        : rng.nextFloat() < 0.5
          ? 'single'
          : 'expand';
      wildCells.push({ reel, row, form });
    }
  }
  return wildCells;
}

/**
 * Standard ways-pay evaluation: for each of the 8 payable symbols, find the
 * longest consecutive run of matching cells (symbol itself OR Wild) starting
 * at reel 0. If that run is >= 3 reels long, it pays once (the longest run
 * only — not also counted as a shorter sub-run), for `ways` = product of the
 * per-reel matching-cell counts across the run.
 *
 * Aggregation convention (placeholder, chosen for simplicity per PM spec):
 * total spin win = sum over all symbols that hit of (ways * table multiplier).
 */
export function evaluateWays(grid) {
  const wins = [];
  for (const symbol of PAYABLE_SYMBOLS) {
    const perReelCounts = [];
    for (let reel = 0; reel < grid.length; reel++) {
      const count = grid[reel].filter((cell) => cell === symbol || cell === SYMBOLS.WILD).length;
      if (count === 0) break;
      perReelCounts.push(count);
    }
    const length = perReelCounts.length;
    if (length < 3) continue;

    const ways = perReelCounts.reduce((product, c) => product * c, 1);
    const betMultiplier = WAYS_PAYTABLE[symbol]?.[length];
    if (betMultiplier === undefined) continue; // defensive: table only defines 3/4/5

    wins.push({
      symbol,
      length,
      ways,
      betMultiplier,
      winMultiplier: ways * betMultiplier,
    });
  }
  return wins;
}
