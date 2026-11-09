/* global console */
/**
 * The code files changed since origin/main: committed, staged, unstaged, and
 * untracked. Used by the gate (scripts/gate.mjs). Run from the repo root.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { changedCode, splitGitPaths, touchedFiles } from "../src/gate.ts";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function base() {
  try {
    return git("merge-base", "origin/main", "HEAD").trim();
  } catch {
    // No origin/main here (and no network wanted in the fast loop): HEAD.
    console.log("gate: no origin/main; comparing against HEAD.");
    return "HEAD";
  }
}

const sincePaths = () => [
  ...splitGitPaths(git("diff", "--name-only", "-z", base())),
  ...splitGitPaths(git("ls-files", "--others", "--exclude-standard", "-z")),
];

/** Repo-relative code paths that still exist, sorted, once each. */
export function changedSinceMain() {
  return changedCode(sincePaths()).filter((path) => existsSync(path));
}

/** Every changed path of any kind that still exists, sorted, once each. */
export function touchedSinceMain() {
  return touchedFiles(sincePaths()).filter((path) => existsSync(path));
}
