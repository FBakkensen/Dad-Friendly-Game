import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatCompact, formatCount } from "../src/format.ts";
import { effectiveRates } from "../src/rates.ts";
import {
  buyPriceWords,
  crewPostsShort,
  formatClock,
  formatSpeed,
  MOCK_RECIPES,
  UNFOUND_HINT,
} from "../src/screen-words.ts";
import { owned, tierById, tierCost } from "../src/tiers.ts";
import { upgradeById, upgradeCost, upgradeLevel } from "../src/upgrades.ts";
import { boardB } from "./directions.ts";
import {
  craftTap,
  parseMockView,
  renderMock,
  shortReason,
  type MockView,
} from "./page.ts";

const view = (patch: Partial<MockView> = {}): MockView => ({
  scene: "workshop",
  phase: "rest",
  control: "",
  shot: true,
  ...patch,
});

function host(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("workshop mock page (#193)", () => {
  it("reads the scene from the query", () => {
    expect(parseMockView("")).toEqual({
      scene: "workshop",
      phase: "rest",
      control: "",
      shot: false,
    });
    expect(
      parseMockView("?scene=layer&phase=press&control=dig&shot=1"),
    ).toEqual({
      scene: "layer",
      phase: "press",
      control: "dig",
      shot: true,
    });
    expect(() => parseMockView("?scene=nope")).toThrow(/scene/);
    expect(() => parseMockView("?phase=nope")).toThrow(/phase/);
    expect(parseMockView("?phase=shake&control=rails").phase).toBe("shake");
    expect(parseMockView("?scene=other-tab").scene).toBe("other-tab");
    expect(parseMockView("?scene=save-conflict").scene).toBe("save-conflict");
  });

  it("names the iron the rails still need", () => {
    const rails = MOCK_RECIPES.find((recipe) => recipe.id === "rails");
    const props = MOCK_RECIPES.find((recipe) => recipe.id === "props");
    const charge = MOCK_RECIPES.find((recipe) => recipe.id === "charge");
    expect(rails).toBeDefined();
    expect(props).toBeDefined();
    expect(charge).toBeDefined();
    if (rails === undefined || props === undefined || charge === undefined) {
      return;
    }
    expect(shortReason(rails)).toBe("Need 5 more iron");
    expect(shortReason(props)).toBeUndefined();
    expect(shortReason(charge)).toBeUndefined();
  });

  it("spells the craft tap for one material and for two", () => {
    expect(craftTap(["12 iron"])).toBe(
      "Presses in. 12 iron floats from the material line to the bench. A short hammer tap plays on the bench. Silent until unmuted.",
    );
    expect(craftTap(["20 clay", "6 iron"])).toBe(
      "Presses in. 20 clay and 6 iron float from the material line to the bench. A short hammer tap plays on the bench. Silent until unmuted.",
    );
    expect(() => craftTap([])).toThrow(/material/);
  });

  it("shows three priced recipes and one dark silhouette", () => {
    const page = host(renderMock(view()));
    const recipes = [...page.querySelectorAll(".recipe")];
    expect(recipes).toHaveLength(4);
    const hidden = page.querySelector(".is-hidden-recipe");
    expect(hidden?.querySelector("button")).toBeNull();
    expect(hidden?.textContent).toContain(UNFOUND_HINT);
    expect(hidden?.textContent ?? "").not.toMatch(/[0-9?]/);
    expect(page.textContent).not.toMatch(/\?/);
    expect(page.textContent).toContain("Need 5 more iron");
    expect(page.textContent).toContain("Craft · 1.8M");
    expect(page.textContent).toContain("Craft · 800K");
    const rails = page.querySelector("[data-craft='rails']");
    expect(rails?.textContent).toBe("Need 5 more iron");
    expect(rails?.hasAttribute("disabled")).toBe(true);
    expect(rails?.getAttribute("data-tap")).toContain("gentle shake");
    expect(rails?.getAttribute("data-tap")).toContain("Need 5 more iron");
    expect(page.textContent).toContain("Carts 10/s to 12/s");
    expect(page.textContent).toContain("Trouble comes 30% less often.");
    expect(page.textContent).toContain("The crew digs at 2× for 20 min.");
    expect(page.textContent).toContain("12 iron");
    expect(page.textContent).toContain("20 clay");
    expect(page.textContent).toContain("Clay 42");
    expect(page.textContent).toContain("Iron 7");
    expect(page.textContent).toContain("The bench is free");
    expect(page.textContent).toContain("Back to the mountain");
    const buttons = [...page.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const button of buttons) {
      const tap = button.getAttribute("data-tap") ?? "";
      expect(tap).toContain("Silent until unmuted");
      const reason = button.getAttribute("data-short");
      if (reason === null) {
        expect(tap).toContain("Presses in");
      } else {
        expect(tap).toContain("gentle shake");
        expect(tap).toContain(reason);
      }
    }
    for (const button of page.querySelectorAll("[data-craft]")) {
      if (button.hasAttribute("data-short")) {
        continue;
      }
      const tap = button.getAttribute("data-tap") ?? "";
      expect(tap).toContain("float");
      expect(tap).toContain("hammer tap");
    }
    expect(page.querySelector("audio, video")).toBeNull();
  });

  it("presses the tapped control and floats that craft's materials", () => {
    const pressed = host(
      renderMock(view({ phase: "press", control: "props" })),
    );
    const button = pressed.querySelector("[data-craft='props']");
    expect(button?.classList.contains("is-pressed")).toBe(true);
    expect(pressed.querySelectorAll(".is-pressed")).toHaveLength(1);
    const floating = host(
      renderMock(view({ phase: "float", control: "props" })),
    );
    const chips = [...floating.querySelectorAll(".float-chip")].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(["20 clay", "6 iron"]);
    const hammer = host(
      renderMock(view({ phase: "hammer", control: "props" })),
    );
    expect(hammer.querySelector(".hammer")).not.toBeNull();
    const denied = host(renderMock(view({ phase: "shake", control: "rails" })));
    const short = denied.querySelector("[data-craft='rails']");
    expect(short?.classList.contains("is-shaking")).toBe(true);
    expect(short?.classList.contains("is-pressed")).toBe(false);
    expect(short?.hasAttribute("disabled")).toBe(true);
    const noFloat = host(
      renderMock(view({ phase: "float", control: "rails" })),
    );
    expect(noFloat.querySelector(".float-chip")).toBeNull();
  });

  it("puts rails on the bench and holds the other crafts", () => {
    const page = host(renderMock(view({ phase: "busy" })));
    expect(page.textContent).toContain(
      "On the bench: Iron rails · 38 min left",
    );
    expect(page.querySelector(".bar")).not.toBeNull();
    const rails = page.querySelector("[data-craft='rails']");
    const props = page.querySelector("[data-craft='props']");
    expect(rails?.textContent).toBe("On the bench");
    expect(props?.textContent).toBe("Waiting its turn");
    expect(rails?.hasAttribute("disabled")).toBe(true);
    expect(props?.hasAttribute("disabled")).toBe(true);
    expect(page.querySelector(".back")?.hasAttribute("disabled")).toBe(false);
  });

  it("keeps the layer card and the craft-done notice free of question marks", () => {
    const layer = host(renderMock(view({ scene: "layer", control: "dig" })));
    expect(layer.textContent).toContain("You broke into the Granite!");
    expect(layer.textContent).toContain("Tough on carts. Drills love it.");
    expect(layer.textContent).toContain("Dig on");
    expect(layer.textContent).toContain("Clay 42");
    expect(layer.textContent).not.toMatch(/\?/);
    const done = host(
      renderMock(
        view({ scene: "craft-done", phase: "press", control: "done" }),
      ),
    );
    expect(done.textContent).toContain(
      "Your Iron rails are fitted. Carts now 12/s.",
    );
    expect(done.querySelector(".go")?.classList.contains("is-pressed")).toBe(
      true,
    );
    expect(done.textContent).not.toMatch(/\?/);
  });

  it("shows the worker bill on each machine and where the crew is", () => {
    const page = host(renderMock(view({ scene: "mountain" })));
    expect(page.textContent).toContain(
      "28 workers: 13 on carts, 15 on drills, 0 free",
    );
    expect(page.textContent).toContain("Needs 1 worker · 0 free");
    expect(page.textContent).toContain("Needs 3 workers · 0 free");
    expect(page.textContent).toContain("Needs 8 workers · 0 free");
    const posts = page.querySelector(".crew-posts");
    expect(posts?.getAttribute("data-tap")).toContain("Presses in");
    expect(posts?.getAttribute("data-tap")).toContain("Silent until unmuted");
    const open = host(renderMock(view({ scene: "mountain", control: "open" })));
    expect(open.querySelector(".crew-breakdown")?.textContent).toContain(
      "13 on carts",
    );
    expect(open.querySelector(".crew-posts")?.textContent).toBe(
      "28 workers · 0 free",
    );
  });

  it("shows two saves side by side and presses Play this one", () => {
    const page = host(renderMock(view({ scene: "save-conflict" })));
    expect(page.querySelector("#save-conflict-title")?.textContent).toBe(
      "Two saves found",
    );
    expect(page.textContent).toContain("Granite, 12.4M deep");
    expect(page.textContent).toContain("This phone");
    expect(page.textContent).toContain("Other device");
    expect(page.querySelector(".save-card.is-selected")?.textContent).toContain(
      "12.4M",
    );
    expect(
      page.querySelector(".save-conflict-confirm")?.hasAttribute("hidden"),
    ).toBe(true);
    const pressed = host(
      renderMock(view({ scene: "save-conflict", phase: "press" })),
    );
    expect(
      pressed
        .querySelector(".save-conflict-play")
        ?.classList.contains("is-pressed"),
    ).toBe(true);
    expect(page.querySelector("audio, video")).toBeNull();
  });
});

const rootDir = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(rootDir, "tokens.css"), "utf8");
const screensCss = readFileSync(join(rootDir, "token-screens.css"), "utf8");
const mockCss = readFileSync(join(rootDir, "mock.css"), "utf8");

