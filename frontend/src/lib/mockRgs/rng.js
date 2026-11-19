/**
 * rng.js — seedable PRNG + debug/force helpers for the mock RGS layer.
 *
 * Why a seedable PRNG: a real Stake RGS pre-computes every round from a
 * weighted CSV and the frontend never influences the outcome. For our mock
 * layer we want the same "pick a result, then just play it back" shape, but
 * we also want:
 *   1. Reproducible results in unit tests (seed in -> same round out).
 *   2. A manual-QA "force result" tool so a human can trigger the Bonus Game
 *      on demand instead of clicking spin hundreds of times. This mirrors the
 *      "test RNG" / force-result pattern already used elsewhere in this
 *      team's QA workflow (see 知識庫/通用/*testRng* docs) — it's a deliberate
 *      feature, not a shortcut.
 *
 * Nothing in this file is tied to slot/duel domain logic — it's generic
 * enough to reuse for any future mock-RGS game.
 */

/**
 * Create a seeded PRNG using the mulberry32 algorithm (small, fast, decent
 * statistical quality for game-feel purposes — NOT cryptographically secure,
 * which is fine, a real RGS result is already pre-computed server-side and
 * this mock never needs to resist prediction).
 *
 * @param {number} seed - any 32-bit integer. Same seed => same sequence.
 * @returns {{
 *   nextFloat: () => number,        // uniform [0, 1)
 *   nextInt: (maxExclusive: number) => number, // uniform integer [0, maxExclusive)
 *   pickWeighted: <T>(items: Array<{value: T, weight: number}>) => T,
 *   seed: number,
 * }}
 */
export function createRng(seed = Date.now() | 0) {
  let state = seed >>> 0;

  function nextFloat() {
    // mulberry32
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(maxExclusive) {
    if (!(maxExclusive > 0)) throw new Error('nextInt requires maxExclusive > 0');
    return Math.floor(nextFloat() * maxExclusive);
  }

  /**
   * Weighted random pick. `items` is [{value, weight}, ...] with weight > 0.
   * Lower-indexed ties resolve deterministically (no reliance on object
   * iteration order quirks).
   */
  function pickWeighted(items) {
    if (!items || items.length === 0) throw new Error('pickWeighted requires a non-empty array');
    const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
    if (!(totalWeight > 0)) throw new Error('pickWeighted requires total weight > 0');
    let roll = nextFloat() * totalWeight;
    for (const item of items) {
      roll -= item.weight;
      if (roll < 0) return item.value;
    }
    // Floating point edge case: fall back to the last item.
    return items[items.length - 1].value;
  }

  return { nextFloat, nextInt, pickWeighted, seed };
}

/**
 * Supported forced scatter counts for manual QA / tests. Anything else in
 * the base game is left to natural randomness. (0 = force a non-triggering
 * spin; 3/4/5 = force exactly that many scatters so the Bonus Game always
 * triggers with a known parameter.)
 */
export const FORCEABLE_SCATTER_COUNTS = [0, 3, 4, 5];

/**
 * Small stateful helper used by duelFeature.js to let a caller force a
 * specific sequence of pitch outcomes (success/failure) for manual QA or
 * deterministic tests, while any pitches beyond the forced list still fall
 * back to genuine RNG draws against the real success probability.
 *
 * This intentionally only overrides the *random-draw* step of a pitch
 * judgement — it never fabricates a "forced success" from a guaranteed
 * slot/life; that bookkeeping belongs to duelFeature.js's own mechanic.
 *
 * @param {boolean[] | undefined} forcedOutcomes
 */
export function createForcedOutcomeQueue(forcedOutcomes) {
  let index = 0;
  return {
    /**
     * @param {() => boolean} drawReal - fallback that performs the genuine
     *   random draw (e.g. `() => rng.nextFloat() < baseSuccessProb`).
     * @returns {boolean}
     */
    next(drawReal) {
      if (forcedOutcomes && index < forcedOutcomes.length) {
        return forcedOutcomes[index++];
      }
      return drawReal();
    },
    /** How many forced outcomes have been consumed so far (for debugging/logs). */
    consumedCount() {
      return index;
    },
  };
}
