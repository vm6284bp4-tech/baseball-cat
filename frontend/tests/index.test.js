import { describe, it, expect, vi } from 'vitest';
import { authenticate, play, endRound } from '../src/lib/mockRgs/index.js';
import { SYMBOLS } from '../src/lib/mockRgs/paytable.js';

describe('authenticate()', () => {
  it('returns a fake balance/currency/bet-level/mode-list shape', () => {
    const res = authenticate();
    expect(res.ok).toBe(true);
    expect(typeof res.balance).toBe('number');
    expect(typeof res.currency).toBe('string');
    expect(Array.isArray(res.betLevels)).toBe(true);
    expect(res.betLevels.length).toBeGreaterThan(0);
    expect(res.modes.map((m) => m.name).sort()).toEqual(['batter', 'pitcher']);
    expect(res.round).toEqual({ active: false, roundId: null });
  });
});

describe('play()', () => {
  it('defaults to pitcher mode, bet 1, and returns a fully-formed round result', () => {
    const result = play();
    expect(result.mode).toBe('pitcher');
    expect(result.betAmount).toBe(1);
    expect(result.baseGame.grid).toHaveLength(5);
    expect(result.baseGame.grid[0]).toHaveLength(5);
    expect(result.events[0].type).toBe('spin_result');
    expect(result.events[result.events.length - 1].type).toBe('round_result');
  });

  it('with debugForce.scatterCount=0, never triggers the feature', () => {
    for (let seed = 0; seed < 10; seed++) {
      const result = play({ debugForce: { seed, scatterCount: 0 } });
      expect(result.baseGame.scatterCount).toBe(0);
      expect(result.baseGame.triggeredFeature).toBe(false);
      expect(result.feature).toBeNull();
      expect(result.events.some((e) => e.type === 'scatter_trigger')).toBe(false);
    }
  });

  it('with debugForce.scatterCount=4 (batter mode), always triggers the feature with lives=1', () => {
    const result = play({ mode: 'batter', betAmount: 2, debugForce: { seed: 55, scatterCount: 4 } });
    expect(result.baseGame.scatterCount).toBe(4);
    expect(result.baseGame.triggeredFeature).toBe(true);
    expect(result.feature).not.toBeNull();
    expect(result.feature.livesAtTrigger).toBe(1);
    const triggerEvent = result.events.find((e) => e.type === 'scatter_trigger');
    expect(triggerEvent).toMatchObject({ scatterCount: 4, mode: 'batter', livesAtTrigger: 1 });
  });

  it('is reproducible given the same debugForce.seed', () => {
    const resultA = play({ mode: 'batter', betAmount: 3, debugForce: { seed: 777, scatterCount: 5 } });
    const resultB = play({ mode: 'batter', betAmount: 3, debugForce: { seed: 777, scatterCount: 5 } });
    expect(resultA.baseGame.grid).toEqual(resultB.baseGame.grid);
    expect(resultA.feature.finalWinMultiplier).toBe(resultB.feature.finalWinMultiplier);
    expect(resultA.totalWinMultiplier).toBe(resultB.totalWinMultiplier);
  });

  it('forceGrid + forcePitchOutcomes together give a fully deterministic round', () => {
    const forceGrid = [
      [SYMBOLS.SCATTER, SYMBOLS.SCATTER, SYMBOLS.SCATTER, SYMBOLS.LOW_BASE, SYMBOLS.LOW_BASE],
      [SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE, SYMBOLS.LOW_GLOVE],
      [SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY, SYMBOLS.LOW_JERSEY],
      [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
      [SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP, SYMBOLS.LOW_CAP],
    ];
    const result = play({
      mode: 'pitcher',
      betAmount: 1,
      debugForce: { forceGrid, pitchOutcomes: [false] }, // 3 scatters -> 0 guaranteed slots -> instant fail
    });
    expect(result.baseGame.scatterCount).toBe(3);
    expect(result.feature.endReason).toBe('early_termination');
    expect(result.feature.totalPitchesThrown).toBe(1);
    expect(result.totalWinMultiplier).toBe(0); // no base-game ways win and feature banked nothing
  });

  it('rejects an unknown mode', () => {
    expect(() => play({ mode: 'nonsense' })).toThrow();
  });
});

describe('endRound()', () => {
  it('is a no-op that echoes the roundId', () => {
    const res = endRound({ roundId: 'abc', totalWinMultiplier: 5 });
    expect(res.ok).toBe(true);
    expect(res.roundId).toBe('abc');
  });

  it('warns when called for a 0x round (per the team checklist: 0倍局不可呼叫 end-round)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    endRound({ roundId: 'zero-round', totalWinMultiplier: 0 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
