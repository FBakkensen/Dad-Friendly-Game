import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "../mountain";
import { RELICS } from "../relics";
import { simulateDadRun } from "../pacing";
import {
  actionsOnTable,
  canPay,
  lookaheadSeconds,
  optimizerDecide,
  sticker,
} from "./decide";
import casual from "./policies/casual-2x10";
import checker from "./policies/checker-6x3";
import evening from "./policies/evening-1x20";
import fiveMin from "./policies/five-min-a-day";
import marathon from "./policies/marathon";
import allIn from "./policies/all-in-engineers";
import boostJunkie from "./policies/boost-junkie";
import hoarder from "./policies/hoarder";
import machinesOnly from "./policies/machines-only";
import neverFix from "./policies/never-fix-trouble";
import neverWorkers from "./policies/never-workers";
import noEngineers from "./policies/no-engineers";
import optimizer from "./policies/optimizer";
import tapOnly from "./policies/tap-only";
import workersOnly from "./policies/workers-only";
import { plainPolicy } from "./plain";
import {
  dayTunnel,
  definePolicy,
  fixDelayMs,
  isNightGap,
  isPolicy,
  nightTunnel,
  parsePolicyExport,
  type Policy,
} from "./policy";
import { promoteAsap, runPolicy, type PolicyRun } from "./run";
import {
  DAY_MS,
  FIX_FAST_MS,
  FIX_SLOW_MS,
  LOOKAHEAD_SESSIONS,
} from "./targets";

const mantle = RELICS.find((relic) => relic.id === "mantle")?.depth ?? 0;

const ada = {
  name: "Ada",
  rank: 0,
  trips: 0,
  post: "borer",
} as const;

function withPocket(pocket: number, extra: Partial<Mountain> = {}): Mountain {
  return { ...createMountain(), pocket, ...extra };
}

/** Next buys are all past `pocket`, so the second can only promote. */
function pricedOut(pocket: number): Mountain {
  return withPocket(pocket, {
    helpers: 80,
    carts: 15,
    drills: 7,
    borers: 1,
    engineers: [ada],
  });
}

let casualRun: PolicyRun | undefined;

function playCasual(): PolicyRun {
  casualRun ??= runPolicy({ policy: casual, seed: 1 });
  return casualRun;
}

describe("spend table", () => {
  it("leaves out a free post and an upgrade this dad will not buy", () => {
    const mountain = {
      ...createMountain(),
      helpers: 4,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" } as const],
    };
    const weighed = actionsOnTable(mountain, 0, casual.params);
    expect(weighed.some((action) => action.kind === "buyTier")).toBe(true);
    expect(weighed.some((action) => action.kind === "station")).toBe(false);
    expect(weighed.some((action) => action.kind === "buyUpgrade")).toBe(false);
    const withUpgrades = actionsOnTable(mountain, 0, {
      ...casual.params,
      spend: { ...casual.params.spend, upgrade: 1 },
    });
    expect(withUpgrades.some((action) => action.kind === "buyUpgrade")).toBe(
      true,
    );
  });
});

describe("casual-2x10", () => {
  it("reproduces today's plain dad: same finish day, same buy list", () => {
    const dad = simulateDadRun({ milestones: [mantle] });
    const run = playCasual();
    expect(run.finishDay).toBe(dad.reached.get(mantle));
    expect(run.buys).toEqual(
      dad.buys.map(({ day, id, price }) => ({ day, id, price })),
    );
    expect(run.promotions).toEqual(
      dad.promotions.map(({ day, name, price }) => ({ day, name, price })),
    );
  }, 120_000);

  it("keeps the plain dad's day: two 10-minute sittings, no jitter", () => {
    expect(casual.schedule.sessionMs).toBe(10 * 60 * 1000);
    expect(casual.schedule.gapMs(0, 1)).toBe(DAY_MS / 2 - 10 * 60 * 1000);
    expect(casual.schedule.gapMs(1, 2)).toBe(casual.schedule.gapMs(0, 1));
  });
});

