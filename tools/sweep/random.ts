/** One deterministic stream. The same seed replays the same draws. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let draw = Math.imul(state ^ (state >>> 15), 1 | state);
    draw = (draw + Math.imul(draw ^ (draw >>> 7), 61 | draw)) ^ draw;
    return ((draw ^ (draw >>> 14)) >>> 0) / 4294967296;
  };
}
