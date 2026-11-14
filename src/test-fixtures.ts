import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { readSave, serializeSave, type ParsedSave } from "./persist";
import { readSessionSave } from "./session-save";
import { readGame } from "./save-format";

/** A mountain after `count` hand taps. */
export function minedMountain(count: number): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - count,
    pocket: count,
  };
}

/** The mountain after a save through JSON and back, or undefined when it does not read `ok`. */
export function reloaded(
  mountain: Mountain,
  lastSeen = 1,
): Mountain | undefined {
  const read = readSave(
    JSON.parse(JSON.stringify(serializeSave({ mountain, lastSeen }))),
  );
  return read.kind === "ok" ? read.save.mountain : undefined;
}

/** A game map read on its own, or undefined when it does not read `ok`. */
export function gameOf(game: unknown): Mountain | undefined {
  const read = readGame(game, 0);
  return read.kind === "ok" ? read.mountain : undefined;
}

/** The stored text of a save holding this mountain, laid over a fresh one. */
export function saveText(
  mountain: Partial<Mountain>,
  lastSeen: number,
): string {
  return JSON.stringify(
    serializeSave({ mountain: { ...createMountain(), ...mountain }, lastSeen }),
  );
}

/** The guest save on this storage when it reads `ok`, else undefined. */
export function guestSave(storage: Storage): ParsedSave | undefined {
  const read = readSessionSave({ storage });
  return read.kind === "ok" ? read.save : undefined;
}
