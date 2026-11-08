import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root.
const css = readFileSync("src/style.css", "utf8");
const boardCss = readFileSync("src/board.css", "utf8");

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
  ".welcome-card",
  ".reveal-card",
  ".shelf-card",
  ".tier-grid",
  ".tier-trouble",
  ".trouble-thanks",
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
  ".material-line",
  ".layer-hint",
  ".update-prompt",
  ".update-reload",
  ".other-tab",
  ".other-tab-play",
  ".save-conflict",
  ".save-conflict-play",
  ".saved-copies",
];

/**
 * The board's parts that took over from the pocket pill and the relic shelf
 * (#370), and from the rock, its vein and the Legacy badge (#371).
 */
const BOARD_SELECTORS = [
  ".board-top",
  ".board-stock",
  ".board-odo",
  ".board-dial",
  ".board-relics",
  ".board-tag",
  ".board-saveline",
  ".board-note",
  ".board-running",
  ".board-gauge-row",
  ".board-gauge",
  ".board-crew",
  ".board-mine",
  ".board-window",
  ".board-legacy",
  ".golden-vein",
  ".vein-note",
];

/** Every sheet and card laid over the game (fixed, inset 0 in style.css). */
const OVERLAYS = [
  ".welcome-back",
  ".layer-arrival",
  ".craft-notice",
  ".relic-reveal",
  ".shelf-dialog",
  ".start-over",
  ".game-menu",
  ".field-log-sheet",
  ".buys-dialog",
  ".upgrades-dialog",
  ".engineers-dialog",
  ".update-prompt",
  ".other-tab",
  ".save-conflict",
  ".saved-copies",
  ".workshop-dialog",
];

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** The z-index a rule for exactly this selector sets in board.css. */
function boardZ(selector: string): number {
  const escaped = selector.replace(/[.]/g, "\\.");
  const rule = new RegExp(`^${escaped} \\{[^}]*z-index:\\s*(\\d+)`, "m").exec(
    boardCss,
  );
  return Number(rule?.[1] ?? Number.NaN);
}

describe("board.css", () => {
  it.each(OVERLAYS)("stops %s at the save line", (selector) => {
    const group =
      /((?:^\.[\w-]+,\n)*^\.[\w-]+) \{[^}]*bottom:\s*var\(--save-h\)/m.exec(
        boardCss,
      );
    expect(group?.[1]?.split(",\n")).toContain(selector);
  });

  it("keeps the save line and its drawer above every overlay", () => {
    const highest = Math.max(
      ...[...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])),
    );
    expect(boardZ(".board-saveline")).toBeGreaterThan(highest);
    expect(boardZ(".board-drawer-clip")).toBeGreaterThan(highest);
  });

  it("writes the plate buttons' words at 4.5:1 on the key skin", () => {
    const tokens = readFileSync("src/tokens.css", "utf8");
    const rule = /^\.board-platebtn \{[^}]*?\bcolor:\s*var\((--[\w-]+)\)/m.exec(
      boardCss,
    );
    const hex = new RegExp(`${rule?.[1] ?? "--none"}:\\s*(#[0-9a-f]{6})`).exec(
      tokens,
    )?.[1];
    // The key face (key.png's fill, up and pressed): #20272c and #111518.
    expect(contrast(hex ?? "#000000", "#20272c")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex ?? "#000000", "#111518")).toBeGreaterThanOrEqual(4.5);
  });

  it("lets an open note take taps, so none falls through to the dial or the menu", () => {
    expect(boardCss).toMatch(
      /^\.board-note\.on \{[^}]*pointer-events:\s*auto/m,
    );
  });

  it("caps the note at the mockup's width inside #app, over #app > *", () => {
    expect(boardCss).toMatch(
      /^#app > \.board-note \{[^}]*max-width:\s*calc\(var\(--art\) \* 150\)/m,
    );
  });

  it("stops every board animation under reduced motion", () => {
    const animated = [
      ...boardCss.matchAll(/^([^{}\n]+) \{[^}]*\banimation:\s*board-/gm),
    ].map((m) => m[1]?.trim() ?? "");
    expect(animated.length).toBeGreaterThan(0);
    const reduced =
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(
        boardCss,
      )?.[1];
    for (const selector of animated) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(reduced).toMatch(
        new RegExp(`${escaped} \\{[^}]*animation:\\s*none`),
      );
    }
  });

  it.each(BOARD_SELECTORS)("styles %s", (selector) => {
    const escaped = selector.replace(".", "\\.");
    expect(boardCss).toMatch(new RegExp(`^${escaped}[\\s,{\\[:]`, "m"));
  });
});

describe("style.css", () => {
  it("keeps no lit crew chip: the crew plate holds the free count (#371)", () => {
    expect(css).not.toMatch(/teach-point/);
  });

  it("lets a long crew row wrap rather than clip a chip (#371)", () => {
    expect(css).toMatch(/^\.crew-row \{[^}]*flex-wrap:\s*wrap/m);
    expect(css).not.toMatch(/^\.crew-row \{[^}]*flex-wrap:\s*nowrap/m);
  });

  it("titles the crew section in Buys (#371)", () => {
    expect(css).toMatch(/^\.buys-crew-title[\s,{]/m);
  });

  it.each(REQUIRED_SELECTORS)("styles %s", (selector) => {
    const escaped = selector.replace(".", "\\.");
    expect(css).toMatch(new RegExp(`^${escaped}[\\s,{\\[:]`, "m"));
  });

  it.each([
    ".welcome-back",
    ".layer-arrival",
    ".craft-notice",
    ".relic-reveal",
    ".shelf-dialog",
    ".start-over",
    ".game-menu",
    ".field-log-sheet",
    ".buys-dialog",
    ".upgrades-dialog",
    ".engineers-dialog",
    ".update-prompt",
    ".other-tab",
    ".save-conflict",
    ".saved-copies",
  ])("lays %s over the game", (selector) => {
    const group = /((?:^\.[\w-]+,\n)*^\.[\w-]+) \{[^}]*position:\s*fixed/m.exec(
      css.slice(css.indexOf(".welcome-back,")),
    );
    expect(group?.[1]?.split(",\n")).toContain(selector);
  });
});
