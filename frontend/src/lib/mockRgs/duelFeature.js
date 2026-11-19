/**
 * duelFeature.js — the "獎金遊戲" (Bonus Game) duel engine, per GDD §4.
 *
 * Triggered by 3/4/5 Scatter from the base game. Faces 3 opponents in
 * order (1st/2nd/3rd); if an opponent isn't cleared (and there's no way to
 * continue), the whole feature round ends immediately with whatever has
 * already been banked. Mode (`pitcher` | `batter`) determines the ruleset —
 * see the two mechanics below, which are intentionally structurally
 * opposite (GDD D6).
 *
 * PITCHER ("全中才過", all-of-3 per opponent):
 *   Each pitch is judged: a remaining guaranteed slot (保底額度) forces
 *   success and is consumed; otherwise draw success/fail from
 *   DUEL_BASE_SUCCESS_PROB.pitcher. ANY random failure ends the whole
 *   feature round immediately — there is no life/tolerance concept here.
 *   Guaranteed slots are a single shared counter consumed in pitch order
 *   across the whole (up to 9-pitch) sequence, not reset per opponent.
 *
 * BATTER ("累計命中2次", first-to-2 per opponent, no guaranteed slots):
 *   Each pitch draws success/fail from DUEL_BASE_SUCCESS_PROB.batter.
 *   Success increments that opponent's hit count; reaching 2 clears the
 *   opponent (hit count resets for the next one). Failure consumes 1 life
 *   (生命值, a single shared pool, not reset per opponent) and KEEPS the
 *   player on the same opponent with hit count preserved; if no lives
 *   remain, the whole feature round ends immediately. Because each of the 3
 *   opponents needs exactly 2 successes, a full clear needs exactly 6
 *   successful pitches, so total pitches thrown is bounded by
 *   6 + lives_at_trigger.
 *
 * SCORING (identical math for both modes): clearing an opponent banks that
 * opponent's fixed base score and draws (but does not yet apply) one
 * multiplier from that opponent's pool. When the round ends (full clear or
 * early termination): finalWinMultiplier = bankedBaseTotal * product(all
 * drawnMultipliers so far). A full clear does NOT add any extra bonus on
 * top of this — the 3 banked base scores + 3 drawn multipliers already are
 * the complete result.
 *
 * All probabilities/scores/pools come from paytable.js and are explicit
 * placeholders (see that file's header comment).
 */

import {
  getScatterTriggerParams,
  DUEL_BASE_SUCCESS_PROB,
  DUEL_PITCHES_TO_CLEAR_OPPONENT,
  DUEL_OPPONENT_COUNT,
  DUEL_SCORING,
} from './paytable.js';
import { createForcedOutcomeQueue } from './rng.js';

/**
 * @param {number} bankedBaseTotal
 * @param {number[]} drawnMultipliers
 * @returns {number}
 */
export function computeFinalWinMultiplier(bankedBaseTotal, drawnMultipliers) {
  const productOfMultipliers = drawnMultipliers.reduce((product, m) => product * m, 1);
  return bankedBaseTotal * productOfMultipliers;
}

/**
 * Run the full duel feature for one triggered round.
 *
 * @param {object} params
 * @param {'pitcher'|'batter'} params.mode
 * @param {3|4|5} params.scatterCount
 * @param {ReturnType<typeof import('./rng.js').createRng>} params.rng
 * @param {boolean[]} [params.forcePitchOutcomes] - forces the outcome of
 *   each RANDOM pitch draw (in order). Never overrides a guaranteed-slot
 *   forced success in pitcher mode — that bookkeeping is mechanic, not a
 *   "random draw". Once exhausted, remaining pitches draw from `rng`.
 * @returns {{
 *   mode: 'pitcher'|'batter',
 *   scatterCount: number,
 *   guaranteedSlotsAtTrigger: number,
 *   livesAtTrigger: number,
 *   events: Array<object>,
 *   bankedBaseTotal: number,
 *   drawnMultipliers: number[],
 *   finalWinMultiplier: number,
 *   endReason: 'full_clear' | 'early_termination',
 *   opponentsCleared: number,
 *   totalPitchesThrown: number,
 * }}
 */
