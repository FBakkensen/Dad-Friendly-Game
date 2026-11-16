import { describe, expect, it } from "vitest";
import { conflictIsReal, mergeSaves, type SaveCopy } from "./save-merge";
import { placeOrder } from "./city";
import {
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  type Granite,
} from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import { NOTHING_CRAFTED } from "./workshop";
import { NO_UPGRADES } from "./upgrades";

function copy(mountain: Mountain, rev: number, lastSeen = 1): SaveCopy {
  return { mountain, lastSeen, rev };
}

describe("mergeSaves", () => {
  it("never adopts a copy with a lower rev", () => {
    const local = copy(minedMountain(40), 5, 20);
    const remote = copy(minedMountain(80), 4, 90);
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.mountain).toBe(local.mountain);
    expect(merged.rev).toBe(5);
    expect(merged.differsFromRemote).toBe(true);
  });

  it("keeps the later run whole", () => {
    const local = copy(
      {
        ...minedMountain(10),
        startedAt: 50,
        upgrades: { ...NO_UPGRADES, cartSyn: 1 },
      },
      2,
    );
    const remote = copy(
      {
        ...minedMountain(90),
        startedAt: 10,
        upgrades: { ...NO_UPGRADES, boots: 1 },
      },
      4,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.mountain).toBe(local.mountain);
    expect(merged.rev).toBe(4);
    expect(merged.mountain.upgrades).toEqual({ ...NO_UPGRADES, cartSyn: 1 });
    expect(merged.mountain.rockDug).toBe(10);
  });

  it("fast-forwards a stones-only gain", () => {
    const local = copy(minedMountain(10), 2);
    const remote = copy(minedMountain(30), 3, 8);
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.mountain).toBe(remote.mountain);
    expect(merged.rev).toBe(3);
    expect(merged.lastSeen).toBe(8);
    expect(merged.differsFromRemote).toBe(false);
  });

  it("fast-forwards when one copy is ahead on everything", () => {
    const local = copy(
      {
        ...minedMountain(10),
        upgrades: { ...NO_UPGRADES, cartSyn: 1 },
        recipes: ["iron-rails"],
      },
      2,
    );
    const remote = copy(
      {
        ...minedMountain(30),
        upgrades: { ...NO_UPGRADES, cartSyn: 1, drillSyn: 1 },
        recipes: ["iron-rails", "sturdy-props"],
        crafted: { ...NOTHING_CRAFTED, "iron-rails": 1 },
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
        finds: ["map"],
        owned: { ...minedMountain(30).owned, cart: 2, helper: 4 },
      },
      3,
      8,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.mountain).toBe(remote.mountain);
    expect(merged.differsFromRemote).toBe(false);
  });

  it("conflicts when each side has something the other lacks", () => {
    const local = copy(
      {
        ...minedMountain(100),
        upgrades: { ...NO_UPGRADES, cartSyn: 1 },
        recipes: ["iron-rails"],
        crafted: { ...NOTHING_CRAFTED, "iron-rails": 1 },
        engineers: [{ name: "Ada", rank: 1, trips: 4, post: "drill" }],
      },
      6,
      10,
    );
    const remote = copy(
      {
        ...minedMountain(40),
        upgrades: { ...NO_UPGRADES, boots: 1 },
        recipes: ["iron-rails", "diamond-bits"],
        crafted: { ...NOTHING_CRAFTED, "sturdy-props": 2 },
        engineers: [
          { name: "Ada", rank: 0, trips: 1, post: "cart" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
        ],
        finds: ["boots"],
      },
      7,
      12,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local).toBe(local);
    expect(merged.remote).toBe(remote);
    expect(merged.local.mountain.rockDug).toBe(100);
    expect(merged.local.mountain.upgrades).toEqual({
      ...NO_UPGRADES,
      cartSyn: 1,
    });
    expect(merged.remote.mountain.upgrades).toEqual({
      ...NO_UPGRADES,
      boots: 1,
    });
    expect(merged.remote.mountain.finds).toEqual(["boots"]);
  });

  it("treats more machines with equal stones as a conflict", () => {
    const local = copy(minedMountain(100), 2, 4);
    const remote = copy(
      {
        ...minedMountain(100),
        owned: { ...minedMountain(100).owned, cart: 6, drill: 4, borer: 1 },
      },
      3,
      4,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local.mountain.owned.cart).toBe(0);
    expect(merged.remote.mountain.owned.cart).toBe(6);
    expect(merged.local.mountain.rockDug).toBe(merged.remote.mountain.rockDug);
  });

  it("does not add the other copy's stones or take the higher upgrade", () => {
    const local = copy(
      { ...minedMountain(100), upgrades: { ...NO_UPGRADES, cartSyn: 1 } },
      6,
    );
    const remote = copy(
      { ...minedMountain(40), upgrades: { ...NO_UPGRADES, boots: 1 } },
      7,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local.mountain).toBe(local.mountain);
    expect(merged.remote.mountain).toBe(remote.mountain);
    expect("mountain" in merged).toBe(false);
  });

  it("keeps a tied pocket as a conflict instead of blending it", () => {
    const local = copy(
      { ...createMountain(), stock: { ...createMountain().stock, stones: 5 } },
      3,
      4,
    );
    const remote = copy(
      { ...createMountain(), stock: { ...createMountain().stock, stones: 9 } },
      3,
      4,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local.mountain.stock.stones).toBe(5);
    expect(merged.remote.mountain.stock.stones).toBe(9);
  });

  it("breaks a tied run on lastSeen without calling it a conflict", () => {
    const local = copy(minedMountain(12), 3, 4);
    const remote = copy(
      {
        ...minedMountain(12),
        stock: { ...minedMountain(12).stock, stones: 4 },
      },
      3,
      9,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.lastSeen).toBe(9);
    expect(merged.mountain.stock.stones).toBe(4);
  });

  it("fast-forwards two identical copies", () => {
    const mountain = minedMountain(12);
    const merged = mergeSaves(copy(mountain, 3, 4), copy(mountain, 3, 4));
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.differsFromRemote).toBe(false);
  });
});

