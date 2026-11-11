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
    expect(firstNotice(noticed.session.news, "reveal")?.relic.id).toBe(
      relic.id,
    );
    expect(firstNotice(noticed.session.news, "layer")?.layer.id).toBe(band.id);
    expect(codes(noticed.effects)).toEqual(
      expect.arrayContaining(["relic.found", "layer.enter"]),
    );
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
    expect(refused.session.mountain.pocket).toBe(session.mountain.pocket);
    expect(step(refused.session, move, 0).session).toBe(refused.session);
  });

  it("starts a new run with no news but the crew's, and remembers the cleared homecomings", () => {
    const session = playing();
    const begun = step(
      {
        ...session,
        news: {
          ...session.news,
          notices: [quiet(12), CREW, ...RELICS.map(reveal)],
        },
      },
      { kind: "begin", mountain: { ...createMountain(), startedAt: 5_000 } },
      5_000,
    );
    expect(begun.session.lastSeen).toBe(5_000);
    expect(begun.session.news.notices).toEqual([CREW]);
    expect(begun.session.baselines.reveal).toBe(0);
    expect(begun.effects).toEqual([{ kind: "remember" }]);
  });

  it("closes one piece of news at a time, and says when there is none", () => {
    const session = playing();
    const news: Session = {
      ...session,
      news: { ...session.news, notices: [reveal(RELICS[0]), quiet(3)] },
    };
    expect(hasNews(session, "reveal")).toBe(false);
    expect(hasNews(news, "reveal")).toBe(true);
    const quietClosed = step(news, { kind: "dismiss", what: "quiet" }, 0);
    expect(hasNews(quietClosed.session, "quiet")).toBe(false);
    expect(quietClosed.session.news.notices).toEqual([reveal(RELICS[0])]);
    expect(step(session, { kind: "dismiss", what: "craft" }, 0).session).toBe(
      session,
    );
  });

  it("dismisses two notices of one kind one at a time, in order (#415)", () => {
    const [first, second] = RELICS;
    const session = playing();
    const two: Session = {
      ...session,
      news: {
        ...session.news,
        notices: [reveal(first), quiet(3), reveal(second)],
      },
    };
    const one = step(two, { kind: "dismiss", what: "reveal" }, 0).session;
    expect(firstNotice(one.news, "reveal")?.relic).toBe(second);
    expect(noticesOf(one.news, "quiet")).toEqual([quiet(3)]);
    const none = step(one, { kind: "dismiss", what: "reveal" }, 0).session;
    expect(hasNews(none, "reveal")).toBe(false);
    expect(none.news.notices).toEqual([quiet(3)]);
  });

  it("closes the whole welcome card: its crew news, bands, crafts and homecomings", () => {
    const session = playing();
    const band: Notice = { kind: "layer", layer: LAYERS[1] };
    const card: Session = {
      ...session,
      news: {
        ...session.news,
        notices: [CREW, { kind: "engineer-joined" }, band, reveal(RELICS[0])],
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
    expect(closed.session.news.notices).toEqual([reveal(RELICS[0])]);
    expect(closed.session.news.homecomings).toEqual([]);
  });

  it("adds the crew who join on load to the crew already told", () => {
    const session = playing({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 1_000,
      drills: 3,
      staffed: 0,
    });
    const told: Session = {
      ...session,
      news: { ...session.news, notices: [CREW] },
    };
    const loaded = step(told, { kind: "loaded" }, 0).session;
    const joined = noticesOf(loaded.news, "crew-joined");
    expect(joined).toHaveLength(1);
    expect(joined[0]?.helpers).toBeGreaterThan(CREW_HELPERS);
  });
});

const CREW_HELPERS = 2;
const CREW: Notice = { kind: "crew-joined", helpers: CREW_HELPERS };
const quiet = (stones: number): Notice => ({ kind: "quiet", stones });
const reveal = (relic: (typeof RELICS)[number] | undefined): Notice => {
  if (relic === undefined) {
    throw new Error("a relic");
  }
  return { kind: "reveal", relic };
};
