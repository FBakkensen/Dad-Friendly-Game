// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BOARD_HOW_ART, boardHowCard } from "./board-how-art";
import { HOW_IT_WORKS } from "./how-it-works";

const widths = (card: HTMLElement): string[] =>
  [...card.querySelectorAll("img")].map(
    (img) => img.getAttribute("width") ?? "",
  );

describe("the board's How it works art (#373)", () => {
  it.each([
    "staffing",
    "upgrades",
    "away",
    "engineers",
    "expeditions",
    "tending",
  ] as const)("maps every step of %s to board art", (system) => {
    for (const [art] of HOW_IT_WORKS[system].steps) {
      expect(BOARD_HOW_ART[art], art).toBeDefined();
    }
  });

  it("shows machines and the worker at 64 and the small icons at 32", () => {
    expect(BOARD_HOW_ART["mine-cart"]?.px).toBe(64);
    expect(BOARD_HOW_ART["helper-miner"]?.px).toBe(64);
    expect(BOARD_HOW_ART.stone?.px).toBe(32);
    expect(BOARD_HOW_ART.pick?.px).toBe(32);
    expect(BOARD_HOW_ART.mountain?.px).toBe(32);
    expect(BOARD_HOW_ART["upgrades-icon"]?.px).toBe(32);
  });

  it("renders staffing's four machines and the worker at 64", () => {
    const card = boardHowCard("staffing", "Back to Buys", () => undefined);
    expect(widths(card)).toEqual(["64", "64", "64", "64"]);
    expect(
      [...card.querySelectorAll("img")].map((img) =>
        img.getAttribute("height"),
      ),
    ).toEqual(["64", "64", "64", "64"]);
  });

  it("is today's card: its title, words, data-how and Back plate", () => {
    const onBack = vi.fn();
    const card = boardHowCard("upgrades", "Back to Upgrades", onBack);
    expect(card.classList.contains("teach-how")).toBe(true);
    expect(card.dataset["how"]).toBe("upgrades");
    expect(card.querySelector(".teach-how-title")?.textContent).toBe(
      "How it works · Upgrades",
    );
    expect(
      [...card.querySelectorAll(".teach-how-steps li span")].map(
        (span) => span.textContent,
      ),
    ).toEqual(HOW_IT_WORKS.upgrades.steps.map(([, words]) => words));
    const back = card.querySelector<HTMLButtonElement>(".teach-how-back");
    expect(back?.classList.contains("board-platebtn")).toBe(true);
    expect(back?.textContent).toBe("Back to Upgrades");
    back?.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the Time away card: the worker at 64, the stone at 32 (#375, #728)", () => {
    const card = boardHowCard("away", "Back to the Ledger", () => undefined);
    expect(card.dataset["how"]).toBe("away");
    const sources = [...card.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    // Night foreman's upgrades step went with him (#728).
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain("mach-worker");
    expect(sources[1]).toContain("res-stone");
    expect(widths(card)).toEqual(["64", "32"]);
  });

  it("renders the Engineers card's four steps: the worker at 64 twice, the map and the boot at 32 (#455, #728)", () => {
    const card = boardHowCard(
      "engineers",
      "Back to your engineers",
      () => undefined,
    );
    expect(card.dataset["how"]).toBe("engineers");
    const sources = [...card.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(sources).toHaveLength(4);
    expect(sources[0]).toContain("mach-worker");
    expect(sources[1]).toContain("mach-worker");
    expect(sources[2]).toContain("res-map");
    expect(sources[3]).toContain("res-boot");
    expect(widths(card)).toEqual(["64", "64", "32", "32"]);
  });

  it("renders the Expeditions card with the map, the nugget and the worker, and Tending with the board's machines (#455)", () => {
    const trips = boardHowCard("expeditions", "Back", () => undefined);
    const tripArt = [...trips.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(tripArt[0]).toContain("res-map");
    expect(tripArt[1]).toContain("res-nugget");
    expect(tripArt[2]).toContain("mach-worker");
    expect(widths(trips)).toEqual(["32", "32", "64"]);
    const tending = boardHowCard("tending", "Back", () => undefined);
    expect(widths(tending)).toEqual(["64", "64", "64"]);
  });
});
