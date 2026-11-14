/**
 * Economy invariants on random play (#555): fast-check plays random legal
 * moves through `listActions`, `applyMove` and `advance`, with live waits and
 * time away between them, and checks the rules a dad should never see broken.
 * A failure shrinks to a few steps and prints its seed. A gap the rules have
 * today is a named, listed exception below, never a silent skip.
 *
 * Known gaps, each pinned by its own test, so a fix turns that test red and
 * takes its line off this list:
 * - "part-stone": each stretch away pays whole stones and drops the part stone.
 * - "band-crossing": an absence that crosses into a new band keeps the old
 *   band's speed for the whole stretch (`accrueAway` reads the rates once).
 *   Its fix is #592.
 *
 * Rules by design, which the checks allow for rather than flag:
 * - the save keeps whole depth, rounded up (save-format.ts);
 * - past the full-pay length an hour away pays less (`paidAwayMs`);
 * - with the Heart of Patience a longer absence pays more an hour (`heartBonus`).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fix, freshHazards, type HazardState } from "../hazards";
import { LAYERS } from "../layers";
import { accrueAway, createMountain, type Mountain } from "../mountain";
import { parseSaveValue, serializeSave } from "../persist";
import { AWAY_FULL_MS, SHIELD_AWAY_CAP_MS, effectiveRates } from "../rates";
import { hasRelic } from "../relics";
import { MOUNTAIN_STONES, minedOut } from "../scale";
import { advance, type TimeInput } from "../session-time";
import { TIERS } from "../tiers";
import { applyMove, listActions, type Move } from "./actions";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
/** 9 pm on a Monday, so a run's clock is a real one. */
const START = Date.UTC(2026, 10, 16, 21);

type World = {
  readonly mountain: Mountain;
  readonly hazards: HazardState;
  /** The wall clock: moves happen now. */
  readonly clock: number;
  /** The moment the crew is paid up to, as the game keeps it (`settledAt`). */
  readonly lastSeen: number;
};

type Step =
  | { readonly kind: "move"; readonly pick: number }
  | { readonly kind: "live"; readonly seconds: number }
  | { readonly kind: "away"; readonly ms: number };

/**
 * Buys machines and upgrades in turn, each buy starting one further along the
 * table, until the pocket runs dry: a mixed crew a dad could own.
 */
function crewed(start: Mountain, buys: number): Mountain {
  let mountain = start;
  for (let bought = 0; bought < buys; bought += 1) {
    const moves = listActions(mountain, START).filter(
      (action) => action.kind === "buyTier" || action.kind === "buyUpgrade",
    );
    let next = mountain;
    for (let tried = 0; tried < moves.length; tried += 1) {
      const move = moves[(bought + tried) % moves.length];
      const result =
        move === undefined
          ? undefined
          : applyMove(mountain, move, START, { trouble: undefined });
      if (result?.kind === "applied") {
        next = result.mountain;
        break;
      }
    }
    if (next === mountain) {
      return mountain;
    }
    mountain = next;
  }
  return mountain;
}

/** A save a little way into each band, with a crew bought on the way down. */
const BAND_STARTS: readonly Mountain[] = LAYERS.map((layer) => {
  const mined = layer.from + 1000;
  const rich = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - mined,
    pocket: Math.max(1000, Math.floor(mined / 10)),
  };
  return crewed(rich, 60);
});

/**
 * What the dad has to spend when a run starts: a little, a fair amount, or a
 * fortune, so cheap buys, upgrades, promotions and crafts all get played.
 */
const pocketArb = fc.oneof(
  fc.nat(1000),
  fc.nat(1_000_000),
  fc.nat(100_000_000),
);

/** The same count of every material: none, a few, or plenty. */
const materialsArb = fc
  .oneof(fc.constant(0), fc.nat(10), fc.nat(200))
  .map((count) => ({
    clay: count,
    iron: count,
    crystal: count,
    heartstone: count,
  }));

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("move" as const),
      pick: fc.nat(200),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("live" as const),
      // Up to five minutes, so trouble (after three minutes live) comes.
      seconds: fc.integer({ min: 1, max: 300 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("away" as const),
      ms: fc.integer({ min: MINUTE, max: 10 * HOUR }),
    }),
  },
);

function troubleOf(hazards: HazardState) {
  return hazards.phase === "trouble" ? hazards.trouble : undefined;
}

