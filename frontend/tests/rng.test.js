import { describe, it, expect } from 'vitest';
import { createRng, createForcedOutcomeQueue } from '../src/lib/mockRgs/rng.js';

describe('createRng', () => {
  it('is reproducible: same seed produces the same sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('nextFloat stays within [0, 1)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt stays within [0, max)', () => {
    const rng = createRng(2);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('pickWeighted respects weight-0 exclusion and only returns provided values', () => {
    const rng = createRng(3);
    const items = [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 1 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(['a', 'b']).toContain(rng.pickWeighted(items));
    }
  });

  it('pickWeighted heavily favors a much larger weight', () => {
    const rng = createRng(4);
    const items = [
      { value: 'common', weight: 999 },
      { value: 'rare', weight: 1 },
    ];
    let commonCount = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (rng.pickWeighted(items) === 'common') commonCount++;
    }
    expect(commonCount / trials).toBeGreaterThan(0.9);
  });
});

describe('createForcedOutcomeQueue', () => {
  it('returns forced outcomes in order before falling back to the real draw', () => {
    const queue = createForcedOutcomeQueue([true, false, true]);
    const drawRealSpy = () => {
      throw new Error('should not be called while forced outcomes remain');
    };
    expect(queue.next(drawRealSpy)).toBe(true);
    expect(queue.next(drawRealSpy)).toBe(false);
    expect(queue.next(drawRealSpy)).toBe(true);
  });

  it('falls back to the real draw once the forced list is exhausted', () => {
    const queue = createForcedOutcomeQueue([true]);
    expect(queue.next(() => false)).toBe(true); // forced
    expect(queue.next(() => false)).toBe(false); // fell back
    expect(queue.next(() => true)).toBe(true); // fell back
  });

  it('with undefined forcedOutcomes, always falls back to the real draw', () => {
    const queue = createForcedOutcomeQueue(undefined);
    expect(queue.next(() => true)).toBe(true);
    expect(queue.next(() => false)).toBe(false);
  });
});