describe("other schedules", () => {
  it("gives the evening dad one 20-minute sitting", () => {
    expect(evening.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 20,
      gapJitter: 0,
    });
    expect(evening.schedule.gapMs(0, 1)).toBe(DAY_MS - 20 * 60 * 1000);
  });

  it("jitters the checker's gaps from the seed, and replays them", () => {
    expect(checker.params).toMatchObject({
      sessionsPerDay: 6,
      minutesPerSession: 3,
    });
    expect(checker.schedule.gapMs(0, 1)).toBe(checker.schedule.gapMs(0, 1));
    expect(checker.schedule.gapMs(0, 1)).not.toBe(checker.schedule.gapMs(0, 2));
    const again = runPolicy({ policy: checker, seed: 3, maxDays: 1 });
    expect(again).toEqual(runPolicy({ policy: checker, seed: 3, maxDays: 1 }));
    expect(again.world.mountain.pocket).not.toBe(
      runPolicy({ policy: checker, seed: 9, maxDays: 1 }).world.mountain.pocket,
    );
  });

  it("gives five minutes, or one long sitting, and nothing else changes", () => {
    expect(fiveMin.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 5,
      tapsPerSecond: casual.params.tapsPerSecond,
    });
    expect(fiveMin.schedule.sessionMs).toBe(5 * 60 * 1000);
    expect(marathon.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 180,
    });
    expect(isNightGap(0, 1)).toBe(true);
    expect(isNightGap(0, 2)).toBe(false);
  });
});

