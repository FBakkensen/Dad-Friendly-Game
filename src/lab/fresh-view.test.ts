import { describe, expect, it } from "vitest";
import { SITE_HOLDS } from "../building-site";
import { holdOrder, placeOrder } from "../city";
import { withFactors } from "../economy/factors";
import { createMountain, type Mountain } from "../mountain";
import { PART_TWO_OFF } from "../part-switch";
import { EMPTY_STOCK } from "../stock";
import { stockpileRoom } from "../stockyard";
import { NO_JOBS, type Jobs } from "../workforce";
import { hirePrice } from "./fresh-kit";
import { narrowAt } from "./line-view";
import {
  cageGap,
  cheapestBuy,
  freshMean,
  freshShare,
  freshView,
  ordered,
  shareTaps,
  workerTaps,
  type FreshView,
} from "./fresh-view";
import deadGood from "./measures/deadGood";
import idleMachines from "./measures/idleMachines";
import idleWorkers from "./measures/idleWorkers";
import siteFull from "./measures/siteFull";
import starved from "./measures/starved";
import transportLimit from "./measures/transportLimit";
import workerMoves from "./measures/workerMoves";
import cageGapMeasure from "./measures/cageGap";
import hoistWorkers from "./measures/hoistWorkers";
import shareMoves from "./measures/shareMoves";
import researchLabDays from "./measures/researchLabDays";
import sliceDays from "./measures/sliceDays";
import { levels, partThree } from "../part-three.harness";
import type { DecisionSample } from "./measure";
import type { SittingEvent } from "./sittings";

