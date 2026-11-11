import { describe, expect, it } from "vitest";
import {
  askedPrice,
  broughtRowView,
  broughtStories,
  crewOf,
  findHer,
  pageEngineer,
  promoteAskLine,
  engineerRowView,
  engineerTeach,
  herPlates,
  listKick,
  machinePost,
  pageKick,
  postGain,
  postRowView,
  promoteRowView,
  promoteWhyLine,
  settlePage,
  tunnelRowView,
  type EngineerCtx,
  type EngineerPage,
  type EngineerTeach,
} from "./engineer-rows";
import { MAX_ENGINEERS, promoteCost, type Engineer } from "./engineers";
import { TUNNELS, type Expedition } from "./expeditions";
import type { Mountain } from "./mountain";
import { firstTend, promotePayoff, tendingGain } from "./rates";
import {
  ENGINEER_SHEET_SUB,
  NONE_BUILT,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  PROMOTE_WHY,
  PROMOTION_INTRO,
  engineersIntro,
  promoteNeeds,
  stonesPerSecond,
  tendingIntro,
} from "./screen-words";
import { minedMountain } from "./test-fixtures";

const NOW = 5_000_000;
const MINUTE = 60_000;

/** The depths suite's Ada: one Apprentice on the borers, and a pocket for a promotion. */
const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
  ...minedMountain(0),
  pocket: 5_000_000,
  helpers: 20,
  carts: 2,
  drills: 1,
  borers: 1,
  engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  ...patch,
});

const trip = (
  engineer: Engineer["name"],
  patch: Partial<Expedition> = {},
): Expedition => ({
  engineer,
  tunnel: "old-shaft",
  sentAt: NOW,
  returnsAt: NOW + 40 * MINUTE,
  home: "borer",
  find: { kind: "quiet" },
  ...patch,
});

/** Ada out in the old shaft, as the trip save has her. */
const adaOut = (patch: Partial<Mountain> = {}): Mountain =>
  withAda({
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
    expeditions: [trip("Ada")],
    ...patch,
  });

/** The camp-posts save's five engineers, Otto out, two keepsakes home. */
const fiveCrew = (patch: Partial<Mountain> = {}): Mountain =>
  withAda({
    engineers: [
      { name: "Ada", rank: 1, trips: 3, post: "borer" },
      { name: "Nils", rank: 0, trips: 0, post: "camp" },
      { name: "Ruth", rank: 2, trips: 9, post: "drill" },
      { name: "Otto", rank: 0, trips: 0, post: "tunnel" },
      { name: "Mae", rank: 0, trips: 0, post: "cart" },
    ],
    expeditions: [trip("Otto", { home: "camp" })],
    finds: ["drawing", "watch"],
    ...patch,
  });

const ctxOf = (mountain: Mountain, ready = true): EngineerCtx => ({
  mountain,
  trouble: undefined,
  now: NOW,
  ready,
});

const NONE: EngineerTeach = { kind: "none" };

/** The crew of the mountain, by index. */
const crew = (mountain: Mountain, index = 0): Engineer => {
  const found = mountain.engineers?.[index];
  if (found === undefined) {
    throw new Error(`no engineer ${String(index)}`);
  }
  return found;
};

describe("the Engineers' teach (#455)", () => {
  it("a first visit teaches the trip, on Ada", () => {
    expect(engineerTeach(ctxOf(withAda()))).toEqual({
      kind: "trip",
      name: "Ada",
    });
  });

  it("not while she is already out", () => {
    const out = adaOut({ expeditions: [] });
    expect(engineerTeach(ctxOf(out)).kind).not.toBe("trip");
  });

  it("after a trip, the tend that firstTend names", () => {
    const mountain = withAda({
      taught: ["engineers"],
      engineers: [{ name: "Ada", rank: 0, trips: 1, post: "camp" }],
    });
    const step = firstTend(mountain, NOW);
    expect(step).toBeDefined();
    expect(engineerTeach(ctxOf(mountain))).toEqual({
      kind: "tend",
      name: "Ada",
      index: step?.index,
      post: step?.post,
    });
  });

  it("then the promotion, with its real payoff", () => {
    const mountain = withAda({
      taught: ["engineers"],
      engineers: [{ name: "Ada", rank: 0, trips: 1, post: "drill" }],
    });
    const payoff = promotePayoff(mountain, NOW);
    expect(payoff).toBeDefined();
    expect(engineerTeach(ctxOf(mountain))).toEqual({
      kind: "promote",
      name: payoff?.name,
      post: payoff?.post,
      gain: stonesPerSecond(payoff?.gain ?? 0),
    });
  });

  it("no engineers, no lesson", () => {
    expect(engineerTeach(ctxOf(minedMountain(0)))).toEqual(NONE);
  });

  it("and nothing once taught", () => {
    const mountain = withAda({
      taught: ["engineers", "tending", "promotion"],
    });
    expect(engineerTeach(ctxOf(mountain))).toEqual(NONE);
  });
});

