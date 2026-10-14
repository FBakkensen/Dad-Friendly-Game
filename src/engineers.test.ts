import { describe, expect, it } from "vitest";
import {
  ENGINEER_NAMES,
  ENGINEER_POSTS,
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  MAX_ENGINEER_TRIPS,
  MAX_ENGINEERS,
  PROMOTE_BASE_COST,
  addTrip,
  grantFirstEngineer,
  parseEngineers,
  promote,
  promoteCost,
  rankOf,
  staffForBuy,
  staffNeeded,
  station,
  TENDED_MACHINE_STAFF,
  tendBestTier,
  tendingTenths,
  type Engineer,
} from "./engineers";
import { accrue, accrueAway, createMountain, parseMountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { tierById } from "./tiers";

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };

const crew = (
  engineers: readonly Engineer[],
): ReturnType<typeof createMountain> => ({
  ...createMountain(),
  pocket: 100_000_000,
  helpers: 10,
  borers: 1,
  engineers,
});

describe("ranks", () => {
  it("stays apprentice until 3 trips, journeyman until 9, then master", () => {
    expect(JOURNEYMAN_TRIPS).toBe(3);
    expect(MASTER_TRIPS).toBe(9);
    expect(rankOf(0)).toBe(0);
    expect(rankOf(2)).toBe(0);
    expect(rankOf(3)).toBe(1);
    expect(rankOf(8)).toBe(1);
    expect(rankOf(9)).toBe(2);
    expect(rankOf(40)).toBe(2);
  });

  it("counts trips and raises rank, and stops at the cap", () => {
    let mountain = crew([ada]);
    for (let trip = 0; trip < JOURNEYMAN_TRIPS; trip += 1) {
      mountain = addTrip(mountain, 0);
    }
    expect(mountain.engineers?.[0]).toMatchObject({ trips: 3, rank: 1 });
    for (let trip = 0; trip < MASTER_TRIPS - JOURNEYMAN_TRIPS; trip += 1) {
      mountain = addTrip(mountain, 0);
    }
    expect(mountain.engineers?.[0]).toMatchObject({ trips: 9, rank: 2 });
    mountain = addTrip(mountain, 0);
    expect(mountain.engineers?.[0]?.trips).toBe(10);
    expect(mountain.engineers?.[0]?.rank).toBe(2);

    const capped = crew([{ ...ada, trips: MAX_ENGINEER_TRIPS, rank: 2 }]);
    expect(addTrip(capped, 0)).toBe(capped);
    const fresh = createMountain();
    expect(addTrip(fresh, 0)).toBe(fresh);
    const one = crew([ada]);
    expect(addTrip(one, 3)).toBe(one);
  });
});

describe("the first engineer", () => {
  it("joins free with the first borer, tending it, and does not take a worker", () => {
    const before = { ...createMountain(), borers: 1, helpers: 8, pocket: 50 };
    const { mountain, joined } = grantFirstEngineer(before);
    expect(joined).toBe(true);
    expect(mountain.helpers).toBe(8);
    expect(mountain.pocket).toBe(50);
    expect(mountain.engineers).toEqual([ada]);
    expect(grantFirstEngineer(mountain)).toEqual({ mountain, joined: false });
  });

  it("does nothing until a borer is owned", () => {
    const fresh = createMountain();
    expect(grantFirstEngineer(fresh)).toEqual({
      mountain: fresh,
      joined: false,
    });
  });
});

describe("promote", () => {
  it("spends a doubling stone price and one worker, and names the next hand", () => {
    const hired = promote(crew([ada]));
    expect(hired.engineers?.[1]).toEqual({
      name: "Nils",
      rank: 0,
      trips: 0,
      post: "camp",
    });
    expect(hired.helpers).toBe(9);
    expect(hired.pocket).toBe(100_000_000 - PROMOTE_BASE_COST * 2);
    expect(PROMOTE_BASE_COST).toBe(1_000_000);
    expect(promoteCost(crew([]))).toBe(1_000_000);
    expect(promoteCost(crew([ada]))).toBe(2_000_000);
    expect(promoteCost(hired)).toBe(4_000_000);

    let mountain: ReturnType<typeof createMountain> = {
      ...createMountain(),
      pocket: PROMOTE_BASE_COST,
      helpers: 1,
    };
    expect(promoteCost(mountain)).toBe(PROMOTE_BASE_COST);
    mountain = promote(mountain);
    expect(mountain.engineers?.[0]?.name).toBe("Ada");
    expect(mountain.helpers).toBe(0);
    expect(mountain.pocket).toBe(0);
  });

  it("refuses a full crew, an empty pool, or a short pocket", () => {
    const full = crew(
      ENGINEER_NAMES.map((name) => ({
        name,
        rank: 0 as const,
        trips: 0,
        post: "camp" as const,
      })),
    );
    expect(promote(full)).toBe(full);
    const broke = { ...crew([ada]), pocket: PROMOTE_BASE_COST * 2 - 1 };
    expect(promote(broke)).toBe(broke);
    const noWorkers = {
      ...createMountain(),
      pocket: PROMOTE_BASE_COST,
      helpers: 0,
    };
    expect(promote(noWorkers)).toBe(noWorkers);
  });
});

