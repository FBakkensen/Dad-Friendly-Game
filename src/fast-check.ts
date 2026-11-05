/**
 * The pure half of `npm run check:fast` (scripts/check-fast.mjs): which of
 * the changed paths ESLint and `vitest related` should get.
 */

const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const BUILT = /^(?:dist|coverage|node_modules)\//;

/**
 * Paths come from git (repo-relative, `/`-separated) and may repeat. Deleted
 * files are the caller's to drop: this module does not touch the disk.
 */
export function changedCode(paths: readonly string[]): readonly string[] {
  return [
    ...new Set(paths.filter((path) => CODE.test(path) && !BUILT.test(path))),
  ].sort();
}

/** Splits `git ... --name-only -z` output. */
export function splitGitPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}
