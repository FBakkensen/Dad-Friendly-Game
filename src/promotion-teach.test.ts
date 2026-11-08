// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { effectiveRates, promotePayoff } from "./rates";
import { PROMOTE_BASE_COST, promote, promoteCost, station } from "./engineers";
import { formatCompact } from "./format";
import { BAND_SCALE } from "./scale";
import {
  PROMOTION_INTRO,
  promoteOffer,
  promotionAction,
  promotionPayoff,
  stonesPerSecond,
} from "./screen-words";
import { noteFor, showsDot } from "./teach";

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
});

const tile =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function mount(now: () => number) {
  const root = document.createElement("div");
  const progress = createProgressStore({
    auth: createUnconfiguredAuth(),
    sessionStorage: memoryStorage(),
    cloudWriteGapMs: 0,
    now,
  });
  mountMountainScreen({
    root,
    lanternUrl: tile,
    mountainUrl: tile,
    stoneUrl: tile,
    veinUrl: tile,
    upgradesUrl: tile,
    tierArt: {
      helper: tile,
      cart: tile,
      drill: tile,
      borer: tile,
      machine: tile,
      kid: tile,
    },
    relicArt: {
      lantern: tile,
      shield: tile,
      hammer: tile,
      heart: tile,
      crown: tile,
      mantle: tile,
    },
    progress,
    now,
    random: () => 0,
  });
  document.body.append(root);
  return { root, progress };
}

const ada = { name: "Ada", rank: 0, trips: 1, post: "borer" } as const;
/** After the first trip, with 2M for the second engineer. */
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 200_000_000,
    // 40M mined is the Granite: the second engineer costs 2M × 3 (#356).
    pocket: 6_500_000,
    helpers: 60,
    carts: 10,
    drills: 6,
    borers: 2,
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers", "staffing"],
  };
}

function withoutEngineers(): Mountain {
  const { engineers: _gone, ...rest } = crew();
  void _gone;
  return rest;
}

describe("promotion teach (#246)", () => {
  it("is small: a dot with no note, only when he can pay and it pays", () => {
    expect(showsDot(crew(), "promotion")).toBe(true);
    expect(noteFor(crew())).toBe(undefined);
    expect(showsDot({ ...crew(), pocket: 1_000_000 }, "promotion")).toBe(false);
    expect(showsDot({ ...crew(), helpers: 0 }, "promotion")).toBe(false);
    expect(
      showsDot(
        {
          ...crew(),
          engineers: [{ ...ada, trips: 0 }],
          taught: ["workshop", "staffing"],
        },
        "promotion",
      ),
    ).toBe(false);
    // No machine for the new hand to tend: no nudge to lose a worker.
    expect(
      showsDot({ ...crew(), carts: 0, drills: 0, borers: 1 }, "promotion"),
    ).toBe(false);
  });

  it("counts the worker who steps up in the payoff", () => {
    const payoff = promotePayoff(crew(), 0);
    expect(payoff?.name).toBe("Nils");
    expect(payoff?.post).toBe("drill");
    const promoted = promote(crew());
    const after = effectiveRates(
      station(promoted, 1, "drill"),
      0,
    ).crewPerSecond;
    expect(payoff?.gain).toBeCloseTo(
      after - effectiveRates(crew(), 0).crewPerSecond,
    );
    // With no engineer yet, the first hand is Ada, and any post is free.
    expect(promotePayoff(withoutEngineers(), 0)?.name).toBe("Ada");
    expect(promotePayoff({ ...crew(), pocket: 0 }, 0)).toBe(undefined);
    expect(promotionAction("Nils", 6_000_000)).toBe("Promote Nils · 6M");
    expect(promotionPayoff("Nils", "drill", "+217 stones/sec")).toBe(
      "Nils could tend the drills: +217 stones/sec",
    );
    expect(PROMOTION_INTRO).not.toContain("?");
  });

  it("the Promote row is the New card; its button confirms, then the dot goes", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const button =
      screen.root.querySelector<HTMLButtonElement>(".engineers-button");
    expect(button?.querySelector(".teach-dot")).not.toBeNull();
    button?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    expect(sheet?.querySelector(".engineers-intro")?.textContent).toBe(
      PROMOTION_INTRO,
    );
    const row = sheet?.querySelector(".engineer-promote-row");
    expect(row?.classList.contains("teach-new")).toBe(true);
    const payoff = promotePayoff(
      screen.progress.getSnapshot().mountain,
      clock,
      screen.progress.getSnapshot().trouble,
    );
    expect(payoff).toBeDefined();
    expect(row?.querySelector(".engineer-promote-why")?.textContent).toBe(
      promotionPayoff("Nils", "drill", stonesPerSecond(payoff?.gain ?? 0)),
    );
    const promoteButton =
      sheet?.querySelector<HTMLButtonElement>(".engineer-promote");
    expect(promoteButton?.textContent).toBe(
      promotionAction(
        "Nils",
        promoteCost(screen.progress.getSnapshot().mountain),
      ),
    );
    promoteButton?.click();
    sheet?.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.engineers?.map((hand) => hand.name)).toEqual([
      "Ada",
      "Nils",
    ]);
    expect(showsDot(mountain, "promotion")).toBe(false);
    expect(row?.classList.contains("teach-new")).toBe(false);
    // Next, the guided first tend puts Nils to work.
    expect(
      sheet?.querySelector<HTMLElement>(".engineer-first-tend:not([hidden])"),
    ).not.toBeNull();
  });

  it("quotes the band's promotion price on the how card, as the button does (#356)", () => {
    const screen = mount(() => 1_700_000_000_000);
    // 45M mined is the Crystal Caves: one-offs cost 6.3 times as much (#357).
    const caves = { ...crew(), remaining: 195_000_000, pocket: 0 };
    screen.progress.applyMutation(() => caves);
    screen.root.querySelector<HTMLButtonElement>(".engineers-button")?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    const first = PROMOTE_BASE_COST * BAND_SCALE[2];
    expect(promoteCost(caves)).toBe(first * 2);
    expect(
      sheet?.querySelector<HTMLButtonElement>(".engineer-promote")?.textContent,
    ).toBe(promoteOffer(promoteCost(caves)));
    const card = sheet?.querySelector<HTMLElement>(
      '[data-how="engineers"] .teach-how-steps li span',
    );
    expect(card?.textContent).toBe(
      `Promote a worker for ${formatCompact(first)} stones. Each next one costs double.`,
    );
  });
});
