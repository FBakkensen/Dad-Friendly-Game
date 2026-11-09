const COUNT_STEPS = 8;
const COUNT_STEP_MS = 60;

/** The crew line's rate, counting up to its new value after a buy. */
export interface RateCounter {
  count(from: number, to: number): void;
}

/**
 * Counts from `from` to `to` in 8 steps of 60ms, painting each rate it shows, then undefined
 * for the live rate. Under reduced motion, or when the rate did not grow, it paints the live
 * rate at once. A new count stops the one running.
 */
export function createRateCounter({
  reduced,
  paint,
}: {
  reduced: () => boolean;
  paint: (shown: number | undefined) => void;
}): RateCounter {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  return {
    count(from, to) {
      stop();
      if (reduced() || to <= from) {
        paint(undefined);
        return;
      }
      let step = 0;
      paint(from);
      timer = setInterval(() => {
        step += 1;
        if (step >= COUNT_STEPS) {
          stop();
          paint(undefined);
          return;
        }
        paint(Math.round(from + ((to - from) * step) / COUNT_STEPS));
      }, COUNT_STEP_MS);
    },
  };
}