describe("the kicks (#455)", () => {
  it("the list says the teach's intro, else the sheet's sub-line", () => {
    expect(listKick({ kind: "trip", name: "Ada" })).toBe(engineersIntro("Ada"));
    expect(
      listKick({ kind: "tend", name: "Ada", index: 0, post: "drill" }),
    ).toBe(tendingIntro("Ada"));
    expect(
      listKick({
        kind: "promote",
        name: "Nils",
        post: "drill",
        gain: "+5 stones/sec",
      }),
    ).toBe(PROMOTION_INTRO);
    expect(listKick(NONE)).toBe(ENGINEER_SHEET_SUB);
  });

  it("her page says her duty with the live gain at home", () => {
    const mountain = withAda();
    const gain = stonesPerSecond(tendingGain(mountain, 0, "borer", NOW));
    expect(
      pageKick({ kind: "engineer", name: "Ada" }, ctxOf(mountain), NONE),
    ).toBe(`Ada is tending the borers: ${gain}.`);
  });

  it("at camp, her page says she rests", () => {
    const mountain = withAda({
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
    });
    expect(
      pageKick({ kind: "engineer", name: "Ada" }, ctxOf(mountain), NONE),
    ).toBe("Ada is resting at camp. Give her a job below.");
  });

  it("while she is out, her page says the trip in words, with no digit", () => {
    const kick = pageKick(
      { kind: "engineer", name: "Ada" },
      ctxOf(adaOut()),
      NONE,
    );
    expect(kick).toBe(
      "Ada will be gone about an hour. She'll bring home whatever is found.",
    );
    expect(kick).not.toMatch(/\d|\?/);
  });

  it("out with no trip on the books, her page says she is out", () => {
    expect(
      pageKick(
        { kind: "engineer", name: "Ada" },
        ctxOf(adaOut({ expeditions: [] })),
        NONE,
      ),
    ).toBe("Ada is out exploring.");
  });

  it("the tunnels page says the aside", () => {
    expect(
      pageKick({ kind: "tunnels", name: "Ada" }, ctxOf(withAda()), NONE),
    ).toBe("While she explores, her machine works without her.");
  });

  it("every other page, and a page whose engineer is gone, says the list's kick", () => {
    const ctx = ctxOf(withAda());
    const teach: EngineerTeach = { kind: "trip", name: "Ada" };
    for (const page of [
      { kind: "list" },
      { kind: "recall", name: "Ada" },
      { kind: "promote", price: 2_000_000 },
      { kind: "brought" },
      { kind: "engineer", name: "Nils" },
      { kind: "tunnels", name: "Nils" },
    ] as const satisfies readonly EngineerPage[]) {
      expect(pageKick(page, ctx, teach), page.kind).toBe(engineersIntro("Ada"));
    }
  });
});