describe("extremes", () => {
  it("never hires a worker except to staff a machine already owned", () => {
    const rich = withPocket(1_000_000_000);
    const first = neverWorkers.decide({
      mountain: rich,
      now: 0,
      params: neverWorkers.params,
    });
    expect(first?.kind === "buyTier" || first?.kind === "buyUpgrade").toBe(
      true,
    );
    if (first?.kind === "buyTier") {
      expect(first.id).not.toBe("helper");
      expect(first.id).not.toBe("kid");
    }
    const short = withPocket(1_000_000_000, { carts: 1 });
    expect(
      neverWorkers.decide({
        mountain: short,
        now: 0,
        params: neverWorkers.params,
      }),
    ).toMatchObject({ kind: "buyTier", id: "helper" });
    const staffed = withPocket(1_000_000_000, { carts: 1, helpers: 1 });
    const next = neverWorkers.decide({
      mountain: staffed,
      now: 0,
      params: neverWorkers.params,
    });
    if (next?.kind === "buyTier") {
      expect(next.id).not.toBe("helper");
    }
  });

  it("taps, and never buys", () => {
    const rich = withPocket(1_000_000_000, {
      helpers: 40,
      borers: 1,
      engineers: [ada],
    });
    expect(
      tapOnly.decide({ mountain: rich, now: 0, params: tapOnly.params }),
    ).toBeUndefined();
    const run = runPolicy({
      policy: tapOnly,
      seed: 1,
      mountain: rich,
      maxLiveSeconds: 5,
    });
    expect(run.buys).toEqual([]);
    expect(run.promotions).toEqual([]);
    expect(run.world.mountain.expeditions ?? []).toEqual([]);
  });

  it("buys machines, and workers only for those machines", () => {
    const rich = withPocket(1_000_000_000, { helpers: 40 });
    const action = machinesOnly.decide({
      mountain: rich,
      now: 0,
      params: machinesOnly.params,
    });
    expect(action?.kind).not.toBe("buyUpgrade");
    expect(action?.kind).not.toBe("buyBoost");
    expect(action).toMatchObject({ kind: "buyTier" });
    if (action?.kind === "buyTier") {
      expect(action.id).not.toBe("helper");
    }
  });

  it("buys workers and nothing with a staff cost", () => {
    const action = workersOnly.decide({
      mountain: withPocket(1_000_000_000_000),
      now: 0,
      params: workersOnly.params,
    });
    expect(action).toMatchObject({ kind: "buyTier", id: "helper" });
  });

  it("waits until the pocket holds 8 times the sticker", () => {
    const poor = withPocket(159);
    const action = hoarder.decide({
      mountain: poor,
      now: 0,
      params: hoarder.params,
    });
    expect(action).toMatchObject({ kind: "buyTier", id: "helper" });
    if (action === undefined) {
      return;
    }
    expect(hoarder.params.hoardK).toBe(8);
    expect(canPay(poor, action, hoarder.params.hoardK)).toBe(false);
    expect(canPay(withPocket(160), action, hoarder.params.hoardK)).toBe(true);
    expect(canPay(withPocket(19), action, 1)).toBe(false);
    const hoarded = runPolicy({
      policy: hoarder,
      seed: 1,
      mountain: withPocket(100),
      maxLiveSeconds: 1,
    });
    const spending = runPolicy({
      policy: casual,
      seed: 1,
      mountain: withPocket(100),
      maxLiveSeconds: 1,
    });
    expect(hoarded.buys).toEqual([]);
    expect(spending.buys.length).toBeGreaterThan(0);
  });

  it("never promotes, sends, or moves a post", () => {
    const run = runPolicy({
      policy: noEngineers,
      seed: 1,
      mountain: pricedOut(2_000_000),
      maxLiveSeconds: 1,
    });
    expect(run.promotions).toEqual([]);
    expect(run.world.mountain.engineers).toEqual([ada]);
    expect(run.world.mountain.expeditions ?? []).toEqual([]);
  });

  it("promotes until the crew is full as soon as each price can be paid", () => {
    const hired = promoteAsap(
      withPocket(40_000_000, {
        helpers: 10,
        borers: 1,
        engineers: [ada],
      }),
      allIn.params,
    );
    expect(hired.hired.map((engineer) => engineer.name)).toEqual([
      "Nils",
      "Ruth",
      "Otto",
      "Mae",
    ]);
    expect(hired.mountain.engineers).toHaveLength(5);
    const one = runPolicy({
      policy: allIn,
      seed: 1,
      mountain: pricedOut(2_000_000),
      maxLiveSeconds: 1,
    });
    expect(one.promotions.map((promotion) => promotion.name)).toEqual(["Nils"]);
  });

  it("leaves trouble up past the fast dad's three seconds", () => {
    const start = withPocket(0, { helpers: 8, borers: 1, engineers: [ada] });
    const lasted = (policy: Policy): { saw: boolean; pastFast: boolean } => {
      let saw = false;
      let pastFast = false;
      runPolicy({
        policy,
        seed: 1,
        mountain: start,
        maxLiveSeconds: 600,
        observe: (world) => {
          if (world.hazards.phase !== "trouble") {
            return;
          }
          saw = true;
          const age = world.clock - world.hazards.trouble.startedAt;
          if (age >= FIX_FAST_MS + 1000) {
            pastFast = true;
          }
        },
      });
      return { saw, pastFast };
    };
    const slow = lasted(neverFix);
    const fast = lasted(casual);
    expect(slow.saw).toBe(true);
    expect(fast.saw).toBe(true);
    expect(slow.pastFast).toBe(true);
    expect(fast.pastFast).toBe(false);
    expect(fixDelayMs("never")).toBeUndefined();
    expect(fixDelayMs("fast")).toBe(FIX_FAST_MS);
    expect(fixDelayMs("slow")).toBe(FIX_SLOW_MS);
  });

  it("starts every affordable boost before the second's dig", () => {
    const run = runPolicy({
      policy: boostJunkie,
      seed: 1,
      mountain: withPocket(10_000, { helpers: 4 }),
      maxLiveSeconds: 1,
    });
    expect(run.world.mountain.boosts?.sharper).toBeGreaterThan(0);
    expect(run.world.mountain.boosts?.overtime).toBeGreaterThan(0);
  });
});

describe("optimizer", () => {
  it("looks ahead one session, from the targets file", () => {
    const live = 10 * 60;
    const away = DAY_MS / 1000 / 2 - live;
    expect(lookaheadSeconds(optimizer.params)).toBe(
      LOOKAHEAD_SESSIONS * (live + away),
    );
    expect(
      optimizerDecide({
        mountain: createMountain(),
        now: 0,
        params: optimizer.params,
      }),
    ).toBeUndefined();
    expect(
      optimizerDecide({
        mountain: createMountain(),
        now: 0,
        params: { ...optimizer.params, tapsPerSecond: 0 },
      }),
    ).toBeUndefined();
    const rich = optimizerDecide({
      mountain: withPocket(1_000_000),
      now: 0,
      params: optimizer.params,
    });
    expect(
      rich?.kind === "buyTier" ||
        rich?.kind === "buyUpgrade" ||
        rich?.kind === "buyBoost",
    ).toBe(true);
  });

  it("finishes no later than casual", () => {
    const run = runPolicy({ policy: optimizer, seed: 1 });
    expect(run.finishDay).toBeLessThanOrEqual(
      playCasual().finishDay ?? Infinity,
    );
    expect(run.finishDay).toBeTypeOf("number");
  }, 120_000);

  it("plays the same run when the seed is the same", () => {
    const first = runPolicy({ policy: optimizer, seed: 2, maxLiveSeconds: 30 });
    const second = runPolicy({
      policy: optimizer,
      seed: 2,
      maxLiveSeconds: 30,
    });
    expect(first).toEqual(second);
  });
});

