import { describe, expect, it } from "vitest";
import { BUILDING_IDS } from "./city";
import { withFactors } from "./economy/factors";
import { createMountain, type Mountain } from "./mountain";
import { PLAY_FACTORS } from "./part-switch";
import {
  createSession,
  firstNotice,
  hasNews,
  noticesOf,
  openBaselines,
  step,
  troubleMark,
  WELCOME_MIN_AWAY_MS,
  type Notice,
  type Session,
  type SessionEffect,
} from "./session";
import { stockpileRoom } from "./stockyard";

const codes = (effects: readonly SessionEffect[]): string[] =>
  effects.flatMap((effect) => (effect.kind === "record" ? [effect.code] : []));

function playing(mountain: Mountain = createMountain()): Session {
  return openBaselines(createSession(mountain, 1), true);
}

describe("session step", () => {
  it("does not announce what a loaded save already holds", () => {
    const loaded = playing({
      ...createMountain(),
      operational: [...BUILDING_IDS],
    });
    const noticed = step(loaded, { kind: "notice" }, 0);
    expect(noticed.session.news.notices).toEqual([]);
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
          notices: [graniteNews, ...BUILDING_IDS.map(lit)],
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
      news: { ...session.news, notices: [lit(BUILDING_IDS[0]), graniteNews] },
    };
    expect(hasNews(session, "operational")).toBe(false);
    expect(hasNews(news, "operational")).toBe(true);
    const levelClosed = step(news, { kind: "dismiss", what: "level" }, 0);
    expect(hasNews(levelClosed.session, "level")).toBe(false);
    expect(levelClosed.session.news.notices).toEqual([lit(BUILDING_IDS[0])]);
    expect(step(session, { kind: "dismiss", what: "level" }, 0).session).toBe(
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
        notices: [lit(first), graniteNews, lit(second)],
      },
    };
    const one = step(two, { kind: "dismiss", what: "operational" }, 0).session;
    expect(firstNotice(one.news, "operational")?.building).toBe(second);
    expect(noticesOf(one.news, "level")).toEqual([graniteNews]);
    const none = step(one, { kind: "dismiss", what: "operational" }, 0).session;
    expect(hasNews(none, "operational")).toBe(false);
    expect(none.news.notices).toEqual([graniteNews]);
  });

  it("closes the whole welcome card and homecomings while leaving operational notices", () => {
    const session = playing();
    const card: Session = {
      ...session,
      news: {
        ...session.news,
        notices: [lit(BUILDING_IDS[0])],
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

  it("omits the shift report when Slice 2 Part 1 only fills the pithead while the stockyard is full (#769)", () => {
    withFactors(PLAY_FACTORS, () => {
      const base = createMountain();
      const cap = stockpileRoom(base, "stones");
      const fullYard: Mountain = {
        ...base,
        owned: { ...base.owned, helper: 3 },
        jobs: { ...base.jobs, drilling: 1, haulage: 1, hoisting: 1 },
        stock: { ...base.stock, stones: cap },
      };
      const session: Session = { ...playing(fullYard), lastSeen: 1 };
      const after = step(
        session,
        { kind: "tick" },
        1 + WELCOME_MIN_AWAY_MS * 10,
      );
      expect(after.session.mountain.pithead.topsoil).toBeGreaterThan(0);
      expect(after.mined).toBeGreaterThan(0);
      expect(after.awayWork).toBe(true);
      expect(hasNews(after.session, "away")).toBe(false);
    });
  });

  it("shows the shift report when Slice 2 Part 1 moves pithead rock into an open stockyard (#769)", () => {
    withFactors(PLAY_FACTORS, () => {
      const base = createMountain();
      const hauling: Mountain = {
        ...base,
        owned: { ...base.owned, helper: 1 },
        jobs: { ...base.jobs, driving: 1 },
        pithead: { ...base.pithead, topsoil: 100 },
      };
      const session: Session = { ...playing(hauling), lastSeen: 1 };
      const after = step(
        session,
        { kind: "tick" },
        1 + WELCOME_MIN_AWAY_MS * 10,
      );
      expect(after.session.mountain.stock.stones).toBeGreaterThan(0);
      expect(after.mined).toBe(0);
      expect(after.awayWork).toBe(true);
      expect(hasNews(after.session, "away")).toBe(true);
    });
  });
});

const graniteNews: Notice = { kind: "level", level: "granite" };
const lit = (building: (typeof BUILDING_IDS)[number] | undefined): Notice => {
  if (building === undefined) {
    throw new Error("a building");
  }
  return { kind: "operational", building };
};
