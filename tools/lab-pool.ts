/**
 * Runs `tasks` with at most `limit` in flight (at least one), taking them in
 * the order given. The results come back in that same order, whichever
 * finishes first. The first failure rejects the whole pool.
 */
export async function inOrder<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<readonly T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < tasks.length) {
      const at = next;
      next += 1;
      const task = tasks[at];
      /* v8 ignore next 3 -- `at` is always below tasks.length */
      if (task === undefined) {
        return;
      }
      results[at] = await task();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, lane),
  );
  return results;
}
