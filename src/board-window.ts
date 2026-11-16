/*
 * The board's frame clock (#371): one step a frame, which the frame's scene
 * painter runs. The board's old mine window went with the board (#727).
 */

/** The longest step the board takes: a tab back from hours away is one 0.1s step. */
const MAX_DT = 0.1;

/**
 * Calls `step` once a frame with the seconds since the last one, capped at 0.1, until `signal`
 * aborts. Without requestAnimationFrame (tests, very old browsers) it does nothing.
 */
export function runBoardLoop(
  step: (dt: number) => void,
  signal?: AbortSignal,
): void {
  if (typeof requestAnimationFrame !== "function") {
    return;
  }
  if (signal?.aborted) {
    return;
  }
  let last: number | undefined;
  let pending = 0;
  const frame = (now: number): void => {
    // the next frame is asked for first, so a step that throws never stops the board
    pending = requestAnimationFrame(frame);
    const dt = last === undefined ? undefined : (now - last) / 1000;
    last = now;
    if (dt !== undefined) {
      step(Math.min(MAX_DT, Math.max(0, dt)));
    }
  };
  pending = requestAnimationFrame(frame);
  signal?.addEventListener(
    "abort",
    () => {
      cancelAnimationFrame(pending);
    },
    { once: true },
  );
}
