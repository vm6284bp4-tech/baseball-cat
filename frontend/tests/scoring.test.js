import { describe, it, expect } from 'vitest';
import { createRng } from '../src/lib/mockRgs/rng.js';
import { runDuelFeature, computeFinalWinMultiplier } from '../src/lib/mockRgs/duelFeature.js';
import { DUEL_SCORING } from '../src/lib/mockRgs/paytable.js';

describe('computeFinalWinMultiplier (pure formula)', () => {
  it('multiplies banked base total by the product of all drawn multipliers', () => {
    expect(computeFinalWinMultiplier(10, [2, 3])).toBe(60);
    expect(computeFinalWinMultiplier(5, [1.5])).toBe(7.5);
  });

  it('is 0 when nothing was banked (no opponent cleared)', () => {
    expect(computeFinalWinMultiplier(0, [])).toBe(0);
  });

  it('is bankedBaseTotal unchanged when no multipliers were drawn (product defaults to 1)', () => {
    expect(computeFinalWinMultiplier(4, [])).toBe(4);
  });
});

describe('runDuelFeature scoring integration', () => {
  it('a partial clear (1st + 2nd opponent only) matches bankedBaseTotal * product(drawnMultipliers)', () => {
    const rng = createRng(99);
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 3, // no guaranteed slots, deterministic via forced outcomes alone
      rng,
      // opponent0: 3 successes (cleared). opponent1: 3 successes (cleared).
      // opponent2: first pitch fails -> early termination.
      forcePitchOutcomes: [true, true, true, true, true, true, false],
    });

    expect(result.opponentsCleared).toBe(2);
    expect(result.endReason).toBe('early_termination');
    expect(result.drawnMultipliers).toHaveLength(2);

    const expectedBankedBaseTotal =
      DUEL_SCORING.pitcher.baseScores[0] + DUEL_SCORING.pitcher.baseScores[1];
    expect(result.bankedBaseTotal).toBeCloseTo(expectedBankedBaseTotal);

    const expectedFinalWinMultiplier =
      result.bankedBaseTotal * result.drawnMultipliers.reduce((p, m) => p * m, 1);
    expect(result.finalWinMultiplier).toBeCloseTo(expectedFinalWinMultiplier);
  });

  it('a full clear (all 3 opponents) matches bankedBaseTotal * product(drawnMultipliers), with no extra bonus', () => {
    const rng = createRng(100);
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 3, // no guaranteed slots
      rng,
      forcePitchOutcomes: [true, true, true, true, true, true, true, true, true],
    });

    expect(result.opponentsCleared).toBe(3);
    expect(result.endReason).toBe('full_clear');
    expect(result.drawnMultipliers).toHaveLength(3);

    const expectedBankedBaseTotal = DUEL_SCORING.pitcher.baseScores.reduce((a, b) => a + b, 0);
    expect(result.bankedBaseTotal).toBeCloseTo(expectedBankedBaseTotal);

    const expectedFinalWinMultiplier =
      result.bankedBaseTotal * result.drawnMultipliers.reduce((p, m) => p * m, 1);
    expect(result.finalWinMultiplier).toBeCloseTo(expectedFinalWinMultiplier);

    // Full clear must NOT add anything beyond the 3 banked base scores + 3 drawn multipliers.
    expect(result.finalWinMultiplier).toBeCloseTo(
      expectedBankedBaseTotal * result.drawnMultipliers.reduce((p, m) => p * m, 1)
    );
  });

  it('no opponent cleared at all yields finalWinMultiplier 0', () => {
    const rng = createRng(101);
    const result = runDuelFeature({
      mode: 'batter',
      scatterCount: 3, // lives: 0
      rng,
      forcePitchOutcomes: [false],
    });
    expect(result.opponentsCleared).toBe(0);
    expect(result.bankedBaseTotal).toBe(0);
    expect(result.finalWinMultiplier).toBe(0);
  });
});
