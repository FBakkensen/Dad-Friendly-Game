/* global console */
/**
 * The code files changed since origin/main: committed, staged, unstaged, and
 * untracked. Shared by the gate (scripts/gate.mjs) and its Claude Code hooks
 * (scripts/gate-hook.mjs). Run from the repo root.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { changedCode, splitGitPaths } from "../src/gate.ts";

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

/** Repo-relative code paths that still exist, sorted, once each. */
export function changedSinceMain() {
  return changedCode([
    ...splitGitPaths(git("diff", "--name-only", "-z", base())),
    ...splitGitPaths(git("ls-files", "--others", "--exclude-standard", "-z")),
  ]).filter((path) => existsSync(path));
}