function movesOn(world: World): readonly Move[] {
  return [
    { kind: "dig" },
    ...listActions(world.mountain, world.clock, troubleOf(world.hazards)),
  ];
}

/** Time passes to `to`, paid from `lastSeen`, so part seconds carry as in the game. */
function timed(world: World, kind: "live" | "away", to: number): World {
  const input: TimeInput = { kind, from: world.lastSeen, to };
  const next = advance(
    { mountain: world.mountain, hazards: world.hazards },
    input,
  );
  return {
    mountain: next.mountain,
    hazards: next.hazards,
    clock: to,
    lastSeen: next.settledAt,
  };
}

type Played = {
  readonly before: World;
  readonly after: World;
  readonly move?: Move;
  readonly applied: boolean;
  /** Stones an applied move took from the pocket. */
  readonly spent: number;
};

function play(world: World, step: Step): Played {
  switch (step.kind) {
    case "move": {
      const moves = movesOn(world);
      const move = moves[step.pick % moves.length] ?? { kind: "dig" };
      if (move.kind === "fixTrouble") {
        // The hold on the troubled card: the hazards clear, the mountain stays.
        const hazards = fix(world.hazards, world.mountain);
        expect(hazards.phase).not.toBe("trouble");
        return {
          before: world,
          after: { ...world, hazards },
          move,
          applied: true,
          spent: 0,
        };
      }
      const result = applyMove(world.mountain, move, world.clock, {
        trouble: troubleOf(world.hazards),
      });
      return result.kind === "applied"
        ? {
            before: world,
            after: { ...world, mountain: result.mountain },
            move,
            applied: true,
            spent: result.spent,
          }
        : { before: world, after: world, move, applied: false, spent: 0 };
    }
    case "live": {
      const to = world.clock + step.seconds * SECOND;
      return {
        before: world,
        after: timed(world, "live", to),
        applied: true,
        spent: 0,
      };
    }
    case "away": {
      const to = world.clock + step.ms;
      return {
        before: world,
        after: timed(world, "away", to),
        applied: true,
        spent: 0,
      };
    }
  }
}

/** Counts of things: whole, never negative. */
function wholeCounts(mountain: Mountain): readonly [string, number][] {
  return [
    ...TIERS.map(
      (tier) => [tier.field, mountain[tier.field]] as [string, number],
    ),
    ["legacy", mountain.legacy],
    ["pocket", mountain.pocket],
    ["rushBank", mountain.rushBank],
    ...Object.entries(mountain.upgrades).map(
      ([id, level]) => [`upgrades.${id}`, level] as [string, number],
    ),
    ...Object.entries(mountain.crafted).map(
      ([id, level]) => [`crafted.${id}`, level] as [string, number],
    ),
    ...mountain.engineers.flatMap((hand) => [
      [`${hand.name}.rank`, hand.rank] as [string, number],
      [`${hand.name}.trips`, hand.trips] as [string, number],
    ]),
  ];
}

