import { describe, expect, it } from "vitest";
import {
  BUY_SECTIONS,
  TIER_WHY,
  buyRowView,
  type BuyIcon,
  type BuyRowView,
} from "./buys-rows";
import { tierLock } from "./crew";
import { crewCounts } from "./crew-count";
import { formatCompact, formatCount } from "./format";
import type { Trouble } from "./hazards";
import { REACHED_LINE } from "./milestones";
import type { RowLamp, RowState } from "./row-view";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates, tendingGain } from "./rates";
import { readyNow, type ReadyPick } from "./ready-now";
import { MOUNTAIN_STONES } from "./scale";
import {
  NEEDS_MORE_WORKERS,
  formatSpeed,
  percent,
  staffingLine,
  stonesPerSecond,
  troubleAria,
} from "./screen-words";
import { lockAria, lockBodyLine, lockRateLine } from "./tier-lock-words";
import {
  TIERS,
  tierById,
  tierCost,
  tierQuote,
  type BuyAmount,
  type TierId,
} from "./tiers";
import { tierSynergy } from "./upgrades";

const NOW = 1_700_000_000_000;

function mountainWith(fields: Partial<Mountain>): Mountain {
  return { ...createMountain(), ...fields };
}

/** Stones mined out so far: this deep. */
function at(depth: number): Pick<Mountain, "remaining"> {
  return { remaining: MOUNTAIN_STONES - depth };
}

/** What the next one of a tier costs on this mountain. */
function priceOf(mountain: Mountain, id: TierId, owned: number): number {
  return tierCost(tierById(id), owned, mountain.stretch ?? 1);
}

/** One row, read as the drawer would: with this frame's Ready pick. */
function row(
  mountain: Mountain,
  tier: TierId,
  {
    trouble,
    pick,
    guided,
    amount = "one",
  }: {
    trouble?: Trouble;
    pick?: ReadyPick;
    guided?: TierId;
    amount?: BuyAmount;
  } = {},
): BuyRowView {
  return buyRowView({
    mountain,
    now: NOW,
    trouble,
    tier,
    pick: pick ?? readyNow(mountain, NOW, trouble),
    guided,
    amount,
  });
}

/** Every string a row would put on screen or read out. */
function words(view: BuyRowView): readonly string[] {
  return [
    view.name,
    view.badge,
    ...view.info,
    view.need,
    view.why,
    ...view.flag,
    view.gain,
    view.price,
    view.verb,
    view.aria,
  ];
}

/** The early save: 18 workers, 6 carts, 12 free. */
const early = mountainWith({ helpers: 18, carts: 6, pocket: 6_854 });

