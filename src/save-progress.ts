import { minedOut, runStartedAt, type Mountain } from "./mountain";

/**
 * One moment of a save, on the phone or in the cloud.
 *
 * Which moment is ahead (#222):
 * 1. A later run wins. `startedAt` is stamped by Start over and by passing
 *    the mine. A missing stamp is 0. An older run loses even if it mined more.
 * 2. More stones mined wins. Inside a run, mining only goes up.
 * 3. A newer `lastSeen` wins when the run and the stones match. A purchase
 *    spends pocket and does not mine, so the clock is the tie-break.
 * 4. A tie is 0. Two real copies keep the phone and do not upload.
 *    A phone that has never saved is not a copy, so the caller keeps the cloud.
 */
export type SaveMoment = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
};

/** Positive when `left` is strictly ahead of `right`. */
export function compareSaveProgress(
  left: SaveMoment,
  right: SaveMoment,
): number {
  const run = runStartedAt(left.mountain) - runStartedAt(right.mountain);
  if (run !== 0) {
    return run;
  }
  const mined = minedOut(left.mountain) - minedOut(right.mountain);
  if (mined !== 0) {
    return mined;
  }
  return (left.lastSeen ?? 0) - (right.lastSeen ?? 0);
}
