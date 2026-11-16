import { describe, expect, it } from "vitest";
import { send } from "./expeditions";
import { closeHazards, freshHazards } from "./hazards";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { levels, partThreeAsBuilt as partThree } from "./part-three.harness";
import { LIVE_GAP_MS, advance, timeInput } from "./session-time";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

function crew(): Mountain {
  return {
    ...createMountain(),
    engineers: [ada],
    owned: { ...createMountain().owned, helper: 8, borer: 1 },
  };
}

describe("timeInput", () => {
  it("is live for a gap up to ten seconds, away past it, and clock-back when time ran backwards", () => {
    expect(timeInput(undefined, 5_000)).toEqual({
      kind: "live",
      from: 5_000,
      to: 5_000,
    });
    expect(timeInput(1_000, 1_000 + LIVE_GAP_MS)).toEqual({
      kind: "live",
      from: 1_000,
      to: 1_000 + LIVE_GAP_MS,
    });
    expect(timeInput(1_000, 1_001 + LIVE_GAP_MS)).toEqual({
      kind: "away",
      from: 1_000,
      to: 1_001 + LIVE_GAP_MS,
    });
    expect(timeInput(9_000, 8_000)).toEqual({ kind: "clock-back", to: 8_000 });
  });
});

describe("advance", () => {
  it("brings a party home before a live stretch is paid, and starts no trouble", () => {
    const sent = send(crew(), 0, "side-seam", 0);
    const returnsAt = sent.expeditions[0]?.returnsAt ?? 0;
    const world = { mountain: sent, hazards: freshHazards(3) };
    const from = returnsAt - 1_000;
    const live = advance(world, { kind: "live", from, to: returnsAt });
    expect(live.homecomings.map((home) => home.engineer)).toEqual(["Ada"]);
    expect(live.mountain.expeditions).toEqual([]);
    expect(live.settledAt).toBe(returnsAt);
    expect(live.away).toBeUndefined();
    expect(live.hazards).toBe(world.hazards);
  });

  it("plays the cages trip by trip in a live stretch with part 3 on, as the tick does (#724)", () => {
    partThree(() => {
      const mountain = levels({
        sunk: false,
        hoists: 1,
        hoisting: 1,
        piles: { shaft: 1_800 },
      });
      const world = { mountain, hazards: freshHazards(3) };
      const nine = advance(world, { kind: "live", from: 0, to: 9_000 });
      expect(nine.mountain.stock.stones).toBe(0);
      expect(nine.mountain.cages.trips["hoist:0"]).toEqual({
        level: "topsoil",
        carried: 600,
        leg: { kind: "up", left: 1 },
      });
      const ten = advance(world, { kind: "live", from: 0, to: 10_000 });
      expect(ten.mountain.stock.stones).toBe(600);
    });
  });

  // The fresh mine's live pace never reads trouble, and trouble never starts:
  // it is out of the game (Flemming, 16 Nov 2026, `docs/decisions.md`).
  it("pays a live stretch as the line runs, and leaves the hazards as they are: trouble is out of the game (16 Nov 2026)", () => {
    const trouble = { kind: "cave-in", tier: "cart", startedAt: 0 } as const;
    const hazards = { phase: "trouble", seed: 1, taps: 0, trouble } as const;
    const mountain = { ...crew(), owned: { ...crew().owned, cart: 3 } };
    const live = advance(
      { mountain, hazards },
      { kind: "live", from: 0, to: 4_000, playerFixMs: 3_000 },
    );
    const paid = accrue({ mountain, from: 0, to: 4_000 });
    expect(live.mountain).toEqual(paid.mountain);
    expect(live.hazards).toBe(hazards);
  });

  it("pays time away like a closed game and clears trouble", () => {
    const mountain = { ...crew(), owned: { ...crew().owned, cart: 2 } };
    const hazards = freshHazards(5);
    const away = advance(
      { mountain, hazards },
      { kind: "away", from: 0, to: 600_000 },
    );
    const paid = accrueAway({ mountain, lastSeen: 0, now: 600_000 });
    expect(away.mountain).toEqual(paid.mountain);
    expect(away.mined).toBe(paid.mined);
    expect(away.away).toEqual(paid.report);
    expect(away.hazards).toEqual(closeHazards(hazards, paid.mountain));
  });

  it("pays nothing when the clock went back, and moves a future departure to now", () => {
    const sent = send(crew(), 0, "side-seam", 50_000);
    const hazards = freshHazards(2);
    const back = advance(
      { mountain: sent, hazards },
      { kind: "clock-back", to: 20_000 },
    );
    expect(back.mined).toBe(0);
    expect(back.settledAt).toBe(20_000);
    expect(back.hazards).toBe(hazards);
    expect(back.mountain.expeditions[0]?.sentAt).toBe(20_000);
    expect(back.mountain.stock.stones).toBe(sent.stock.stones);
  });
});