describe("station", () => {
  it("moves an engineer, and leaves a bad index or the same post alone", () => {
    const mountain = crew([ada]);
    expect(station(mountain, 0, "drill").engineers?.[0]?.post).toBe("drill");
    expect(station(mountain, 0, "borer")).toBe(mountain);
    expect(station(mountain, 2, "camp")).toBe(mountain);
    const fresh = createMountain();
    expect(station(fresh, 0, "camp")).toBe(fresh);
  });
});

describe("Great Machine crew", () => {
  const machine = tierById("machine");

  it("needs 5 workers while tended, and the full 25 otherwise", () => {
    const tended = {
      ...createMountain(),
      helpers: TENDED_MACHINE_STAFF,
      machines: 1,
      engineers: [ada],
    };
    const posted = station(tended, 0, "machine");
    expect(staffNeeded(posted, machine)).toBe(5);
    expect(effectiveRates(posted).running.machine).toBe(1);
    expect(staffNeeded(tended, machine)).toBe(25);
    expect(effectiveRates(tended).running.machine).toBe(0);
    expect(staffForBuy(tended, machine)).toBe(5);
    expect(staffForBuy(createMountain(), machine)).toBe(25);
    expect(
      staffForBuy(
        {
          ...createMountain(),
          engineers: [{ ...ada, post: "tunnel" }],
        },
        machine,
      ),
    ).toBe(25);
    expect(staffForBuy(posted, tierById("cart"))).toBe(1);
  });

  it("posts the pacing dad on the Great Machine once he owns one, else the borers", () => {
    const fresh = createMountain();
    expect(tendBestTier(fresh)).toBe(fresh);
    const onBorer = { ...fresh, borers: 1, engineers: [ada] };
    expect(tendBestTier(onBorer)).toBe(onBorer);
    const atCamp = station(onBorer, 0, "camp");
    expect(tendBestTier(atCamp).engineers?.[0]?.post).toBe("borer");
    const withMachine = { ...onBorer, machines: 1 };
    expect(tendBestTier(withMachine).engineers?.[0]?.post).toBe("machine");
    const already = tendBestTier(withMachine);
    expect(tendBestTier(already)).toBe(already);
    const waiting = { ...fresh, engineers: [ada] };
    expect(tendBestTier(waiting)).toBe(waiting);
    const away = {
      ...withMachine,
      engineers: [{ ...ada, post: "tunnel" as const }],
    };
    expect(tendBestTier(away)).toBe(away);
  });
});

