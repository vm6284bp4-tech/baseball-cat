/**
 * roundPlayer.test.js — sanity-checks the RoundPlayer event-stepping state
 * machine (frontend/src/lib/player/roundPlayer.svelte.js) in isolation,
 * without any PixiJS/DOM rendering. Written for Step 3 (frontend UI) to
 * verify the "every mockRgs event type gets handled, nothing silently
 * dropped" requirement from the task brief, since visually confirming the
 * PixiJS canvas isn't practical from a non-interactive agent session.
 *
 * Uses `skipToEnd()` (processes every queued event synchronously, no real
 * timers) rather than `start()`, since we only care about the resulting
 * state transitions here, not the playback pacing.
 */
import { describe, it, expect, vi } from 'vitest';
import { play } from '../src/lib/mockRgs/index.js';
import { RoundPlayer } from '../src/lib/player/roundPlayer.svelte.js';

/** Every event type documented in mockRgs/index.js's header contract. */
const KNOWN_EVENT_TYPES = [
  'spin_result',
  'base_game_win',
  'scatter_trigger',
  'pitch',
  'opponent_cleared',
  'feature_end',
  'round_result',
];

function runToEnd(playResult) {
  const player = new RoundPlayer();
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  player.loadRound(playResult);
  player.skipToEnd();
  warnSpy.mockRestore();
  return player;
}

describe('RoundPlayer', () => {
  it('handles a non-triggering round (no feature) and never hits the unhandled branch', () => {
    const result = play({ mode: 'pitcher', betAmount: 1, debugForce: { scatterCount: 0, seed: 1 } });
    const player = runToEnd(result);

    expect(player.unhandledEvents).toHaveLength(0);
    expect(player.featureActive).toBe(false);
    expect(player.grid).toEqual(result.baseGame.grid);
    expect(player.roundResult).toEqual({
      type: 'round_result',
      totalWinMultiplier: result.totalWinMultiplier,
      totalWinAmount: result.totalWinAmount,
    });
    expect(player.phase).toBe('done');
  });

  it('handles a pitcher-mode full-clear bonus round end to end', () => {
    // scatterCount 5 -> 2 guaranteed slots; pitcher needs 3x3=9 pitches for a
    // full clear, so 9-2=7 of them are real random draws that must all be
    // forced to succeed for a guaranteed full clear.
    const result = play({
      mode: 'pitcher',
      betAmount: 2,
      debugForce: { scatterCount: 5, seed: 42, pitchOutcomes: Array(7).fill(true) },
    });
    expect(result.feature).not.toBeNull();
    const player = runToEnd(result);

    expect(player.unhandledEvents).toHaveLength(0);
    expect(player.featureActive).toBe(true);
    expect(player.featureMode).toBe('pitcher');
    expect(player.featureParam).toEqual({ guaranteedSlots: 2 });
    expect(player.opponents).toHaveLength(3);
    // every opponent should have been resolved (cleared, since forced all-success)
    for (const opp of player.opponents) {
      expect(opp.status).toBe('cleared');
      expect(typeof opp.baseScoreAdded).toBe('number');
      expect(typeof opp.drawnMultiplier).toBe('number');
    }
    expect(player.featureEndSummary.endReason).toBe('full_clear');
    expect(player.roundResult.totalWinMultiplier).toBe(result.totalWinMultiplier);
  });

  it('handles a batter-mode early-termination bonus round (life pool exhausted)', () => {
    // scatterCount 4 -> 1 life. Force every random pitch to fail so the
    // feature ends early after the single life is consumed.
    const result = play({
      mode: 'batter',
      betAmount: 1,
      debugForce: { scatterCount: 4, seed: 7, pitchOutcomes: [false, false] },
    });
    expect(result.feature).not.toBeNull();
    expect(result.feature.endReason).toBe('early_termination');
    const player = runToEnd(result);

    expect(player.unhandledEvents).toHaveLength(0);
    expect(player.featureMode).toBe('batter');
    expect(player.featureParam).toEqual({ lives: 1 });
    // first opponent should be marked failed (never cleared)
    expect(player.opponents[0].status).toBe('failed');
    expect(player.opponents[1].status).toBe('pending');
    expect(player.featureEndSummary.endReason).toBe('early_termination');
  });

  it('every event type the contract documents is dispatched to a real handler (no default-branch fallthrough)', () => {
    // Build a round virtually guaranteed to emit every event type at least
    // once: force a base-game win via a full base grid override AND a
    // full-clear bonus feature in the same round.
    const forceGrid = [
      ['HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3'],
      ['HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3'],
      ['HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3', 'HIGH_OPP3'],
      ['SCATTER', 'SCATTER', 'SCATTER', 'SCATTER', 'SCATTER'],
      ['LOW_CAP', 'LOW_CAP', 'LOW_CAP', 'LOW_CAP', 'LOW_CAP'],
    ];
    const result = play({
      mode: 'pitcher',
      betAmount: 1,
      debugForce: { forceGrid, seed: 99, pitchOutcomes: [true, true, true, true, true, true, true, true, true] },
    });

    const seenTypes = new Set(result.events.map((e) => e.type));
    for (const type of KNOWN_EVENT_TYPES) {
      expect(seenTypes.has(type)).toBe(true);
    }

    const player = runToEnd(result);
    expect(player.unhandledEvents).toHaveLength(0);
  });
});
