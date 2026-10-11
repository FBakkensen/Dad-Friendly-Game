/** How far above the finger the "+1" starts, so a thumb doesn't hide it. */
export const TAP_FLOAT_LIFT_PX = 70;
const JITTER_PX = 12;
/** Keep the float's centre this far inside the mountain's edges. */
const MARGIN_PCT = 8;

type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Where a tap's "+1" spawns, as percentages of the mountain box: well above the
 * touch point, nudged sideways a little, and always inside the mountain.
 */
export function tapFloatSpot(
  box: Box,
  point: { readonly x: number; readonly y: number } | undefined,
  random: () => number = Math.random,
): { readonly x: number; readonly y: number } {
  if (point === undefined || box.width <= 0 || box.height <= 0) {
    return { x: 50, y: 40 };
  }
  const jitter = (random() * 2 - 1) * JITTER_PX;
  const x = ((point.x - box.left + jitter) / box.width) * 100;
  const y = ((point.y - box.top - TAP_FLOAT_LIFT_PX) / box.height) * 100;
  const clamp = (value: number) =>
    Math.min(100 - MARGIN_PCT, Math.max(MARGIN_PCT, value));
  return { x: clamp(x), y: clamp(y) };
}