export function runDuelFeature({ mode, scatterCount, rng, forcePitchOutcomes }) {
  const triggerParams = getScatterTriggerParams(scatterCount);
  if (!triggerParams) {
    throw new Error(`runDuelFeature: scatterCount ${scatterCount} does not trigger the feature`);
  }
  const successProb = DUEL_BASE_SUCCESS_PROB[mode];
  const pitchesToClear = DUEL_PITCHES_TO_CLEAR_OPPONENT[mode];
  const scoring = DUEL_SCORING[mode];
  const forcedQueue = createForcedOutcomeQueue(forcePitchOutcomes);

  const events = [];
  const drawnMultipliers = [];
  let bankedBaseTotal = 0;
  let opponentsCleared = 0;
  let globalPitchIndex = 0;
  let endReason = 'early_termination';

  function drawSuccess() {
    return forcedQueue.next(() => rng.nextFloat() < successProb);
  }

  function clearOpponent(opponentIndex) {
    const baseScoreAdded = scoring.baseScores[opponentIndex];
    const drawnMultiplier = rng.pickWeighted(scoring.multiplierPools[opponentIndex]);
    bankedBaseTotal += baseScoreAdded;
    drawnMultipliers.push(drawnMultiplier);
    opponentsCleared++;
    events.push({
      type: 'opponent_cleared',
      opponentIndex,
      baseScoreAdded,
      drawnMultiplier,
      bankedBaseTotal,
      drawnMultipliers: [...drawnMultipliers],
    });
  }

  if (mode === 'pitcher') {
    let guaranteedSlotsRemaining = triggerParams.guaranteedSlots;

    opponentLoop: for (let opponentIndex = 0; opponentIndex < DUEL_OPPONENT_COUNT; opponentIndex++) {
      for (let pitchInOpponent = 0; pitchInOpponent < pitchesToClear; pitchInOpponent++) {
        globalPitchIndex++;
        let outcome;
        if (guaranteedSlotsRemaining > 0) {
          guaranteedSlotsRemaining--;
          outcome = 'forced_success';
        } else {
          outcome = drawSuccess() ? 'success' : 'failure';
        }
        events.push({
          type: 'pitch',
          opponentIndex,
          pitchNumberGlobal: globalPitchIndex,
          outcome,
          guaranteedSlotsRemaining,
        });
        if (outcome === 'failure') {
          endReason = 'early_termination';
          break opponentLoop;
        }
      }
      clearOpponent(opponentIndex);
      if (opponentIndex === DUEL_OPPONENT_COUNT - 1) endReason = 'full_clear';
    }
  } else if (mode === 'batter') {
    let livesRemaining = triggerParams.lives;

    opponentLoop: for (let opponentIndex = 0; opponentIndex < DUEL_OPPONENT_COUNT; opponentIndex++) {
      let hitCount = 0;
      while (true) {
        globalPitchIndex++;
        const success = drawSuccess();
        if (success) {
          hitCount++;
          events.push({
            type: 'pitch',
            opponentIndex,
            pitchNumberGlobal: globalPitchIndex,
            outcome: 'success',
            hitCount,
            livesRemaining,
          });
          if (hitCount >= pitchesToClear) {
            clearOpponent(opponentIndex);
            if (opponentIndex === DUEL_OPPONENT_COUNT - 1) endReason = 'full_clear';
            break; // move on to next opponent (outer for-loop)
          }
          // else: keep pitching at the same opponent
        } else if (livesRemaining > 0) {
          livesRemaining--;
          events.push({
            type: 'pitch',
            opponentIndex,
            pitchNumberGlobal: globalPitchIndex,
            outcome: 'failure_life_used',
            hitCount, // NOT reset — stays on this opponent with hits preserved
            livesRemaining,
          });
          // continue the while loop, same opponent
        } else {
          events.push({
            type: 'pitch',
            opponentIndex,
            pitchNumberGlobal: globalPitchIndex,
            outcome: 'failure',
            hitCount,
            livesRemaining,
          });
          endReason = 'early_termination';
          break opponentLoop;
        }
      }
    }
  } else {
    throw new Error(`runDuelFeature: unknown mode "${mode}"`);
  }

  const finalWinMultiplier = computeFinalWinMultiplier(bankedBaseTotal, drawnMultipliers);
  events.push({
    type: 'feature_end',
    endReason,
    bankedBaseTotal,
    drawnMultipliers: [...drawnMultipliers],
    finalWinMultiplier,
    opponentsCleared,
    totalPitchesThrown: globalPitchIndex,
  });

  return {
    mode,
    scatterCount,
    guaranteedSlotsAtTrigger: triggerParams.guaranteedSlots,
    livesAtTrigger: triggerParams.lives,
    events,
    bankedBaseTotal,
    drawnMultipliers,
    finalWinMultiplier,
    endReason,
    opponentsCleared,
    totalPitchesThrown: globalPitchIndex,
  };
}
