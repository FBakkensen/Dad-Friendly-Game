// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BOARD_HOW_ART, boardHowCard, createHowPricer } from "./board-how-art";
import { HOW_IT_WORKS, howItWorks } from "./how-it-works";
import { createMountain } from "./mountain";

const widths = (card: HTMLElement): string[] =>
  [...card.querySelectorAll("img")].map(
    (img) => img.getAttribute("width") ?? "",
  );

describe("the board's How it works art (#373)", () => {
  it.each([
    "staffing",
    "layers",
    "upgrades",
    "boosts",
    "workshop",
    "materials",
    "away",
    "relics",
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

  it.each(["layers", "workshop", "materials"] as const)(
    "draws the board's own art for %s, not today's",
    (system) => {
      const card = boardHowCard(system, "Back", () => undefined);
      const sources = [...card.querySelectorAll("img")].map(
        (img) => img.getAttribute("src") ?? "",
      );
      expect(sources).toEqual(
        HOW_IT_WORKS[system].steps.map(([art]) => BOARD_HOW_ART[art]?.src),
      );
    },
  );

  it("renders layers at 32, 64, 64 and 32", () => {
    const card = boardHowCard("layers", "Back to Buys", () => undefined);
    expect(widths(card)).toEqual(["32", "64", "64", "32"]);
  });

  it("renders the Workshop's four steps: the hammer at 48, clay at 32, the cart at 64 (#374)", () => {
    const card = boardHowCard(
      "workshop",
      "Back to the Workshop",
      () => undefined,
    );
    expect(card.dataset["how"]).toBe("workshop");
    const imgs = [...card.querySelectorAll("img")];
    expect(imgs).toHaveLength(4);
    expect(HOW_IT_WORKS.workshop.steps.map(([art]) => art)).toEqual([
      "relics/hammer",
      "ore-lump",
      "upgrades-icon",
      "mine-cart",
    ]);
    expect(imgs[0]?.getAttribute("src")).toContain("relic-hammer");
    expect(imgs[1]?.getAttribute("src")).toContain("res-clay");
    expect(widths(card)).toEqual(["48", "32", "32", "64"]);
    expect(imgs.map((img) => img.getAttribute("height"))).toEqual([
      "48",
      "32",
      "32",
      "64",
    ]);
  });

  it("renders Materials' three steps with no fallback stone where real art is mapped (#374)", () => {
    const card = boardHowCard(
      "materials",
      "Back to the Workshop",
      () => undefined,
    );
    const sources = [...card.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(sources).toHaveLength(3);
    expect(sources[0]).toContain("res-clay");
    expect(sources[2]).toContain("relic-hammer");
    expect(widths(card)).toEqual(["32", "32", "48"]);
  });

  it("renders the Relics card's three steps with the lit relic art at 48 (#375)", () => {
    const card = boardHowCard("relics", "Back to the Ledger", () => undefined);
    expect(card.dataset["how"]).toBe("relics");
    const imgs = [...card.querySelectorAll("img")];
    expect(imgs).toHaveLength(3);
    expect(imgs.map((img) => img.getAttribute("src"))).toEqual([
      BOARD_HOW_ART["relics/lantern"]?.src,
      BOARD_HOW_ART["relics/shield"]?.src,
      BOARD_HOW_ART["relics/crown"]?.src,
    ]);
    expect(imgs[0]?.getAttribute("src")).toContain("relic-lantern");
    expect(imgs[0]?.getAttribute("src")).not.toContain("dark");
    expect(imgs[1]?.getAttribute("src")).toContain("relic-shield");
    expect(imgs[2]?.getAttribute("src")).toContain("relic-crown");
    expect(widths(card)).toEqual(["48", "48", "48"]);
  });

  it("renders the Time away card: the worker at 64, the stone and upgrades at 32 (#375)", () => {
    const card = boardHowCard("away", "Back to the Ledger", () => undefined);
    expect(card.dataset["how"]).toBe("away");
    const sources = [...card.querySelectorAll("img")].map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(sources).toHaveLength(3);
    expect(sources[0]).toContain("mach-worker");
    expect(sources[1]).toContain("res-stone");
    expect(sources[2]).toContain("icon-upgrades");
    expect(widths(card)).toEqual(["64", "32", "32"]);
  });

  it("renders the Engineers card's four steps: the worker at 64, the crown at 48, the map and the boot at 32 (#455)", () => {
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
    expect(sources[1]).toContain("relic-crown");
    expect(sources[2]).toContain("res-map");
    expect(sources[3]).toContain("res-boot");
    expect(widths(card)).toEqual(["64", "48", "32", "32"]);
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

describe("createHowPricer (#455)", () => {
  const steps = (card: HTMLElement): string[] =>
    [...card.querySelectorAll(".teach-how-steps li span")].map(
      (span) => span.textContent,
    );

  const cards = (): HTMLElement => {
    const how = document.createElement("div");
    how.append(
      boardHowCard("engineers", "Back", () => undefined),
      boardHowCard("upgrades", "Back", () => undefined),
    );
    return how;
  };

  const card = (how: HTMLElement, system: string): HTMLElement => {
    const found = how.querySelector<HTMLElement>(`[data-how="${system}"]`);
    if (found === null) {
      throw new Error(`no ${system} card`);
    }
    return found;
  };

  it("reprices the cards it lists when the stretch changes, and leaves the others", () => {
    const how = cards();
    const price = createHowPricer(how, ["engineers"]);
    const upgrades = steps(card(how, "upgrades"));
    const stretched = { ...createMountain(), stretch: 4 };
    price(stretched);
    const copy = howItWorks(4, 4);
    expect(steps(card(how, "engineers"))).toEqual(
      copy.engineers.steps.map(([, words]) => words),
    );
    expect(steps(card(how, "engineers"))).not.toEqual(
      HOW_IT_WORKS.engineers.steps.map(([, words]) => words),
    );
    expect(steps(card(how, "upgrades"))).toEqual(upgrades);
  });

  it("writes nothing while the stretch holds", () => {
    const how = cards();
    const price = createHowPricer(how, ["engineers"]);
    price(createMountain());
    const engineers = card(how, "engineers");
    const first = engineers.querySelector(".teach-how-steps li span");
    if (first === null) {
      throw new Error("no step");
    }
    first.textContent = "kept";
    price(createMountain());
    expect(first.textContent).toBe("kept");
  });
});
