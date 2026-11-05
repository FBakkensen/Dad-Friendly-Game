/* global console, process */
/**
 * The edit-and-test loop: typecheck, then ESLint and `vitest related` on the
 * files changed since origin/main (committed, staged, unstaged, untracked).
 *   npm run check:fast
 * `npm run check` is still the gate before every PR.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { changedCode, splitGitPaths } from "../src/fast-check.ts";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function base() {
  try {
    return git("merge-base", "origin/main", "HEAD").trim();
  } catch {
    // No origin/main here (and no network wanted in the fast loop): HEAD.
    console.log("check:fast: no origin/main; comparing against HEAD.");
    return "HEAD";
  }
}

const files = changedCode([
  ...splitGitPaths(git("diff", "--name-only", "-z", base())),
  ...splitGitPaths(git("ls-files", "--others", "--exclude-standard", "-z")),
]).filter((path) => existsSync(path));

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\ncheck:fast: ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

run("typecheck", "npm", ["run", "typecheck", "--silent"]);
if (files.length === 0) {
  console.log("\ncheck:fast: no changed code files; skipping lint and tests.");
} else {
  console.log(`\ncheck:fast: ${String(files.length)} changed code file(s).`);
  run("lint (changed files)", "npx", [
    "eslint",
    "--cache",
    "--max-warnings",
    "0",
    ...files,
  ]);
  run("vitest related", "npx", [
    "vitest",
    "related",
    "--run",
    "--passWithNoTests",
    ...files,
  ]);
}
console.log("\ncheck:fast passed. Run npm run check before the PR.");
