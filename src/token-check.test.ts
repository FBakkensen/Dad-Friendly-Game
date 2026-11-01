import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findingsInDiff, tokenLengths, type TokenFinding } from "./token-check";

const TOKENS = `
  --space-4: 4px;
  --space-8: 8px;
  --space-24: 24px;
  --line: 2px;
  --target-min: 48px;
  --sheet-icon: var(--space-24);
  --sum: calc(var(--space-4) + var(--space-8));
  --double: calc(var(--target-min) * 2);
  --half: calc(var(--space-8) / 2);
  --wrapped: calc((var(--space-8)));
  --neg: calc(-1 * var(--space-4));
  --pad: var(--missing, 16px);
  --known: var(--space-4, 40px);
  --a: var(--b);
  --b: var(--a);
  --z: calc(var(--space-4) / 0);
  --full: 100%;
  --tall: 10vh;
  --weight-bold: 700;
`;

function diffOf(file: string, body: readonly string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1 @@",
    ...body,
  ].join("\n");
}

function findings(file: string, body: readonly string[]): TokenFinding[] {
  return findingsInDiff(diffOf(file, body), TOKENS);
}

function kinds(file: string, body: readonly string[]): TokenFinding["kind"][] {
  return findings(file, body).map((finding) => finding.kind);
}

describe("token lengths", () => {
  it("resolves the approved scale, aliases, and calc", () => {
    const lengths = tokenLengths(TOKENS);
    expect(lengths.get("--space-4")).toBe(4);
    expect(lengths.get("--sheet-icon")).toBe(24);
    expect(lengths.get("--sum")).toBe(12);
    expect(lengths.get("--double")).toBe(96);
    expect(lengths.get("--half")).toBe(4);
    expect(lengths.get("--wrapped")).toBe(8);
    expect(lengths.get("--neg")).toBe(-4);
    expect(lengths.get("--pad")).toBe(16);
    expect(lengths.get("--known")).toBe(4);
    expect(lengths.has("--a")).toBe(false);
    expect(lengths.has("--z")).toBe(false);
    expect(lengths.has("--full")).toBe(false);
    expect(lengths.has("--tall")).toBe(false);
    expect(lengths.has("--weight-bold")).toBe(false);
  });

  it("reads the game tokens that match the approved mocks", () => {
    const mock = properties(readFileSync("mockups/tokens.css", "utf8"));
    const game = properties(readFileSync("src/tokens.css", "utf8"));
    expect(mock.get("--target-min")).toBe("48px");
    expect(mock.get("--type-14")).toBe("14px");
    expect(mock.get("--space-4")).toBe("4px");
    expect(mock.get("--radius-control")).toBe("12px");
    expect(mock.get("--color-ink-on-gold")).toBe(mock.get("--color-page"));
    for (const [name, value] of mock) {
      expect(game.get(name), name).toBe(value);
    }
    for (const [name, value] of game) {
      if (mock.has(name)) {
        continue;
      }
      if (name === "--line") {
        expect(value).toBe("2px");
        continue;
      }
      const alias = /^var\((--[\w-]+)\)$/.exec(value);
      expect(alias?.[1], name).toBeDefined();
      expect(mock.has(alias?.[1] ?? "")).toBe(true);
    }
    const lengths = tokenLengths(readFileSync("src/tokens.css", "utf8"));
    expect(lengths.get("--type-32")).toBe(32);
    expect(lengths.get("--target-min")).toBe(48);
    expect(lengths.get("--target-gap")).toBe(8);
    expect(lengths.get("--radius-pill")).toBe(999);
    expect(lengths.get("--sheet-price")).toBe(20);
    expect(lengths.has("--color-ink")).toBe(false);
    expect(lengths.has("--leading")).toBe(false);
  });
});

