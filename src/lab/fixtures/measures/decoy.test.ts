import { describe, expect, it } from "vitest";
import { isDiscoveredFile } from "../../registry";

describe("registry decoy", () => {
  it("is a test file, so the loader skips it", () => {
    expect(isDiscoveredFile("decoy.test.ts")).toBe(false);
  });
});
