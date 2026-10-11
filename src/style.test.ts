import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root.
const css = readFileSync("src/style.css", "utf8");

/** Rules whose loss breaks the game silently: jsdom tests don't apply CSS. */
const REQUIRED_SELECTORS = [
  ".welcome-back",
  ".relic-reveal",
  ".shelf-dialog",
  ".start-over",
  ".game-menu",
  ".menu-button",
  ".welcome-card",
  ".reveal-card",
  ".shelf-card",
  ".mountain-wrap",
  ".mountain-stage",
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

  it.each([
    ".welcome-back",
    ".relic-reveal",
    ".shelf-dialog",
    ".start-over",
    ".game-menu",
  ])("lays %s over the game", (selector) => {
    const group = /((?:^\.[\w-]+,\n)*^\.[\w-]+) \{[^}]*position:\s*fixed/m.exec(
      css.slice(css.indexOf(".welcome-back,")),
    );
    expect(group?.[1]?.split(",\n")).toContain(selector);
  });
});
