import { describe, expect, it } from "vitest";
import { conflictIsReal, mergeSaves, type SaveCopy } from "./save-merge";
import { createMountain, minedOut, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";

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
      { ...minedMountain(10), startedAt: 50, upgrades: { tap: 3 } },
      2,
    );
    const remote = copy(
      { ...minedMountain(90), startedAt: 10, upgrades: { boots: 1 } },
      4,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.mountain).toBe(local.mountain);
    expect(merged.rev).toBe(4);
    expect(merged.mountain.upgrades).toEqual({ tap: 3 });
    expect(minedOut(merged.mountain)).toBe(10);
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
        upgrades: { tap: 1 },
        recipes: ["iron-rails"],
      },
      2,
    );
    const remote = copy(
      {
        ...minedMountain(30),
        upgrades: { tap: 2 },
        recipes: ["iron-rails", "sturdy-props"],
        crafted: { "iron-rails": 1 },
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
        finds: ["pick"],
        carts: 2,
        helpers: 4,
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
        upgrades: { tap: 2 },
        recipes: ["iron-rails"],
        crafted: { "iron-rails": 1 },
        engineers: [{ name: "Ada", rank: 1, trips: 4, post: "drill" }],
      },
      6,
      10,
    );
    const remote = copy(
      {
        ...minedMountain(40),
        upgrades: { boots: 1 },
        recipes: ["iron-rails", "diamond-bits"],
        crafted: { "sturdy-props": 2 },
        engineers: [
          { name: "Ada", rank: 0, trips: 1, post: "cart" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
        ],
        finds: ["lamp"],
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
    expect(minedOut(merged.local.mountain)).toBe(100);
    expect(merged.local.mountain.upgrades).toEqual({ tap: 2 });
    expect(merged.remote.mountain.upgrades).toEqual({ boots: 1 });
    expect(merged.remote.mountain.finds).toEqual(["lamp"]);
  });

  it("treats more machines with equal stones as a conflict", () => {
    const local = copy(minedMountain(100), 2, 4);
    const remote = copy(
      { ...minedMountain(100), carts: 6, drills: 4, borers: 1 },
      3,
      4,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local.mountain.carts).toBe(0);
    expect(merged.remote.mountain.carts).toBe(6);
    expect(minedOut(merged.local.mountain)).toBe(
      minedOut(merged.remote.mountain),
    );
  });

  it("does not add the other copy's stones or take the higher upgrade", () => {
    const local = copy({ ...minedMountain(100), upgrades: { tap: 2 } }, 6);
    const remote = copy({ ...minedMountain(40), upgrades: { boots: 1 } }, 7);
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
    const local = copy({ ...createMountain(), pocket: 5 }, 3, 4);
    const remote = copy({ ...createMountain(), pocket: 9 }, 3, 4);
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("conflict");
    if (merged.kind !== "conflict") {
      return;
    }
    expect(merged.local.mountain.pocket).toBe(5);
    expect(merged.remote.mountain.pocket).toBe(9);
  });

  it("breaks a tied run on lastSeen without calling it a conflict", () => {
    const local = copy(minedMountain(12), 3, 4);
    const remote = copy({ ...minedMountain(12), pocket: 4 }, 3, 9);
    const merged = mergeSaves(local, remote);
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind !== "fast-forward") {
      return;
    }
    expect(merged.lastSeen).toBe(9);
    expect(merged.mountain.pocket).toBe(4);
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
