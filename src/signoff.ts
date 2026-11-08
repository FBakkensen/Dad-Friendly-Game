/**
 * The pure half of `npm run gate -- signoff` (scripts/signoff.mjs, #397).
 *
 * A green full gate on a clean, committed HEAD leaves a marker. Signoff reads
 * it and asks the `signoff.yml` relay to post a `signoff` commit status, which
 * the ruleset on main requires. Cloud sessions cannot post statuses
 * themselves; the relay can, with the Actions token.
 */
import { GATE_DIR } from "./gate.ts";

/** Git-ignored: the commit the last green full run passed on. */
export const MARKER = `${GATE_DIR}/passed`;

/** GitHub's limit on a commit status description. */
const DESCRIPTION_MAX = 140;
const SHA = /^[0-9a-f]{40}$/;

export interface Marker {
  readonly sha: string;
  /** The full gate's total line, shown on the status. */
  readonly summary: string;
}

export function markerText(marker: Marker): string {
  return `${marker.sha}\n${marker.summary}\n`;
}

export function parseMarker(text: string | undefined): Marker | undefined {
  if (text === undefined) return undefined;
  const [sha = "", summary = ""] = text.split("\n");
  return SHA.test(sha) && summary.trim() !== ""
    ? { sha, summary: summary.trim() }
    : undefined;
}

export interface FullRun {
  readonly green: boolean;
  readonly headBefore: string;
  readonly headAfter: string;
  /** No uncommitted or untracked files. */
  readonly cleanBefore: boolean;
  readonly cleanAfter: boolean;
  readonly summary: string;
}

export type MarkerMove =
  | { readonly kind: "write"; readonly marker: Marker }
  | { readonly kind: "none"; readonly reason: string };

/** A pass counts only when the checks ran on exactly one committed tree. */
export function markerAfterFull(run: FullRun): MarkerMove {
  if (!run.green) return { kind: "none", reason: "the gate is red" };
  if (!run.cleanBefore || !run.cleanAfter) {
    return {
      kind: "none",
      reason: "uncommitted files; commit them and run the full gate again",
    };
  }
  if (run.headBefore !== run.headAfter) {
    return { kind: "none", reason: "HEAD moved during the run" };
  }
  return {
    kind: "write",
    marker: { sha: run.headAfter, summary: run.summary },
  };
}

export interface SignoffState {
  readonly head: string;
  readonly marker: Marker | undefined;
  readonly dirty: boolean;
  /** HEAD is on a remote branch, so GitHub has the commit. */
  readonly pushed: boolean;
}

export type Signoff =
  | {
      readonly kind: "post";
      readonly sha: string;
      readonly description: string;
    }
  | { readonly kind: "refuse"; readonly message: string };

export function decideSignoff(state: SignoffState): Signoff {
  if (state.dirty) {
    return {
      kind: "refuse",
      message: "uncommitted files. Commit them, then run the full gate.",
    };
  }
  if (!state.pushed) {
    return {
      kind: "refuse",
      message: "HEAD is not on GitHub yet. git push first.",
    };
  }
  if (state.marker?.sha !== state.head) {
    return {
      kind: "refuse",
      message: "no green full run on HEAD. Run npm run gate -- full first.",
    };
  }
  return {
    kind: "post",
    sha: state.head,
    description: state.marker.summary.slice(0, DESCRIPTION_MAX),
  };
}

export type SignoffStatus = "success" | "pending" | "failure" | "missing";

/** The `signoff` entry of a commit's combined status. */
export function signoffState(
  statuses: readonly { readonly context: string; readonly state: string }[],
): SignoffStatus {
  const entry = statuses.find((status) => status.context === "signoff");
  if (entry === undefined) return "missing";
  if (entry.state === "success" || entry.state === "pending") {
    return entry.state;
  }
  return "failure";
}
