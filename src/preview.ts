/** Dev-only look at a rule that is not in the game yet. */
const MILESTONE_PREVIEW = "milestones";

const MILESTONE_MARKS = [10, 25, 50] as const;

export function milestonePreviewEnabled(): boolean {
  if (typeof location === "undefined") {
    return false;
  }
  return (
    new URLSearchParams(location.search).get("preview") === MILESTONE_PREVIEW
  );
}

/**
 * Ownership milestones are not in the rules. The line appears only when
 * `?preview=milestones` is set.
 */
export function milestonePreviewLine(
  ownedCount: number,
  plural: string,
): string | undefined {
  if (!milestonePreviewEnabled()) {
    return undefined;
  }
  const mark = MILESTONE_MARKS.find((step) => ownedCount < step);
  if (mark === undefined) {
    return undefined;
  }
  const one = plural.endsWith("s") ? plural.slice(0, -1) : plural;
  return `Preview · ${String(ownedCount)} of ${String(mark)} ${plural}: at ${String(mark)}, every ${one} digs twice as fast.`;
}
