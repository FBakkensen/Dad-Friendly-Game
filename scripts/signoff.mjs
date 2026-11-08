/* global console, setTimeout */
/**
 * `npm run gate -- signoff` (#397): after a green `npm run gate -- full` on a
 * clean, pushed HEAD, ask the signoff.yml relay to post the `signoff` commit
 * status, then wait for it to show. The rules are in src/signoff.ts.
 *
 * The relay exists because cloud sessions may not post commit statuses, but
 * may start a workflow. Every machine uses it, so there is one path. Never
 * post `signoff` any other way.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  MARKER,
  decideSignoff,
  parseMarker,
  signoffState,
} from "../src/signoff.ts";

const WAIT_MS = 90_000;
const POLL_MS = 5_000;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** `gh api` with the repo filled in from the git remote. */
function gh(...args) {
  const run = spawnSync("gh", ["api", ...args], { encoding: "utf8" });
  return {
    ok: run.status === 0,
    out: run.stdout ?? "",
    err: (run.stderr || run.error?.message) ?? "",
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {Promise<0 | 1>} the exit code */
export async function signoff() {
  const head = git("rev-parse", "HEAD");
  const short = head.slice(0, 7);
  const decision = decideSignoff({
    head,
    marker: parseMarker(
      existsSync(MARKER) ? readFileSync(MARKER, "utf8") : undefined,
    ),
    dirty: git("status", "--porcelain") !== "",
    pushed: git("branch", "-r", "--contains", "HEAD") !== "",
  });
  if (decision.kind === "refuse") {
    console.log(`gate signoff: ${decision.message}`);
    return 1;
  }

  // ref main: the relay runs as main has it, whatever the branch holds.
  const dispatched = gh(
    "-X",
    "POST",
    "repos/{owner}/{repo}/actions/workflows/signoff.yml/dispatches",
    "-f",
    "ref=main",
    "-f",
    `inputs[sha]=${decision.sha}`,
    "-f",
    `inputs[summary]=${decision.description}`,
  );
  if (!dispatched.ok) {
    console.log(
      `gate signoff: could not start signoff.yml.\n${dispatched.err}`,
    );
    return 1;
  }
  console.log(`gate signoff: asked signoff.yml to sign off ${short}.`);

  let seen = "missing";
  for (let waited = 0; waited <= WAIT_MS; waited += POLL_MS) {
    await sleep(POLL_MS);
    const status = gh(`repos/{owner}/{repo}/commits/${decision.sha}/status`);
    if (!status.ok) continue;
    seen = signoffState(JSON.parse(status.out).statuses ?? []);
    if (seen === "success") {
      console.log(`gate signoff: signoff is green on ${short}.`);
      return 0;
    }
    if (seen === "failure") break;
  }
  console.log(
    `gate signoff: signoff on ${short} is ${seen}. See the signoff runs in GitHub Actions.`,
  );
  return 1;
}
