import glassworksUrl from "./assets/board/mach-glassworks.png";
import partsPressUrl from "./assets/board/mach-parts-press.png";
import precisionAssemblyUrl from "./assets/board/mach-precision-assembly.png";
import glassUrl from "./assets/board/res-glass.png";
import researchLabUrl from "./assets/city/research-lab.png";

/**
 * The Slice 2 Part 2 art, one entry per id (#774–#778, PixelLab). The screens
 * read their pictures here so a redrawn asset is a one-line swap.
 */
export const PART2_ART = {
  glass: glassUrl,
  glassworks: glassworksUrl,
  partsPress: partsPressUrl,
  precisionAssembly: precisionAssemblyUrl,
  researchLab: researchLabUrl,
} as const;
