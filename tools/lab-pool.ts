/**
 * Runs `tasks` with at most `limit` in flight (at least one; a limit that is
 * not a number is one), taking them in the order given. The results come
 * back in that same order, whichever finishes first. The first failure
 * rejects the pool, and no task starts after it. Tasks already running are
 * left to finish.
 */
export async function inOrder<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<readonly T[]> {
  const results: T[] = new Array<T>(tasks.length);
  const lanes = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
  let next = 0;
  let failed = false;
  const lane = async (): Promise<void> => {
    while (!failed && next < tasks.length) {
      const at = next;
      next += 1;
      const task = tasks[at];
      /* v8 ignore next 3 -- `at` is always below tasks.length */
      if (task === undefined) {
        return;
      }
      try {
        results[at] = await task();
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(lanes, tasks.length) }, lane),
  );
  return results;
}
