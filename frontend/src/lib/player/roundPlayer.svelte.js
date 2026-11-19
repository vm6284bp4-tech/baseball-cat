/**
 * roundPlayer.svelte.js — event-log playback state machine.
 *
 * This module owns "what event from mockRgs's play().events are we currently
 * showing, and when do we advance to the next one". It does NOT touch
 * PixiJS, the DOM, or any rendering at all — it only exposes reactive state
 * (Svelte 5 runes) that a rendering layer (PixiJS canvas, or in principle
 * any other animation style) reads and reacts to. This separation is
 * deliberate (see frontend task brief): swapping the visual style later
 * should mean touching only the renderer, never this file.
 *
 * Contract this plays back is documented in full in
 * `frontend/src/lib/mockRgs/index.js`'s header comment — read that first if
 * you're adding a new event type.
 *
 * Every event type in the documented contract has a case in `_applyEvent`:
 *   spin_result, base_game_win, scatter_trigger, pitch, opponent_cleared,
 *   feature_end, round_result. Anything NOT matching one of those codes hits
 * the `default` branch and is recorded into `unhandledEvents` + logged as a
 * console.warn — so an unrecognized event type is never silently dropped.
 */

/** Per-event-type playback pacing (ms to wait AFTER applying this event
 * before advancing to the next one). Chosen so a human can actually watch
 * pitches land one at a time rather than seeing the end state instantly —
 * not tuned for "feel", just "legible". Tune freely later. */
const STEP_DELAYS = {
  spin_result: 500,
  base_game_win: 550,
  scatter_trigger: 1400,
  pitch: 700,
  opponent_cleared: 1500,
  feature_end: 1600,
  round_result: 1200,
};
const DEFAULT_DELAY = 500;

/** @typedef {'idle'|'spinning'|'base_wins'|'feature_trigger'|'feature_pitching'|'opponent_cleared'|'feature_end'|'round_result'|'done'} PlayerPhase */

export class RoundPlayer {
  // --- raw event feed -------------------------------------------------
  events = $state.raw([]);
  eventIndex = $state(-1);
  currentEvent = $state(null);
  isPlaying = $state(false);
  unhandledEvents = $state.raw([]);

  /** @type {PlayerPhase} */
  phase = $state('idle');

  // --- base game display state ----------------------------------------
  grid = $state.raw(null); // string[][] or null before first spin
  wildCells = $state.raw([]);
  scatterCount = $state(0);
  baseWins = $state.raw([]); // base_game_win events accumulated this round
  highlightedSymbols = $state.raw(new Set()); // symbol ids currently highlighted as winning

  // --- bonus / duel feature display state -------------------------------
  featureActive = $state(false);
  featureMode = $state(null); // 'pitcher' | 'batter'
  featureParam = $state.raw(null); // { guaranteedSlots } | { lives }
  opponentCount = $state(3);
  /** @type {Array<{status: 'pending'|'current'|'cleared'|'failed', baseScoreAdded?: number, drawnMultiplier?: number}>} */
  opponents = $state.raw([]);
  /** Recent pitch events, newest last, capped so the log stays readable. */
  pitchLog = $state.raw([]);
  currentOpponentIndex = $state(0);
  guaranteedSlotsRemaining = $state(0);
  livesRemaining = $state(0);
  currentHitCount = $state(0);
  lastPitch = $state.raw(null);
  featureEndSummary = $state.raw(null);

  // --- round-level outcome ------------------------------------------
  roundMeta = $state.raw(null); // { roundId, mode, betAmount }
  roundResult = $state.raw(null); // { totalWinMultiplier, totalWinAmount }

  /** @type {ReturnType<typeof setTimeout>|null} */
  _timer = null;
  /** Called once with the full round's meta right after every event has been applied. */
  _onDone = null;

  /**
   * Load a fresh round (the full object returned by mockRgs's play()) and
   * reset all display state. Does NOT start playback — call start() after.
   * @param {object} playResult
   */
  loadRound(playResult) {
    this.cancel();
    this.events = playResult.events ?? [];
    this.eventIndex = -1;
    this.currentEvent = null;
    this.unhandledEvents = [];
    this.roundMeta = {
      roundId: playResult.roundId,
      mode: playResult.mode,
      betAmount: playResult.betAmount,
    };

    this.phase = 'idle';
    this.grid = null;
    this.wildCells = [];
    this.scatterCount = 0;
    this.baseWins = [];
    this.highlightedSymbols = new Set();

    this.featureActive = false;
    this.featureMode = null;
    this.featureParam = null;
    this.opponents = Array.from({ length: this.opponentCount }, () => ({ status: 'pending' }));
    this.pitchLog = [];
    this.currentOpponentIndex = 0;
    this.guaranteedSlotsRemaining = 0;
    this.livesRemaining = 0;
    this.currentHitCount = 0;
    this.lastPitch = null;
    this.featureEndSummary = null;

    this.roundResult = null;
  }

