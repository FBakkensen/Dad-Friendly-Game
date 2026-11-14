import { factor } from "./economy/factors";

/**
 * The sweep factor that switches the line (M15, #532). A factor reads 1 when
 * no sweep runs, so 1 is off (play today) and a lab run sets it to 0 to play
 * the line. Its own leaf, so the tier table can read the switch while the
 * line's rule (`src/line.ts`) reads the table's stages.
 */
export const LINE_OFF = "line.off";

/** True when the crew moves what the line moves, not the sum of its parts. */
export function lineOn(): boolean {
  return factor(LINE_OFF) === 0;
}
