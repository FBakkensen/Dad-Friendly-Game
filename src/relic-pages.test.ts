// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { RELIC_LIT } from "./board-relics";
import {
  KEEPSAKE_ART,
  createDetailPage,
  createLegendPage,
  createRevealPage,
} from "./relic-pages";
import { RELICS, type Relic } from "./relics";

let time = 0;
let board: BoardHost;
let sheet: BoardSheet;

const advance = (ms: number): void => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

/** A finger's tap: down, up, then its click. */
const press = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

function find(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

const text = (root: HTMLElement, selector: string): string =>
  find(root, selector).textContent ?? "";

const plates = (root: HTMLElement): string[] =>
  [...root.querySelectorAll(".board-platebtn-text")].map(
    (each) => each.textContent ?? "",
  );

const relic = (index: number): Relic => {
  const found = RELICS[index];
  if (found === undefined) {
    throw new Error(`no relic ${String(index)}`);
  }
  return found;
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
  sheet = createBoardSheet({
    name: "relics",
    title: "Relics of Fatherhood",
    infoLabel: "How relics work",
    how: { systems: [], backLabel: "Back to the shelf" },
    board,
    overSave: () => false,
  });
  document.body.append(sheet.root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("a found relic's detail page (#465)", () => {
  it("shows the relic lit at 24 art px, its virtue and power, and Back to the shelf", () => {
    const page = createDetailPage({ board, onBack: vi.fn() });
    const lantern = relic(0);
    page.paint(lantern, []);
    expect(text(page.root, ".relic-page-kicker")).toBe(
      "A Legendary Relic of Fatherhood",
    );
    expect(text(page.root, "h3.relic-page-title")).toBe("Lantern of Guidance");
    const art = find(page.root, ".relic-page-art") as HTMLImageElement;
    expect(art.getAttribute("src")).toBe(RELIC_LIT.lantern);
    expect(art.width).toBe(48);
    expect(text(page.root, ".relic-page-line")).toBe(
      "The virtue of Guidance.",
    );
    expect(text(page.root, ".relic-page-boost")).toBe(
      `Your power: ${lantern.boost}`,
    );
    expect(plates(page.root)).toEqual(["Back to the shelf"]);
    expect(page.root.getAttribute("aria-labelledby")).toBe(
      "relic-detail-title",
    );
  });

  it("hides the keepsakes box with none, and shows only the found ones, each with its art", () => {
    const page = createDetailPage({ board, onBack: vi.fn() });
    page.paint(relic(2), []);
    expect(find(page.root, ".relic-keepsakes").hidden).toBe(true);
    page.paint(relic(2), ["drawing", "ribbon"]);
    expect(find(page.root, ".relic-keepsakes").hidden).toBe(false);
    expect(text(page.root, ".relic-keepsakes-title")).toBe("Keepsakes");
    const shown = [
      ...page.root.querySelectorAll<HTMLElement>("[data-keepsake]"),
    ].filter((item) => !item.hidden);
    expect(shown.map((item) => item.dataset["keepsake"])).toEqual([
      "drawing",
      "ribbon",
    ]);
    const drawing = find(page.root, '[data-keepsake="drawing"]');
    expect(text(drawing, ".relic-keepsake-name")).toBe("A child's drawing");
    expect(text(drawing, ".relic-keepsake-story")).toBe(
      "A little figure with a lamp, folded for a pocket.",
    );
    const art = find(drawing, "img") as HTMLImageElement;
    expect(art.getAttribute("src")).toBe(KEEPSAKE_ART.drawing);
    expect(art.width).toBe(32);
  });

  it("Back to the shelf acts only past the page's settle", () => {
    const onBack = vi.fn();
    const page = createDetailPage({ board, onBack });
    page.paint(relic(0), []);
    sheet.open();
    advance(DRAWER_SETTLE_MS + 50);
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, ".relic-page-shelf"));
    expect(onBack).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, ".relic-page-shelf"));
    expect(onBack).toHaveBeenCalledWith("finger");
  });
});

describe("the reveal page (#465)", () => {
  it("names the relic found, with what it does and its power, and one plate", () => {
    const page = createRevealPage({ board, onCarry: vi.fn() });
    const shield = relic(1);
    page.paint(shield);
    expect(text(page.root, "h3.relic-page-title")).toBe(
      "You found the Shield of Protection",
    );
    expect(text(page.root, ".relic-page-line")).toBe(
      "The virtue of Protection.",
    );
    expect(text(page.root, ".relic-page-power")).toBe(shield.power);
    expect(text(page.root, ".relic-page-boost")).toBe(
      `Your power: ${shield.boost}`,
    );
    expect(plates(page.root)).toEqual(["Carry it with pride"]);
  });

  it("Carry it with pride acts past the settle, with how it came", () => {
    const onCarry = vi.fn();
    const page = createRevealPage({ board, onCarry });
    page.paint(relic(0));
    sheet.open();
    sheet.showPage(page.root);
    press(find(page.root, ".relic-page-carry"));
    expect(onCarry).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS + 50);
    press(find(page.root, ".relic-page-carry"));
    expect(onCarry).toHaveBeenCalledWith("finger");
  });
});

describe("the Legend page (#465)", () => {
  it("shows the six relics lit, the line, the cheer, and Stand proud then Pass to your kid", () => {
    const page = createLegendPage({ board, onStand: vi.fn(), onPass: vi.fn() });
    page.paint("Six relics found.");
    expect(text(page.root, "h3.relic-page-title")).toBe("You became a Legend");
    expect(text(page.root, ".relic-page-kicker")).toBe(
      "The bottom of the mountain",
    );
    const icons = [
      ...page.root.querySelectorAll<HTMLImageElement>(".relic-legend-art"),
    ];
    expect(icons.map((icon) => icon.getAttribute("src"))).toEqual(
      RELICS.map((each) => RELIC_LIT[each.id]),
    );
    expect(text(page.root, ".relic-legend-stats")).toBe("Six relics found.");
    expect(text(page.root, ".relic-page-power")).toMatch(
      /pass the mine to your kid\.$/,
    );
    expect(plates(page.root)).toEqual(["Stand proud", "Pass to your kid"]);
  });

  it("each plate runs its own act", () => {
    const onStand = vi.fn();
    const onPass = vi.fn();
    const page = createLegendPage({ board, onStand, onPass });
    sheet.open();
    sheet.showPage(page.root);
    advance(DRAWER_SETTLE_MS + 50);
    press(find(page.root, ".relic-page-pass"));
    expect(onPass).toHaveBeenCalledTimes(1);
    expect(onStand).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS + 50);
    press(find(page.root, ".relic-page-stand"));
    expect(onStand).toHaveBeenCalledTimes(1);
  });
});
