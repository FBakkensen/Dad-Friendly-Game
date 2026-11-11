import { describe, expect, it } from "vitest";
import { send } from "./expeditions";
import { closeHazards, freshHazards, stepHazards } from "./hazards";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { LIVE_GAP_MS, advance, timeInput } from "./session-time";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

function crew(): Mountain {
  return { ...createMountain(), helpers: 8, borers: 1, engineers: [ada] };
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
  it("brings a party home before a live stretch is paid, then steps the hazards", () => {
    const sent = send(crew(), 0, "side-seam", 0);
    const returnsAt = sent.expeditions?.[0]?.returnsAt ?? 0;
    const world = { mountain: sent, hazards: freshHazards(3) };
    const from = returnsAt - 1_000;
    const live = advance(world, { kind: "live", from, to: returnsAt });
    expect(live.homecomings.map((home) => home.engineer)).toEqual(["Ada"]);
    expect(live.mountain.expeditions ?? []).toEqual([]);
    // The stretch ending on the return is paid with Ada back on her borer.
    const away = accrue({ mountain: sent, from, to: returnsAt, live: true });
    expect(live.mined).toBeGreaterThan(away.mined);
    expect(live.settledAt).toBe(returnsAt);
    expect(live.away).toBeUndefined();
    expect(live.hazards).toEqual(
      stepHazards(world.hazards, {
        now: returnsAt,
        liveMs: 1_000,
        mountain: live.mountain,
      }),
    );
  });

  it("pays a live stretch with the trouble that is up, and the player's fix time", () => {
    const trouble = { kind: "cave-in", tier: "cart", startedAt: 0 } as const;
    const hazards = { phase: "trouble", seed: 1, taps: 0, trouble } as const;
    const mountain = { ...crew(), carts: 3 };
    const live = advance(
      { mountain, hazards },
      { kind: "live", from: 0, to: 4_000, playerFixMs: 3_000 },
    );
    const paid = accrue({ mountain, from: 0, to: 4_000, live: true, trouble });
    expect(live.mountain).toEqual(paid.mountain);
    expect(live.hazards).toEqual(
      stepHazards(hazards, {
        now: 4_000,
        liveMs: 4_000,
        mountain: paid.mountain,
        playerFixMs: 3_000,
      }),
    );
  });

  it("pays time away like a closed game and clears trouble", () => {
    const mountain = { ...crew(), carts: 2 };
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
    expect(back.mountain.expeditions?.[0]?.sentAt).toBe(20_000);
    expect(back.mountain.pocket).toBe(sent.pocket);
  });
});
