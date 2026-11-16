/** Float dust between two equal crews never moves a hand. */
export function moreStones(stones: number, than: number): boolean {
  return stones > than + 1e-9 * Math.max(1, Math.abs(than));
}
