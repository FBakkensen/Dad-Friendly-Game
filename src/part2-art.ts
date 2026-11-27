import machKilnUrl from "./assets/board/mach-kiln.png";
import machMachineUrl from "./assets/board/mach-machine.png";
import machSawUrl from "./assets/board/mach-saw.png";
import resCutStoneUrl from "./assets/board/res-cut-stone.png";
import foundryUrl from "./assets/city/foundry.png";

/**
 * Single temporary art lookup for Slice 2 Part 2 assets being drawn in
 * #774–#778 (one entry per id). Each borrows the closest shipped PNG so
 * landing real PixelLab art is a one-line swap. (`res-parts.png` already
 * ships in `src/price-icons.ts`.)
 */
export const PART2_ART = {
  glass: resCutStoneUrl,
  glassworks: machKilnUrl,
  partsPress: machSawUrl,
  precisionAssembly: machMachineUrl,
  researchLab: foundryUrl,
} as const;
