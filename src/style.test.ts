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
  ".field-log-sheet",
  ".menu-button",
  ".upgrades-dialog",
  ".upgrades-button",
  ".engineers-dialog",
  ".engineers-button",
  ".engineer-tunnel",
  ".expedition-chip",
  ".welcome-return",
  ".pocket-row",
  ".welcome-card",
  ".reveal-card",
  ".shelf-card",
  ".mountain-wrap",
  ".mountain-stage",
  ".golden-vein",
  ".vein-note",
  ".tier-grid",
  ".tier-trouble",
  ".trouble-thanks",
  ".relic-shelf",
  ".found-tool",
  ".keepsakes",
  ".keepsake-story",
  ".workshop-dialog",
  ".workshop-open",
  ".workshop-locked",
  ".workshop-card",
  ".workshop-cancel",
  ".layer-arrival",
  ".craft-notice",
  ".material-find",
  ".material-line",
  ".material-chip",
  ".layer-hint",
];

describe("style.css", () => {
  it.each(REQUIRED_SELECTORS)("styles %s", (selector) => {
    const escaped = selector.replace(".", "\\.");
    expect(css).toMatch(new RegExp(`^${escaped}[\\s,{\\[:]`, "m"));
  });

  it.each([
    ".welcome-back",
    ".layer-arrival",
    ".craft-notice",
    ".material-find",
    ".relic-reveal",
    ".shelf-dialog",
    ".start-over",
    ".game-menu",
    ".field-log-sheet",
    ".upgrades-dialog",
    ".engineers-dialog",
  ])("lays %s over the game", (selector) => {
    const group = /((?:^\.[\w-]+,\n)*^\.[\w-]+) \{[^}]*position:\s*fixed/m.exec(
      css.slice(css.indexOf(".welcome-back,")),
    );
    expect(group?.[1]?.split(",\n")).toContain(selector);
  });
});
