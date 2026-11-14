/**
 * Every writer reads back what it is about to write (#558): a save this build
 * could not read goes nowhere, not to the cloud, the phone backup or the
 * guest save. Saying so happens once per refusal, not on every tick.
 */
import type { Mountain } from "./mountain";
import { readSave, serializeSave } from "./persist";
import { saveCounts } from "./session";
import { log, record, type StoreContext } from "./store-context";

/** True when this build could not read the save it is about to write. */
export function shapeRefused(
  ctx: StoreContext,
  mountain: Mountain,
  lastSeen: number,
): boolean {
  const read = readSave(
    JSON.parse(JSON.stringify(serializeSave({ mountain, lastSeen }))),
  );
  if (read.kind === "ok") {
    ctx.shapeRefused = false;
    return false;
  }
  ctx.saveKind = "error";
  if (ctx.shapeRefused) {
    return true;
  }
  ctx.shapeRefused = true;
  record(ctx, "save.shape", { source: read.kind });
  log(ctx, {
    level: "error",
    code: "save.shape",
    detail: read.kind,
    data: saveCounts(mountain),
  });
  ctx.hooks.emit();
  return true;
}