describe("token check", () => {
  it("allow-lists context lines and flags a new raw size or colour", () => {
    expect(
      findings("src/style.css", [
        "   color: #fff;",
        "   #app {",
        "+  margin: 12px;",
        "+  border-color: #e8d4b8;",
        "+  background: rgb(1, 2, 3);",
        "+  outline: hsla(10, 20%, 30%, 0.4);",
        "-  color: #000;",
      ]),
    ).toEqual([
      { file: "src/style.css", text: "margin: 12px;", kind: "raw-size" },
      {
        file: "src/style.css",
        text: "border-color: #e8d4b8;",
        kind: "raw-colour",
      },
      {
        file: "src/style.css",
        text: "background: rgb(1, 2, 3);",
        kind: "raw-colour",
      },
      {
        file: "src/style.css",
        text: "outline: hsla(10, 20%, 30%, 0.4);",
        kind: "raw-colour",
      },
    ]);
  });

  it("flags a raw size and a raw colour on one new rule", () => {
    expect(
      kinds("src/nested/ui.css", [
        "+.card {",
        "+  margin: 0.5px 12PX;",
        "+  color: RGB(0, 0, 0);",
        "+  box-shadow: 0 0 0 #ffffffff;",
        "+}",
      ]),
    ).toEqual(["raw-size", "raw-colour", "raw-colour"]);
  });

  it("accepts token colours and sizes, including the 48px target", () => {
    const game = readFileSync("src/tokens.css", "utf8");
    expect(
      findingsInDiff(
        diffOf("src/new.css", [
          "+button {",
          "+  min-height: var(--target-min);",
          "+  min-width: var(--target-min) !important;",
          "+  color: var(--color-ink);",
          "+  margin: var(--space-8);",
          "+  height: auto;",
          "+  width: 100%;",
          "+}",
        ]),
        game,
      ),
    ).toEqual([]);
  });

  it("flags a tap target under 48px even when it uses a token", () => {
    expect(
      findings("src/new.css", [
        "+button,",
        "+[role=button] {",
        "+  min-height: var(--space-24);",
        "+}",
        "+.upgrade-buy { width: var(--sheet-icon); }",
        "+summary { height: var(--pad); }",
        "+a.card { inline-size: var(--sum); }",
        "+input { block-size: min(40px, 100%); }",
        "+select { min-inline-size: clamp(8px, 2vh, 20px); }",
        "+textarea { max-height: var(--space-4); }",
      ]),
    ).toEqual([
      {
        file: "src/new.css",
        text: "min-height: var(--space-24)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "width: var(--sheet-icon)",
        kind: "tap-target",
      },
      { file: "src/new.css", text: "height: var(--pad)", kind: "tap-target" },
      {
        file: "src/new.css",
        text: "inline-size: var(--sum)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "block-size: min(40px, 100%)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "input { block-size: min(40px, 100%); }",
        kind: "raw-size",
      },
      {
        file: "src/new.css",
        text: "min-inline-size: clamp(8px, 2vh, 20px)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "select { min-inline-size: clamp(8px, 2vh, 20px); }",
        kind: "raw-size",
      },
    ]);
  });

  it("keeps icons, pseudos, and keyframes off the tap-target rule", () => {
    expect(
      findings("src/new.css", [
        "+.icon { width: var(--space-24); height: var(--space-24); }",
        "+article { width: var(--space-8); }",
        "+button::before { width: var(--space-8); min-height: var(--space-4); }",
        "+@keyframes pop {",
        "+  from { min-height: var(--space-4); }",
        "+  50% { height: var(--space-8); }",
        "+}",
        "+.row { min-height: 0; min-width: 0px; }",
        "+button { min-height: var(--double); }",
        "+span { min-height: var(--neg); }",
        "+div { min-height: var(--a); }",
        "+div { min-height: max(var(--space-4), 50%); }",
      ]),
    ).toEqual([
      {
        file: "src/new.css",
        text: ".row { min-height: 0; min-width: 0px; }",
        kind: "raw-size",
      },
    ]);
  });

  it("flags a floor continued onto the next added line and a media query", () => {
    expect(
      findings("src/new.css", [
        "+.chip {",
        "+  min-height:",
        "+    var(--half);",
        "+}",
        "+@media (max-height: 600px) {",
        "+  .icon { color: var(--color-ink); }",
        "+}",
        "+/* #fff 12px */",
        "+div { margin: var(--space-4); } /* 12px */",
      ]),
    ).toEqual([
      {
        file: "src/new.css",
        text: "min-height: var(--half)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "@media (max-height: 600px) {",
        kind: "raw-size",
      },
    ]);
  });

  it("ignores tokens, mockups, deletions, and non-css", () => {
    const diff = [
      diffOf("src/tokens.css", ["+#fff", "+4px", "+min-height: 1px;"]),
      diffOf("mockups/tokens.css", ["+#abc", "+3px"]),
      diffOf("src/token-check.ts", ["+const sample = '12px #fff';"]),
      diffOf("src/new.css", [
        "-button { min-height: 10px; color: #fff; }",
        "+button { min-height: var(--target-min); }",
      ]),
    ].join("\n");
    expect(findingsInDiff(diff, TOKENS)).toEqual([]);
  });

  it("ignores a raw value that stays inside a comment", () => {
    expect(
      findings("src/new.css", [
        "+/*",
        "+ #fff 12px",
        "+*/",
        "+#app {",
        "+  color: var(--color-ink);",
        "+}",
        "+#craft-notice-line { margin: var(--space-4); }",
      ]),
    ).toEqual([]);
  });

  it("resolves calc edges and a missing target token", () => {
    const lengths = tokenLengths(`
      --target-min: 48px;
      --inset: calc(48px - 4px);
      --times: calc(2 * 4px);
      --plus: calc(+8px);
      --max: max(10px, 60px);
      --minpx: min(12px, 40px);
      --clamp: clamp(10px, 20px, 80px);
      --nums: calc(8 / 2);
      --mixed: calc(4px + 1);
      --vh: calc(10vh + 4px);
      --pxpx: calc(4px * 2px);
      --divpx: calc(8px / 2px);
      --blur: blur(4px);
      --bad: var(foo);
      --open: var(--space-4;
      --empty-fallback: var(--missing, );
    `);
    expect(lengths.get("--inset")).toBe(44);
    expect(lengths.get("--times")).toBe(8);
    expect(lengths.get("--plus")).toBe(8);
    expect(lengths.get("--max")).toBe(60);
    expect(lengths.get("--minpx")).toBe(12);
    expect(lengths.get("--clamp")).toBe(20);
    expect(lengths.has("--nums")).toBe(false);
    expect(lengths.has("--mixed")).toBe(false);
    expect(lengths.has("--vh")).toBe(false);
    expect(lengths.has("--pxpx")).toBe(false);
    expect(lengths.has("--divpx")).toBe(false);
    expect(lengths.has("--blur")).toBe(false);
    expect(lengths.has("--bad")).toBe(false);
    expect(lengths.has("--open")).toBe(false);
    expect(lengths.has("--empty-fallback")).toBe(false);
    expect(
      findingsInDiff(
        diffOf("src/new.css", ["+button { min-height: 40px; }"]),
        "--space-4: 4px;",
      ).map((finding) => finding.kind),
    ).toEqual(["tap-target", "raw-size"]);
  });

  it("flags nested floors, roles, and a value continued from an old line", () => {
    expect(
      findings("src/new.css", [
        "Binary files differ",
        "+   ",
        "+.chip {",
        "   min-height:",
        "+    var(--space-4);",
        "+}",
        "+button",
        " .extra { color: #fff; }",
        "+button { span { min-height: var(--space-4); } }",
        '+[role="tab"] { width: var(--space-8); }',
        "+.menu-button { height: var(--half); }",
        "+.sheet-close { width: var(--space-8); }",
        "+div { --pad: 4px; color:; : 1px; }",
        "+@font-face { src: local(x); }",
        "+> { min-height: var(--space-4); }",
        "+button { min-height: min(40px, 10vh); }",
        "+button { height: clamp(10px, 20px, 80px); }",
        "+button { width: max(10px, 60px); }",
      ]),
    ).toEqual([
      {
        file: "src/new.css",
        text: "min-height: var(--space-4)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "min-height: var(--space-4)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "width: var(--space-8)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "height: var(--half)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "width: var(--space-8)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "div { --pad: 4px; color:; : 1px; }",
        kind: "raw-size",
      },
      {
        file: "src/new.css",
        text: "min-height: var(--space-4)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "min-height: min(40px, 10vh)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "button { min-height: min(40px, 10vh); }",
        kind: "raw-size",
      },
      {
        file: "src/new.css",
        text: "height: clamp(10px, 20px, 80px)",
        kind: "tap-target",
      },
      {
        file: "src/new.css",
        text: "button { height: clamp(10px, 20px, 80px); }",
        kind: "raw-size",
      },
      {
        file: "src/new.css",
        text: "button { width: max(10px, 60px); }",
        kind: "raw-size",
      },
    ]);
  });

  it("allow-lists CSS already on main", () => {
    try {
      execSync("git rev-parse --verify origin/main", { stdio: "ignore" });
    } catch {
      execSync("git fetch origin main --depth=1", { stdio: "inherit" });
    }
    const diff = execSync("git diff origin/main -U20 -- src", {
      encoding: "utf8",
    });
    expect(
      findingsInDiff(diff, readFileSync("src/tokens.css", "utf8")),
    ).toEqual([]);
  });
});

function properties(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim());
    }
  }
  return map;
}