describe("settlePage (#455)", () => {
  const ada = { kind: "engineer", name: "Ada" } as const;

  it("an engineer gone takes every page of hers to the list", () => {
    const mountain = withAda();
    for (const page of [
      { kind: "engineer", name: "Nils" },
      { kind: "tunnels", name: "Nils" },
      { kind: "recall", name: "Nils" },
    ] as const satisfies readonly EngineerPage[]) {
      expect(settlePage(page, mountain, true)).toEqual({ kind: "list" });
    }
  });

  it("her page stays while she is here", () => {
    expect(settlePage(ada, withAda(), true)).toBe(ada);
    expect(settlePage(ada, adaOut(), true)).toBe(ada);
  });

  it("a recall page whose engineer came home gives way to her page", () => {
    expect(
      settlePage({ kind: "recall", name: "Ada" }, withAda(), true),
    ).toEqual(ada);
    const recall = { kind: "recall", name: "Ada" } as const;
    expect(settlePage(recall, adaOut(), true)).toBe(recall);
  });

  it("a tunnels page whose engineer left gives way to her page", () => {
    expect(
      settlePage({ kind: "tunnels", name: "Ada" }, adaOut(), true),
    ).toEqual(ada);
    const tunnels = { kind: "tunnels", name: "Ada" } as const;
    expect(settlePage(tunnels, withAda(), true)).toBe(tunnels);
  });

  it("a promote page that can no longer promote gives way to the list", () => {
    const page = { kind: "promote", price: 2_000_000 } as const;
    expect(settlePage(page, withAda(), true)).toBe(page);
    expect(settlePage(page, withAda({ pocket: 0 }), true)).toEqual({
      kind: "list",
    });
  });

  it("a Brought home page with no keepsakes gives way to the list", () => {
    const page = { kind: "brought" } as const;
    expect(settlePage(page, fiveCrew(), true)).toBe(page);
    expect(settlePage(page, withAda(), true)).toEqual({ kind: "list" });
  });

  it("no engineers at all is the list", () => {
    expect(settlePage(ada, withAda({ engineers: [] }), true)).toEqual({
      kind: "list",
    });
    const list = { kind: "list" } as const;
    expect(settlePage(list, withAda(), true)).toBe(list);
  });

  it("a mountain with no crew field is the list", () => {
    expect(
      settlePage({ kind: "engineer", name: "Ada" }, minedMountain(0), true),
    ).toEqual({ kind: "list" });
    expect(
      pageKick(
        { kind: "engineer", name: "Ada" },
        ctxOf(minedMountain(0)),
        NONE,
      ),
    ).toBe(ENGINEER_SHEET_SUB);
    expect(promoteRowView(ctxOf(minedMountain(0)), NONE).verb).toBe("Promote");
  });

  it("a save that is not in yet keeps the page", () => {
    const page = { kind: "engineer", name: "Nils" } as const;
    expect(settlePage(page, withAda({ engineers: [] }), false)).toBe(page);
  });
});

describe("postGain (#455)", () => {
  it("camp gains nothing to show", () => {
    expect(postGain(ctxOf(withAda()), 0, "camp")).toBeUndefined();
  });

  it("a tier with none built says so", () => {
    expect(postGain(ctxOf(withAda()), 0, "machine")).toBe(NONE_BUILT);
  });

  it("a built tier says its real stones a second", () => {
    const mountain = withAda();
    expect(postGain(ctxOf(mountain), 0, "drill")).toBe(
      stonesPerSecond(tendingGain(mountain, 0, "drill", NOW)),
    );
    expect(postGain(ctxOf(mountain), 0, "drill")).toMatch(
      /^\+[\d.,]+[KMBT]? stones\/sec$/,
    );
  });
});

