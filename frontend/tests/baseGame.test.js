import { describe, it, expect } from 'vitest';
import { createRng } from '../src/lib/mockRgs/rng.js';
import { spin, evaluateWays } from '../src/lib/mockRgs/baseGame.js';
import {
  SYMBOLS,
  WAYS_PAYTABLE,
  SCATTER_TRIGGER_TABLE,
  getScatterTriggerParams,
  REEL_STRIPS,
} from '../src/lib/mockRgs/paytable.js';

// A 3-of-a-kind HIGH_BAT win on reels 0-2, with per-reel padding symbols
// chosen so none of them accidentally forms a run of their own starting at
// reel 0 (see inline comments). reel[i] = column of 5 rows.
const THREE_OF_A_KIND_GRID = [
  [SYMBOLS.HIGH_BAT, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE],
  [SYMBOLS.HIGH_BAT, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE],
  [SYMBOLS.HIGH_BAT, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY],
  [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
  [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
];

// Same idea, but reel 1's matching cell is a WILD instead of the real
// symbol, to prove substitution works and pays exactly the same table value.
const WILD_SUBSTITUTION_GRID = [
  [SYMBOLS.HIGH_OPP1, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE],
  [SYMBOLS.WILD, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE],
  [SYMBOLS.HIGH_OPP1, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY],
  [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
  [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
];

function gridWithScatterCount(count) {
  // Fill everything with a symbol that never pays on its own (varies per
  // reel so no accidental ways win), then drop `count` scatters into the
  // first N cells of reel 0 (reels aren't relevant to scatter counting).
  const grid = [
    [SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE],
    [SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE],
    [SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY],
    [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
    [SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_OPP1],
  ];
  let remaining = count;
  for (let reel = 0; reel < grid.length && remaining > 0; reel++) {
    for (let row = 0; row < grid[reel].length && remaining > 0; row++) {
      grid[reel][row] = SYMBOLS.SCATTER;
      remaining--;
    }
  }
  return grid;
}

describe('evaluateWays', () => {
  it('pays a 3-of-a-kind win matching the paytable exactly', () => {
    const wins = evaluateWays(THREE_OF_A_KIND_GRID);
    expect(wins).toHaveLength(1);
    const [win] = wins;
    expect(win.symbol).toBe(SYMBOLS.HIGH_BAT);
    expect(win.length).toBe(3);
    expect(win.ways).toBe(1);
    expect(win.betMultiplier).toBe(WAYS_PAYTABLE[SYMBOLS.HIGH_BAT][3]);
    expect(win.winMultiplier).toBe(WAYS_PAYTABLE[SYMBOLS.HIGH_BAT][3]);
  });

  it('lets Wild substitute to complete a run, paying the real symbol\'s table value', () => {
    const wins = evaluateWays(WILD_SUBSTITUTION_GRID);
    expect(wins).toHaveLength(1);
    const [win] = wins;
    expect(win.symbol).toBe(SYMBOLS.HIGH_OPP1);
    expect(win.length).toBe(3);
    expect(win.ways).toBe(1); // 1 matching cell per reel (reel1's match IS the wild)
    expect(win.winMultiplier).toBe(WAYS_PAYTABLE[SYMBOLS.HIGH_OPP1][3]);
  });
});

describe('spin() with forceGrid', () => {
  it('uses the exact forced grid, not a randomly generated one', () => {
    const rng = createRng(42);
    const result = spin(rng, { forceGrid: THREE_OF_A_KIND_GRID });
    expect(result.grid).toEqual(THREE_OF_A_KIND_GRID);
    expect(result.totalWinMultiplier).toBe(WAYS_PAYTABLE[SYMBOLS.HIGH_BAT][3]);
  });

  it('does not mutate the caller\'s forceGrid array', () => {
    const original = THREE_OF_A_KIND_GRID.map((col) => [...col]);
    const rng = createRng(1);
    spin(rng, { forceGrid: THREE_OF_A_KIND_GRID });
    expect(THREE_OF_A_KIND_GRID).toEqual(original);
  });

  it('forceScatterCount is ignored when forceGrid is also provided (forceGrid wins outright)', () => {
    const rng = createRng(1);
    const result = spin(rng, { forceGrid: THREE_OF_A_KIND_GRID, forceScatterCount: 5 });
    expect(result.scatterCount).toBe(0); // THREE_OF_A_KIND_GRID has no scatters at all
  });

  it('a full-reel "expand" wild event does not change the payout vs. "single" form', () => {
    const rngA = createRng(7);
    const resultSingle = spin(rngA, {
      forceGrid: WILD_SUBSTITUTION_GRID,
      forceWildForms: { '1,0': 'single' },
    });
    const rngB = createRng(7);
    const resultExpand = spin(rngB, {
      forceGrid: WILD_SUBSTITUTION_GRID,
      forceWildForms: { '1,0': 'expand' },
    });
    expect(resultSingle.totalWinMultiplier).toBe(resultExpand.totalWinMultiplier);
    expect(resultSingle.wins).toEqual(resultExpand.wins);
    expect(resultSingle.grid).toEqual(resultExpand.grid);
    // Only the cosmetic flag itself differs.
    expect(resultSingle.wildCells[0].form).toBe('single');
    expect(resultExpand.wildCells[0].form).toBe('expand');
  });
});

describe('scatter detection and feature trigger', () => {
  it.each([0, 1, 2, 3, 4, 5])('counts exactly %i scatters on a forced grid', (count) => {
    const rng = createRng(1);
    const result = spin(rng, { forceGrid: gridWithScatterCount(count) });
    expect(result.scatterCount).toBe(count);
  });

  it('3/4/5 scatters are present in the trigger table; 0/1/2 are not', () => {
    expect(SCATTER_TRIGGER_TABLE[3]).toBeDefined();
    expect(SCATTER_TRIGGER_TABLE[4]).toBeDefined();
    expect(SCATTER_TRIGGER_TABLE[5]).toBeDefined();
    expect(SCATTER_TRIGGER_TABLE[0]).toBeUndefined();
    expect(SCATTER_TRIGGER_TABLE[1]).toBeUndefined();
    expect(SCATTER_TRIGGER_TABLE[2]).toBeUndefined();
  });

  it('getScatterTriggerParams clamps 6+ scatters to the 5-tier instead of failing to trigger', () => {
    expect(getScatterTriggerParams(0)).toBeNull();
    expect(getScatterTriggerParams(1)).toBeNull();
    expect(getScatterTriggerParams(2)).toBeNull();
    expect(getScatterTriggerParams(3)).toEqual(SCATTER_TRIGGER_TABLE[3]);
    expect(getScatterTriggerParams(4)).toEqual(SCATTER_TRIGGER_TABLE[4]);
    expect(getScatterTriggerParams(5)).toEqual(SCATTER_TRIGGER_TABLE[5]);
    // The grid is 5x5 = 25 cells, so 6+ scatters is a real (if rare/forced) case.
    expect(getScatterTriggerParams(6)).toEqual(SCATTER_TRIGGER_TABLE[5]);
    expect(getScatterTriggerParams(25)).toEqual(SCATTER_TRIGGER_TABLE[5]);
  });

  it.each([0, 3, 4, 5])(
    'debugForce.forceScatterCount=%i on a randomly-generated grid still lands exactly that many scatters',
    (targetCount) => {
      for (let seed = 0; seed < 20; seed++) {
        const rng = createRng(seed * 1000 + targetCount);
        const result = spin(rng, { forceScatterCount: targetCount });
        expect(result.scatterCount).toBe(targetCount);
      }
    }
  );

  it('each reel strip contains exactly 1 Scatter entry (2026-11-19 PM rule: at most 5 scatters total, one per axis)', () => {
    for (const strip of REEL_STRIPS) {
      const scatterCount = strip.filter((s) => s === SYMBOLS.SCATTER).length;
      expect(scatterCount).toBe(1);
    }
  });

  it('a natural (unforced) spin can never land more than 1 scatter on any single reel, or more than 5 total', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = createRng(seed);
      const result = spin(rng);
      for (const reel of result.grid) {
        const perReel = reel.filter((cell) => cell === SYMBOLS.SCATTER).length;
        expect(perReel).toBeLessThanOrEqual(1);
      }
      expect(result.scatterCount).toBeLessThanOrEqual(5);
    }
  });
});

describe('reel 1 never contains Wild (2026-11-19 PM rule)', () => {
  it('reel strip 0 has zero Wild entries', () => {
    expect(REEL_STRIPS[0].filter((s) => s === SYMBOLS.WILD).length).toBe(0);
  });

  it('a natural (unforced) spin never shows Wild on reel 0 (reelIndex 0)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = createRng(seed);
      const result = spin(rng);
      expect(result.grid[0].filter((cell) => cell === SYMBOLS.WILD).length).toBe(0);
    }
  });

  it('bounds how many distinct symbols can pay simultaneously to at most 5 (reel 0 row count), even on an all-Wild-from-reel-2-onward grid', () => {
    // Reel 0 shows 5 distinct real symbols (one per row, no repeats); reels
    // 1-4 are entirely Wild. Every one of reel 0's 5 symbols should pay a
    // 5-of-a-kind, but no symbol absent from reel 0 should pay anything —
    // this is the bounded version of the review's "all-Wild stacks every
    // symbol" finding, now capped at 5 (reel 0's row count) instead of 8.
    const allWildReel = [SYMBOLS.WILD, SYMBOLS.WILD, SYMBOLS.WILD, SYMBOLS.WILD, SYMBOLS.WILD];
    const grid = [
      [SYMBOLS.HIGH_OPP3, SYMBOLS.HIGH_OPP2, SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_BAT, SYMBOLS.LOW_JERSEY],
      allWildReel,
      allWildReel,
      allWildReel,
      allWildReel,
    ];
    const wins = evaluateWays(grid);
    expect(wins.length).toBe(5); // exactly the 5 symbols present on reel 0
    const paidSymbols = wins.map((w) => w.symbol).sort();
    expect(paidSymbols).toEqual(
      [SYMBOLS.HIGH_OPP3, SYMBOLS.HIGH_OPP2, SYMBOLS.HIGH_OPP1, SYMBOLS.HIGH_BAT, SYMBOLS.LOW_JERSEY].sort()
    );
    // The 3 low-tier symbols NOT present on reel 0 (glove/base/cap) must not pay.
    expect(paidSymbols).not.toContain(SYMBOLS.LOW_GLOVE);
    expect(paidSymbols).not.toContain(SYMBOLS.LOW_BASE);
    expect(paidSymbols).not.toContain(SYMBOLS.LOW_CAP);
  });
});