/** Every number in the save, by path. */
function numbersIn(value: unknown, at = ""): readonly [string, number][] {
  if (typeof value === "number") {
    return [[at, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      numbersIn(item, `${at}[${String(index)}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      numbersIn(item, at === "" ? key : `${at}.${key}`),
    );
  }
  return [];
}

function badNumbers(mountain: Mountain): readonly string[] {
  const bad: string[] = [];
  for (const [path, value] of numbersIn(mountain)) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      bad.push(`${path}=${String(value)}`);
    }
  }
  for (const [path, value] of wholeCounts(mountain)) {
    if (!Number.isInteger(value)) {
      bad.push(`${path}=${String(value)} is not whole`);
    }
  }
  return bad;
}

/** Things a run only ever gains. */
function lifetime(mountain: Mountain): Record<string, number> {
  return {
    mined: minedOut(mountain),
    legacy: mountain.legacy,
    recipes: mountain.recipes.length,
    finds: mountain.finds.length,
    taught: mountain.taught.length,
    ...Object.fromEntries(
      Object.entries(mountain.upgrades).map(([id, level]) => [
        `upgrades.${id}`,
        level,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(mountain.crafted).map(([id, level]) => [
        `crafted.${id}`,
        level,
      ]),
    ),
  };
}

function lowered(before: Mountain, after: Mountain): readonly string[] {
  const was = lifetime(before);
  const now = lifetime(after);
  return Object.keys(was).filter((key) => (now[key] ?? 0) < (was[key] ?? 0));
}

function roundTrips(world: World): void {
  const saved = JSON.parse(
    JSON.stringify(
      serializeSave({ mountain: world.mountain, lastSeen: world.lastSeen }),
    ),
  ) as unknown;
  const back = parseSaveValue(saved);
  // By design (save-format.ts): the cloud keeps whole depth, rounded up.
  expect(back?.mountain).toEqual({
    ...world.mountain,
    remaining: Math.ceil(world.mountain.remaining),
  });
  expect(back?.lastSeen).toBe(world.lastSeen);
}

/**
 * Moves that spend stones or materials: none of them may slow the crew. Two
 * kinds may, by design. A promotion takes a free worker off the crew to be an
 * engineer at camp, who tends nothing until given a job. Moving a hand
 * (`station`, `send`, `recall`) may leave a machine untended. Ranks come from
 * trips, never from a move.
 */
function isCrewBuy(move: Move | undefined): boolean {
  switch (move?.kind) {
    case "buyTier":
    case "buyUpgrade":
    case "buyBoost":
    case "craft":
      return true;
    default:
      return false;
  }
}

/**
 * Moves with a price. A shown price is what it costs (#367); every buy of a
 * machine or a boost costs stones. A craft may cost only materials.
 */
function priceOf(move: Move | undefined): number | "some" | undefined {
  switch (move?.kind) {
    case "buyUpgrade":
    case "promote":
      return move.price;
    case "buyTier":
    case "buyBoost":
      return "some";
    default:
      return undefined;
  }
}

/** Every rule one step must keep. */
function checkStep(played: Played): void {
  const { before, after } = played;
  expect(badNumbers(after.mountain)).toEqual([]);
  expect(lowered(before.mountain, after.mountain)).toEqual([]);
  if (played.applied && isCrewBuy(played.move)) {
    expect(
      effectiveRates(after.mountain).exactCrewPerSecond,
    ).toBeGreaterThanOrEqual(
      effectiveRates(before.mountain).exactCrewPerSecond,
    );
  }
  const price = played.applied ? priceOf(played.move) : undefined;
  if (price === "some") {
    expect(played.spent).toBeGreaterThan(0);
  } else if (price !== undefined) {
    expect(played.spent).toBe(price);
  }
  roundTrips(after);
}

describe("economy invariants on random play (#555)", () => {
  it("never breaks a count, a lifetime figure, a buy's price or speed, or a save", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BAND_STARTS.keys()),
        pocketArb,
        materialsArb,
        fc.nat(1000),
        fc.array(stepArb, { minLength: 1, maxLength: 40, size: "max" }),
        (band, pocket, materials, seed, steps) => {
          let world: World = {
            mountain: {
              ...(BAND_STARTS[band] ?? createMountain()),
              pocket,
              materials,
            },
            hazards: freshHazards(seed),
            clock: START,
            lastSeen: START,
          };
          for (const step of steps) {
            const played = play(world, step);
            checkStep(played);
            world = played.after;
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

/**
 * Several stretches away, each from where the last one settled, as the game
 * keeps `lastSeen`: part-seconds carry over, they are not paid twice or lost.
 */
function awayThrough(
  mountain: Mountain,
  from: number,
  ends: readonly number[],
): Mountain {
  let current = mountain;
  let lastSeen = from;
  for (const now of ends) {
    const paid = accrueAway({ mountain: current, lastSeen, now });
    current = paid.mountain;
    lastSeen = paid.settledAt;
  }
  return current;
}

/**
 * Known gap, "part-stone": each stretch away pays whole stones and drops the
 * part stone (23 workers away pay 6.9 a second, so a 3 s stretch pays 20 and
 * three 1 s stretches pay 18). So the stated tolerance is one stone a
 * stretch, plus a millionth of the haul for float dust.
 */
function tolerance(mined: number, stretches: number): number {
  return stretches + mined * 1e-6;
}

/**
 * How long an absence is paid in full. Past it, by design (`paidAwayMs`), an
 * hour pays less, so one long absence pays less than two short ones.
 */
function fullPayMs(mountain: Mountain): number {
  return hasRelic(mountain, "shield") ? SHIELD_AWAY_CAP_MS : AWAY_FULL_MS;
}

function minedAway(mountain: Mountain, ends: readonly number[]): number {
  return minedOut(awayThrough(mountain, START, ends)) - minedOut(mountain);
}

/**
 * Stones the stretches pay before the Heart of Patience's bonus. With the
 * Heart a longer stretch pays more an hour, by design (`heartBonus`), so each
 * stretch's haul is divided by its own bonus: what is left must not depend on
 * the slicing, in every band. Without the Heart the bonus is 1.
 */
function basePay(mountain: Mountain, ends: readonly number[]): number {
  let current = mountain;
  let lastSeen = START;
  let base = 0;
  for (const now of ends) {
    const paid = accrueAway({ mountain: current, lastSeen, now });
    base += paid.report.mined / paid.report.heart;
    current = paid.mountain;
    lastSeen = paid.settledAt;
  }
  return base;
}

describe("time away pays the same however it is sliced (#555)", () => {
  it("one absence pays what the same absence pays in two parts", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BAND_STARTS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (start, length, at) => {
          const ms = Math.round(MINUTE + length * (fullPayMs(start) - MINUTE));
          const split = START + Math.round(ms * at);
          const once = basePay(start, [START + ms]);
          const twice = basePay(start, [split, START + ms]);
          expect(Math.abs(once - twice)).toBeLessThanOrEqual(
            tolerance(once, 2),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("a long absence pays what the same time pays a second at a time", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BAND_STARTS),
        fc.integer({ min: 2, max: 30 * 60 }),
        (start, seconds) => {
          const once = basePay(start, [START + seconds * SECOND]);
          const stepped = basePay(
            start,
            Array.from(
              { length: seconds },
              (_, second) => START + (second + 1) * SECOND,
            ),
          );
          expect(Math.abs(once - stepped)).toBeLessThanOrEqual(
            tolerance(once, seconds),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("with the Heart of Patience, one long absence pays more than the same time in parts, by design", () => {
    const deep = BAND_STARTS.find((mountain) => hasRelic(mountain, "heart"));
    if (deep === undefined) {
      throw new Error("no band start has found the Heart of Patience");
    }
    const once = minedAway(deep, [START + 6 * HOUR]);
    const twice = minedAway(deep, [START + 3 * HOUR, START + 6 * HOUR]);
    expect(once).toBeGreaterThan(twice);
  });
});

describe("known gaps, pinned (#555)", () => {
  it("part-stone: three 1 s stretches away pay less than one 3 s stretch", () => {
    const crew = { ...createMountain(), helpers: 23 };
    const once = minedAway(crew, [START + 3 * SECOND]);
    const thrice = minedAway(crew, [
      START + SECOND,
      START + 2 * SECOND,
      START + 3 * SECOND,
    ]);
    expect(once).toBeGreaterThan(thrice);
    expect(once - thrice).toBeLessThanOrEqual(tolerance(once, 3));
  });

  const GRANITE = LAYERS[1];

  /**
   * A crew with drills or borers, placed so one hour away ends exactly on the
   * Granite's first stone. Granite slows drills and suits borers.
   */
  function atGranite(field: "drills" | "borers"): Mountain {
    const crew = {
      ...createMountain(),
      helpers: 30,
      carts: 10,
      hoists: 10,
      [field]: 20,
    };
    const hour = accrueAway({
      mountain: crew,
      lastSeen: START,
      now: START + HOUR,
    });
    // The Topsoil's scale is 1: an hour's stones are an hour's depth.
    return {
      ...crew,
      remaining: MOUNTAIN_STONES - (GRANITE.from - hour.mined),
    };
  }

  it("band-crossing: an absence into the Granite keeps the Topsoil's speed", () => {
    const drills = atGranite("drills");
    const borers = atGranite("borers");
    expect(minedOut(awayThrough(drills, START, [START + HOUR]))).toBe(
      GRANITE.from,
    );
    // One 6 h absence against the same absence split where it crosses: the
    // drills are paid over a tenth too much, the borers a twentieth too little.
    // Far beyond the part-stone tolerance, so the fix (#592) turns both red.
    const split = [START + HOUR, START + 6 * HOUR];
    const once = (mountain: Mountain) =>
      minedAway(mountain, [START + 6 * HOUR]);
    expect(once(drills) / minedAway(drills, split)).toBeGreaterThan(1.1);
    expect(once(borers) / minedAway(borers, split)).toBeLessThan(0.95);
  });
});