describe("an engineer's row (#455)", () => {
  it("names her, her rank as a word, and her duty", () => {
    const mountain = withAda({ taught: ["engineers", "tending", "promotion"] });
    const view = engineerRowView(crew(mountain), ctxOf(mountain), NONE);
    expect(view).toMatchObject({
      name: "Ada",
      badge: "Apprentice",
      info: ["Tending the borers", "Tending the borers"],
      why: "",
      flag: [],
      lamp: "green",
      state: "owned",
      verb: "",
      price: "",
      can: true,
      pick: false,
      out: false,
      aria: "Ada. Apprentice. Tending the borers",
    });
  });

  it("is the New row, amber, under a teach that names her", () => {
    const mountain = withAda();
    const view = engineerRowView(crew(mountain), ctxOf(mountain), {
      kind: "trip",
      name: "Ada",
    });
    expect(view.lamp).toBe("amber");
    expect(view.flag).toEqual(["New"]);
    const tend = engineerRowView(crew(mountain), ctxOf(mountain), {
      kind: "tend",
      name: "Ada",
      index: 0,
      post: "drill",
    });
    expect(tend.flag).toEqual(["New"]);
    const other = engineerRowView(crew(mountain), ctxOf(mountain), {
      kind: "promote",
      name: "Nils",
      post: "drill",
      gain: "+5 stones/sec",
    });
    expect(other.flag).toEqual([]);
    expect(other.lamp).toBe("green");
  });

  it("out, she runs green with the trip in words, and walks", () => {
    const mountain = adaOut();
    const view = engineerRowView(crew(mountain), ctxOf(mountain), NONE);
    expect(view.info).toEqual([
      "Exploring the old shaft · gone about an hour",
      "Exploring a tunnel",
    ]);
    expect(view.state).toBe("running");
    expect(view.lamp).toBe("green");
    expect(view.out).toBe(true);
    expect(view.info.join(" ")).not.toMatch(/\d/);
  });

  it("at camp, her lamp is off and she is ready", () => {
    const mountain = fiveCrew();
    const nils = engineerRowView(crew(mountain, 1), ctxOf(mountain), NONE);
    expect(nils.lamp).toBe("off");
    expect(nils.state).toBe("ready");
    expect(nils.info[0]).toBe("Resting at camp");
  });

  it("a near rank shows as her why line, never a count", () => {
    const mountain = withAda({
      engineers: [{ name: "Ada", rank: 0, trips: 2, post: "borer" }],
    });
    expect(engineerRowView(crew(mountain), ctxOf(mountain), NONE).why).toBe(
      "nearly a Journeyman",
    );
    const five = fiveCrew();
    expect(engineerRowView(crew(five, 2), ctxOf(five), NONE).badge).toBe(
      "Master engineer",
    );
  });
});

describe("a post row on her page (#455)", () => {
  // Her own post's gain is the page's kick, so its right column stays clear for the name.
  it("her own post is here, green, with its real gain in the line, not the column", () => {
    const mountain = withAda({ taught: ["engineers", "tending"] });
    const ctx = ctxOf(mountain);
    const gain = stonesPerSecond(tendingGain(mountain, 0, "borer", NOW));
    const view = postRowView(crew(mountain), 0, "borer", ctx, NONE);
    expect(view).toMatchObject({
      name: "The borers · here now",
      gain: "",
      lamp: "green",
      state: "owned",
      can: true,
      flag: [],
    });
    expect(view.info).toEqual([
      `${gain.charAt(0).toUpperCase()}${gain.slice(1)}. They dig faster, and she clears any jam herself.`,
      "They dig faster, and she clears any jam herself.",
    ]);
    expect(view.aria).toBe(`The borers · here now. ${view.info[0] ?? ""}`);
  });

  it("another post is off and ready; one with none built shows no gain", () => {
    const mountain = withAda();
    const ctx = ctxOf(mountain);
    const drills = postRowView(crew(mountain), 0, "drill", ctx, NONE);
    expect(drills.name).toBe("The drills");
    expect(drills.lamp).toBe("off");
    expect(drills.state).toBe("ready");
    const machine = postRowView(crew(mountain), 0, "machine", ctx, NONE);
    expect(machine.gain).toBe("");
    expect(machine.info[0]).toBe(
      "None built yet. It runs with far fewer workers, and she clears any jam herself.",
    );
    const camp = postRowView(crew(mountain), 0, "camp", ctx, NONE);
    expect(camp.gain).toBe("");
    expect(camp.info).toEqual([
      "Rests by the fire, ready for the next job.",
      "Rests by the fire, ready for the next job.",
    ]);
  });

  it("the tend the teach names is the New row", () => {
    const mountain = withAda();
    const teach: EngineerTeach = {
      kind: "tend",
      name: "Ada",
      index: 0,
      post: "drill",
    };
    const ctx = ctxOf(mountain);
    const drills = postRowView(crew(mountain), 0, "drill", ctx, teach);
    expect(drills.lamp).toBe("amber");
    expect(drills.flag).toEqual(["New"]);
    expect(postRowView(crew(mountain), 0, "cart", ctx, teach).flag).toEqual([]);
    const nils = { name: "Nils", rank: 0, trips: 0, post: "camp" } as const;
    expect(postRowView(nils, 1, "drill", ctx, teach).flag).toEqual([]);
  });
});

