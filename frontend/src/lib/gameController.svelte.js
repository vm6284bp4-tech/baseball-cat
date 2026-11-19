/**
 * gameController.svelte.js — top-level game state: auth/balance/bet/mode,
 * owns the RoundPlayer instance, and is the ONLY place that calls into
 * mockRgs (authenticate/play/endRound). UI components read this controller's
 * reactive state and call its methods; they never import mockRgs directly.
 *
 * Fixed-point convention: mockRgs returns money as integers scaled by
 * 1,000,000 (see index.js header). This controller converts to/from human
 * display units (divide/multiply by FIXED_POINT_SCALE) at the boundary, so
 * every component downstream only ever sees human units (e.g. 1.5, not
 * 1500000).
 */

import { authenticate, play, endRound } from './mockRgs/index.js';
import { RoundPlayer } from './player/roundPlayer.svelte.js';

const FIXED_POINT_SCALE = 1_000_000;
const toHuman = (fixed) => fixed / FIXED_POINT_SCALE;

export class GameController {
  // --- authenticate() results -----------------------------------------
  authReady = $state(false);
  authError = $state(null);
  currency = $state('USD');
  /** @type {number[]} human-unit bet levels, e.g. [0.2, 0.5, 1, ...] */
  betLevels = $state.raw([]);
  /** @type {Array<{name: string, costMultiplier: number, isDefault: boolean}>} */
  modes = $state.raw([]);

  // --- wallet / selection state ------------------------------------
  balance = $state(0); // human units
  mode = $state('pitcher');
  betAmount = $state(1);

  // --- debug/QA force controls (fed straight into play()'s debugForce) --
  debugForceScatterCount = $state('off'); // 'off' | 0 | 3 | 4 | 5
  debugSeed = $state('');
  /** Free-text forced pitch outcomes, comma-separated "1/0" or "s/f", parsed on spin. */
  debugPitchOutcomesText = $state('');
  debugPanelOpen = $state(false);

  // --- round lifecycle ------------------------------------------------
  roundPlayer = new RoundPlayer();
  isSpinning = $state(false); // true from spin button press until playback + endRound settle
  lastRoundSummary = $state.raw(null); // { mode, betAmount, totalWinMultiplier, totalWinAmount, roundId }
  lastError = $state(null);

  init() {
    try {
      const auth = authenticate();
      this.currency = auth.currency;
      this.betLevels = auth.betLevels.map(toHuman);
      this.modes = auth.modes;
      this.balance = toHuman(auth.balance);
      const defaultMode = auth.modes.find((m) => m.isDefault) ?? auth.modes[0];
      if (defaultMode) this.mode = defaultMode.name;
      if (this.betLevels.length && !this.betLevels.includes(this.betAmount)) {
        this.betAmount = this.betLevels[0];
      }
      this.authReady = true;
    } catch (err) {
      this.authError = String(err?.message ?? err);
    }
  }

  setMode(name) {
    if (this.isSpinning) return; // don't allow switching mid-round
    this.mode = name;
  }

  setBetAmount(amount) {
    if (this.isSpinning) return;
    this.betAmount = amount;
  }

  /** @returns {object} the debugForce object to pass into play(), built from the debug panel's fields. */
  _buildDebugForce() {
    /** @type {object} */
    const force = {};
    if (this.debugForceScatterCount !== 'off') {
      force.scatterCount = Number(this.debugForceScatterCount);
    }
    if (this.debugSeed !== '' && !Number.isNaN(Number(this.debugSeed))) {
      force.seed = Number(this.debugSeed);
    }
    const parsedPitches = this._parsePitchOutcomes(this.debugPitchOutcomesText);
    if (parsedPitches.length) {
      force.pitchOutcomes = parsedPitches;
    }
    return force;
  }

  /** Parses a user-typed string like "1,0,1" or "s,s,f" into booleans. Unrecognized
   * tokens become `false` (failure) explicitly, rather than being silently dropped. */
  _parsePitchOutcomes(text) {
    if (!text || !text.trim()) return [];
    return text
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .map((t) => t === '1' || t === 's' || t === 'success' || t === 'true');
  }

  canSpin() {
    return this.authReady && !this.isSpinning && this.betAmount > 0 && this.betAmount <= this.balance;
  }

  spin() {
    if (!this.canSpin()) return;
    this.lastError = null;
    this.isSpinning = true;

    let result;
    try {
      result = play({
        mode: this.mode,
        betAmount: this.betAmount,
        debugForce: this._buildDebugForce(),
      });
    } catch (err) {
      this.isSpinning = false;
      this.lastError = String(err?.message ?? err);
      return;
    }

    // Deduct the bet immediately (optimistic), credit any win once playback
    // finishes — mirrors "multi-step wins must accumulate up to the final
    // amount" from the platform guide, applied to the whole-round total
    // here since mockRgs hands back the full pre-computed result up front.
    this.balance -= this.betAmount;

    this.roundPlayer.loadRound(result);
    this.roundPlayer.start((roundMeta) => this._onRoundPlaybackDone(result, roundMeta));
  }

  /** QA convenience: skip straight to the end of the current round's animation. */
  skipAnimation() {
    if (!this.isSpinning) return;
    this.roundPlayer.skipToEnd();
  }

  _onRoundPlaybackDone(result) {
    // endRound() contract (see mockRgs/index.js header): a 0x round must NOT
    // call end-round; a round with any win MUST call it. Wired for real here
    // (not skipped just because the mock is a no-op) so a future real-RGS
    // swap-in inherits correct call discipline.
    if (result.totalWinMultiplier > 0) {
      endRound({ roundId: result.roundId, totalWinMultiplier: result.totalWinMultiplier });
      this.balance += result.totalWinAmount;
    }
    this.lastRoundSummary = {
      mode: result.mode,
      betAmount: result.betAmount,
      totalWinMultiplier: result.totalWinMultiplier,
      totalWinAmount: result.totalWinAmount,
      roundId: result.roundId,
      debugForceApplied: result.debugForceApplied,
    };
    this.isSpinning = false;
  }
}