describe("mergeSaves in a fresh mine (#664)", () => {
  const start = createMountain();
  const dug = (rockDug: number, more: Partial<Mountain> = {}): Mountain => ({
    ...start,
    rockDug,
    ...more,
  });

  it("fast-forwards more rock dug", () => {
    const merged = mergeSaves(copy(dug(1_000), 2), copy(dug(1_200), 3));
    expect(merged.kind).toBe("fast-forward");
    expect(merged.kind === "fast-forward" && merged.mountain.rockDug).toBe(
      1_200,
    );
  });

  it("is a conflict when the copy with more rock is behind on hoists, vehicles or buildings", () => {
    const remote = copy(dug(1_200), 3);
    const behind = [
      dug(1_000, { owned: { ...start.owned, hoist: 2 } }),
      dug(1_000, { fleet: { ...start.fleet, horseWagon: 3 } }),
      dug(1_000, { operational: ["lightTower"] }),
    ];
    for (const mountain of behind) {
      expect(mergeSaves(copy(mountain, 2), remote).kind).toBe("conflict");
    }
  });

  it("is a conflict when the copy with more rock is behind on kilns or the stockyard (#666)", () => {
    const remote = copy(dug(1_200), 3);
    const behind = [
      dug(1_000, { makers: { kiln: 1, saw: 0 } }),
      dug(1_000, { stockyard: 1 }),
    ];
    for (const mountain of behind) {
      expect(mergeSaves(copy(mountain, 2), remote).kind).toBe("conflict");
    }
  });

  it("fast-forwards a bigger stockyard with the same rock dug (#666)", () => {
    const bigger = dug(1_000, { stockyard: 1 });
    const merged = mergeSaves(copy(dug(1_000), 2), copy(bigger, 3));
    expect(merged.kind === "fast-forward" && merged.mountain).toBe(bigger);
  });

  const sunk = (machines = NO_LEVEL_MACHINES): Granite => ({
    kind: "sunk",
    machines,
    piles: NO_GRANITE_PILES,
  });

  it("is a conflict when the copy with more rock never sank the shaft (#673)", () => {
    const shaft = dug(1_000, { granite: sunk() });
    const more = dug(1_200);
    expect(mergeSaves(copy(shaft, 2), copy(more, 3)).kind).toBe("conflict");
    expect(mergeSaves(copy(more, 2), copy(shaft, 3)).kind).toBe("conflict");
  });

  it("fast-forwards a sunk shaft with the same rock dug (#673)", () => {
    const shaft = dug(1_000, { granite: sunk() });
    const merged = mergeSaves(copy(dug(1_000), 2), copy(shaft, 3));
    expect(merged.kind === "fast-forward" && merged.mountain).toBe(shaft);
  });

  it("is a conflict when one copy put a machine on the Granite and the other on the Topsoil (#673)", () => {
    const owned = { ...start.owned, borer: 2 };
    const onGranite = dug(1_000, {
      owned,
      granite: sunk({ ...NO_LEVEL_MACHINES, borer: 1 }),
    });
    const onTopsoil = dug(1_200, { owned, granite: sunk() });
    expect(mergeSaves(copy(onGranite, 2), copy(onTopsoil, 3)).kind).toBe(
      "conflict",
    );
    expect(
      mergeSaves(copy({ ...onGranite, rockDug: 1_400 }, 2), copy(onTopsoil, 3))
        .kind,
    ).toBe("conflict");
  });

  it("fast-forwards a machine added on the Granite (#673)", () => {
    const owned = { ...start.owned, borer: 2 };
    const before = dug(1_000, {
      owned: { ...owned, borer: 1 },
      granite: sunk(),
    });
    const after = dug(1_200, {
      owned,
      granite: sunk({ ...NO_LEVEL_MACHINES, borer: 1 }),
    });
    const merged = mergeSaves(copy(before, 2), copy(after, 3));
    expect(merged.kind === "fast-forward" && merged.mountain).toBe(after);
  });

  it("settles copies that differ only in hoists assigned or rock carried as copies that differ only in jobs (#724)", () => {
    const owned = { ...start.owned, helper: 1, hoist: 2 };
    const base = dug(1_000, { owned, granite: sunk() });
    const assigned = {
      ...base,
      cages: { ...base.cages, assigned: { topsoil: 1, granite: 1 } },
    };
    const carried = {
      ...base,
      cages: {
        ...base.cages,
        trips: {
          "hoist:0": {
            level: "granite",
            carried: 300,
            leg: { kind: "top" },
          },
        },
      },
    } satisfies Mountain;
    const jobbed = { ...base, jobs: { ...base.jobs, haulage: 1 } };
    const settled = (one: Mountain, other: Mountain) => [
      mergeSaves(copy(one, 2), copy(other, 3)).kind,
      mergeSaves(copy(other, 2), copy(one, 3)).kind,
    ];
    const byJobs = settled(jobbed, base);
    expect(byJobs).toEqual(["conflict", "conflict"]);
    expect(settled(assigned, base)).toEqual(byJobs);
    expect(settled(carried, base)).toEqual(byJobs);
    // A copy further on rock dug fast-forwards, whatever it assigned or carries.
    for (const behind of [assigned, carried, base]) {
      const further = { ...base, rockDug: 1_200 };
      const merged = mergeSaves(copy(behind, 2), copy(further, 3));
      expect(merged.kind === "fast-forward" && merged.mountain).toBe(further);
      const ahead = { ...behind, rockDug: 1_200 };
      const back = mergeSaves(copy(base, 2), copy(ahead, 3));
      expect(back.kind === "fast-forward" && back.mountain).toBe(ahead);
    }
  });

  it("counts the steps built and what has arrived as progress", () => {
    const ordered = placeOrder(dug(1_000));
    const site =
      ordered.project.kind === "delivering" ? ordered.project.site : undefined;
    if (site === undefined) {
      throw new Error("the order did not start");
    }
    const arrived = {
      ...ordered,
      project: {
        kind: "delivering" as const,
        site: { ...site, arrived: { ...site.arrived, stones: 500 } },
      },
    };
    const stepUp = {
      ...ordered,
      project: {
        kind: "delivering" as const,
        site: { ...site, step: 1 as const },
      },
    };
    const forward = mergeSaves(copy(ordered, 2), copy(arrived, 3));
    expect(forward.kind === "fast-forward" && forward.mountain).toBe(arrived);
    const built = mergeSaves(copy(arrived, 2), copy(stepUp, 3));
    expect(built.kind === "fast-forward" && built.mountain).toBe(stepUp);
    const split = mergeSaves(
      copy(arrived, 2),
      copy({ ...ordered, rockDug: 2_000 }, 3),
    );
    expect(split.kind).toBe("conflict");
  });
});

describe("conflictIsReal", () => {
  const gate = {
    serverRev: 4,
    syncedRev: 2,
    dirty: true,
    remoteDeviceId: "other-device",
    localDeviceId: "this-device",
  };

  it("is real only when the server moved, we are dirty, and it is not our write", () => {
    expect(conflictIsReal(gate)).toBe(true);
    expect(conflictIsReal({ ...gate, serverRev: 2 })).toBe(false);
    expect(conflictIsReal({ ...gate, dirty: false })).toBe(false);
    expect(conflictIsReal({ ...gate, remoteDeviceId: "this-device" })).toBe(
      false,
    );
    expect(conflictIsReal({ ...gate, remoteDeviceId: "" })).toBe(true);
  });
});
