import { describe, expect, it } from "vitest";
import { send } from "../expeditions";
import { accrue, accrueAway, createMountain, type Mountain } from "../mountain";
import { createWorld, step, type World } from "./world";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

function withBorer(): Mountain {
  return {
    ...createMountain(),
    owned: { ...createMountain().owned, helper: 8, borer: 1 },
    engineers: [ada],
  };
}

/** The same buys, the same sends, the same steps. Only the seed may differ. */
function play(seed: number): World {
  let world = createWorld(seed, withBorer());
  world = {
    ...world,
    mountain: send(world.mountain, 0, "side-seam", world.clock),
  };
  world = step(world, 30_000, "live", { playerFixMs: 3_000 });
  world = step(world, 10 * 60_000, "away");
  world = step(world, 1_000, "live");
  return world;
}

describe("world step", () => {
  it("starts on the seed, at the beginning of the clock", () => {
    const world = createWorld(1);
    expect(world.clock).toBe(0);
    expect(world.hazards).toEqual({ phase: "idle", seed: 1 });
    expect(world.mountain).toEqual(createMountain());
  });

  it("gives the same world for the same seed", () => {
    expect(play(1)).toEqual(play(1));
    const again = play(1);
    expect(again.mountain.engineers[0]).toMatchObject({
      post: "borer",
      trips: 1,
    });
    expect(again.mountain.expeditions).toEqual([]);
  });

  it("starts no trouble in live play, even with a borer: trouble is out of the game (16 Nov 2026)", () => {
    let world = createWorld(1, withBorer());
    for (let second = 0; second < 400; second += 1) {
      world = step(world, 1_000, "live");
    }
    expect(world.hazards).toEqual({ phase: "idle", seed: 1 });
  });

  it("leaves the world in place when no time passes", () => {
    const world = createWorld(1, withBorer());
    expect(step(world, 0, "live")).toBe(world);
    expect(step(world, -5, "away")).toBe(world);
    expect(step(world, Number.NaN, "live")).toBe(world);
  });

  it("pays a live second as the mountain accrues it, and pays time away as a closed game", () => {
    const world = createWorld(1, withBorer());
    const accrued = accrue({ mountain: world.mountain, from: 0, to: 1_000 });
    const next = step(world, 1_000, "live");
    expect(next.clock).toBe(1_000);
    expect(next.mountain.stock.stones).toBe(accrued.mountain.stock.stones);
    const left = step(world, 1_000, "away");
    const paid = accrueAway({
      mountain: world.mountain,
      lastSeen: 0,
      now: 1_000,
    });
    expect(left.mountain).toEqual(paid.mountain);
    expect(left.clock).toBe(1_000);
  });

  it("brings a party home when the clock reaches the return", () => {
    const sent = send(withBorer(), 0, "side-seam", 0);
    const live = step(createWorld(1, sent), 10 * 60_000, "live");
    expect(live.mountain.expeditions).toEqual([]);
    expect(live.mountain.engineers[0]).toMatchObject({
      post: "borer",
      trips: 1,
    });

    const away = step(createWorld(4, sent), 10 * 60_000, "away");
    const paid = accrueAway({
      mountain: sent,
      lastSeen: 0,
      now: 10 * 60_000,
    });
    expect(away.mountain).toEqual(paid.mountain);
    expect(away.mountain.engineers[0]?.post).toBe("borer");
    expect(away.hazards.phase).toBe("waiting");
  });
});
