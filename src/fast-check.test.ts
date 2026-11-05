import { describe, expect, it } from "vitest";
import { changedCode, splitGitPaths } from "./fast-check";

describe("changedCode", () => {
  it("keeps code files once, sorted, and drops docs, art, and build output", () => {
    expect(
      changedCode([
        "src/mountain.ts",
        "scripts/play.mjs",
        "docs/DESIGN.md",
        "public/art/worker.png",
        "src/mountain.ts",
        "eslint.config.js",
        "dist/assets/index.js",
        "coverage/lcov.js",
        "node_modules/vite/index.mjs",
        "src/styles.css",
      ]),
    ).toEqual(["eslint.config.js", "scripts/play.mjs", "src/mountain.ts"]);
  });

  it("is empty when no code changed", () => {
    expect(changedCode(["README.md"])).toEqual([]);
  });
});

describe("splitGitPaths", () => {
  it("splits NUL-separated output and drops the trailing empty entry", () => {
    expect(splitGitPaths("src/a.ts\0docs/b md.md\0")).toEqual([
      "src/a.ts",
      "docs/b md.md",
    ]);
    expect(splitGitPaths("")).toEqual([]);
  });
});
