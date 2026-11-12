/**
 * A cloud answer, or a give-up: `timeout` once `ms` pass, `rejected` when the
 * call throws. Used where the game must not wait on an offline phone: the
 * fresh read on resume, and the copy a new run keeps first (#480).
 */
export type GaveUp = "timeout" | "rejected";

type Timer = ReturnType<typeof setTimeout>;

export function settleWithin<T>(
  work: Promise<T>,
  ms: number,
  /** Told the timer as it starts (running) and once it is done, so a dispose can clear it. */
  track: (timer: Timer, running: boolean) => void = () => undefined,
): Promise<T | GaveUp> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | GaveUp): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      track(timer, false);
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish("timeout");
    }, ms);
    track(timer, true);
    work.then(finish, () => {
      finish("rejected");
    });
  });
}