  /**
   * Begin stepping through events, one per timer tick.
   * @param {(roundMeta: object) => void} [onDone] - called once after the
   *   final event (round_result) has been applied and no more remain.
   */
  start(onDone) {
    this._onDone = onDone ?? null;
    this.isPlaying = true;
    this._scheduleNext(0);
  }

  /** Jump straight to the final state, applying every remaining event with
   * no delay — a QA/debug convenience to skip animation, not part of the
   * normal "watch it play out" flow. */
  skipToEnd() {
    this.cancel();
    while (this.eventIndex < this.events.length - 1) {
      this.eventIndex++;
      const evt = this.events[this.eventIndex];
      this.currentEvent = evt;
      this._applyEvent(evt);
    }
    this.isPlaying = false;
    this.phase = 'done';
    if (this._onDone) {
      const cb = this._onDone;
      this._onDone = null;
      cb(this.roundMeta);
    }
  }

  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.isPlaying = false;
  }

  _scheduleNext(delay) {
    this._timer = setTimeout(() => this._advance(), delay);
  }

  _advance() {
    this.eventIndex++;
    if (this.eventIndex >= this.events.length) {
      this.isPlaying = false;
      this.phase = 'done';
      this.currentEvent = null;
      if (this._onDone) {
        const cb = this._onDone;
        this._onDone = null;
        cb(this.roundMeta);
      }
      return;
    }
    const evt = this.events[this.eventIndex];
    this.currentEvent = evt;
    this._applyEvent(evt);
    const delay = STEP_DELAYS[evt.type] ?? DEFAULT_DELAY;
    this._scheduleNext(delay);
  }

  /** @param {{type: string, [key: string]: any}} evt */
  _applyEvent(evt) {
    switch (evt.type) {
      case 'spin_result': {
        this.grid = evt.grid;
        this.wildCells = evt.wildCells;
        this.scatterCount = evt.scatterCount;
        this.phase = 'spinning';
        break;
      }
      case 'base_game_win': {
        this.baseWins = [...this.baseWins, evt];
        const next = new Set(this.highlightedSymbols);
        next.add(evt.symbol);
        this.highlightedSymbols = next;
        this.phase = 'base_wins';
        break;
      }
      case 'scatter_trigger': {
        this.featureActive = true;
        this.featureMode = evt.mode;
        this.featureParam =
          evt.mode === 'pitcher'
            ? { guaranteedSlots: evt.guaranteedSlotsAtTrigger }
            : { lives: evt.livesAtTrigger };
        this.guaranteedSlotsRemaining = evt.guaranteedSlotsAtTrigger ?? 0;
        this.livesRemaining = evt.livesAtTrigger ?? 0;
        this.phase = 'feature_trigger';
        break;
      }
      case 'pitch': {
        this.currentOpponentIndex = evt.opponentIndex;
        this.opponents = this.opponents.map((o, i) =>
          i === evt.opponentIndex && o.status === 'pending' ? { ...o, status: 'current' } : o
        );
        if ('guaranteedSlotsRemaining' in evt) this.guaranteedSlotsRemaining = evt.guaranteedSlotsRemaining;
        if ('livesRemaining' in evt) this.livesRemaining = evt.livesRemaining;
        if ('hitCount' in evt) this.currentHitCount = evt.hitCount;
        this.lastPitch = evt;
        this.pitchLog = [...this.pitchLog, evt].slice(-30);
        this.phase = 'feature_pitching';
        break;
      }
      case 'opponent_cleared': {
        this.opponents = this.opponents.map((o, i) =>
          i === evt.opponentIndex
            ? { ...o, status: 'cleared', baseScoreAdded: evt.baseScoreAdded, drawnMultiplier: evt.drawnMultiplier }
            : o
        );
        this.currentHitCount = 0;
        this.phase = 'opponent_cleared';
        break;
      }
      case 'feature_end': {
        if (evt.endReason === 'early_termination') {
          this.opponents = this.opponents.map((o) => (o.status === 'current' ? { ...o, status: 'failed' } : o));
        }
        this.featureEndSummary = evt;
        this.phase = 'feature_end';
        break;
      }
      case 'round_result': {
        this.roundResult = evt;
        this.phase = 'round_result';
        break;
      }
      default: {
        // Contract violation / future event type this player doesn't know
        // about yet — surface it loudly instead of silently dropping it.
        console.warn(`RoundPlayer: unhandled event type "${evt.type}"`, evt);
        this.unhandledEvents = [...this.unhandledEvents, evt];
        break;
      }
    }
  }
}
