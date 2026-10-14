import {
  ENGINEER_POSTS,
  promoteCost,
  station,
  type Engineer,
} from "../engineers";
import { previewFind, type StoredFind, type TunnelId } from "../expeditions";
import { type LostToolId } from "../lost-tools";
import type { Mountain } from "../mountain";

/**
 * Seconds of the schedule's income a lost tool is worth, on top of any
 * change `effectiveRates` already shows (Grandfather's pick). The lamp,
 * the map, and the boots are not a rate, so this is the stones they are
 * worth over the horizon. Keepsakes and glimmers stay at 0: a heart and a
 * hint are not a price. #178.
 */
const TOOL_SECONDS: Readonly<Record<LostToolId, number>> = {
  pick: 0,
  lamp: 8 * 60,
  map: 12 * 60,
  boots: 10 * 60,
};

const ROLLS = 100;

/**
 * Expected stones one trip brings home, averaged over every roll.
 * `rateOf` is the schedule's stones a second, so a tool that speeds the
 * crew is worth that gain for the horizon. A free engineer is worth the
 * promotion they save, plus the best post they could tend.
 */
export function expectedFindStones(
  mountain: Mountain,
  engineers: readonly Engineer[],
  tunnel: TunnelId,
  horizon: number,
  rateOf: (mountain: Mountain) => number,
): number {
  if (!(horizon > 0)) {
    return 0;
  }
  const priced = new Map<string, number>();
  let total = 0;
  for (let roll = 0; roll < ROLLS; roll += 1) {
    const find = previewFind(mountain, engineers, tunnel, roll);
    const key = findKey(find);
    let stones = priced.get(key);
    if (stones === undefined) {
      stones = stonesOf(mountain, engineers, find, horizon, rateOf);
      priced.set(key, stones);
    }
    total += stones;
  }
  return total / ROLLS;
}

function findKey(find: StoredFind): string {
  switch (find.kind) {
    case "quiet":
      return "quiet";
    case "glimmer":
      return `glimmer:${find.id}`;
    case "tool":
      return `tool:${find.id}`;
    case "keepsake":
      return `keepsake:${find.id}`;
    case "engineer":
      return `engineer:${find.id}`;
    case "recipe":
      return `recipe:${find.id}`;
  }
}

function stonesOf(
  mountain: Mountain,
  engineers: readonly Engineer[],
  find: StoredFind,
  horizon: number,
  rateOf: (mountain: Mountain) => number,
): number {
  switch (find.kind) {
    case "quiet":
    case "keepsake":
    case "glimmer":
      return 0;
    case "tool":
      return toolStones(mountain, find.id, horizon, rateOf);
    case "engineer":
      return engineerStones(mountain, engineers, find.id, horizon, rateOf);
    case "recipe":
      // The sketch is not a price. The craft it unlocks is valued on its own.
      return 0;
  }
}

function toolStones(
  mountain: Mountain,
  id: LostToolId,
  horizon: number,
  rateOf: (mountain: Mountain) => number,
): number {
  const withTool: Mountain = {
    ...mountain,
    finds: [...(mountain.finds ?? []), id],
  };
  const current = rateOf(mountain);
  const delta = rateOf(withTool) - current;
  const fromRate = delta > 0 ? delta * horizon : 0;
  return fromRate + TOOL_SECONDS[id] * Math.max(0, current);
}

function engineerStones(
  mountain: Mountain,
  engineers: readonly Engineer[],
  name: Engineer["name"],
  horizon: number,
  rateOf: (mountain: Mountain) => number,
): number {
  const hired: Mountain = {
    ...mountain,
    engineers: [...engineers, { name, rank: 0, trips: 0, post: "camp" }],
  };
  const index = engineers.length;
  let best = rateOf(hired);
  for (const post of ENGINEER_POSTS) {
    if (post === "camp" || post === "tunnel") {
      continue;
    }
    best = Math.max(best, rateOf(station(hired, index, post)));
  }
  const delta = best - rateOf(mountain);
  return promoteCost(mountain) + (delta > 0 ? delta * horizon : 0);
}
