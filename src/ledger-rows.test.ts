import { describe, expect, it } from "vitest";
import type { AuthState } from "./auth";
import type { FieldEvent, FieldEventData } from "./field-log";
import { legacyWords } from "./legacy-panel";
import { legacyBonus } from "./legacy";
import {
  TONIGHT_LINES,
  accountRowView,
  relicsRowView,
  stonesRowView,
  tonightLines,
  tonightText,
} from "./ledger-rows";
import { createMountain, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";

/** One field log event at a local time on 11 November 2026. */
function event(
  code: string,
  data: FieldEventData = {},
  hh = 22,
  mm = 13,
): FieldEvent {
  return {
    at: new Date(2026, 10, 11, hh, mm, 30).toISOString(),
    code,
    data,
  };
}

const text = (code: string, data: FieldEventData = {}): string | undefined =>
  tonightText(event(code, data));

describe("tonightText words each event the field log keeps (#375)", () => {
  it("words a worker, a kid worker and a machine bought", () => {
    expect(text("tier.buy", { id: "helper", count: 56 })).toBe(
      "Hired worker 56.",
    );
    expect(text("tier.buy", { id: "kid", count: 2 })).toBe(
      "Hired kid worker 2.",
    );
    expect(text("tier.buy", { id: "cart", count: 3 })).toBe(
      "Bought mine cart 3.",
    );
    expect(text("tier.buy", { id: "machine", count: 1 })).toBe(
      "Bought Great Machine 1.",
    );
  });

  it("words an upgrade's level and a boost's length", () => {
    expect(text("upgrade.buy", { id: "tap", count: 3 })).toBe(
      "Strong arms, level 3.",
    );
    const start = event("boost.start", {
      id: "overtime",
      endsAt: new Date(Date.parse(event("x").at) + 30 * 60_000).toISOString(),
    });
    expect(tonightText(start)).toBe("Overtime started for 30:00.");
  });

  it("words a craft started and fitted", () => {
    expect(text("craft.start", { id: "iron-rails" })).toBe(
      "Iron rails went on the bench.",
    );
    expect(text("craft.done", { id: "iron-rails", count: 1 })).toBe(
      "Your Iron rails are fitted.",
    );
  });

  it("words a relic found and a layer broken into", () => {
    expect(text("relic.found", { id: "hammer" })).toBe(
      "Found the Hammer of the Builder.",
    );
    expect(text("layer.enter", { id: "granite" })).toBe(
      "You broke into the Granite!",
    );
  });

  it("words the away haul and a vein's stones", () => {
    expect(text("away.report", { ms: 3_600_000, stones: 1_234_567 })).toBe(
      "Came back. The crew dug 1.2M while you were away.",
    );
    expect(text("vein.tap", { stones: 4_200 })).toBe(
      "A golden vein gave 4,200 stones.",
    );
  });

  it("words the fix and the engineers with today's cheers", () => {
    expect(text("trouble.fix", { id: "cart", source: "tap" })).toBe(
      "Fixed! The crew cheers.",
    );
    expect(text("engineer.promote", { id: "Ada", count: 4 })).toBe(
      "Ada steps up. The crew cheers.",
    );
    expect(text("engineer.station", { id: "Nils", source: "drill" })).toBe(
      "Nils heads to the drills!",
    );
    expect(text("expedition.send", { id: "Ada", source: "side-seam" })).toBe(
      "Ada lights a lamp and heads in!",
    );
    expect(text("expedition.recall", { id: "Ada", source: "side-seam" })).toBe(
      "Ada comes home empty-handed.",
    );
    expect(text("expedition.return", { id: "Ada", source: "quiet" })).toBe(
      "Ada came home.",
    );
  });

  it("skips save, log and housekeeping codes", () => {
    for (const code of [
      "save.write",
      "save.load",
      "field-log.write",
      "idle.away",
      "crew.staff",
      "recipe.found",
      "trouble.start",
      "run.start-over",
      "run.pass",
      "something.new",
    ]) {
      expect(text(code, { id: "cart", count: 1, stones: 5 }), code).toBe(
        undefined,
      );
    }
  });

  it("skips what this build cannot name, and a missing or bad number", () => {
    expect(text("tier.buy", { id: "rocket", count: 1 })).toBe(undefined);
    expect(text("tier.buy", { id: "cart" })).toBe(undefined);
    expect(text("tier.buy", { id: "cart", count: Number.NaN })).toBe(undefined);
    expect(text("tier.buy", { count: 1 })).toBe(undefined);
    expect(text("upgrade.buy", { id: "jetpack", count: 1 })).toBe(undefined);
    expect(text("upgrade.buy", { id: "tap", count: 0 })).toBe(undefined);
    expect(text("boost.start", { id: "nap", endsAt: event("x").at })).toBe(
      undefined,
    );
    expect(text("boost.start", { id: "overtime" })).toBe(undefined);
    expect(text("boost.start", { id: "overtime", endsAt: "soon" })).toBe(
      undefined,
    );
    expect(text("boost.start", { id: "overtime", endsAt: event("x").at })).toBe(
      undefined,
    );
    expect(text("craft.start", { id: "jet-boots" })).toBe(undefined);
    expect(text("craft.done", { id: "jet-boots", count: 1 })).toBe(undefined);
    expect(text("relic.found", { id: "sword" })).toBe(undefined);
    expect(text("layer.enter", { id: "magma" })).toBe(undefined);
    expect(text("layer.enter", { id: "topsoil" })).toBe(undefined);
    expect(text("engineer.promote", { id: "Bob" })).toBe(undefined);
    expect(text("engineer.station", { id: "Nils", source: "tunnel" })).toBe(
      undefined,
    );
    expect(text("engineer.station", { id: "Nils" })).toBe(undefined);
    expect(text("expedition.send", {})).toBe(undefined);
    expect(text("vein.tap", {})).toBe(undefined);
    expect(text("vein.tap", { stones: 0 })).toBe(undefined);
  });

  it("skips an away haul of no stones", () => {
    expect(text("away.report", { ms: 60_000, stones: 0 })).toBe(undefined);
    expect(text("away.report", { ms: 60_000 })).toBe(undefined);
  });

  it("skips an event with a bad time", () => {
    expect(
      tonightText({ at: "yesterday", code: "trouble.fix", data: {} }),
    ).toBe(undefined);
    expect(tonightLines([{ at: "", code: "trouble.fix", data: {} }])).toEqual(
      [],
    );
  });
});

describe("tonightLines (#375)", () => {
  it("shows the newest three wordable lines, newest first, with HH:MM times", () => {
    const events = [
      event("tier.buy", { id: "helper", count: 1 }, 21, 0),
      event("save.write", {}, 21, 1),
      event("tier.buy", { id: "helper", count: 2 }, 21, 5),
      event("tier.buy", { id: "cart", count: 1 }, 21, 9),
      event("crew.staff", { count: 1 }, 21, 10),
      event("upgrade.buy", { id: "tap", count: 2 }, 22, 3),
      event("trouble.fix", { id: "cart" }, 7, 5),
    ];
    expect(TONIGHT_LINES).toBe(3);
    expect(tonightLines(events)).toEqual([
      { time: "07:05", text: "Fixed! The crew cheers." },
      { time: "22:03", text: "Strong arms, level 2." },
      { time: "21:09", text: "Bought mine cart 1." },
    ]);
  });

  it("starts again at the newest Start over or pass", () => {
    const events = [
      event("tier.buy", { id: "helper", count: 9 }, 20, 0),
      event("run.start-over", {}, 20, 1),
      event("tier.buy", { id: "helper", count: 1 }, 20, 2),
      event("run.pass", {}, 20, 3),
      event("tier.buy", { id: "helper", count: 1 }, 20, 4),
    ];
    expect(tonightLines(events)).toEqual([
      { time: "20:04", text: "Hired worker 1." },
    ]);
    expect(tonightLines(events.slice(0, 2))).toEqual([]);
  });

  it("says nothing for an empty ring", () => {
    expect(tonightLines([])).toEqual([]);
  });
});

/** A mountain deep in the Heart, `remaining` stones of the deepest band still in it. */
function heart(remaining: number): Mountain {
  return { ...createMountain(), remaining, pocket: 0 };
}

describe("stonesRowView (#375)", () => {
  it("reads the stones left, with the exact count on its title, and four materials", () => {
    const view = stonesRowView(heart(12_729));
    expect(view.name).toBe("412.4K stones left");
    expect(view.title).toBe("412,420 of 4,462,375,000");
    expect(view.info).toHaveLength(1);
    expect(view.info[0]?.split(" · ")).toHaveLength(4);
    expect(view.info[0]).toMatch(
      /^Clay \S+ · Iron \S+ · Crystal \S+ · Heartstone \S+$/,
    );
    expect(view.aria).toBe(`412.4K stones left. ${view.info[0] ?? ""}`);
    expect(view).toMatchObject({
      lamp: "off",
      state: "owned",
      verb: "",
      price: "",
      can: false,
    });
  });

  it("names the materials met, with their counts", () => {
    const view = stonesRowView({
      ...minedMountain(12_000_000),
      materials: { clay: 10, iron: 4, crystal: 0, heartstone: 0 },
    });
    expect(view.info).toEqual(["Clay 10 · Iron 4"]);
  });

  it("shows no materials on a fresh mountain", () => {
    const view = stonesRowView(createMountain());
    expect(view.info).toEqual([]);
    expect(view.aria).toBe(view.name);
  });
});

describe("relicsRowView (#375)", () => {
  it("an unguided fresh mountain: none found, the dark Lantern, no bar", () => {
    const view = relicsRowView(createMountain());
    expect(view.name).toBe("0 of 6 relics found");
    expect(view.info).toEqual([
      "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.",
    ]);
    expect(view.why).toBe("Below the topsoil, the rock turns hard and grey.");
    expect(view).toMatchObject({
      icon: "lantern",
      lit: false,
      progress: undefined,
      barLabel: "",
      lamp: "off",
      state: "owned",
      can: false,
    });
  });

  it("an unguided kid's run speaks of the Legacy", () => {
    const kid = { ...createMountain(), legacy: 1 };
    const view = relicsRowView(kid);
    expect(view.info).toEqual([
      `Your kid's mine: six relics wait inside. Legacy ${legacyWords(legacyBonus(kid))}.`,
    ]);
  });

  it("a next relic: the goal, the layer hint and the bar", () => {
    const view = relicsRowView(minedMountain(4_600_000));
    expect(view.name).toBe("1 of 6 relics found");
    expect(view.info).toEqual(["Next: Shield of Protection · Getting closer"]);
    expect(view.why).toBe("Below the topsoil, the rock turns hard and grey.");
    expect(view.progress).toBe(0.4);
    expect(view.barLabel).toBe(
      "Progress to the Shield of Protection. Below the topsoil, the rock turns hard and grey.",
    );
    expect(view).toMatchObject({
      icon: "shield",
      lit: false,
      lamp: "amber",
      state: "owned",
    });
    expect(view.aria).toBe(
      "1 of 6 relics found. Next: Shield of Protection · Getting closer. Below the topsoil, the rock turns hard and grey.",
    );
  });

  it("a next relic with no layer below: the bar's label is the relic alone", () => {
    const view = relicsRowView(heart(1_000_000));
    expect(view.why).toBe("");
    expect(view.barLabel).toBe("Progress to the Mantle of the Hero");
    expect(view.icon).toBe("mantle");
    expect(view.lit).toBe(false);
    expect(view.aria).toBe(`5 of 6 relics found. ${view.info[0] ?? ""}`);
  });

  it("every relic found: the lit Mantle and the done sentence", () => {
    const view = relicsRowView({ ...createMountain(), remaining: 0 });
    expect(view.name).toBe("6 of 6 relics found");
    expect(view.info).toEqual(["Every relic is yours. You are a legend."]);
    expect(view).toMatchObject({
      icon: "mantle",
      lit: true,
      progress: undefined,
      lamp: "green",
      state: "found",
      why: "",
    });
  });
});

describe("accountRowView (#375)", () => {
  const view = (state: AuthState) => accountRowView(state);

  it("signed out: Sign in", () => {
    expect(view({ kind: "signed-out" })).toMatchObject({
      name: "Account",
      info: ["Not signed in"],
      verb: "Sign in",
      lamp: "off",
      state: "ready",
      can: true,
      aria: "Sign in with Google",
    });
  });

  it("signing in: no verb, an amber lamp, and no tap", () => {
    expect(view({ kind: "signing-in" })).toMatchObject({
      name: "Account",
      info: ["Signing in..."],
      verb: "",
      lamp: "amber",
      state: "running",
      can: false,
      aria: "Signing in...",
    });
  });

  it("signed in: the label on the info line, and Sign out", () => {
    const label = "a.very.long.email.address.for.a.dad@example.com";
    expect(
      view({ kind: "signed-in", user: { uid: "u1", label } }),
    ).toMatchObject({
      name: "Account",
      info: [`Signed in as ${label}`],
      verb: "Sign out",
      lamp: "green",
      state: "owned",
      can: true,
      aria: `Signed in as ${label}. Sign out`,
    });
  });
});
