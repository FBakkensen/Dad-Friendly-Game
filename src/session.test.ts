import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
import {
  MOUNTAIN_STONES,
  createMountain,
  minedOut,
  type Mountain,
} from "./mountain";
import { BUILDING_IDS } from "./city";
import {
  createSession,
  firstNotice,
  hasNews,
  noticesOf,
  openBaselines,
  step,
  troubleMark,
  type Notice,
  type Session,
  type SessionEffect,
} from "./session";
import { NOTHING_CRAFTED } from "./workshop";

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
  it("announces a band reached since the baselines, once", () => {
    const band = LAYERS[1];
    const session = playing();
    const dug = { ...session, mountain: minedTo(band.from) };
    const noticed = step(dug, { kind: "notice" }, 0);
    expect(firstNotice(noticed.session.news, "layer")?.layer.id).toBe(band.id);
    expect(codes(noticed.effects)).toContain("layer.enter");
    expect(codes(noticed.effects)).not.toContain("relic.found");
    const again = step(noticed.session, { kind: "notice" }, 0);
    expect(codes(again.effects)).not.toContain("layer.enter");
    expect(again.session.news.notices).toEqual(noticed.session.news.notices);
  });

  it("does not announce what a loaded save already holds", () => {
    const loaded = playing(minedTo(50_000_000));
    const noticed = step(loaded, { kind: "notice" }, 0);
    expect(noticed.session.news.notices).toEqual([]);
  });

  it("keeps the fitted mountain and the moment on a craft notice", () => {
    const session = playing();
    const fitted = {
      ...session,
      mountain: {
        ...session.mountain,
        crafted: { ...NOTHING_CRAFTED, "iron-rails": 1 },
      },
    };
    const noticed = step(fitted, { kind: "notice" }, 42_000);
    expect(noticed.session.news.notices).toEqual([
      {
        kind: "craft",
        craft: {
          id: "iron-rails",
          level: 1,
          mountain: fitted.mountain,
          at: 42_000,
        },
      },
    ]);
    expect(codes(noticed.effects)).toContain("craft.done");
  });

  it("presses only the troubled tier, and the fifth press fixes it", () => {
    const trouble = { kind: "cave-in", tier: "cart", startedAt: 0 } as const;
    let session: Session = {
      ...playing({
        ...createMountain(),
        owned: { ...createMountain().owned, borer: 1, cart: 1 },
      }),
      hazards: { phase: "trouble", seed: 1, taps: 0, trouble },
    };
    const wrong = step(session, { kind: "press", tier: "drill" }, 0);
    expect(wrong.session).toBe(session);
    for (let tap = 0; tap < 5; tap += 1) {
      session = step(session, { kind: "press", tier: "cart" }, 0).session;
    }
    expect(troubleMark(session)).toBe("");
  });

  it("records a previewed trouble once, not again for the same moment", () => {
    const preview = { kind: "preview-trouble", tier: "cart" } as const;
    const first = step(playing(), preview, 7_000);
    expect(codes(first.effects)).toEqual(["trouble.start"]);
    expect(codes(step(first.session, preview, 7_000).effects)).toEqual([]);
    expect(codes(step(first.session, preview, 8_000).effects)).toEqual([
      "trouble.start",
    ]);
  });

  it("marks a first use taught on a refused move, and records nothing", () => {
    const ada = { name: "Ada", rank: 0, trips: 1, post: "borer" } as const;
    const session = playing({ ...createMountain(), engineers: [ada] });
    const move = {
      kind: "move",
      move: { kind: "buyTier", id: "drill" },
    } as const;
    const refused = step(session, move, 0);
    expect(refused.effects).toContainEqual({
      kind: "moved",
      result: { kind: "refused" },
    });
    expect(codes(refused.effects)).toEqual([]);
    expect(refused.session.mountain.taught).toContain("engineers");
    expect(refused.session.mountain.stock.stones).toBe(
      session.mountain.stock.stones,
    );
    expect(step(refused.session, move, 0).session).toBe(refused.session);
  });

  it("starts a new run with no news, and remembers the cleared homecomings", () => {
    const session = playing();
    const begun = step(
      {
        ...session,
        news: {
          ...session.news,
          notices: [deeper, ...BUILDING_IDS.map(lit)],
        },
      },
      { kind: "begin", mountain: { ...createMountain(), startedAt: 5_000 } },
      5_000,
    );
    expect(begun.session.lastSeen).toBe(5_000);
    expect(begun.session.news.notices).toEqual([]);
    expect(begun.effects).toEqual([{ kind: "remember" }]);
  });

  it("closes one piece of news at a time, and says when there is none", () => {
    const session = playing();
    const news: Session = {
      ...session,
      news: { ...session.news, notices: [lit(BUILDING_IDS[0]), deeper] },
    };
    expect(hasNews(session, "operational")).toBe(false);
    expect(hasNews(news, "operational")).toBe(true);
    const bandClosed = step(news, { kind: "dismiss", what: "layer" }, 0);
    expect(hasNews(bandClosed.session, "layer")).toBe(false);
    expect(bandClosed.session.news.notices).toEqual([lit(BUILDING_IDS[0])]);
    expect(step(session, { kind: "dismiss", what: "craft" }, 0).session).toBe(
      session,
    );
  });

  it("dismisses two notices of one kind one at a time, in order (#415)", () => {
    const [first, second] = BUILDING_IDS;
    const session = playing();
    const two: Session = {
      ...session,
      news: {
        ...session.news,
        notices: [lit(first), deeper, lit(second)],
      },
    };
    const one = step(two, { kind: "dismiss", what: "operational" }, 0).session;
    expect(firstNotice(one.news, "operational")?.building).toBe(second);
    expect(noticesOf(one.news, "layer")).toEqual([deeper]);
    const none = step(one, { kind: "dismiss", what: "operational" }, 0).session;
    expect(hasNews(none, "operational")).toBe(false);
    expect(none.news.notices).toEqual([deeper]);
  });

  it("closes the whole welcome card: its bands, crafts and homecomings", () => {
    const session = playing();
    const band: Notice = { kind: "layer", layer: LAYERS[1] };
    const card: Session = {
      ...session,
      news: {
        ...session.news,
        notices: [band, lit(BUILDING_IDS[0])],
        homecomings: [
          {
            engineer: "Ada",
            tunnel: "side-seam",
            find: { kind: "quiet", text: "Q." },
            sentAt: 0,
          },
        ],
      },
    };
    expect(hasNews(card, "away")).toBe(true);
    const closed = step(card, { kind: "dismiss", what: "away" }, 0);
    expect(closed.effects).toEqual([{ kind: "remember" }]);
    expect(hasNews(closed.session, "away")).toBe(false);
    expect(closed.session.news.notices).toEqual([lit(BUILDING_IDS[0])]);
    expect(closed.session.news.homecomings).toEqual([]);
  });
});

/** A band broken into: a notice the welcome card does not close one by one. */
const deeper: Notice = { kind: "layer", layer: LAYERS[1] };
const lit = (building: (typeof BUILDING_IDS)[number] | undefined): Notice => {
  if (building === undefined) {
    throw new Error("a building");
  }
  return { kind: "operational", building };
};
