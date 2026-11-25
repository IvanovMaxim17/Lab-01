export interface Prng {
  next(): number;
  range(min: number, max: number): number;
  getState(): number;
  setState(savedState: number): void;
}

export function createPrng(seed = 1): Prng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min: number, max: number): number {
    return min + next() * (max - min);
  }

  return {
    next,
    range,
    getState(): number {
      return state;
    },
    setState(savedState: number): void {
      state = savedState >>> 0;
    },
  };
}