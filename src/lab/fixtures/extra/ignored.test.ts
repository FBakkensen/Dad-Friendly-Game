import { describe, expect, it } from "vitest";

describe("policy fixture folder", () => {
  it("holds a test file the loader must skip", () => {
    expect("skipped").toBe("skipped");
  });
});
