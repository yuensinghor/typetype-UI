// src/lib/prng.ts
//
// Small seeded PRNG (mulberry32) for reproducible content generation.
// Math.random() is NOT seedable, so anything that needs the same output
// for the same input (e.g. Level N always rolling the same trait combo)
// needs to go through this instead.
//
// Usage:
//   const rand = mulberry32(seed);
//   rand()          -> float in [0, 1)
//   randInt(rand, 1, 6) -> int in [1, 6] inclusive
//   pick(rand, arr) -> random element of arr

export type RandFn = () => number;

/**
 * Creates a seeded pseudo-random generator. Same seed always produces the
 * same sequence of outputs, across browsers/sessions/devices.
 */
export function mulberry32(seed: number): RandFn {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max], inclusive on both ends. */
export function randInt(rand: RandFn, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/** Random element from a non-empty array. */
export function pick<T>(rand: RandFn, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Random boolean, optionally weighted (probability of true, default 0.5). */
export function chance(rand: RandFn, probability = 0.5): boolean {
  return rand() < probability;
}
