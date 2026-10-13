import { describe, expect, it } from "vitest";
import {
  BOOTS_GAP_SCALE,
  ENGINEER_FIX_MS,
  FIX_TAPS,
  SLOW_EASE_MS,
  TROUBLE_MAX_MS,
  TROUBLE_MIN_MS,
  closeHazards,
  engineerFixDelay,
  fix,
  freshHazards,
  kindForTier,
  nextTrouble,
  pressTrouble,
  slowedSpeed,
  stepHazards,
  type HazardState,
  type TroubleTier,
} from "./hazards";
import { createMountain, type Mountain } from "./mountain";
import type { Engineer } from "./engineers";

const pit = (extra: Partial<Mountain> = {}): Mountain => ({
  ...createMountain(),
  helpers: 40,
  carts: 2,
  drills: 2,
  borers: 1,
  machines: 1,
  ...extra,
});

const ada = (post: Engineer["post"], rank: Engineer["rank"] = 0): Engineer => ({
  name: "Ada",
  rank,
  trips: rank === 2 ? 9 : rank === 1 ? 3 : 0,
  post,
});

function waitingFor(
  tier: TroubleTier,
  mountain: Mountain = pit(),
): Extract<HazardState, { phase: "waiting" }> {
  for (let seed = 1; seed < 500; seed += 1) {
    const state = stepHazards(freshHazards(seed), {
      now: 0,
      liveMs: 0,
      mountain,
    });
    if (state.phase === "waiting" && state.tier === tier) {
      return state;
    }
  }
  throw new Error(`no seed scheduled a ${tier}`);
}

describe("nextTrouble", () => {
  it("waits until a borer is owned", () => {
    const bare = pit({ borers: 0, machines: 0 });
    expect(nextTrouble(1, 0, bare)).toBeUndefined();
    expect(
      stepHazards(freshHazards(1), {
        now: 0,
        liveMs: TROUBLE_MAX_MS,
        mountain: bare,
      }).phase,
    ).toBe("idle");
  });

  it("is one trouble, every 3–6 minutes, and the same seed rolls the same one", () => {
    const mountain = pit();
    const seen = new Set<TroubleTier>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const first = nextTrouble(seed, 5_000, mountain);
      const again = nextTrouble(seed, 5_000, mountain);
      expect(first).toEqual(again);
      if (first === undefined) {
        throw new Error("a borer should schedule trouble");
      }
      expect(first.gapMs).toBeGreaterThanOrEqual(TROUBLE_MIN_MS);
      expect(first.gapMs).toBeLessThanOrEqual(TROUBLE_MAX_MS);
      expect(first.trouble.startedAt).toBe(5_000);
      expect(first.trouble.kind).toBe(kindForTier(first.trouble.tier));
      seen.add(first.trouble.tier);
    }
    expect([...seen].sort()).toEqual(["borer", "cart", "drill", "machine"]);
  });

  it("only jams a borer when that is the only machine", () => {
    const mountain = pit({ carts: 0, drills: 0, machines: 0 });
    for (let seed = 1; seed <= 30; seed += 1) {
      expect(nextTrouble(seed, 0, mountain)?.trouble).toEqual({
        kind: "jam",
        tier: "borer",
        startedAt: 0,
      });
    }
  });

  it("Steel-toe boots make the same roll rarer", () => {
    const mountain = pit();
    for (let seed = 1; seed <= 40; seed += 1) {
      const plain = nextTrouble(seed, 0, mountain);
      const booted = nextTrouble(seed, 0, mountain, true);
      expect(plain).toBeDefined();
      expect(booted?.gapMs).toBe((plain?.gapMs ?? 0) * BOOTS_GAP_SCALE);
      expect(booted?.gapMs).toBeGreaterThanOrEqual(
        TROUBLE_MIN_MS * BOOTS_GAP_SCALE,
      );
      expect(booted?.gapMs).toBeLessThanOrEqual(
        TROUBLE_MAX_MS * BOOTS_GAP_SCALE,
      );
      expect(booted?.trouble.tier).toBe(plain?.trouble.tier);
    }
  });
});

describe("slowdown", () => {
  it("starts at a quarter and eases to a half over two minutes", () => {
    expect(slowedSpeed(10, 0, 0)).toBe(7.5);
    expect(slowedSpeed(10, 0, -1)).toBe(7.5);
    expect(slowedSpeed(10, 0, SLOW_EASE_MS / 2)).toBe(6.25);
    expect(slowedSpeed(10, 0, SLOW_EASE_MS)).toBe(5);
    expect(slowedSpeed(10, 0, SLOW_EASE_MS + 60_000)).toBe(5);
  });
});

