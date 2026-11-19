import { describe, it, expect } from 'vitest';
import { createRng } from '../src/lib/mockRgs/rng.js';
import { runDuelFeature } from '../src/lib/mockRgs/duelFeature.js';

describe('pitcher mode ("全中才過")', () => {
  it('a single random failure with 0 guaranteed slots ends the round immediately', () => {
    const rng = createRng(1);
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 3, // guaranteedSlots: 0
      rng,
      forcePitchOutcomes: [false],
    });
    expect(result.endReason).toBe('early_termination');
    expect(result.opponentsCleared).toBe(0);
    expect(result.totalPitchesThrown).toBe(1);
    expect(result.bankedBaseTotal).toBe(0);
    expect(result.drawnMultipliers).toEqual([]);
    expect(result.finalWinMultiplier).toBe(0);
  });

  it('guaranteed slots are consumed in pitch order and force success ahead of any random draw', () => {
    const rng = createRng(2);
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 4, // guaranteedSlots: 1
      rng,
      // Pitch 1 must be forced (guaranteed slot), so this queue is only
      // consulted starting pitch 2. Only opponent 0's 3 pitches are forced;
      // what happens afterwards is left to real RNG, so we only assert on
      // opponent 0's events (deterministic) and that it cleared.
      forcePitchOutcomes: [true, true],
    });
    const pitches = result.events.filter((e) => e.type === 'pitch' && e.opponentIndex === 0);
    expect(pitches[0]).toMatchObject({
      opponentIndex: 0,
      pitchNumberGlobal: 1,
      outcome: 'forced_success',
      guaranteedSlotsRemaining: 0,
    });
    expect(pitches[1]).toMatchObject({ outcome: 'success', guaranteedSlotsRemaining: 0 });
    expect(pitches[2]).toMatchObject({ outcome: 'success', guaranteedSlotsRemaining: 0 });
    const opponent0Cleared = result.events.find((e) => e.type === 'opponent_cleared' && e.opponentIndex === 0);
    expect(opponent0Cleared).toBeDefined();
    expect(result.opponentsCleared).toBeGreaterThanOrEqual(1);
  });

  it('a full clear requires all 9 logical pitch-slots to resolve success (forced or random) with zero random failures', () => {
    const rng = createRng(3);
    // scatterCount 5 => 2 guaranteed slots consumed on global pitches 1-2.
    // Remaining 7 pitches (3 opponents x 3 pitches = 9 total, minus 2 forced) must all be forced success too.
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 5,
      rng,
      forcePitchOutcomes: [true, true, true, true, true, true, true],
    });
    expect(result.totalPitchesThrown).toBe(9);
    expect(result.opponentsCleared).toBe(3);
    expect(result.endReason).toBe('full_clear');
    const pitchEvents = result.events.filter((e) => e.type === 'pitch');
    expect(pitchEvents).toHaveLength(9);
    expect(pitchEvents.every((e) => e.outcome === 'forced_success' || e.outcome === 'success')).toBe(true);
    expect(pitchEvents.some((e) => e.outcome === 'failure')).toBe(false);
  });

  it('a single random failure mid-sequence still ends the round even after earlier opponents cleared', () => {
    const rng = createRng(4);
    const result = runDuelFeature({
      mode: 'pitcher',
      scatterCount: 3, // no guaranteed slots at all
      rng,
      // Opponent 0 clears (3 successes), opponent 1's 2nd pitch fails.
      forcePitchOutcomes: [true, true, true, true, false],
    });
    expect(result.opponentsCleared).toBe(1);
    expect(result.endReason).toBe('early_termination');
    expect(result.totalPitchesThrown).toBe(5);
    expect(result.bankedBaseTotal).toBeGreaterThan(0); // 1st opponent's base score was banked
  });
});

describe('batter mode ("累計命中2次")', () => {
  it('0 lives means a single failure ends the round immediately', () => {
    const rng = createRng(10);
    const result = runDuelFeature({
      mode: 'batter',
      scatterCount: 3, // lives: 0
      rng,
      forcePitchOutcomes: [false],
    });
    expect(result.endReason).toBe('early_termination');
    expect(result.opponentsCleared).toBe(0);
    expect(result.totalPitchesThrown).toBe(1);
    expect(result.finalWinMultiplier).toBe(0);
  });

  it('with lives > 0, a failure keeps hit count and stays on the same opponent, consuming a life', () => {
    const rng = createRng(11);
    const result = runDuelFeature({
      mode: 'batter',
      scatterCount: 4, // lives: 1
      rng,
      // opponent0: success, failure(uses the 1 life, stays), success -> cleared
      forcePitchOutcomes: [true, false, true],
    });
    const pitches = result.events.filter((e) => e.type === 'pitch');
    expect(pitches[0]).toMatchObject({ opponentIndex: 0, outcome: 'success', hitCount: 1, livesRemaining: 1 });
    expect(pitches[1]).toMatchObject({
      opponentIndex: 0,
      outcome: 'failure_life_used',
      hitCount: 1, // preserved, NOT reset to 0
      livesRemaining: 0,
    });
    expect(pitches[2]).toMatchObject({ opponentIndex: 0, outcome: 'success', hitCount: 2, livesRemaining: 0 });
    const clearedEvents = result.events.filter((e) => e.type === 'opponent_cleared');
    expect(clearedEvents[0].opponentIndex).toBe(0);
  });

  it('reaching exactly 2 successes clears an opponent and resets hit count for the next one', () => {
    const rng = createRng(12);
    const result = runDuelFeature({
      mode: 'batter',
      scatterCount: 5, // lives: 2, plenty of cushion
      rng,
      // opponent0: 2 successes; opponent1: 2 successes
      forcePitchOutcomes: [true, true, true, true],
    });
    const pitches = result.events.filter((e) => e.type === 'pitch');
    // First pitch thrown at opponent 1 (index 1) must start hitCount back at 1, not continue from opponent 0's 2.
    const firstOpponent1Pitch = pitches.find((p) => p.opponentIndex === 1);
    expect(firstOpponent1Pitch.hitCount).toBe(1);
    expect(result.opponentsCleared).toBeGreaterThanOrEqual(2);
  });

  it('bounds total pitches thrown at <= 6 + lives_at_trigger across many random (unforced) trials', () => {
    for (const scatterCount of [3, 4, 5]) {
      for (let seed = 0; seed < 200; seed++) {
        const rng = createRng(seed * 7 + scatterCount);
        const result = runDuelFeature({ mode: 'batter', scatterCount, rng });
        expect(result.totalPitchesThrown).toBeLessThanOrEqual(6 + result.livesAtTrigger);
      }
    }
  });
});