describe("buyRowView", () => {
  it("the four card states", () => {
    const cart = row(early, "cart");
    expect(cart).toMatchObject({
      tier: "cart",
      name: "Mine cart",
      state: "ready",
      lamp: "amber",
      pick: true,
      flag: ["Ready now"],
      price: formatCompact(priceOf(early, "cart", 6)),
      dimTag: false,
      verb: "Buy",
      can: true,
      need: "",
      gain: "+6/s",
      icon: "cart",
      shown: true,
      guided: false,
    });

    const drill = row(early, "drill");
    expect(drill).toMatchObject({
      state: "dear",
      price: formatCompact(priceOf(early, "drill", 0)),
      dimTag: true,
      verb: "1 worker",
      lamp: "off",
      pick: false,
      can: false,
      need: "",
      flag: [],
      icon: "drill",
    });

    const borerTier = tierById("borer");
    const lock = tierLock(early, borerTier);
    if (lock === undefined) {
      throw new Error("the early borer is locked");
    }
    expect(row(early, "borer")).toMatchObject({
      state: "locked",
      price: "Locked",
      dimTag: true,
      info: [lockBodyLine(borerTier, lock), lockRateLine(borerTier, lock)],
      gain: "",
      verb: "",
      lamp: "off",
      can: false,
      icon: "tarp",
      // No drill yet, so the drawer keeps the borer hidden.
      shown: false,
    });

    // A worker the pocket covers hires; the machine past the borer is hidden.
    expect(row(early, "helper")).toMatchObject({
      state: "ready",
      verb: "Hire",
      lamp: "green",
      icon: "worker",
    });
    expect(row(early, "machine").shown).toBe(false);

    // Every row at once: what the drawer paints.
    const faces: Readonly<Record<TierId, readonly [RowState, RowLamp]>> = {
      helper: ["ready", "green"],
      cart: ["ready", "amber"],
      drill: ["dear", "off"],
      borer: ["locked", "off"],
      machine: ["locked", "off"],
      kid: ["locked", "off"],
    };
    for (const tier of TIERS) {
      const view = row(early, tier.id);
      expect([view.state, view.lamp], tier.id).toEqual(faces[tier.id]);
    }
  });

  it("short of workers says the bill, never the free count", () => {
    // 5 workers on a cart and a drill: 3 free, and a borer takes 8.
    const base = mountainWith({
      ...at(10_000_000),
      helpers: 5,
      carts: 1,
      drills: 1,
    });
    const mountain = { ...base, pocket: priceOf(base, "borer", 0) + 1 };
    expect(crewCounts(mountain, NOW).free).toBe(3);

    const borer = row(mountain, "borer");
    expect(borer).toMatchObject({
      state: "short",
      need: "Needs 8 workers",
      verb: "8 workers",
      price: formatCompact(priceOf(mountain, "borer", 0)),
      dimTag: false,
      can: true,
      lamp: "off",
      icon: "tarp",
    });
    expect(borer.aria).toContain(NEEDS_MORE_WORKERS);
    for (const tier of TIERS) {
      for (const line of words(row(mountain, tier.id))) {
        expect(line).not.toMatch(/free/i);
      }
    }
  });

  it("green is ready but not the pick", () => {
    const mountain = { ...early, pocket: priceOf(early, "drill", 0) };
    expect(row(mountain, "drill")).toMatchObject({
      state: "ready",
      lamp: "amber",
      pick: true,
      flag: ["Ready now"],
    });
    expect(row(mountain, "cart")).toMatchObject({
      state: "ready",
      lamp: "green",
      pick: false,
      flag: [],
    });
  });

  it("Saving for flags the row, dark", () => {
    const broke = { ...early, pocket: 0 };
    const pick = readyNow(broke, NOW);
    expect(pick).toMatchObject({ kind: "saving", tier: "cart" });

    const cart = row(broke, "cart", { pick });
    expect(cart.flag).toEqual(["Saving for"]);
    expect(cart.pick).toBe(false);
    expect(cart.lamp).not.toBe("amber");
    expect(cart.state).toBe("dear");

    // A mined-out mountain flags nothing.
    const mined = row(broke, "cart", { pick: { kind: "mined-out" } });
    expect(mined.flag).toEqual([]);
    expect(mined.pick).toBe(false);
  });

  it("the milestone line, then without its lead", () => {
    const carts = mountainWith({ helpers: 12, carts: 12, pocket: 1e9 });
    const [full, bare, ...rest] = row(carts, "cart").info;
    expect(rest).toEqual([]);
    expect(full).toMatch(new RegExp(`^${REACHED_LINE} 12 of 25 · `));
    expect(bare).toBe(full?.slice(REACHED_LINE.length + 1));
    expect(bare).toMatch(/^12 of 25 · /);

    // Before the first mark there is no lead to drop.
    expect(row(early, "cart").info).toEqual([
      "6 of 10 · Ten carts on the rails. Every cart hauls twice as fast.",
    ]);
    // Past the last mark, the reached line alone.
    expect(
      row(mountainWith({ helpers: 120, pocket: 1e9 }), "helper").info,
    ).toEqual([REACHED_LINE]);

    // Kids have no marks: the count and the tier's quiet line.
    const kids = mountainWith({ ...at(70_000_000), kids: 3, pocket: 1e12 });
    expect(row(kids, "kid").info).toEqual([
      `3 owned · ${TIER_WHY.kid}`,
      "3 owned",
    ]);
    expect(TIER_WHY.kid).toBe("Mines, and teaches the others a little.");
  });

  it("trouble", () => {
    const trouble: Trouble = {
      kind: "cave-in",
      tier: "cart",
      startedAt: NOW - 1_000,
    };
    const broke = { ...early, pocket: 0 };
    const cart = row(broke, "cart", { trouble });
    expect(cart).toMatchObject({
      state: "trouble",
      info: ["Cave-in! · Hold to fix"],
      lamp: "red",
      can: true,
      need: "",
      price: "",
      dimTag: false,
      verb: "",
      gain: "",
      aria: troubleAria("cave-in", tierById("cart")),
    });
    // The drill beside it is untroubled.
    expect(row(broke, "drill", { trouble }).state).toBe("dear");
  });

  it("the guided New row hires", () => {
    // 2 workers run 2 carts; 4 stand idle.
    const idle = mountainWith({ helpers: 2, carts: 6 });
    const workerPrice = priceOf(idle, "helper", 2);
    const mountain = { ...idle, pocket: workerPrice };
    expect(6 - effectiveRates(mountain, NOW).running.cart).toBe(4);

    const cart = row(mountain, "cart", { guided: "cart" });
    expect(cart).toMatchObject({
      guided: true,
      state: "ready",
      flag: ["New"],
      price: formatCompact(workerPrice),
      dimTag: false,
      verb: "Hire",
      info: [staffingLine(1, 4)],
      lamp: "green",
      can: true,
      aria: `Mine cart: 4 idle: each needs 1 worker to run. Tap to hire a worker for ${formatCount(workerPrice)} stones.`,
    });

    const short = row({ ...mountain, pocket: workerPrice - 1 }, "cart", {
      guided: "cart",
    });
    expect(short).toMatchObject({
      state: "dear",
      dimTag: true,
      lamp: "off",
      can: false,
      verb: "Hire",
    });

    // Another tier is not the New row, and trouble wins over it.
    expect(row(mountain, "drill", { guided: "cart" }).guided).toBe(false);
    const troubled = row(mountain, "cart", {
      guided: "cart",
      trouble: { kind: "cave-in", tier: "cart", startedAt: NOW },
    });
    expect(troubled).toMatchObject({
      guided: false,
      state: "trouble",
    });
    expect(troubled.flag).not.toContain("New");
  });

  it("the tending mark", () => {
    const crew = mountainWith({
      ...at(10_000_000),
      helpers: 20,
      carts: 2,
      drills: 1,
      borers: 1,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    });
    const mountain = { ...crew, pocket: priceOf(crew, "borer", 1) };
    const gain = tendingGain(mountain, 0, "borer", NOW);
    const borer = row(mountain, "borer");
    expect(borer.pick).toBe(true);
    expect(borer.flag).toEqual([
      `Ready now · Ada tends · +${formatSpeed(gain)}/s`,
      "Ready now",
    ]);
    expect(borer.icon).toBe("borer");
    expect(borer.aria).toMatch(
      new RegExp(`\\. Ada tends them\\. \\${stonesPerSecond(gain)}$`),
    );

    // Not the pick: the tending word alone.
    const broke = row({ ...mountain, pocket: 0 }, "borer");
    expect(broke.flag).toEqual([`Ada tends · +${formatSpeed(gain)}/s`]);
  });

  it("icons", () => {
    const icons: readonly (readonly [Mountain, TierId, BuyIcon])[] = [
      [early, "helper", "worker"],
      // Without the Crown, the kid is locked.
      [createMountain(), "kid", "kid-dim"],
      [mountainWith(at(70_000_000)), "kid", "kid"],
      [early, "cart", "cart"],
      [early, "drill", "drill"],
      [mountainWith(at(10_000_000)), "borer", "tarp"],
      [mountainWith({ borers: 2 }), "borer", "borer"],
      // Past the Hammer, before the Deep Heart: the Great Machine waits.
      [
        mountainWith({ ...at(30_000_000), borers: 1 }),
        "machine",
        "machine-dim",
      ],
      [mountainWith({ ...at(30_000_000), machines: 1 }), "machine", "machine"],
    ];
    for (const [mountain, tier, icon] of icons) {
      expect(row(mountain, tier).icon, tier).toBe(icon);
    }
  });

  it("the aria sentences are today's", () => {
    // The buy sentence, as crew-panel.ts builds it today.
    expect(row(early, "cart").aria).toBe(
      `Buy a mine cart for ${formatCount(priceOf(early, "cart", 6))} stones, mines 6 stones a second. You have 6.`,
    );
    expect(row(early, "helper").aria).toBe(
      `Buy a worker for ${formatCount(priceOf(early, "helper", 18))} stones, mines 1 stone a second. You have 18.`,
    );

    // Idle machines and the workers they need.
    const idle = mountainWith({
      helpers: 3,
      carts: 3,
      drills: 2,
      pocket: 1_000,
    });
    expect(row(idle, "cart").aria).toContain(
      "You have 3, 2 idle: each needs 1 worker to run.",
    );
    expect(row(idle, "drill").aria).toContain(`. ${NEEDS_MORE_WORKERS}.`);

    // Crew synergy names its percent.
    const synergy = mountainWith({
      helpers: 12,
      carts: 6,
      pocket: 6_854,
      upgrades: { cartSyn: 1 },
    });
    const share = tierSynergy(synergy, "cart");
    expect(share).toBeGreaterThan(0);
    expect(row(synergy, "cart").aria).toContain(
      `, ${percent(share)} faster from crew synergy. You have 6.`,
    );

    // A locked machine names why, its pace and who tends it.
    const tended = mountainWith({
      ...at(30_000_000),
      borers: 1,
      helpers: 20,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "machine" }],
    });
    const machine = tierById("machine");
    const lock = tierLock(tended, machine);
    if (lock === undefined) {
      throw new Error("the Great Machine waits for the Deep Heart");
    }
    const speed = effectiveRates(tended, NOW).tierSpeed.machine;
    const gain = tendingGain(tended, 0, "machine", NOW);
    expect(row(tended, "machine").aria).toBe(
      `${lockAria(machine, lock)} Mines ${formatCount(speed)} stones a second each. Ada tends it. ${stonesPerSecond(gain)}`,
    );
  });

  it("display only", () => {
    const mountain = mountainWith({
      ...at(30_000_000),
      helpers: 20,
      carts: 2,
      drills: 1,
      borers: 1,
      pocket: 5_000_000,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      upgrades: { cartSyn: 1 },
    });
    const before = structuredClone(mountain);
    const frozen = Object.freeze({
      ...mountain,
      engineers: Object.freeze(
        (mountain.engineers ?? []).map((one) => Object.freeze({ ...one })),
      ),
      upgrades: Object.freeze({ ...mountain.upgrades }),
    });
    for (const tier of TIERS) {
      row(frozen, tier.id, { guided: "cart" });
    }
    expect(frozen).toEqual(before);
  });
});