function tokenValue(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensCss);
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`missing --${name}`);
  }
  return value.trim();
}

function channel(hex: string, index: number): number {
  const raw = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const unit = raw / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 0) +
    0.7152 * channel(hex, 1) +
    0.0722 * channel(hex, 2)
  );
}

function mustCost(cost: number | undefined): number {
  if (cost === undefined) {
    throw new Error("missing price");
  }
  return cost;
}

function mountTokens(
  scene: MockView["scene"],
  phase: "rest" | "press",
  control: string,
): HTMLElement {
  const root = document.createElement("div");
  root.id = "mock";
  root.className = `tok scene-${scene} phase-${phase} shot`;
  root.dataset.scene = scene;
  root.innerHTML = renderMock(view({ scene, phase, control, shot: true }));
  document.body.append(root);
  return root;
}

describe("design token mocks (#234)", () => {
  beforeAll(() => {
    const style = document.createElement("style");
    style.id = "token-test-style";
    style.textContent = `${mockCss}\n${tokensCss}\n${screensCss}`;
    document.head.append(style);
  });

  afterEach(() => {
    document.getElementById("mock")?.remove();
  });

  afterAll(() => {
    document.getElementById("token-test-style")?.remove();
  });

  it("keeps the scale, the folds, and AA pairs", () => {
    expect(tokenValue("type-14")).toBe("14px");
    expect(tokenValue("type-16")).toBe("16px");
    expect(tokenValue("type-20")).toBe("20px");
    expect(tokenValue("type-24")).toBe("24px");
    expect(tokenValue("type-32")).toBe("32px");
    expect(tokenValue("weight-regular")).toBe("400");
    expect(tokenValue("weight-bold")).toBe("700");
    expect(tokenValue("leading")).toBe("1.3");
    expect(tokenValue("space-4")).toBe("4px");
    expect(tokenValue("space-8")).toBe("8px");
    expect(tokenValue("space-16")).toBe("16px");
    expect(tokenValue("space-24")).toBe("24px");
    expect(tokensCss).not.toContain("--space-32");
    expect(tokenValue("radius-control")).toBe("12px");
    expect(tokenValue("radius-sheet")).toBe("20px");
    expect(tokenValue("radius-pill")).toBe("999px");
    expect(tokenValue("target-min")).toBe("48px");
    expect(tokenValue("target-gap")).toBe("8px");
    expect(tokenValue("color-ink-on-gold")).toBe(tokenValue("color-page"));
    const body: readonly [string, string, string][] = [
      ["color-ink", "color-page", "ink on page"],
      ["color-ink", "color-card", "ink on card"],
      ["color-ink", "color-disabled", "ink on disabled"],
      ["color-quiet", "color-page", "quiet on page"],
      ["color-quiet", "color-card", "quiet on card"],
      ["color-quiet", "color-disabled", "quiet on disabled"],
      ["color-gold", "color-page", "gold on page"],
      ["color-gold", "color-card", "gold on card"],
      ["color-gold", "color-disabled", "gold on disabled"],
      ["color-ink-on-gold", "color-gold", "ink-on-gold on gold"],
      ["color-ink-on-gold", "color-danger", "ink-on-gold on danger"],
    ];
    const edges: readonly [string, string, string][] = [
      ["color-edge", "color-page", "edge on page"],
      ["color-edge", "color-card", "edge on card"],
      ["color-edge", "color-disabled", "edge on disabled"],
      ["color-danger", "color-page", "danger on page"],
      ["color-danger", "color-card", "danger on card"],
    ];
    for (const [foreground, background, label] of body) {
      const ratio = contrast(tokenValue(foreground), tokenValue(background));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(tokensCss).toContain(`${label} ${ratio.toFixed(2)}:1`);
    }
    for (const [foreground, background, label] of edges) {
      const ratio = contrast(tokenValue(foreground), tokenValue(background));
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(tokensCss).toContain(`${label} ${ratio.toFixed(2)}:1`);
    }
    const pill = screensCss
      .split("}")
      .filter((block) => block.includes("var(--radius-pill)"));
    expect(pill).toHaveLength(1);
    expect(pill[0]).toContain(".tok-badge");
    expect(screensCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(screensCss).not.toMatch(/font-size:\s*\d/);
  });

  it("shows the scale, the next drill, and the boost sheet without a question mark", () => {
    const drill = formatCompact(tierCost(tierById("drill"), 8));
    const arms = buyPriceWords(mustCost(upgradeCost(upgradeById("tap"), 3)));
    const roads = buyPriceWords(
      mustCost(upgradeCost(upgradeById("drillSyn"), 0)),
    );
    const crews = buyPriceWords(
      mustCost(upgradeCost(upgradeById("borerSyn"), 0)),
    );
    const tracks = buyPriceWords(
      mustCost(upgradeCost(upgradeById("machineSyn"), 0)),
    );
    expect(parseMockView("?scene=token-sheet").scene).toBe("token-sheet");
    expect(parseMockView("?scene=mountain-tokens").scene).toBe(
      "mountain-tokens",
    );
    expect(parseMockView("?scene=upgrades-tokens").scene).toBe(
      "upgrades-tokens",
    );
    const sheet = host(renderMock(view({ scene: "token-sheet" })));
    expect(sheet.textContent).toContain("+2.5 · 203/s");
    expect(sheet.textContent).toContain(arms);
    expect(sheet.textContent).toContain(crewPostsShort(84, 2));
    expect(sheet.textContent).toContain(`Running · ${formatClock(600_000)}`);
    expect(sheet.textContent).toContain("Clay 40");
    expect(sheet.textContent).toContain(
      "Your Iron rails are fitted. Carts now 12/s.",
    );
    expect(sheet.textContent).not.toMatch(/\?/);
    const pressedSheet = host(
      renderMock(
        view({ scene: "token-sheet", phase: "press", control: "buy" }),
      ),
    );
    expect(
      pressedSheet
        .querySelector(".tok-primary")
        ?.classList.contains("is-pressed"),
    ).toBe(true);

    const mountain = host(renderMock(view({ scene: "mountain-tokens" })));
    expect(drill).toBe("3.5M");
    expect(mountain.textContent).toContain(`Next: a drill · ${drill}`);
    expect(mountain.textContent).toContain("Needs 3 workers");
    expect(mountain.textContent).toContain("110 million stones left");
    expect(mountain.textContent).toContain("80 million stones");
    expect(mountain.textContent).toContain("Saved on this device");
    expect(
      [...mountain.querySelectorAll(".tok-icon")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Workshop", "Engineers", "Upgrades"]);
    expect(
      mountain
        .querySelector("[data-tier='drill']")
        ?.classList.contains("tok-primary"),
    ).toBe(true);
    expect(
      mountain.querySelector("[data-tier='machine']")?.hasAttribute("disabled"),
    ).toBe(true);
    expect(mountain.textContent).not.toMatch(/Legacy|Mantle|Welcome|\?/);
    const pressedDrill = host(
      renderMock(
        view({ scene: "mountain-tokens", phase: "press", control: "drill" }),
      ),
    );
    expect(
      pressedDrill
        .querySelector("[data-tier='drill']")
        ?.classList.contains("is-pressed"),
    ).toBe(true);

    const upgrades = host(renderMock(view({ scene: "upgrades-tokens" })));
    expect(upgrades.textContent).toContain(arms);
    expect(upgrades.textContent).toContain(roads);
    expect(upgrades.textContent).toContain(crews);
    expect(upgrades.textContent).toContain(tracks);
    expect(upgrades.textContent).toContain(`Running · ${formatClock(600_000)}`);
    expect(upgrades.textContent).toContain(
      `Running · ${formatClock(1_800_000)}`,
    );
    expect(upgrades.textContent).toContain("now 1,410");
    expect(upgrades.textContent).toContain("22.7K/s");
    expect(
      upgrades.querySelector(".tok-close")?.getAttribute("aria-label"),
    ).toBe("Back to the mountain");
    expect(upgrades.querySelectorAll(".tok-action")).toHaveLength(6);
    expect(upgrades.textContent).not.toMatch(/\?/);
    expect(upgrades.querySelector("audio, video")).toBeNull();
  });

  it("keeps three different directions on the real prices", () => {
    const drill = formatCompact(tierCost(tierById("drill"), 8));
    const arms = buyPriceWords(mustCost(upgradeCost(upgradeById("tap"), 3)));
    for (const which of ["a", "c"] as const) {
      const mountain = host(renderMock(view({ scene: `mountain-${which}` })));
      expect(mountain.textContent).toContain(drill);
      expect(mountain.textContent).toContain("80 million");
      expect(mountain.textContent).toContain("Workshop");
      expect(mountain.textContent).toContain("Engineers");
      expect(mountain.textContent).toContain("Upgrades");
      expect(mountain.textContent).toContain("+2.5 · 203/s");
      expect(mountain.textContent).not.toMatch(/\?/);
      const sheet = host(renderMock(view({ scene: `upgrades-${which}` })));
      expect(sheet.textContent).toContain(arms);
      expect(sheet.textContent).toContain("Running · 10:00");
      expect(sheet.textContent).toContain("Running · 30:00");
      expect(sheet.textContent).toContain("Back to the mountain");
      expect(sheet.textContent).not.toMatch(/\?/);
    }
    const mountainB = boardB();
    const rates = effectiveRates(mountainB);
    const shown = host(renderMock(view({ scene: "mountain-b" })));
    const drillTier = tierById("drill");
    const drillPrice = buyPriceWords(
      tierCost(drillTier, owned(mountainB, drillTier)),
    );
    expect(shown.textContent).toContain(formatCount(mountainB.pocket));
    expect(shown.textContent).toContain(
      `${formatCompact(rates.crewPerSecond)} stones/s`,
    );
    expect(shown.textContent).toContain("on carts");
    expect(shown.textContent).toContain("7 free");
    for (const card of shown.querySelectorAll(".dir-buycard")) {
      expect(card.textContent).toMatch(/Needs \d/);
      expect(card.textContent).not.toMatch(/free/);
    }
    expect(shown.textContent).toContain(drillPrice);
    expect(shown.textContent).toContain(
      `+${formatSpeed(rates.tierSpeed.drill)}/s each`,
    );
    expect(shown.textContent).toContain("Needs 3 workers");
    expect(shown.textContent).toContain("Bites the wall while you rest.");
    expect(shown.textContent).toContain("The Granite");
    expect(shown.textContent).toContain("Drills love it.");
    expect(shown.textContent).toContain("One pool of hands");
    expect(shown.textContent).toContain("Preview · 2 of 10 drills");
    expect(shown.textContent).toContain("every drill digs twice as fast");
    expect(shown.textContent).not.toMatch(
      /pays back|worth it|best value|\?|in \d+ min/i,
    );
    const sheetB = host(renderMock(view({ scene: "upgrades-b" })));
    const before = rates.tapYield;
    const after = effectiveRates({
      ...mountainB,
      upgrades: {
        ...mountainB.upgrades,
        tap: upgradeLevel(mountainB, "tap") + 1,
      },
    }).tapYield;
    expect(sheetB.textContent).toContain(
      `Tap ${formatCount(before)} to ${formatCount(after)}`,
    );
    expect(sheetB.textContent).toContain("Taps ×2 for 10 min.");
    expect(sheetB.textContent).toContain("Crew ×2 for 30 min.");
    const helped = effectiveRates({
      ...mountainB,
      upgrades: {
        ...mountainB.upgrades,
        cartSyn: upgradeLevel(mountainB, "cartSyn") + 1,
      },
    });
    expect(sheetB.textContent).toContain("Helping hands");
    expect(sheetB.textContent).toContain(
      `Cart ${formatSpeed(rates.tierSpeed.cart)}/s to ${formatSpeed(helped.tierSpeed.cart)}/s each`,
    );
    expect(sheetB.textContent).toContain("Each worker makes carts 1% faster.");
    expect(sheetB.textContent).not.toMatch(
      /pays back|worth it|best value|\?|in \d+ min/i,
    );
    expect(
      host(
        renderMock(
          view({ scene: "mountain-a", phase: "press", control: "drill" }),
        ),
      )
        .querySelector(".dir-buy")
        ?.classList.contains("is-pressed"),
    ).toBe(true);
  });

  it("keeps token mock type at 14px and targets at 48px", () => {
    const shots = [
      ["token-sheet", "rest", ""],
      ["token-sheet", "press", "buy"],
      ["mountain-tokens", "rest", ""],
      ["mountain-tokens", "press", "drill"],
      ["upgrades-tokens", "rest", ""],
      ["upgrades-tokens", "press", "arms"],
      ["mountain-a", "rest", ""],
      ["mountain-a", "press", "drill"],
      ["upgrades-a", "rest", ""],
      ["upgrades-a", "press", "arms"],
      ["mountain-b", "rest", ""],
      ["mountain-b", "press", "drill"],
      ["upgrades-b", "rest", ""],
      ["upgrades-b", "press", "arms"],
      ["mountain-c", "rest", ""],
      ["mountain-c", "press", "buy"],
      ["upgrades-c", "rest", ""],
      ["upgrades-c", "press", "arms"],
    ] as const;
    for (const [scene, phase, control] of shots) {
      const root = mountTokens(scene, phase, control);
      for (const element of root.querySelectorAll("*")) {
        const hasText = [...element.childNodes].some(
          (node) =>
            node.nodeType === 3 && (node.textContent ?? "").trim() !== "",
        );
        if (!hasText) {
          continue;
        }
        const font = Number.parseFloat(getComputedStyle(element).fontSize);
        expect(font, element.textContent).toBeGreaterThanOrEqual(14);
      }
      for (const button of root.querySelectorAll("button")) {
        const style = getComputedStyle(button);
        expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(48);
        expect(Number.parseFloat(style.minWidth)).toBeGreaterThanOrEqual(48);
        const tap = button.getAttribute("data-tap") ?? "";
        expect(tap).toContain("Presses in");
        expect(tap).toContain("Silent until unmuted");
      }
    }
  });
});