describe("fixing trouble", () => {
  const mountain = pit();

  it("fixes on the fifth tap, and a hold-sized fix clears it at once", () => {
    const started = stepHazards(waitingFor("cart"), {
      now: 1_000,
      liveMs: TROUBLE_MAX_MS,
      mountain,
    });
    expect(started.phase).toBe("trouble");
    if (started.phase !== "trouble") {
      return;
    }
    let state: HazardState = started;
    for (let tap = 1; tap < FIX_TAPS; tap += 1) {
      state = pressTrouble(state, mountain);
      expect(state.phase).toBe("trouble");
    }
    state = pressTrouble(state, mountain);
    expect(state.phase).toBe("waiting");
    if (state.phase !== "waiting") {
      return;
    }
    expect(state.playedMs).toBe(0);
    expect(state.gapMs).toBeGreaterThanOrEqual(TROUBLE_MIN_MS);

    expect(fix(started, mountain).phase).toBe("waiting");
    expect(fix(state, mountain)).toBe(state);
    expect(pressTrouble(state, mountain)).toBe(state);
  });

  it("an engineer tending the tier fixes it after a short while, a Master at once", () => {
    const carts = waitingFor("cart");
    expect(engineerFixDelay(mountain, "cart")).toBeUndefined();
    expect(engineerFixDelay({ ...mountain, engineers: [] }, "cart")).toBe(
      undefined,
    );

    expect(
      engineerFixDelay({ ...mountain, engineers: [ada("cart", 0)] }, "cart"),
    ).toBe(ENGINEER_FIX_MS);
    expect(
      engineerFixDelay({ ...mountain, engineers: [ada("cart", 1)] }, "cart"),
    ).toBe(ENGINEER_FIX_MS);
    expect(
      engineerFixDelay(
        {
          ...mountain,
          engineers: [ada("cart", 0), { ...ada("cart", 2), name: "Nils" }],
        },
        "cart",
      ),
    ).toBe(0);

    const early = stepHazards(
      {
        phase: "trouble",
        seed: carts.seed,
        taps: 0,
        trouble: { kind: "cave-in", tier: "cart", startedAt: 0 },
      },
      {
        now: ENGINEER_FIX_MS - 1,
        liveMs: 1_000,
        mountain: { ...mountain, engineers: [ada("cart")] },
      },
    );
    expect(early.phase).toBe("trouble");
    const later = stepHazards(early, {
      now: ENGINEER_FIX_MS,
      liveMs: 1_000,
      mountain: { ...mountain, engineers: [ada("cart")] },
    });
    expect(later.phase).toBe("waiting");
    if (later.phase === "waiting") {
      expect(later.playedMs).toBe(1_000);
    }

    const mastered = stepHazards(carts, {
      now: carts.gapMs,
      liveMs: carts.gapMs,
      mountain: { ...mountain, engineers: [ada("cart", 2)] },
    });
    expect(mastered.phase).toBe("waiting");
    if (mastered.phase === "waiting") {
      expect(mastered.playedMs).toBe(0);
    }
  });

  it("the sim dad's fix lands within three seconds, and a second trouble does not stack", () => {
    const carts = waitingFor("drill");
    const started = stepHazards(carts, {
      now: 50_000,
      liveMs: carts.gapMs,
      mountain,
    });
    expect(started.phase).toBe("trouble");
    const still = stepHazards(started, {
      now: 52_999,
      liveMs: TROUBLE_MAX_MS,
      mountain,
      playerFixMs: 3_000,
    });
    expect(still.phase).toBe("trouble");
    if (still.phase === "trouble") {
      expect(still.trouble.startedAt).toBe(50_000);
    }
    const fixed = stepHazards(still, {
      now: 53_000,
      liveMs: 1_000,
      mountain,
      playerFixMs: 3_000,
    });
    expect(fixed.phase).toBe("waiting");
  });
});

describe("live play only", () => {
  const mountain = pit();

  it("counts live milliseconds toward the gap and ignores time that was not live", () => {
    const waiting = waitingFor("borer");
    const nudged = stepHazards(waiting, {
      now: 10_000,
      liveMs: 1_000,
      mountain,
    });
    expect(nudged.phase).toBe("waiting");
    if (nudged.phase === "waiting") {
      expect(nudged.playedMs).toBe(1_000);
    }
    const paused = stepHazards(nudged, {
      now: 999_999,
      liveMs: -50,
      mountain,
    });
    expect(paused).toEqual(
      nudged.phase === "waiting" ? { ...nudged, playedMs: 1_000 } : nudged,
    );
  });

  it("boots stretch the wait the session is counting", () => {
    const plain = stepHazards(freshHazards(3), {
      now: 0,
      liveMs: 0,
      mountain,
    });
    const booted = stepHazards(freshHazards(3), {
      now: 0,
      liveMs: 0,
      mountain,
      boots: true,
    });
    expect(plain.phase).toBe("waiting");
    expect(booted.phase).toBe("waiting");
    if (plain.phase === "waiting" && booted.phase === "waiting") {
      expect(booted.gapMs).toBe(plain.gapMs * BOOTS_GAP_SCALE);
    }
  });

  it("close and away clear trouble and start the wait over", () => {
    const started = stepHazards(waitingFor("machine"), {
      now: 10,
      liveMs: TROUBLE_MAX_MS,
      mountain,
    });
    expect(started.phase).toBe("trouble");
    const closed = closeHazards(started, mountain);
    expect(closed.phase).toBe("waiting");
    if (closed.phase === "waiting") {
      expect(closed.playedMs).toBe(0);
    }
    expect(closeHazards(freshHazards(1), pit({ borers: 0 })).phase).toBe(
      "idle",
    );
    const dropped = stepHazards(started, {
      now: 10,
      liveMs: 1_000,
      mountain: pit({ borers: 0, machines: 0 }),
    });
    expect(dropped.phase).toBe("idle");
  });
});
