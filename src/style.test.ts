import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root.
const css = readFileSync("src/style.css", "utf8");

/** Rules whose loss breaks the game silently: jsdom tests don't apply CSS. */
const REQUIRED_SELECTORS = [
  ".welcome-back",
  ".relic-reveal",
  ".shelf-dialog",
  ".welcome-card",
  ".reveal-card",
  ".shelf-card",
  ".mountain-wrap",
  ".golden-vein",
  ".vein-note",
  ".tier-grid",
  ".relic-shelf",
];

describe("style.css", () => {
  it.each(REQUIRED_SELECTORS)("styles %s", (selector) => {
    const escaped = selector.replace(".", "\\.");
    expect(css).toMatch(new RegExp(`^${escaped}[\\s,{\\[:]`, "m"));
  });

  it("lays dialogs over the game", () => {
    const overlay = /\.welcome-back,[^{]*\{[^}]*position:\s*fixed/;
    expect(css).toMatch(overlay);
  });
});
