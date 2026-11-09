// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BOARD_HOW_ART, boardHowCard } from "./board-how-art";
import { HOW_IT_WORKS } from "./how-it-works";

const widths = (card: HTMLElement): string[] =>
  [...card.querySelectorAll("img")].map(
    (img) => img.getAttribute("width") ?? "",
  );

describe("the board's How it works art (#373)", () => {
  it.each(["staffing", "layers", "upgrades", "boosts"] as const)(
    "maps every step of %s to board art",
    (system) => {
      for (const [art] of HOW_IT_WORKS[system].steps) {
        expect(BOARD_HOW_ART[art], art).toBeDefined();
      }
    },
  );

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

  it("renders boosts at 32, 64 and 32", () => {
    const card = boardHowCard("boosts", "Back to Upgrades", () => undefined);
    expect(widths(card)).toEqual(["32", "64", "32"]);
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

  it("draws the board's own art, not today's", () => {
    const card = boardHowCard("layers", "Back to Buys", () => undefined);
    const sources = [...card.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(sources).toEqual(
      HOW_IT_WORKS.layers.steps.map(([art]) => BOARD_HOW_ART[art]?.src),
    );
    expect(widths(card)).toEqual(["32", "64", "64", "32"]);
  });
});