/** What the lab reads off a fresh mine (#655). */
const fresh = <T>(body: () => T): T => withFactors({}, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

function mine(
  jobs: Partial<Jobs>,
  { free = 0, pocket = 0, wagons = 1, cart = 0 } = {},
): Mountain {
  const start = createMountain();
  const placed = { ...NO_JOBS, ...jobs };
  const onJobs = Object.values(placed).reduce((sum, n) => sum + n, 0);
  return {
    ...start,
    owned: { ...start.owned, helper: onJobs + free, cart },
    jobs: placed,
    stock: { ...start.stock, stones: pocket },
    fleet: { ...start.fleet, horseWagon: wagons },
  };
}

const START = { drilling: 6, haulage: 6, hoisting: 6, driving: 1, building: 2 };

function view(over: Partial<FreshView> = {}): FreshView {
  return {
    limit: "good",
    siteFull: false,
    starved: false,
    idleWorkers: 0,
    idleMachines: Number.NaN,
    yardOpen: false,
    deadGood: false,
    partThree: false,
    ...over,
  };
}

/** Samples with only what the fresh measures read. */
function samples(
  ...views: (FreshView | undefined)[]
): readonly DecisionSample[] {
  return views.map(
    (fresh) =>
      ({ ...(fresh === undefined ? {} : { fresh }) }) as DecisionSample,
  );
}

describe("the view of a fresh mine (#655)", () => {
  it("names the order's limit, and why nothing is delivered", () => {
    fresh(() => {
      const start = mine(START);
      expect(freshView(start).limit).toBe("unordered");
      expect(freshView(holdOrder(placeOrder(start))).limit).toBe("onHold");
      // One wagon (9) against two builders (16): transport.
      expect(freshView(placeOrder(start)).limit).toBe("transport");
      // One builder (8) against one wagon (9): the builders.
      expect(freshView(placeOrder(mine({ ...START, building: 1 }))).limit).toBe(
        "builders",
      );
    });
  });

  it("sees the site full", () => {
    fresh(() => {
      const ordered = placeOrder(mine(START));
      if (ordered.project.kind !== "delivering") {
        throw new Error("delivering");
      }
      const full: Mountain = {
        ...ordered,
        project: {
          kind: "delivering",
          site: {
            ...ordered.project.site,
            arrived: { ...EMPTY_STOCK, stones: SITE_HOLDS },
            onSite: { ...EMPTY_STOCK, stones: SITE_HOLDS },
          },
        },
      };
      expect(freshView(full).siteFull).toBe(true);
      expect(freshView(ordered).siteFull).toBe(false);
    });
  });

  it("is starved when the order drains the mine and the pocket buys nothing", () => {
    fresh(() => {
      const thin = {
        drilling: 4,
        haulage: 4,
        hoisting: 4,
        driving: 1,
        building: 2,
      };
      expect(freshView(placeOrder(mine(thin))).starved).toBe(true);
      const rich = placeOrder(mine(thin, { pocket: 100_000 }));
      expect(freshView(rich).starved).toBe(false);
      expect(freshView(placeOrder(mine(START))).starved).toBe(false);
    });
  });

  it("sees a full stockpile that no order takes as dead, once the stockyard is open (#667)", () => {
    partTwo(() => {
      const lit = { ...mine(START), operational: ["lightTower"] as const };
      const room = stockpileRoom(lit, "stones");
      const full: Mountain = {
        ...lit,
        stock: { ...lit.stock, stones: room },
      };
      expect(freshView(lit)).toMatchObject({ yardOpen: true, deadGood: false });
      expect(freshView(full).deadGood).toBe(true);
      // The Warehouse's foundation takes stone: not dead while it delivers.
      expect(freshView(placeOrder(full)).deadGood).toBe(false);
      expect(freshView(holdOrder(placeOrder(full))).deadGood).toBe(true);
    });
    fresh(() => {
      expect(freshView(mine(START))).toMatchObject({
        yardOpen: false,
        deadGood: false,
      });
    });
  });

  it("leaves a closed truck out of the cheapest buy (#673)", () => {
    partTwo(() => {
      const start = mine(START, { wagons: 40 });
      const lit = {
        ...start,
        operational: ["lightTower", "warehouse"] as const,
      };
      expect(cheapestBuy(lit)).not.toBe(150_000);
      expect(cheapestBuy(lit)).toBeLessThanOrEqual(hirePrice(lit));
    });
  });

  it("prices the cheapest buy at a hire or less", () => {
    fresh(() => {
      const start = mine(START);
      expect(cheapestBuy(start)).toBeLessThanOrEqual(hirePrice(start));
      expect(cheapestBuy(start)).toBeGreaterThan(0);
    });
  });

  it("counts free workers, drivers with no order, and builders with an idle site as idle", () => {
    fresh(() => {
      // 21 on jobs and 1 free, nothing ordered: the driver, two builders
      // and the free one have nothing to do.
      const idle = mine(START, { free: 1 });
      expect(freshView(idle).idleWorkers).toBeCloseTo(4 / 22, 9);
      // Delivering, all of them work.
      expect(freshView(placeOrder(mine(START))).idleWorkers).toBe(0);
      // A driver with no wagon is idle while it delivers.
      const noWagon = placeOrder(mine({ ...START, driving: 2 }));
      expect(freshView(noWagon).idleWorkers).toBeCloseTo(1 / 22, 9);
    });
  });

  it("counts a stage's workers with tools the line does not need as idle", () => {
    fresh(() => {
      // Haulage has 8 where 6 move what the line moves.
      const wide = placeOrder(mine({ ...START, haulage: 8 }));
      expect(freshView(wide).idleWorkers).toBeCloseTo(2 / 23, 9);
    });
  });

  it("reads no machine share without machines, and none idle with a cart", () => {
    fresh(() => {
      expect(freshView(mine(START)).idleMachines).toBeNaN();
      // A cart (60) runs over three tools (18).
      const cart = mine({ ...START, haulage: 9 }, { cart: 1 });
      expect(freshView(cart).idleMachines).toBe(0);
    });
  });
});

describe("worker taps (#655)", () => {
  it("counts hires and moves with the amount key on ×10, then ×1", () => {
    const before = { helper: 21, jobs: { ...NO_JOBS, drilling: 6 } };
    expect(workerTaps(before, before)).toBe(0);
    // 12 hires: one ×10 tap and two ×1. 12 placed on drilling: the same.
    expect(
      workerTaps(before, {
        helper: 33,
        jobs: { ...NO_JOBS, drilling: 18 },
      }),
    ).toBe(6);
    // One freed from drilling and placed on driving: two taps. Firing is no tap.
    expect(
      workerTaps(before, {
        helper: 20,
        jobs: { ...NO_JOBS, drilling: 5, driving: 1 },
      }),
    ).toBe(2);
  });
});

describe("the fresh measures (#655)", () => {
  it("share the samples where an order stands", () => {
    const run = samples(
      view({ limit: "unordered" }),
      view({ limit: "transport", siteFull: true }),
      view({ limit: "onHold" }),
      view({ limit: "builders" }),
      undefined,
    );
    expect(transportLimit.aggregate(run)).toBeCloseTo(1 / 3, 9);
    expect(siteFull.aggregate(run)).toBeCloseTo(1 / 3, 9);
    expect(transportLimit.aggregate(samples(undefined))).toBeNaN();
    expect(ordered(view({ limit: "unordered" }))).toBe(false);
    expect(ordered(view({ limit: "good" }))).toBe(true);
  });

  it("shares a dead good over the samples with the stockyard open (#667)", () => {
    expect(
      deadGood.aggregate(
        samples(
          view(),
          view({ yardOpen: true }),
          view({ yardOpen: true, deadGood: true }),
          undefined,
        ),
      ),
    ).toBe(0.5);
    expect(deadGood.aggregate(samples(view()))).toBeNaN();
  });

  it("shares starved over every fresh sample", () => {
    const run = samples(
      view({ limit: "unordered" }),
      view({ starved: true }),
      undefined,
    );
    expect(starved.aggregate(run)).toBe(0.5);
    expect(
      freshShare(
        [],
        () => true,
        () => true,
      ),
    ).toBeNaN();
  });

  it("takes the mean of the idle shares, leaving out samples with none", () => {
    const run = samples(
      view({ idleWorkers: 0.2, idleMachines: 0 }),
      view({ idleWorkers: 0.4 }),
      undefined,
    );
    expect(idleWorkers.aggregate(run)).toBeCloseTo(0.3, 9);
    expect(idleMachines.aggregate(run)).toBe(0);
    expect(freshMean([], () => 1)).toBeNaN();
  });

  it("takes the mean worker taps a sitting, NaN outside a fresh mine", () => {
    const sitting = (at: number, taps?: number): SittingEvent => ({
      sitting: at,
      openedAtMs: at,
      buys: 0,
      taps: 0,
      open: { kind: "nothing" },
      ...(taps === undefined ? {} : { workerTaps: taps }),
    });
    const run = [
      { sittings: [sitting(0, 4), sitting(1, 10)] },
    ] as unknown as readonly DecisionSample[];
    expect(workerMoves.aggregate(run)).toBe(7);
    const none = [
      { sittings: [sitting(0)] },
    ] as unknown as readonly DecisionSample[];
    expect(workerMoves.aggregate(none)).toBeNaN();
  });
});

describe("the part 3 measures (#675)", () => {
  const sitting = (
    at: number,
    over: Partial<SittingEvent> = {},
  ): SittingEvent => ({
    sitting: at,
    openedAtMs: at,
    buys: 0,
    taps: 0,
    open: { kind: "nothing" },
    ...over,
  });
  const run = (...events: SittingEvent[]) =>
    [{ sittings: events }] as unknown as readonly DecisionSample[];

  it("reads the share on hoisting with the Granite open, and part 3", () => {
    const mine = levels({ topsoil: 3, granite: 2, hoisting: 2 });
    const viewed = partThree(() => freshView(mine));
    // 6 on the Topsoil, 4 on the Granite, 2 on hoisting.
    expect(viewed.hoistShare).toBeCloseTo(2 / 12, 9);
    expect(viewed.partThree).toBe(true);
    const shut = partThree(() =>
      freshView(levels({ topsoil: 3, sunk: false })),
    );
    expect(shut.hoistShare).toBeUndefined();
    expect(
      hoistWorkers.aggregate(
        samples(view({ hoistShare: 0.1 }), view({ hoistShare: 0.3 }), view()),
      ),
    ).toBeCloseTo(0.2, 9);
    expect(hoistWorkers.aggregate(samples(view()))).toBeNaN();
  });

  it("weighs idle workers on both levels, each against its own line (#675)", () => {
    partThree(() => {
      // Each level drills 9, hauls 18 and has 6 lifted a second: one
      // driller and two hauliers spare on each, and none on the winch.
      const mine = levels({ topsoil: 3, granite: 3, hoisting: 2 });
      expect(freshView(mine).idleWorkers).toBeCloseTo(6 / 14, 9);
      // Four more on the Granite's haulage are four more spare.
      const wide = {
        ...mine,
        owned: { ...mine.owned, helper: mine.owned.helper + 4 },
        jobs: { ...mine.jobs, graniteHaulage: mine.jobs.graniteHaulage + 4 },
      };
      expect(freshView(wide).idleWorkers).toBeCloseTo(10 / 18, 9);
    });
  });

  it("reads the narrow stage of the level that moves less, hoisting by the cages (#675)", () => {
    partThree(() => {
      const winch = levels({ topsoil: 3, granite: 3, hoisting: 2 });
      expect(narrowAt(winch, 0)).toBe("lift");
      const hoists = levels({ topsoil: 3, granite: 3, hoisting: 2, hoists: 2 });
      expect(narrowAt(hoists, 0)).toBe("face");
      // The Topsoil short on haulage and the Granite on drilling: the
      // level that moves less names its own narrow stage.
      const crossed = {
        ...hoists,
        jobs: { ...hoists.jobs, haulage: 1, graniteDrilling: 2 },
      };
      expect(narrowAt(crossed, 0)).toBe("haul");
    });
  });

  it("reads the slice's days only from a run that plays part 3", () => {
    const finished = (partThree: boolean) =>
      [
        { fresh: view({ partThree }), foundryDay: 16, finishDay: 20 },
      ] as unknown as readonly DecisionSample[];
    expect(sliceDays.aggregate(finished(true))).toBe(16);
    expect(sliceDays.aggregate(finished(false))).toBeNaN();
    expect(
      sliceDays.aggregate([
        { fresh: view({ partThree: true }), finishDay: 20 },
      ] as unknown as readonly DecisionSample[]),
    ).toBe(Infinity);
    expect(sliceDays.aggregate(samples(view({ partThree: true })))).toBe(
      Infinity,
    );
  });

  it("measures The Foundry explicitly in sliceDays and reports The Research Lab separately", () => {
    const partTwoRun = [
      {
        fresh: view({ partThree: true }),
        foundryDay: 15,
        researchLabDay: 20,
        finishDay: 20,
      },
    ] as unknown as readonly DecisionSample[];
    expect(sliceDays.aggregate(partTwoRun)).toBe(15);
    expect(researchLabDays.aggregate(partTwoRun)).toBe(20);
    expect(
      researchLabDays.aggregate(samples(view({ partThree: true }))),
    ).toBeNaN();
  });

  it("counts the taps that set the share: the Granite's jobs and the hoists on each level", () => {
    const before = partThree(() =>
      levels({ topsoil: 4, granite: 1, hoists: 3 }),
    );
    expect(partThree(() => shareTaps(before, before))).toBe(0);
    const after = partThree(() =>
      levels({
        topsoil: 4,
        granite: 12,
        hoists: 3,
        assigned: { topsoil: 1, granite: 2 },
      }),
    );
    // 11 more on each Granite stage: two taps each. One hoist and two hoists: three taps.
    expect(partThree(() => shareTaps(before, after))).toBe(7);
    const shut = levels({ topsoil: 4, sunk: false });
    expect(partThree(() => shareTaps(shut, shut))).toBeUndefined();
    expect(
      shareMoves.aggregate(
        run(
          sitting(0, { shareTaps: 2 }),
          sitting(1, { shareTaps: 4 }),
          sitting(2),
        ),
      ),
    ).toBe(3);
    expect(shareMoves.aggregate(run(sitting(0)))).toBeNaN();
  });

  it("plays ten minutes of the cages against the rates, and keeps the largest gap", () => {
    const mine = partThree(() =>
      levels({ topsoil: 8, granite: 8, hoisting: 3, hoists: 2 }),
    );
    const gap = partThree(() => cageGap(mine));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(0.05);
    expect(cageGap(createMountain())).toBeUndefined();
    expect(
      cageGapMeasure.aggregate(
        run(
          sitting(0, { cageGap: 0.01 }),
          sitting(1, { cageGap: 0.03 }),
          sitting(2),
        ),
      ),
    ).toBe(0.03);
    expect(cageGapMeasure.aggregate(run(sitting(0)))).toBeNaN();
  });
});
