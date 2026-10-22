/** A control's box in CSS pixels, as the audit script measured it. */
export type Box = {
  readonly selector: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/** Targets with either side under `minimum` (48px unless a test says otherwise). */
export function undersizedTargets(
  targets: readonly Box[],
  minimum = 48,
): Box[] {
  return targets.filter(
    (target) => target.width < minimum || target.height < minimum,
  );
}

/**
 * Shortest gap between the edges. 0 when the boxes overlap or touch.
 * A diagonal gap is the straight-line distance between the corners.
 */
export function edgeGap(a: Box, b: Box): number {
  const overlapX =
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const overlapY =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const sepX = overlapX >= 0 ? 0 : -overlapX;
  const sepY = overlapY >= 0 ? 0 : -overlapY;
  if (sepX === 0 && sepY === 0) {
    return 0;
  }
  if (sepX === 0) {
    return sepY;
  }
  if (sepY === 0) {
    return sepX;
  }
  return Math.hypot(sepX, sepY);
}

/** True when `inner` sits entirely inside `outer`. */
export function containsBox(outer: Box, inner: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  );
}

/**
 * Pairs closer than `gapPx`, skipping a control that sits inside another
 * (a card button that contains its own label is one target).
 */
export function targetsCloserThan(
  targets: readonly Box[],
  gapPx = 8,
): { readonly a: string; readonly b: string; readonly gap: number }[] {
  const pairs: { a: string; b: string; gap: number }[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const a = targets[i];
      const b = targets[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      if (containsBox(a, b) || containsBox(b, a)) {
        continue;
      }
      const gap = edgeGap(a, b);
      if (gap < gapPx) {
        pairs.push({ a: a.selector, b: b.selector, gap });
      }
    }
  }
  return pairs;
}

/** The page or a sheet scrolls when its scroll height exceeds the client. */
export function scrollOverflows(box: {
  readonly scrollHeight: number;
  readonly clientHeight: number;
}): { readonly scrolls: boolean; readonly overflow: number } {
  const overflow = box.scrollHeight - box.clientHeight;
  return { scrolls: overflow > 0, overflow };
}

/** WCAG relative luminance contrast, from 1 to 21. */
export function contrastRatio(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Large text is 24px, or 18.66px (14pt) at weight 700 or more. WCAG 1.4.3. */
export function isLargeText(
  fontSizePx: number,
  fontWeight: number | string,
): boolean {
  const weight =
    typeof fontWeight === "number" ? fontWeight : Number(fontWeight);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
}

/** Body text needs 4.5:1. Large text and controls need 3:1. */
export function passesContrast(
  ratio: number,
  kind: "body" | "large" | "control",
): boolean {
  return ratio >= (kind === "body" ? 4.5 : 3);
}

function luminance(rgb: readonly [number, number, number]): number {
  const [red, green, blue] = rgb;
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}