describe("BUY_SECTIONS", () => {
  it("crew first, then the machines, every tier once", () => {
    expect(BUY_SECTIONS).toEqual({
      crew: ["helper", "kid"],
      machines: ["cart", "drill", "borer", "machine"],
    });
    expect([...BUY_SECTIONS.crew, ...BUY_SECTIONS.machines].sort()).toEqual(
      TIERS.map((tier) => tier.id).sort(),
    );
  });
});

describe("buyRowView: ×10 and Max (#358)", () => {
  /** What `amount` of a tier costs on this mountain, from the shared quote. */
  const quote = (mountain: Mountain, id: TierId, amount: BuyAmount) =>
    tierQuote(mountain, tierById(id), amount);

  it("×10 shows ten's total, the count on the verb, and ten's output", () => {
    const ten = quote(early, "cart", "ten");
    const mountain = { ...early, pocket: ten.cost };
    const cart = row(mountain, "cart", { amount: "ten" });
    expect(cart).toMatchObject({
      state: "ready",
      price: formatCompact(ten.cost),
      verb: "Buy 10",
      gain: "+60/s",
      can: true,
      dimTag: false,
    });
    expect(cart.aria).toMatch(
      new RegExp(
        `^Buy 10 mine carts for ${formatCount(ten.cost)} stones, each mines `,
      ),
    );
  });

  it("×10 the pocket cannot pay is too dear, and still says ten", () => {
    const ten = quote(early, "cart", "ten");
    const mountain = { ...early, pocket: ten.cost - 1 };
    expect(row(mountain, "cart", { amount: "ten" })).toMatchObject({
      state: "dear",
      price: formatCompact(ten.cost),
      verb: "Buy 10",
      dimTag: true,
      can: false,
    });
  });

  it("Max counts what the pocket holds, and hires on the workers' row", () => {
    const rich = { ...early, pocket: 1_000_000 };
    const max = quote(rich, "helper", "max");
    expect(max.count).toBeGreaterThan(10);
    expect(row(rich, "helper", { amount: "max" })).toMatchObject({
      state: "ready",
      price: formatCompact(max.cost),
      verb: `Hire ${String(max.count)}`,
      gain: `+${String(max.count)}/s`,
    });
  });

  it("Max with nothing affordable shows one's price, dimmed", () => {
    const broke = { ...early, pocket: 0 };
    expect(row(broke, "cart", { amount: "max" })).toMatchObject({
      state: "dear",
      price: formatCompact(priceOf(broke, "cart", 6)),
      verb: "Buy 1",
      can: false,
    });
  });

  it("short of hands for ten says ten's bill, and the verb still counts ten", () => {
    // 18 workers on 15 carts leave 3 free, and ten drills take 10.
    const base = mountainWith({ helpers: 18, carts: 6 });
    const ten = quote(base, "drill", "ten");
    const mountain = { ...base, carts: 15, pocket: ten.cost };
    expect(crewCounts(mountain, NOW).free).toBe(3);
    expect(row(mountain, "drill", { amount: "ten" })).toMatchObject({
      state: "short",
      need: "Needs 10 workers",
      verb: "Buy 10",
      can: true,
    });
  });

  it("a ready pick whose ×10 is too dear is not offered on its row", () => {
    const cart = row(early, "cart", { amount: "ten" });
    expect(cart).toMatchObject({ state: "dear", lamp: "off", pick: false });
    expect(cart.flag).toEqual([]);
    const ten = quote(early, "cart", "ten");
    expect(
      row({ ...early, pocket: ten.cost }, "cart", { amount: "ten" }),
    ).toMatchObject({ lamp: "amber", pick: true, flag: ["Ready now"] });
  });

  it("the guided New row still hires one, whatever the amount", () => {
    const idle = mountainWith({ helpers: 2, carts: 6 });
    const mountain = { ...idle, pocket: 1e9 };
    const one = row(mountain, "cart", { guided: "cart" });
    expect(row(mountain, "cart", { guided: "cart", amount: "max" })).toEqual(
      one,
    );
  });
});