describe("policy shape", () => {
  it("names the tunnels the plain dad walks", () => {
    expect(dayTunnel("shift")).toBe("old-shaft");
    expect(nightTunnel("shift")).toBe("deep-dark");
    expect(dayTunnel("side-seam")).toBe("side-seam");
    expect(nightTunnel("deep-dark")).toBe("deep-dark");
    expect(dayTunnel("old-shaft")).toBe("old-shaft");
    expect(nightTunnel("old-shaft")).toBe("old-shaft");
    expect(dayTunnel("deep-dark")).toBe("deep-dark");
    expect(nightTunnel("side-seam")).toBe("side-seam");
  });

  it("rejects a default export that is not a player type", () => {
    expect(isPolicy(null)).toBe(false);
    expect(isPolicy({ ...casual, id: "" })).toBe(false);
    expect(isPolicy({ ...casual, id: "-bad" })).toBe(false);
    expect(isPolicy({ ...casual, id: "a--b" })).toBe(false);
    expect(isPolicy({ ...casual, id: "trail-" })).toBe(false);
    expect(() => {
      parsePolicyExport(null, "x.ts");
    }).toThrow(/default export/);
    expect(() => {
      parsePolicyExport({}, "x.ts");
    }).toThrow(/default export/);
    expect(() => {
      parsePolicyExport({ default: { id: "nope" } }, "x.ts");
    }).toThrow(/not a policy/);
    expect(isPolicy("casual")).toBe(false);
    expect(isPolicy([])).toBe(false);
    expect(isPolicy({ ...casual, id: "NO" })).toBe(false);
    expect(isPolicy({ ...casual, label: "" })).toBe(false);
    expect(isPolicy({ ...casual, kind: "dad" })).toBe(false);
    expect(isPolicy({ ...casual, params: null })).toBe(false);
    expect(isPolicy({ ...casual, schedule: null })).toBe(false);
    expect(isPolicy({ ...casual, decide: "buy" })).toBe(false);
    expect(
      isPolicy({
        ...casual,
        params: { ...casual.params, sessionsPerDay: 0 },
      }),
    ).toBe(false);
    expect(
      isPolicy({
        ...casual,
        params: { ...casual.params, spend: { worker: 1 } },
      }),
    ).toBe(false);
    expect(
      isPolicy({ ...casual, params: { ...casual.params, spend: null } }),
    ).toBe(false);
    expect(() => {
      definePolicy({ ...casual, id: "Bad" });
    }).toThrow('Invalid policy "Bad"');
    expect(() =>
      definePolicy({ ...casual, id: 4 } as unknown as Policy),
    ).toThrow('Invalid policy "?"');
  });

  it("prices a sticker, including a free post", () => {
    const mountain = withPocket(100, {
      helpers: 1,
      borers: 1,
      engineers: [ada],
    });
    expect(
      sticker(mountain, { kind: "buyTier", id: "helper" }),
    ).toBeGreaterThan(0);
    expect(
      sticker(mountain, { kind: "buyUpgrade", id: "tap" }),
    ).toBeGreaterThan(0);
    expect(
      sticker(
        { ...mountain, upgrades: { tap: 10 } },
        { kind: "buyUpgrade", id: "tap" },
      ),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(
      sticker(mountain, { kind: "buyBoost", id: "sharper" }),
    ).toBeGreaterThan(0);
    expect(sticker(mountain, { kind: "promote" })).toBe(2_000_000);
    expect(sticker(mountain, { kind: "station", index: 0, post: "camp" })).toBe(
      0,
    );
    expect(
      sticker(mountain, { kind: "send", index: 0, tunnel: "old-shaft" }),
    ).toBe(0);
    expect(sticker(mountain, { kind: "recall", index: 0 })).toBe(0);
    expect(
      sticker(mountain, { kind: "fixTrouble", tier: "borer", startedAt: 0 }),
    ).toBe(0);
  });

  it("stops when the caller says the second is enough", () => {
    const run = runPolicy({
      policy: tapOnly,
      seed: 1,
      maxLiveSeconds: 10,
      until: (world) => world.clock >= 2 * 1000,
    });
    expect(run.world.clock).toBe(2 * 1000);
  });

  it("does not pay the gap once the live seconds are used up", () => {
    const brief = plainPolicy({
      id: "brief",
      label: "One minute",
      kind: "extreme",
      sessionsPerDay: 2,
      minutesPerSession: 1,
      tapsPerSecond: 0,
      promote: "never",
      explore: "never",
      tend: "never",
    });
    const run = runPolicy({ policy: brief, seed: 1, maxLiveSeconds: 60 });
    expect(run.world.clock).toBe(60 * 1000);
  });

  it("records a promotion chosen on value, and skips a hire it cannot make", () => {
    const onValue = plainPolicy({
      id: "on-value-promote",
      label: "Promotes on value",
      kind: "extreme",
      sessionsPerDay: 1,
      minutesPerSession: 1,
      tapsPerSecond: 0,
      promote: "on-value",
      explore: "never",
      tend: "never",
      workers: "never",
      spend: { worker: 0, machine: 0, upgrade: 0, boost: 0, promote: 1 },
    });
    const hired = runPolicy({
      policy: onValue,
      seed: 1,
      mountain: withPocket(5_000_000, {
        helpers: 3,
        borers: 1,
        engineers: [ada],
      }),
      maxLiveSeconds: 1,
    });
    expect(hired.promotions.map((promotion) => promotion.name)).toEqual([
      "Nils",
    ]);
    const firstEngineer = runPolicy({
      policy: onValue,
      seed: 1,
      mountain: withPocket(5_000_000, { helpers: 3 }),
      maxLiveSeconds: 1,
    });
    expect(firstEngineer.promotions.map((promotion) => promotion.name)).toEqual(
      ["Ada", "Nils"],
    );
    const stuck = plainPolicy({
      id: "stuck-promote",
      label: "Promote with nobody free",
      kind: "extreme",
      sessionsPerDay: 1,
      minutesPerSession: 1,
      tapsPerSecond: 0,
      promote: "never",
      explore: "never",
      tend: "never",
      decide: () => ({ kind: "promote" }),
    });
    const missed = runPolicy({
      policy: stuck,
      seed: 1,
      mountain: withPocket(5_000_000),
      maxLiveSeconds: 1,
    });
    expect(missed.promotions).toEqual([]);
    expect(missed.world.mountain.engineers ?? []).toEqual([]);
    const boosting = plainPolicy({
      id: "buys-a-boost",
      label: "One boost",
      kind: "extreme",
      sessionsPerDay: 1,
      minutesPerSession: 1,
      tapsPerSecond: 0,
      promote: "never",
      explore: "never",
      tend: "never",
      decide: () => ({ kind: "buyBoost", id: "sharper" }),
    });
    const boosted = runPolicy({
      policy: boosting,
      seed: 1,
      mountain: withPocket(1_000),
      maxLiveSeconds: 1,
    });
    expect(boosted.world.mountain.boosts?.sharper).toBeGreaterThan(0);
  });

  it("sends a scout when the expected find beats the post they leave", () => {
    const curious = plainPolicy({
      id: "curious",
      label: "Sends on value",
      kind: "extreme",
      sessionsPerDay: 2,
      minutesPerSession: 10,
      explore: "on-value",
      promote: "on-value",
      spend: { worker: 1, machine: 1, upgrade: 0, boost: 1, promote: 1 },
    });
    const mountain = withPocket(1_000_000, {
      helpers: 8,
      borers: 1,
      engineers: [ada, { name: "Nils", rank: 0, trips: 0, post: "camp" }],
    });
    const run = runPolicy({
      policy: curious,
      seed: 1,
      mountain,
      maxLiveSeconds: 1,
    });
    expect(run.world.mountain.expeditions?.[0]?.engineer).toBe("Nils");
    curious.decide({ mountain, now: 0, params: curious.params });
    expect(promoteAsap(mountain, curious.params).hired).toEqual([]);
  });
});