describe("a tunnel row (#455)", () => {
  const [seam, shaft, deep] = TUNNELS;

  it("names the tunnel and what it brings", () => {
    const view = tunnelRowView(crew(withAda()), shaft, NONE);
    expect(view).toMatchObject({
      name: "Old shaft",
      info: ["About an hour, often a lost tool or keepsake."],
      lamp: "off",
      state: "ready",
      can: true,
      flag: [],
    });
  });

  it("the deep dark is locked for an Apprentice, and open to a Journeyman", () => {
    const locked = tunnelRowView(crew(withAda()), deep, NONE);
    expect(locked).toMatchObject({
      info: ["The deep dark waits for a Journeyman."],
      state: "locked",
      lamp: "off",
      can: false,
    });
    const five = fiveCrew();
    expect(tunnelRowView(crew(five), deep, NONE).can).toBe(true);
  });

  it("the shortest tunnel is the New row under the trip teach", () => {
    const teach: EngineerTeach = { kind: "trip", name: "Ada" };
    const ada = crew(withAda());
    const quick = tunnelRowView(ada, seam, teach);
    expect(quick.lamp).toBe("amber");
    expect(quick.flag).toEqual(["New"]);
    expect(tunnelRowView(ada, shaft, teach).flag).toEqual([]);
    const nils = { name: "Nils", rank: 0, trips: 0, post: "camp" } as const;
    expect(tunnelRowView(nils, seam, teach).flag).toEqual([]);
  });
});

describe("the Promote row (#455)", () => {
  it("a promotable crew: the price on its tag, the verb, and why", () => {
    const mountain = withAda({ taught: ["engineers", "tending", "promotion"] });
    const view = promoteRowView(ctxOf(mountain), NONE);
    expect(view).toMatchObject({
      name: "Promote a worker",
      verb: "Promote",
      price: "2M",
      dimTag: false,
      info: [PROMOTE_WHY],
      lamp: "green",
      state: "ready",
      can: true,
      cost: promoteCost(mountain),
      aria: `Promote: 2M stones. ${PROMOTE_WHY}`,
    });
  });

  it("not until the save is in", () => {
    expect(promoteRowView(ctxOf(withAda(), false), NONE).can).toBe(false);
  });

  it("a light pocket dims the tag and says what it needs", () => {
    const view = promoteRowView(ctxOf(withAda({ pocket: 10 })), NONE);
    expect(view).toMatchObject({
      price: "2M",
      dimTag: true,
      info: [promoteNeeds(2_000_000)],
      lamp: "off",
      state: "dear",
      can: false,
    });
  });

  it("no free worker says so", () => {
    expect(promoteRowView(ctxOf(withAda({ helpers: 0 })), NONE).info).toEqual([
      PROMOTE_NEEDS_WORKER,
    ]);
  });

  it("a full crew keeps the row, with no tag and no verb", () => {
    const view = promoteRowView(ctxOf(fiveCrew()), NONE);
    expect(MAX_ENGINEERS).toBe(5);
    expect(view).toMatchObject({
      price: "",
      verb: "",
      info: [PROMOTE_CREW_FULL],
      state: "locked",
      lamp: "off",
      can: false,
      aria: `Promote a worker. ${PROMOTE_CREW_FULL}`,
    });
  });

  it("under the promotion teach it is the New row, with the payoff", () => {
    const view = promoteRowView(ctxOf(withAda()), {
      kind: "promote",
      name: "Nils",
      post: "drill",
      gain: "+5 stones/sec",
    });
    expect(view.lamp).toBe("amber");
    expect(view.flag).toEqual(["New"]);
    expect(view.info).toEqual(["Nils could tend the drills: +5 stones/sec"]);
  });
});

