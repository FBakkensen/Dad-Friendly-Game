/**
 * A copy on its way to Saved copies, waited on for at most the archive wait,
 * so a move never hangs on an offline phone (#480). The answer goes to the
 * field log and, on a miss, to the save line. Used by the moves that leave a
 * mountain behind and by the set-aside of a copy from before this version
 * (#558).
 */
import type { ArchiveReason, CloudWriteResult } from "./cloud-save";
import { settleWithin, type GaveUp } from "./settle-within";
import { log, record, type StoreContext } from "./store-context";
import { emit } from "./store-session";

/**
 * True when the copy landed. False when it failed or gave up (logged), or
 * when `still` says the save moved on meanwhile (not logged).
 */
export async function archiveWithin(
  ctx: StoreContext,
  write: Promise<CloudWriteResult>,
  reason: ArchiveReason,
  mined: number,
  still: () => boolean,
): Promise<boolean> {
  const answer = await settleWithin(write, ctx.ports.archiveWaitMs);
  if (!still()) {
    return false;
  }
  const failed = archiveFailure(answer);
  if (failed !== undefined) {
    record(ctx, "save.archive", { id: reason, source: failed });
    log(ctx, {
      level: "error",
      code: "save.archive",
      detail: `${reason} ${failed}`,
      data: { mined },
    });
    emit(ctx);
    return false;
  }
  record(ctx, "save.archive", { id: reason, stones: mined });
  return true;
}

/** Why the copy did not land, or undefined when it did. */
function archiveFailure(answer: CloudWriteResult | GaveUp): string | undefined {
  if (typeof answer === "string") {
    return answer;
  }
  return answer.kind === "ok" ? undefined : answer.message;
}
