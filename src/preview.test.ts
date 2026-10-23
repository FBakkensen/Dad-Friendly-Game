import { afterEach, describe, expect, it } from "vitest";
import { milestonePreviewEnabled, milestonePreviewLine } from "./preview.ts";

describe("milestone preview flag", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("stays off unless the preview flag is set", () => {
    expect(milestonePreviewEnabled()).toBe(false);
    expect(milestonePreviewLine(2, "drills")).toBeUndefined();
  });

  it("names the next mark only while the flag is on", () => {
    window.history.replaceState(null, "", "/?preview=milestones");
    expect(milestonePreviewEnabled()).toBe(true);
    expect(milestonePreviewLine(2, "drills")).toBe(
      "Preview · 2 of 10 drills: at 10, every drill digs twice as fast.",
    );
    expect(milestonePreviewLine(12, "drills")).toBe(
      "Preview · 12 of 25 drills: at 25, every drill digs twice as fast.",
    );
    expect(milestonePreviewLine(50, "drills")).toBeUndefined();
  });
});
