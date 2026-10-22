import { describe, expect, it } from "vitest";
import { mergeSaves, type SaveCopy } from "./save-merge";
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
    expect(merged.mountain).toBe(local.mountain);
    expect(merged.rev).toBe(5);
    expect(merged.conflict).toBe(false);
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
    expect(merged.mountain).toBe(local.mountain);
    expect(merged.rev).toBe(4);
    expect(merged.conflict).toBe(false);
    expect(merged.mountain.upgrades).toEqual({ tap: 3 });
  });

  it("takes the copy that dominates monotonic progress", () => {
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
      },
      3,
      8,
    );
    const merged = mergeSaves(local, remote);
    expect(merged.conflict).toBe(false);
    expect(merged.mountain).toBe(remote.mountain);
    expect(merged.rev).toBe(3);
    expect(merged.lastSeen).toBe(8);
    expect(merged.differsFromRemote).toBe(false);
  });

  it("unions crossed progress, keeps the fuller side, and flags the conflict", () => {
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
    expect(merged.conflict).toBe(true);
    expect(merged.rev).toBe(7);
    expect(minedOut(merged.mountain)).toBe(100);
    expect(merged.mountain.upgrades).toEqual({ tap: 2, boots: 1 });
    expect(merged.mountain.recipes).toEqual(["iron-rails", "diamond-bits"]);
    expect(merged.mountain.crafted).toEqual({
      "iron-rails": 1,
      "sturdy-props": 2,
    });
    expect(merged.mountain.engineers).toEqual([
      { name: "Ada", rank: 1, trips: 4, post: "drill" },
      { name: "Nils", rank: 0, trips: 0, post: "camp" },
    ]);
    expect(merged.mountain.finds).toEqual(["lamp"]);
    expect(merged.differsFromRemote).toBe(true);
    expect(merged.lastSeen).toBe(10);
  });

  it("keeps a tied mountain on the local side and logs the conflict", () => {
    const local = copy({ ...createMountain(), pocket: 5 }, 3, 4);
    const remote = copy({ ...createMountain(), pocket: 9 }, 3, 4);
    const merged = mergeSaves(local, remote);
    expect(merged.conflict).toBe(true);
    expect(merged.mountain.pocket).toBe(5);
    expect(merged.rev).toBe(3);
  });

  it("breaks a monotonic tie on lastSeen without calling it a conflict", () => {
    const local = copy(minedMountain(12), 3, 4);
    const remote = copy({ ...minedMountain(12), pocket: 4 }, 3, 9);
    const merged = mergeSaves(local, remote);
    expect(merged.conflict).toBe(false);
    expect(merged.lastSeen).toBe(9);
    expect(merged.mountain.pocket).toBe(4);
  });
});