describe("tending", () => {
  const base = {
    ...minedMountain(0),
    helpers: 8,
    borers: 1,
    drills: 1,
    remaining: 100_000_000,
    pocket: 0,
  };

  it("speeds the posted tier by rank, live and away, and not a tunnel", () => {
    const plain = effectiveRates(base);
    const apprentice = effectiveRates({ ...base, engineers: [ada] });
    expect(apprentice.tierSpeed.borer).toBeCloseTo(
      plain.tierSpeed.borer * 1.162,
      8,
    );
    expect(apprentice.tierSpeed.drill).toBe(plain.tierSpeed.drill);
    expect(apprentice.crewPerSecond).toBeGreaterThan(plain.crewPerSecond);

    const journeyman = effectiveRates({
      ...base,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "drill" }],
    });
    expect(journeyman.tierSpeed.drill).toBe((plain.tierSpeed.drill * 12) / 10);
    expect(journeyman.tierSpeed.borer).toBe(plain.tierSpeed.borer);

    const master = effectiveRates({
      ...base,
      engineers: [{ name: "Ada", rank: 2, trips: 9, post: "borer" }],
    });
    expect(master.tierSpeed.borer).toBeCloseTo(
      plain.tierSpeed.borer * 1.486,
      8,
    );

    const awayPlain = accrueAway({ mountain: base, lastSeen: 0, now: 10_000 });
    const awayTended = accrueAway({
      mountain: { ...base, engineers: [ada] },
      lastSeen: 0,
      now: 10_000,
    });
    expect(awayTended.mined).toBeGreaterThan(awayPlain.mined);
    expect(
      accrue({ mountain: { ...base, engineers: [ada] }, from: 0, to: 1_000 })
        .mined,
    ).toBe(apprentice.crewPerSecond);

    const tunnel = effectiveRates({
      ...base,
      engineers: [{ ...ada, post: "tunnel" }],
    });
    expect(tunnel.crewPerSecond).toBe(plain.crewPerSecond);
    expect(tendingTenths(base, "borer")).toBe(0);
    expect(tendingTenths({ ...base, engineers: [ada] }, "helper")).toBe(0);
  });

  it("lets the best engineer at a tier set the pace", () => {
    const both = {
      ...base,
      engineers: [
        ada,
        {
          name: "Nils" as const,
          rank: 2 as const,
          trips: 9,
          post: "borer" as const,
        },
      ],
    };
    expect(tendingTenths(both, "borer")).toBe(3);
    expect(effectiveRates(both).tierSpeed.borer).toBeCloseTo(595 * 1.486, 8);
  });
});

describe("parseEngineers", () => {
  const base = {
    remaining: 10,
    pocket: 0,
    helpers: 0,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
    kids: 0,
  };

  it("accepts a closed crew and omits an empty list", () => {
    const engineers: Engineer[] = ENGINEER_NAMES.map((name, index) => ({
      name,
      rank: index === 0 ? 0 : index === 1 ? 1 : 2,
      trips: index === 0 ? 0 : index === 1 ? 3 : 9,
      post: ENGINEER_POSTS[index] ?? "camp",
    }));
    expect(parseEngineers(engineers)).toEqual(engineers);
    expect(parseMountain({ ...base, engineers })?.engineers).toEqual(engineers);
    expect(parseEngineers([])).toEqual([]);
    expect(
      parseMountain({ ...base, engineers: [] })?.engineers,
    ).toBeUndefined();
    expect(parseMountain(base)?.engineers).toBeUndefined();
  });

  it("rejects a bad shape, a stranger, a duplicate, and a rank that lies about trips", () => {
    expect(parseEngineers("Ada")).toBeUndefined();
    expect(
      parseEngineers(new Array(MAX_ENGINEERS + 1).fill(ada)),
    ).toBeUndefined();
    expect(parseMountain({ ...base, engineers: [ada, ada] })).toBeUndefined();
    for (const engineers of [
      [{ ...ada, name: "Bob" }],
      [{ ...ada, post: "helper" }],
      [{ ...ada, post: "moon" }],
      [{ ...ada, rank: 1 }],
      [{ ...ada, trips: 3, rank: 0 }],
      [{ ...ada, trips: -1 }],
      [{ ...ada, trips: MAX_ENGINEER_TRIPS + 1, rank: 2 }],
      [{ ...ada, rank: 1.5, trips: 3 }],
      [{ ...ada, nickname: "Ace" }],
      [null],
      [{ name: "Ada", rank: 0, trips: 0 }],
    ]) {
      expect(parseEngineers(engineers)).toBeUndefined();
      expect(parseMountain({ ...base, engineers })).toBeUndefined();
    }
  });
});

describe("Flemming's save (63 workers, 16 carts, 9 drills, 1 borer)", () => {
  it("keeps every machine running once Ada steps up, and needs no worker for her", () => {
    const save = {
      ...createMountain(),
      helpers: 63,
      carts: 16,
      drills: 9,
      borers: 1,
    };
    const before = effectiveRates(save);
    const { mountain, joined } = grantFirstEngineer(save);
    const after = effectiveRates(mountain);
    expect(joined).toBe(true);
    expect(mountain.helpers).toBe(63);
    expect(after.running).toMatchObject({ cart: 16, drill: 9, borer: 1 });
    expect(after.crewPerSecond).toBeGreaterThan(before.crewPerSecond);
    expect(grantFirstEngineer(mountain).joined).toBe(false);
  });
});
