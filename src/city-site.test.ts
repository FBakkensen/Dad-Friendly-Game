// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { projectCard, transportPlate } from "./city-view";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { createMemoryStorage } from "./mountain-screen.harness";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { NO_FREE_WORKER } from "./workforce-view";

/** The city on slice 1's frame, on the DOM (#662). */

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [FRESH_OFF]: 0 });
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
  vi.restoreAllMocks();
});

/** Every worker on a job: one driver, two builders, the rest in the mine. */
const crewed = (mountain: Mountain): Mountain => ({
  ...mountain,
  owned: { ...mountain.owned, helper: 9 },
  jobs: {
    drilling: 2,
    haulage: 2,
    hoisting: 2,
    driving: 1,
    building: 2,
    kilns: 0,
  },
});

function mount(change: (mountain: Mountain) => Mountain = (m) => m) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: createMemoryStorage(),
    cloudWriteGapMs: 0,
  });
  progress.applyMutation((m) => change(crewed(m)));
  mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    signal: unmount.signal,
  });
  const button = (selector: string): HTMLButtonElement => {
    const found = root.querySelector(selector);
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  const text = (selector: string): string =>
    root.querySelector(selector)?.textContent ?? "";
  button('.frame-site[data-site="city"]').click();
  return { root, progress, button, text };
}

const withStones =
  (stones: number) =>
  (mountain: Mountain): Mountain => ({
    ...mountain,
    stock: { ...mountain.stock, stones },
  });

describe("the city", () => {
  it("is on the city's site only", () => {
    const { root, button } = mount();
    const city = root.querySelector<HTMLElement>(".city");
    expect(city?.hidden).toBe(false);
    button('.frame-site[data-site="mine"]').click();
    expect(city?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".mine")?.hidden).toBe(false);
  });

  it("has the transport plate as the view says, a wagon key and no hire key", () => {
    const { root, progress, text } = mount();
    const plate = transportPlate(progress.getSnapshot().mountain);
    expect(text(".city-drivers")).toBe(plate.drivers);
    expect(text(".city-state")).toBe("idle: no order");
    expect(text(".city-fleet")).toBe(plate.fleet);
    expect(text(".city-key")).toMatch(/^\+Wagon · .*\/s.* · 1 to run$/);
    const words = [
      ...(root.querySelector(".city")?.querySelectorAll("button") ?? []),
    ]
      .map(
        (key) => `${key.textContent} ${key.getAttribute("aria-label") ?? ""}`,
      )
      .join(" ");
    expect(words).not.toMatch(/\bhire\b|\+Worker|truck/i);
  });

  it("buys a wagon from its key, and nothing when it is dark", () => {
    const rich = mount(withStones(10_000));
    rich.button(".city-key").click();
    expect(rich.progress.getSnapshot().mountain.fleet.horseWagon).toBe(2);
    unmount.abort();
    unmount = new AbortController();
    const poor = mount(withStones(0));
    poor.button(".city-key").click();
    expect(poor.progress.getSnapshot().mountain.fleet.horseWagon).toBe(1);
  });

  it("names three plots: the Light Tower's and two vacant", () => {
    const { root } = mount();
    const tags = [...root.querySelectorAll(".city-tag")].map(
      (tag) => tag.textContent,
    );
    expect(tags).toEqual([
      "The Light Towerfoundation",
      "Vacant plotunassigned",
      "Vacant plotunassigned",
    ]);
  });

  it("places the order, holds it and resumes it from the order key", () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const tapLater = (): void => {
      clock += 1_000;
      button(".city-order").click();
    };
    const { progress, button, text } = mount(withStones(1_000));
    expect(text(".city-order")).toBe("Place orderthe whole building");
    tapLater();
    expect(progress.getSnapshot().mountain.project.kind).toBe("delivering");
    expect(text(".city-order b")).toBe("Delivering");
    expect(text(".city-state")).toBe("serving the city");
    tapLater();
    expect(progress.getSnapshot().mountain.project.kind).toBe("onHold");
    expect(text(".city-order b")).toBe("Resume");
    expect(text(".city-state")).toBe("on hold");
    tapLater();
    expect(progress.getSnapshot().mountain.project.kind).toBe("delivering");
  });

  it("takes a double tap on Place order as one tap, so the order is not held", () => {
    const { progress, button } = mount(withStones(1_000));
    button(".city-order").click();
    button(".city-order").click();
    expect(progress.getSnapshot().mountain.project.kind).toBe("delivering");
  });

  it("shows the card's bar, builders and power as the view says", () => {
    const { progress, text } = mount();
    const card = projectCard(progress.getSnapshot().mountain);
    if (card.kind !== "project") {
      throw new Error("no project");
    }
    expect(text(".city-card-name")).toBe("The Light Tower");
    expect(text(".city-bar-line")).toBe(card.bars[0]?.line);
    expect(text(".city-crew-line")).toBe(card.builders.line);
    expect(text(".city-completion")).toBe(
      "On completion: night shift output 45%, up from 30%.",
    );
  });

  it("moves drivers and builders with − and +, and says where a free worker comes from", () => {
    const { root, progress, button } = mount();
    const note = root.querySelector<HTMLElement>(".city-note");
    expect(note?.hidden).toBe(true);
    button('.city .frame-step[data-job="building"][data-way="place"]').click();
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(NO_FREE_WORKER);
    button('.city .frame-step[data-job="driving"][data-way="free"]').click();
    expect(note?.hidden).toBe(true);
    expect(progress.getSnapshot().mountain.jobs.driving).toBe(0);
    button('.city .frame-step[data-job="building"][data-way="place"]').click();
    expect(progress.getSnapshot().mountain.jobs.building).toBe(3);
  });

  it("after the last roof says the strip's line, has no order key, and keeps the − and +", () => {
    const { root, text } = mount((m) => ({
      ...m,
      operational: ["lightTower"],
    }));
    expect(text(".city-planning")).toBe(
      "The Light Tower is operational · the city is planning its next building",
    );
    expect(root.querySelector<HTMLElement>(".city-order")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".city-bars")?.hidden).toBe(true);
    expect(text(".city-state")).toBe("idle: no order");
    expect(
      root.querySelectorAll(".city .frame-step:not([hidden])").length,
    ).toBe(4);
  });

  it("never says hands, and names no limit", () => {
    const { root, button } = mount(withStones(1_000));
    button(".city-order").click();
    expect(root.querySelector(".city")?.textContent).not.toMatch(
      /\bhands?\b|by hand|bottleneck|limit|waiting/i,
    );
  });
});
