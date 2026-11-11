import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root.
const boardCss = readFileSync("src/board.css", "utf8");

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
  ".board-bays",
  ".board-bay",
  ".board-band",
  ".board-flap",
  ".board-thanks",
  ".board-ready-row",
  ".board-ready",
  ".board-dig-button",
  ".board-sheet",
  ".board-row",
  ".board-scrim",
  ".board-rail",
  ".board-key",
  ".board-key-cap",
  ".board-key-dot",
  ".board-sign-slot",
  ".board-sign",
  ".workshop-mats",
  ".workshop-mat",
  ".workshop-bench",
  ".board-row-bar",
  ".ledger-log",
  ".ledger-log-line",
  ".ledger-log-time",
  ".ledger-log-text",
  ".ledger-doors",
  ".board-page",
  ".board-page-title",
  ".board-page-line",
  ".board-page-answers",
  ".ledger-field-log-well",
  ".ledger-field-log-text",
  ".relic-page",
  ".relic-page-kicker",
  ".relic-page-title",
  ".relic-page-line",
  ".relic-page-boost",
  ".relic-page-answers",
  ".relic-legend-shelf",
  ".relic-keepsakes",
  ".relic-keepsake-list",
  ".relic-keepsake-story",
  ".workshop-timers",
  ".workshop-pager",
  ".workshop-sound",
  ".board-card",
  ".board-card-face",
  ".board-card-title",
  ".board-card-line",
  ".board-card-big",
  ".board-card-foot",
  ".board-card-plate",
  ".welcome-mined-unit",
  ".welcome-ore",
  ".welcome-returns",
  ".welcome-layers",
  ".welcome-crafts",
  ".save-card",
  ".save-conflict-confirm",
  ".board-card .save-conflict-error",
  ".saved-copies-list",
  ".saved-copy",
  ".legacy-lead",
  ".legacy-rates",
  ".engineer-walk",
  ".engineer-page-plates",
  ".engineer-brought-page",
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
  it("keeps the save line and its drawer above every overlay", () => {
    const highest = Math.max(
      ...[...boardCss.matchAll(/z-index:\s*(\d+)/g)]
        .map((m) => Number(m[1]))
        .filter(
          (z) =>
            z !== boardZ(".board-saveline") &&
            z !== boardZ(".board-drawer-clip"),
        ),
    );
    expect(boardZ(".board-saveline")).toBeGreaterThan(highest);
    expect(boardZ(".board-drawer-clip")).toBeGreaterThan(highest);
    // The board cards stand under the drawers' clips and the save line (#464).
    expect(boardZ(".board-card")).toBe(10);
    expect(boardZ(".board-card.save-conflict")).toBe(12);
    expect(boardZ(".board-sheet-clip")).toBeGreaterThan(
      boardZ(".board-card.save-conflict"),
    );
    expect(boardZ(".board-saveline")).toBeGreaterThan(boardZ(".board-card"));
    expect(boardZ(".board-sheet-clip")).toBeGreaterThan(boardZ(".board-card"));
  });

  it("stacks the cards in the root's order, the conflict over them all (#464)", () => {
    // Every card stands at one z-index, so the root's order stacks them
    // (screen-panels#cardsFrom): Pass the mine, the update, the other tab and saved copies
    // over the welcome and the layer card. The relics and Engineers drawers (#465, #455)
    // are drawers in the drawers' clip, above every card: a card that comes up closes them
    // (screen-overlays#coverDrawers), and the relics' reveal waits while a card is up.
    const raised = [
      ...boardCss.matchAll(/^(\.board-card\.[\w-]+) \{[^}]*z-index/gm),
    ].map((m) => m[1]);
    expect(raised).toEqual([".board-card.save-conflict"]);
  });

  it("lets no card body shrink under its words, so an overflow shows in the face (#464)", () => {
    const rule = /^\.board-card-body \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(rule).toMatch(/flex-shrink:\s*0/);
    // But Saved copies' (#466): its list of copies scrolls inside the face instead.
    const shrinks = [
      ...boardCss.matchAll(
        /^([^{}\n]*\.board-card-body) \{[^}]*flex-shrink:\s*1/gm,
      ),
    ].map((m) => m[1]);
    expect(shrinks).toEqual([".saved-copies .board-card-body"]);
    const list = /^\.saved-copies-list \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps the conflict card's rules off Saved copies (#464)", () => {
    // Saved copies' error line and plays carry the conflict's names.
    for (const name of ["save-conflict-error", "save-conflict-play"]) {
      expect(boardCss).not.toMatch(new RegExp(`^\\.${name}\\b`, "m"));
    }
  });

  it("stops a board card at the save line (#464)", () => {
    const rule = /^\.board-card \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(
      /height:\s*calc\(var\(--board-h\) - var\(--save-h\)\)/,
    );
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

  it("stands the Ready row at its top in #app, under the bays (#372)", () => {
    const rule = /^\.board-ready-row \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/top:\s*var\(--ready-top\)/);
  });

  it("a shut drawer takes no taps, from the moment it shuts (#373)", () => {
    // It slides away for 200ms: a second tap on Back must not land on a row.
    expect(boardCss).toMatch(
      /^\.board-sheet-clip > \.board-sheet:not\(\.is-open\) \{[^}]*pointer-events:\s*none/m,
    );
    // Nothing inside a drawer takes taps back for itself.
    const rules = [...boardCss.matchAll(/^([^{}@/]+?)\s*\{([^}]*)\}/gm)];
    const inside = rules.filter(
      ([, selector = "", body = ""]) =>
        /\.board-(sheet|row|sec|spare)/.test(selector) &&
        !/^\.board-sheet,/.test(selector.trim()) &&
        /pointer-events:\s*auto/.test(body),
    );
    expect(inside.map(([, selector = ""]) => selector.trim())).toEqual([]);
  });

  it("lets an open note take taps, so none falls through to the dial or the menu", () => {
    expect(boardCss).toMatch(
      /^\.board-note\.on \{[^}]*pointer-events:\s*auto/m,
    );
  });

  it("lets taps pass through a bay's thanks note to the bay under it (#372)", () => {
    expect(boardCss).toMatch(
      /^\.board-note\.on:has\(\.board-thanks\) \{[^}]*pointer-events:\s*none/m,
    );
  });

  it("caps the note at the mockup's width inside #app, over #app > *", () => {
    expect(boardCss).toMatch(/^#app > \* \{/m);
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

  it("lets a long crew row wrap rather than clip a chip (#371)", () => {
    expect(boardCss).toMatch(/^\.crew-row \{[^}]*flex-wrap:\s*wrap/m);
    expect(boardCss).not.toMatch(/^\.crew-row \{[^}]*flex-wrap:\s*nowrap/m);
  });

  it("blanks the Crew section in its place while a save loads again, and speaks the posts unseen (#373)", () => {
    expect(boardCss).toMatch(
      /^\.board-sheet \.crew\.is-blank,\n\.board-sheet \.board-sec\.is-blank \{[^}]*visibility:\s*hidden/m,
    );
    // The screen-reader-only pattern: 1px, clipped, never zero-sized; the save line's spoken
    // separator too.
    for (const selector of ["crew-posts-words", "board-save-sep"]) {
      const rule =
        new RegExp(`^\\.${selector} \\{([^}]*)\\}`, "m").exec(boardCss)?.[1] ??
        "";
      expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
      expect(rule).toMatch(/width:\s*var\(--board-hair\)/);
      expect(rule).toMatch(/height:\s*var\(--board-hair\)/);
      expect(rule).toMatch(/overflow:\s*hidden/);
    }
  });

  it("keeps the open drawer's chip rows from wrapping (#373)", () => {
    expect(boardCss).toMatch(
      /^\.board-sheet \.crew-posts\.is-frozen \.crew-row \{[^}]*flex-wrap:\s*nowrap/m,
    );
  });

  it("the drawers' clip can never scroll (#373)", () => {
    // overflow: hidden can still be scrolled by script, and scrollIntoView did (the idle save).
    expect(boardCss).toMatch(/^\.board-sheet-clip \{[^}]*overflow:\s*clip/m);
  });

  it("an off spare plate gives its gap in the list back (#373)", () => {
    const rule =
      /^\.board-spare\.is-off \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    // The list's gap is 5 art; the plate's negative margin cancels it.
    expect(boardCss).toMatch(
      /^\.board-sheet-list \{[^}]*gap:\s*calc\(var\(--art\) \* 5\)/m,
    );
    expect(rule).toMatch(/margin-top:\s*calc\(var\(--art\) \* -5\)/);
  });

  it("a drawer row's flag shares the name's line, so a row has three lines at most (#373)", () => {
    const line = /^\.board-row-line \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(line).toMatch(/display:\s*flex/);
    expect(line).toMatch(/white-space:\s*nowrap/);
    // The name keeps its whole width; the flag gives way and ends in its ellipsis.
    expect(boardCss).toMatch(
      /^\.board-row-line > \.board-row-name \{[^}]*flex:\s*none/m,
    );
    expect(boardCss).toMatch(
      /^\.board-row-line > \.board-row-flag \{[^}]*min-width:\s*0/m,
    );
  });

  it("clips the spare plate, so a stale skin never lengthens a drawer's scroll (#373)", () => {
    expect(boardCss).toMatch(/^\.board-spare \{[^}]*overflow:\s*hidden/m);
  });

  it("styles the Crew section in the Buys drawer, its chips on the tag skin (#373)", () => {
    expect(boardCss).toMatch(/^\.board-sheet \.crew \{/m);
    expect(boardCss).toMatch(/^\.board-sheet \.crew-status \{/m);
    expect(boardCss).toMatch(/^\.crew-bit,\n\.crew-bit\.board-skinned \{/m);
  });

  it("the walk home holds still under reduced motion (#455)", () => {
    const reduced = [
      ...boardCss.matchAll(
        /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g,
      ),
    ]
      .map((m) => m[1] ?? "")
      .find((body) => body.includes(".engineer-walker"));
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(/\.engineer-walker[^{]*\{[^}]*animation:\s*none/);
  });

  it("the New sign takes no taps: they go through to the plate or the key (#373)", () => {
    const rule = /^\.board-sign-slot \{([^}]*)\}/m.exec(boardCss)?.[1] ?? "";
    expect(rule).toMatch(/pointer-events:\s*none/);
  });

  it("sits her page's plate words on the key face, and the guided first trip across the row (#455)", () => {
    const rule = (selector: string): string => {
      const escaped = selector.replace(/[.>]/g, "\\$&");
      return (
        new RegExp(`^${escaped} \\{([^}]*)\\}`, "m").exec(boardCss)?.[1] ?? ""
      );
    };
    // The key skin's 8 art px edge and 2 more: the inset engineer-parts#fitsPlate fits against.
    expect(rule(".engineer-page-plates > .board-platebtn")).toMatch(
      /padding:\s*0 calc\(var\(--art\) \* 10\)/,
    );
    expect(rule(".engineer-page-plates > .board-platebtn.is-small")).toMatch(
      /font-size:\s*var\(--board-type-14\)/,
    );
    expect(rule(".engineer-page-plates > .board-platebtn.teach-new")).toMatch(
      /grid-column:\s*1 \/ -1/,
    );
  });

  it.each(BOARD_SELECTORS)("styles %s", (selector) => {
    const escaped = selector.replace(".", "\\.");
    expect(boardCss).toMatch(new RegExp(`^${escaped}[\\s,{\\[:.]`, "m"));
  });
});

describe("today's CSS", () => {
  /** Every selector of a top-level rule in board.css, one per comma. */
  const selectors = [
    ...boardCss.matchAll(/^([^{}@/\s][^{}@/]*?)\s*\{/gm),
  ].flatMap(([, group = ""]) => group.split(",").map((one) => one.trim()));

  it("src/style.css is gone (#376)", () => {
    expect(existsSync("src/style.css")).toBe(false);
  });

  it("main.ts loads only the tokens and the board (#376)", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const sheets = [...main.matchAll(/^import "(\.\/[\w-]+\.css)";$/gm)].map(
      (m) => m[1],
    );
    expect(sheets).toEqual(["./tokens.css", "./board.css"]);
  });

  it("the board carries none of today's sheet hooks (#376)", () => {
    // The old sheet, pill and teach rules went with style.css; a rule of theirs here would
    // restyle a board part that still carries the hook.
    expect(
      selectors.filter((one) =>
        /^\.(sheet-|boost-chips|teach-payoff|teach-intro|effect-chip\.is-named)/.test(
          one,
        ),
      ),
    ).toEqual([]);
    expect(boardCss).not.toMatch(
      /game-menu|copied-float|field-log-sheet|stones-left|auth-action|workshop-open|thumb-bar|menu-button|@keyframes float-up/,
    );
  });

  it("the page is the board's night (#376)", () => {
    expect(boardCss).toMatch(
      /^html,\nbody \{[^}]*background:\s*var\(--board-night\)/m,
    );
    expect(boardCss).toMatch(/^html,\nbody \{[^}]*overflow:\s*hidden/m);
  });

  it("a hidden board row takes no room (#376)", () => {
    expect(boardCss).toMatch(/^\.board-row\[hidden\] \{[^}]*display:\s*none/m);
  });
});
