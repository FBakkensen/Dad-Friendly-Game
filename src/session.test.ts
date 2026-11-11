import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
import {
  MOUNTAIN_STONES,
  createMountain,
  minedOut,
  type Mountain,
} from "./mountain";
import { RELICS } from "./relics";
import {
  createSession,
  hasNews,
  openBaselines,
  step,
  troubleMark,
  type Session,
  type SessionEffect,
} from "./session";

const codes = (effects: readonly SessionEffect[]): string[] =>
  effects.flatMap((effect) => (effect.kind === "record" ? [effect.code] : []));

function minedTo(depth: number): Mountain {
  const mountain = { ...createMountain(), remaining: MOUNTAIN_STONES - depth };
  expect(minedOut(mountain)).toBe(depth);
  return mountain;
}

function playing(mountain: Mountain = createMountain()): Session {
  return openBaselines(createSession(mountain, 1), true);
}

describe("session step", () => {
  it("announces a relic and a band reached since the baselines, once", () => {
    const relic = RELICS[0];
    const band = LAYERS[1];
    if (relic === undefined) {
      throw new Error("the first relic");
    }
    const deep = Math.max(relic.depth, band.from);
    const session = playing();
    const dug = { ...session, mountain: minedTo(deep) };
    const noticed = step(dug, { kind: "notice" }, 0);
    expect(noticed.session.news.reveals[0]?.id).toBe(relic.id);
    expect(noticed.session.news.layersArrived[0]?.id).toBe(band.id);
    expect(codes(noticed.effects)).toEqual(
      expect.arrayContaining(["relic.found", "layer.enter"]),
    );
    const again = step(noticed.session, { kind: "notice" }, 0);
    expect(codes(again.effects)).not.toContain("layer.enter");
    expect(again.session.news.reveals).toHaveLength(
      noticed.session.news.reveals.length,
    );
  });

  it("does not announce what a loaded save already holds", () => {
    const loaded = playing(minedTo(50_000_000));
    const noticed = step(loaded, { kind: "notice" }, 0);
    expect(noticed.session.news.reveals).toEqual([]);
    expect(noticed.session.news.layersArrived).toEqual([]);
  });

  it("keeps the fitted mountain and the moment on a craft notice", () => {
    const session = playing();
    const fitted = {
      ...session,
      mountain: { ...session.mountain, crafted: { "iron-rails": 1 } },
    };
    const noticed = step(fitted, { kind: "notice" }, 42_000);
    expect(noticed.session.news.craftsFitted).toEqual([
      { id: "iron-rails", level: 1, mountain: fitted.mountain, at: 42_000 },
    ]);
    expect(codes(noticed.effects)).toContain("craft.done");
  });

  it("presses only the troubled tier, and the fifth press fixes it", () => {
    const trouble = { kind: "cave-in", tier: "cart", startedAt: 0 } as const;
    let session: Session = {
      ...playing({ ...createMountain(), borers: 1, carts: 1 }),
      hazards: { phase: "trouble", seed: 1, taps: 0, trouble },
    };
    const wrong = step(session, { kind: "press", tier: "drill" }, 0);
    expect(wrong.session).toBe(session);
    for (let tap = 0; tap < 5; tap += 1) {
      session = step(session, { kind: "press", tier: "cart" }, 0).session;
    }
    expect(troubleMark(session)).toBe("");
  });

  it("starts a new run with no news, and remembers the cleared homecomings", () => {
    const session = playing();
    const begun = step(
      {
        ...session,
        news: { ...session.news, quietAway: 12, reveals: [...RELICS] },
      },
      { kind: "begin", mountain: { ...createMountain(), startedAt: 5_000 } },
      5_000,
    );
    expect(begun.session.lastSeen).toBe(5_000);
    expect(begun.session.news.quietAway).toBeUndefined();
    expect(begun.session.news.reveals).toEqual([]);
    expect(begun.session.baselines.reveal).toBe(0);
    expect(begun.effects).toEqual([{ kind: "remember" }]);
  });

  it("closes one piece of news at a time, and says when there is none", () => {
    const session = playing();
    const news: Session = {
      ...session,
      news: { ...session.news, reveals: RELICS.slice(0, 2), quietAway: 3 },
    };
    expect(hasNews(session, "reveal")).toBe(false);
    expect(hasNews(news, "reveal")).toBe(true);
    const one = step(news, { kind: "dismiss", what: "reveal" }, 0).session;
    expect(one.news.reveals).toHaveLength(1);
    const quiet = step(news, { kind: "dismiss", what: "quiet" }, 0).session;
    expect(hasNews(quiet, "quiet")).toBe(false);
    const away = step(news, { kind: "dismiss", what: "away" }, 0);
    expect(away.effects).toEqual([{ kind: "remember" }]);
    expect(hasNews(away.session, "away")).toBe(false);
  });
});