describe("Brought home (#455)", () => {
  it("is a row of today's names, and none without keepsakes", () => {
    expect(broughtRowView(fiveCrew().finds)).toMatchObject({
      name: "Brought home",
      info: ["A child's drawing, A pocket watch"],
      lamp: "off",
      state: "found",
      can: true,
      aria: "Brought home. A child's drawing, A pocket watch",
    });
    expect(broughtRowView(undefined)).toBeUndefined();
    expect(broughtRowView(["pick"])).toBeUndefined();
  });

  it("tells each story in the order they came home, with no digit", () => {
    const stories = broughtStories(["watch", "drawing"]);
    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatch(/^A pocket watch\. /);
    expect(stories[1]).toMatch(/^A child's drawing\. /);
    expect(stories.join(" ")).not.toMatch(/\d/);
  });
});

describe("her page's plates (#455)", () => {
  it("at home: Send exploring, and the way back", () => {
    expect(herPlates(crew(withAda()), NONE)).toEqual({
      left: { id: "explore", label: ["Send exploring"], newCard: false },
      right: { id: "back", label: ["Back to your engineers"], newCard: false },
    });
  });

  it("out: Call her back", () => {
    expect(herPlates(crew(adaOut()), NONE).left).toEqual({
      id: "recall",
      label: ["Call her back"],
      newCard: false,
    });
  });

  it("under the trip teach, the guided first trip with its fallback", () => {
    const teach: EngineerTeach = { kind: "trip", name: "Ada" };
    expect(herPlates(crew(withAda()), teach).left).toEqual({
      id: "explore",
      label: ["Send Ada exploring · 10 min", "Send exploring"],
      newCard: true,
    });
    const nils = { name: "Nils", rank: 0, trips: 0, post: "camp" } as const;
    expect(herPlates(nils, teach).left.newCard).toBe(false);
  });
});

describe("moved from the panel (#455)", () => {
  it("machinePost names a machine, never camp or a tunnel", () => {
    expect(machinePost("drill")).toBe("drill");
    expect(machinePost("cart")).toBe("cart");
    expect(machinePost("borer")).toBe("borer");
    expect(machinePost("machine")).toBe("machine");
    expect(machinePost("camp")).toBeUndefined();
    expect(machinePost("tunnel")).toBeUndefined();
  });

  it("promoteWhyLine says why a promotion waits, or why it is worth it", () => {
    const mountain = withAda();
    expect(promoteWhyLine(mountain, false, 1)).toBe(PROMOTE_CREW_FULL);
    expect(promoteWhyLine({ ...mountain, helpers: 0 }, true, 1)).toBe(
      PROMOTE_NEEDS_WORKER,
    );
    expect(promoteWhyLine(mountain, true, 9_000_000)).toBe(
      promoteNeeds(9_000_000),
    );
    expect(promoteWhyLine(mountain, true, 1)).toBe(PROMOTE_WHY);
  });
});

/** A mountain before its first borer: no crew at all. */
const noCrew = (): Mountain => ({
  ...minedMountain(0),
  pocket: 5_000_000,
  helpers: 20,
});

describe("what a press reads (#455)", () => {
  it("finds her by name, with her place in the crew", () => {
    const five = fiveCrew();
    expect(findHer(five, "Ruth")).toEqual({
      engineer: crew(five, 2),
      index: 2,
    });
    expect(findHer(withAda(), "Nils")).toBeUndefined();
    expect(findHer(five, undefined)).toBeUndefined();
    expect(findHer(noCrew(), "Ada")).toBeUndefined();
  });

  it("reads the crew, or none", () => {
    expect(crewOf(fiveCrew()).map((each) => each.name)).toEqual([
      "Ada",
      "Nils",
      "Ruth",
      "Otto",
      "Mae",
    ]);
    expect(crewOf(noCrew())).toEqual([]);
  });

  it("names the engineer a page is about", () => {
    expect(pageEngineer({ kind: "engineer", name: "Ada" })).toBe("Ada");
    expect(pageEngineer({ kind: "tunnels", name: "Nils" })).toBe("Nils");
    expect(pageEngineer({ kind: "recall", name: "Otto" })).toBe("Otto");
    expect(pageEngineer({ kind: "list" })).toBeUndefined();
    expect(pageEngineer({ kind: "promote", price: 5 })).toBeUndefined();
  });

  it("the price the promote ask was opened at, and none on another page", () => {
    expect(askedPrice({ kind: "promote", price: 2_000_000 })).toBe(2_000_000);
    expect(askedPrice({ kind: "list" })).toBeNaN();
  });

  it("the promote ask names the next hand, and a full crew asks nothing", () => {
    expect(promoteAskLine(withAda())).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    expect(promoteAskLine(fiveCrew())).toBe("");
    expect(promoteAskLine(noCrew())).toBe(
      "Ada steps up as engineer. One worker fewer at the machines.",
    );
  });
});
