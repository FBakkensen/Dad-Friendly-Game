import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root.
const boardCss = readFileSync("src/board.css", "utf8");

/** The board's parts that still stand: the save line, the drawers and the cards. */
const BOARD_SELECTORS = [
  ".board-saveline",
  ".board-sheet",
  ".board-row",
  ".board-scrim",
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
  ".sound-key",
  ".board-card",
  ".board-card-face",
  ".board-card-title",
  ".board-card-line",
  ".board-card-foot",
  ".board-card-plate",
  ".save-card",
  ".save-conflict-confirm",
  ".board-card .save-conflict-error",
  ".saved-copies-list",
  ".saved-copy",
  ".legacy-lead",
  ".legacy-rates",
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

/** Text with every RegExp metacharacter escaped, so it matches only itself. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A selector escaped for a RegExp that matches its rule's head. */
function ruleHead(selector: string): string {
  return `^${escapeRegExp(selector)} \\{`;
}

/** Every declaration of board.css's top-level rules that list this exact selector. */
function declared(selector: string): string {
  return [...boardCss.matchAll(/^([^{}@/\s][^{}@/]*?)\s*\{([^}]*)\}/gm)]
    .filter((m) =>
      (m[1] ?? "")
        .split(",")
        .map((one) => one.trim())
        .includes(selector),
    )
    .map((m) => m[2] ?? "")
    .join("\n");
}

/** The z-index a rule for exactly this selector sets in board.css. */
function boardZ(selector: string): number {
  const rule = new RegExp(
    `${ruleHead(selector)}[^}]*z-index:\\s*(\\d+)`,
    "m",
  ).exec(boardCss);
  return Number(rule?.[1] ?? Number.NaN);
}

/** board.css without the rules for exactly these selectors. */
function boardCssWithout(...selectors: string[]): string {
  return selectors.reduce(
    (css, selector) =>
      css.replace(new RegExp(`${ruleHead(selector)}[^}]*\\}`, "gm"), ""),
    boardCss,
  );
}

describe("board.css", () => {
  it("keeps the save line and its drawer above every overlay", () => {
    const others = boardCssWithout(".board-saveline", ".board-drawer-clip");
    const highest = Math.max(
      ...[...others.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])),
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
    // Every card stands at one z-index, so the root's order stacks them: the update, the
    // other tab and saved copies, as the frame mounts them. Drawers sit in the drawers'
    // clip, above every card.
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
      const escaped = escapeRegExp(selector);
      expect(reduced).toMatch(
        new RegExp(`${escaped} \\{[^}]*animation:\\s*none`),
      );
    }
  });

  it("speaks the save line's separator unseen", () => {
    // The screen-reader-only pattern: 1px, clipped, never zero-sized.
    const rule = declared(".board-save-sep");
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(rule).toMatch(/width:\s*var\(--board-hair\)/);
    expect(rule).toMatch(/height:\s*var\(--board-hair\)/);
    expect(rule).toMatch(/overflow:\s*hidden/);
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

  it("prints a row's tag figure in bold 17px Barlow with tabular figures (#505)", () => {
    const rule = declared(".board-row-tag");
    expect(rule).toMatch(/font-family:\s*"Barlow Condensed"/);
    expect(rule).toMatch(/font-size:\s*var\(--board-type-17\)/);
    expect(rule).toMatch(/font-weight:\s*700/);
    expect(rule).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("keeps the plate's face on a row's price, over the mono of .board-num (#505)", () => {
    expect(declared(".board-row-price")).toMatch(/font-family:\s*inherit/);
  });

  it("lets a row's info line take two lines when it has the room, ending in an ellipsis past them (#506)", () => {
    const roomy = declared(".board-row-info.is-roomy");
    expect(roomy).toMatch(/white-space:\s*normal/);
    expect(roomy).toMatch(/-webkit-line-clamp:\s*2/);
    // A hidden line stays hidden: the row's [hidden] rule comes after it.
    expect(boardCss.indexOf(".board-row-info.is-roomy {")).toBeLessThan(
      boardCss.indexOf(".board-row [hidden],"),
    );
  });

  it("sets a row's info line at 15px, its words quiet and its figures bright and bold (#505, #506)", () => {
    const info = declared(".board-row-info");
    expect(info).toMatch(/font-size:\s*var\(--board-type-15\)/);
    expect(info).toMatch(/color:\s*var\(--board-ink-2\)/);
    expect(info).not.toMatch(/font-weight/);
    expect(declared(".board-fig")).toMatch(/font-weight:\s*700/);
    expect(declared(".board-fig")).toMatch(/color:\s*var\(--board-ink-bare\)/);
    // Trouble has no figure, so the whole shout stays bright and semi-bold.
    const shout = declared(".board-row.is-trouble .board-row-info");
    expect(shout).toMatch(/font-weight:\s*var\(--board-weight-semi\)/);
    expect(shout).toMatch(/color:\s*var\(--board-ink\);/);
    // A shortfall keeps its rust, semi-bold at the same size.
    expect(declared(".board-row-need")).toMatch(
      /font-size:\s*var\(--board-type-15\)/,
    );
    expect(declared(".board-row-need")).toMatch(
      /font-weight:\s*var\(--board-weight-semi\)/,
    );
    expect(declared(".board-row-need")).toMatch(/color:\s*var\(--board-rust\)/);
    // The flavour line stays small, so the figures above it lead.
    expect(declared(".board-row-why")).toMatch(
      /font-size:\s*var\(--board-type-13\)/,
    );
    expect(declared(".board-row-why")).toMatch(/color:\s*var\(--board-ink-2\)/);
  });

  it("makes a row's gain bold (#505)", () => {
    expect(declared(".board-row-gain")).toMatch(
      /font-family:\s*"Barlow Condensed"/,
    );
    expect(declared(".board-row-gain")).toMatch(/font-weight:\s*700/);
    expect(declared(".board-row-gain")).toMatch(
      /font-variant-numeric:\s*tabular-nums/,
    );
    expect(declared(".board-row-gain")).toMatch(
      /color:\s*var\(--board-ink-bare\)/,
    );
  });

  it.each(BOARD_SELECTORS)("styles %s", (selector) => {
    const escaped = escapeRegExp(selector);
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
