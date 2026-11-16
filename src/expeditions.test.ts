import { describe, expect, it } from "vitest";
import {
  KEEPSAKES,
  LOST_TOOLS,
  MAX_EXPEDITION_MS,
  TRIP_FIND_IDS,
  TUNNELS,
  parseExpeditions,
  parseHomecomingNews,
  previewFind,
  send,
  settle,
  recall,
  type TunnelId,
} from "./expeditions";
import {
  ENGINEER_NAMES,
  onTrip,
  type DutyEngineer,
  type Engineer,
} from "./engineers";
import { createMountain } from "./mountain";
import { gameOf, reloaded } from "./test-fixtures";
import { STARTING_RECIPE_IDS } from "./workshop";

const SEAM = 10 * 60_000;
const HOUR = 60 * 60_000;

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };
const journeyman: Engineer = { name: "Ada", rank: 1, trips: 3, post: "borer" };

const crew = (
  engineers: readonly Engineer[] = [ada],
): ReturnType<typeof createMountain> => ({
  ...createMountain(),
  owned: { ...createMountain().owned, helper: 8, borer: 1 },
  engineers,
});

const tunnel = (id: TunnelId) => {
  const found = TUNNELS.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
};

describe("tunnels", () => {
  it("offers a side seam, the old shaft, and the deep dark", () => {
    expect(TUNNELS.map((candidate) => candidate.name)).toEqual([
      "A side seam",
      "The old shaft",
      "The deep dark",
    ]);
    expect(tunnel("side-seam")).toMatchObject({ awayMs: SEAM, minRank: 0 });
    expect(tunnel("old-shaft")).toMatchObject({ awayMs: HOUR, minRank: 0 });
    expect(tunnel("deep-dark")).toMatchObject({
      awayMs: 4 * HOUR,
      minRank: 1,
    });
    expect(MAX_EXPEDITION_MS).toBe(4 * HOUR);
  });
});

describe("send and recall", () => {
  it("moves the engineer into the tunnel and remembers the post they left", () => {
    const before = crew();
    const sent = send(before, 0, "side-seam", 5_000);
    expect(sent.engineers[0]).toMatchObject({ post: "borer", trips: 0 });
    expect(onTrip(sent, "Ada")).toBe(true);
    expect(sent.stock.stones).toBe(before.stock.stones);
    expect(sent.owned.helper).toBe(before.owned.helper);
    expect(sent.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt: 5_000,
        returnsAt: 5_000 + SEAM,
        find: sent.expeditions[0]?.find,
      },
    ]);
    expect(sent.expeditions[0]?.find).toBeDefined();
  });

  it("the worn map brings the next party home sooner, and a party already out keeps its clock", () => {
    const mapped = { ...crew(), finds: ["map" as const] };
    const sent = send(mapped, 0, "old-shaft", 0);
    expect(sent.expeditions[0]?.returnsAt).toBe(45 * 60_000);
    const seam = send(mapped, 0, "side-seam", 1_000);
    expect(seam.expeditions[0]?.returnsAt).toBe(1_000 + 450_000);
    const deep = send(
      { ...crew([journeyman]), finds: ["map"] },
      0,
      "deep-dark",
      0,
    );
    expect(deep.expeditions[0]?.returnsAt).toBe(3 * HOUR);
    const already = send(crew(), 0, "old-shaft", 0);
    expect(already.expeditions[0]?.returnsAt).toBe(HOUR);
    const withMap = { ...already, finds: ["map" as const] };
    expect(send(withMap, 0, "side-seam", 10)).toBe(withMap);
    expect(withMap.expeditions[0]?.returnsAt).toBe(HOUR);
  });

  it("refuses a stranger, a second trip, the deep dark for an apprentice, and a clock that cannot hold the return", () => {
    const before = crew();
    expect(send(before, 3, "side-seam", 0)).toBe(before);
    expect(send(before, 0, "deep-dark", 0)).toBe(before);
    const fresh = createMountain();
    expect(send(fresh, 0, "side-seam", 0)).toBe(fresh);
    const sent = send(before, 0, "side-seam", 0);
    expect(send(sent, 0, "old-shaft", 10)).toBe(sent);
    expect(send(before, 0, "side-seam", Number.MAX_SAFE_INTEGER)).toBe(before);
    expect(send(before, 0, "moon" as "side-seam", 0)).toBe(before);
    const journeymanGone = send(crew([journeyman]), 0, "deep-dark", 0);
    expect(journeymanGone.expeditions[0]?.returnsAt).toBe(4 * HOUR);
    const packed: ReturnType<typeof createMountain> = {
      ...before,
      expeditions: ENGINEER_NAMES.map((name) => ({
        engineer: name,
        tunnel: "side-seam" as const,
        sentAt: 0,
        returnsAt: SEAM,
        find: { kind: "quiet" as const },
      })),
    };
    expect(send(packed, 0, "side-seam", 0)).toBe(packed);
  });

  it("loads a saved tunnel post with no expedition at camp (#409)", () => {
    const saved = { engineers: [{ ...ada, post: "tunnel" }] };
    expect(gameOf(saved)?.engineers[0]?.post).toBe("camp");
  });

  it("recalls empty-handed, back at the old post, with no trip and no find", () => {
    const sent = send(crew(), 0, "old-shaft", 80);
    const back = recall(sent, 0);
    expect(back.engineers[0]).toEqual(ada);
    expect(back.expeditions).toEqual([]);
    expect(back.finds).toEqual([]);
    expect(back.stock.stones).toBe(sent.stock.stones);
    expect(recall(back, 0)).toBe(back);
    const idle = crew();
    expect(recall(idle, 0)).toBe(idle);
    expect(recall(sent, 4)).toBe(sent);
    const pair = crew([ada, { name: "Nils", rank: 0, trips: 0, post: "camp" }]);
    const oneOut = send(pair, 0, "side-seam", 0);
    expect(recall(oneOut, 1)).toBe(oneOut);
  });
});

describe("finds", () => {
  const samples = 400;

  const share = (id: TunnelId, kind: string): number => {
    let hits = 0;
    const mountain = crew([journeyman]);
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      const sent = send(mountain, 0, id, sentAt);
      if (sent.expeditions[0]?.find.kind === kind) {
        hits += 1;
      }
    }
    return hits / samples;
  };

  it("is fixed when the party leaves, so a reload or a second settle cannot reroll it", () => {
    const sent = send(crew(), 0, "side-seam", 40);
    const saved = reloaded(sent, 40);
    expect(saved).toEqual(sent);
    if (saved === undefined) {
      return;
    }
    const once = settle(sent, 40 + SEAM);
    const loaded = settle(saved, 40 + SEAM);
    expect(loaded.finds).toEqual(once.finds);
    expect(loaded.mountain.finds).toEqual(once.mountain.finds);
    expect(settle(once.mountain, 40 + SEAM).finds).toEqual([]);
    expect(settle(once.mountain, 40 + SEAM).mountain).toBe(once.mountain);
  });

  it("gives the old shaft a better chance of a lost tool, and keeps a side seam small", () => {
    expect(share("old-shaft", "tool")).toBeGreaterThan(
      share("side-seam", "tool") + 0.2,
    );
    expect(share("side-seam", "keepsake")).toBeGreaterThan(
      share("side-seam", "tool"),
    );
    expect(share("side-seam", "engineer")).toBe(0);
    expect(share("old-shaft", "engineer")).toBe(0);
    expect(share("deep-dark", "engineer")).toBeGreaterThan(0.05);
  });

  it("does not offer a tool or a keepsake the crew already holds, including one still out", () => {
    const owned = crew();
    let toolSeed = -1;
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      const sent = send(owned, 0, "old-shaft", sentAt);
      if (sent.expeditions[0]?.find.kind === "tool") {
        toolSeed = sentAt;
        break;
      }
    }
    expect(toolSeed).toBeGreaterThanOrEqual(0);
    const stuffed = send(
      { ...owned, finds: [...LOST_TOOLS] },
      0,
      "old-shaft",
      toolSeed,
    );
    expect(stuffed.expeditions[0]?.find.kind).not.toBe("tool");

    const two: ReturnType<typeof createMountain> = {
      ...crew([ada, { name: "Nils", rank: 0, trips: 0, post: "drill" }]),
      owned: {
        ...crew([ada, { name: "Nils", rank: 0, trips: 0, post: "drill" }])
          .owned,
        drill: 1,
        helper: 11,
      },
      finds: LOST_TOOLS.filter((id) => id !== "map"),
    };
    let mapSeed = -1;
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      const sent = send(two, 0, "old-shaft", sentAt);
      const find = sent.expeditions[0]?.find;
      if (find?.kind === "tool" && find.id === "map") {
        mapSeed = sentAt;
        break;
      }
    }
    expect(mapSeed).toBeGreaterThanOrEqual(0);
    const first = send(two, 0, "old-shaft", mapSeed);
    const second = send(first, 1, "side-seam", mapSeed);
    expect(second.expeditions[1]?.find).not.toEqual({
      kind: "tool",
      id: "map",
    });
  });

  it("brings nothing home on a quiet roll, where a relic glimmer was (#728)", () => {
    const seed = Array.from({ length: samples }, (_, sentAt) => sentAt).find(
      (sentAt) =>
        send(crew(), 0, "side-seam", sentAt).expeditions[0]?.find.kind ===
        "quiet",
    );
    expect(seed).toBeGreaterThanOrEqual(0);
    const sent = send(crew(), 0, "side-seam", seed ?? 0);
    const home = settle(sent, (seed ?? 0) + SEAM);
    expect(home.finds[0]).toMatchObject({ kind: "quiet" });
    expect(home.mountain.finds).toEqual([]);
  });

  it("falls back from a full shelf to a quiet trip in the deep dark, never to an engineer (#728)", () => {
    // Tool rolls are 0..34, keepsake 35..59, quiet 60..79, an engineer 80..99.
    const full = {
      ...crew([journeyman]),
      finds: [...LOST_TOOLS, ...KEEPSAKES],
      recipes: [...createMountain().recipes, "engineers-kit" as const],
    };
    for (const roll of [0, 34, 35, 59]) {
      expect(previewFind(full, full.engineers, "deep-dark", roll)).toEqual({
        kind: "quiet",
      });
    }
    expect(previewFind(full, full.engineers, "deep-dark", 90)).toMatchObject({
      kind: "engineer",
    });
    // One shelf full: the roll falls back to the other shelf first.
    const toolsOnly = { ...full, finds: [...LOST_TOOLS] };
    expect(
      previewFind(toolsOnly, toolsOnly.engineers, "deep-dark", 0),
    ).toMatchObject({ kind: "keepsake" });
  });

  it("sometimes brings an engineer home from the deep dark, and never a sixth", () => {
    const mountain = crew([journeyman]);
    let broughtHome = false;
    let seed = 0;
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      const back = settle(
        send(mountain, 0, "deep-dark", sentAt),
        sentAt + 4 * HOUR,
      );
      const engineer = back.finds.find((find) => find.kind === "engineer");
      if (engineer?.kind === "engineer" && engineer.joined) {
        broughtHome = true;
        seed = sentAt;
        expect(back.mountain.engineers).toHaveLength(2);
        expect(back.mountain.engineers[1]).toMatchObject({
          name: engineer.name,
          rank: 0,
          trips: 0,
          post: "camp",
        });
        expect(back.mountain.owned.helper).toBe(mountain.owned.helper);
        break;
      }
    }
    expect(broughtHome).toBe(true);

    const full: ReturnType<typeof createMountain> = {
      ...crew(
        ENGINEER_NAMES.map((name, index) => ({
          name,
          rank: index === 0 ? 1 : 0,
          trips: index === 0 ? 3 : 0,
          post: index === 0 ? "borer" : "camp",
        })),
      ),
      finds: [...LOST_TOOLS, ...KEEPSAKES],
      recipes: [...createMountain().recipes, "engineers-kit"],
    };
    const quiet = send(full, 0, "deep-dark", 7);
    expect(quiet.expeditions[0]?.find).toEqual({ kind: "quiet" });
    const home = settle(quiet, 7 + 4 * HOUR);
    expect(home.finds[0]).toMatchObject({ kind: "quiet" });
    if (home.finds[0]?.kind === "quiet") {
      expect(home.finds[0].text).not.toMatch(/[0-9?]/);
    }
    expect(home.mountain.engineers).toHaveLength(5);

    const sent = send(mountain, 0, "deep-dark", seed);
    const blocked = settle(
      {
        ...sent,
        engineers: ENGINEER_NAMES.map((name, index) => ({
          name,
          rank: index === 0 ? 1 : 0,
          trips: index === 0 ? 3 : 0,
          post: index === 0 ? "borer" : "camp",
        })),
      },
      seed + 4 * HOUR,
    );
    expect(blocked.mountain.engineers).toHaveLength(5);
    expect(blocked.finds[0]).toMatchObject({ kind: "engineer", joined: false });

    const quietSeam = send(
      { ...full, engineers: [journeyman] },
      0,
      "side-seam",
      9,
    );
    expect(quietSeam.expeditions[0]?.find).toEqual({ kind: "quiet" });

    const reserved = send(
      {
        ...crew(
          ENGINEER_NAMES.slice(0, 4).map((name, index) => ({
            name,
            rank: index === 0 ? 1 : 0,
            trips: index === 0 ? 3 : 0,
            post: index === 0 ? "borer" : "camp",
          })),
        ),
        finds: [...LOST_TOOLS, ...KEEPSAKES],
        expeditions: [
          {
            engineer: "Nils" as const,
            tunnel: "deep-dark" as const,
            sentAt: 1,
            returnsAt: 1 + 4 * HOUR,
            find: { kind: "engineer" as const, id: "Mae" as const },
          },
        ],
      },
      0,
      "deep-dark",
      3,
    );
    expect(reserved.expeditions[1]?.find).toEqual({ kind: "quiet" });

    const besideATool = send(
      {
        ...crew([
          journeyman,
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
        ]),
        finds: [...LOST_TOOLS, ...KEEPSAKES],
        expeditions: [
          {
            engineer: "Nils" as const,
            tunnel: "old-shaft" as const,
            sentAt: 1,
            returnsAt: 1 + HOUR,
            find: { kind: "tool" as const, id: "map" as const },
          },
        ],
      },
      0,
      "deep-dark",
      8,
    );
    expect(besideATool.expeditions[1]?.find).toMatchObject({
      kind: "engineer",
    });
  });

  it("adds a trip and puts the find on the shelf when they come home", () => {
    const sent = send({ ...crew(), finds: ["drawing"] }, 0, "side-seam", 11);
    expect(settle(sent, 11 + SEAM - 1).mountain).toBe(sent);
    const home = settle(sent, 11 + SEAM);
    expect(home.mountain.engineers[0]).toMatchObject({
      post: "borer",
      trips: 1,
      rank: 0,
    });
    expect(home.mountain.expeditions).toEqual([]);
    const find = sent.expeditions[0]?.find;
    if (find?.kind === "tool" || find?.kind === "keepsake") {
      expect(home.mountain.finds).toEqual(["drawing", find.id]);
    } else {
      expect(home.mountain.finds).toEqual(["drawing"]);
    }
    const repeat = settle(
      {
        ...sent,
        expeditions: [
          {
            engineer: "Ada" as const,
            tunnel: "side-seam" as const,
            sentAt: 11,
            returnsAt: 11 + SEAM,
            find: { kind: "tool" as const, id: "map" as const },
          },
        ],
        finds: ["map" as const],
      },
      11 + SEAM,
    );
    expect(repeat.mountain.finds).toEqual(["map"]);
  });

  it("brings the earlier party home first and leaves the other one out", () => {
    const two = crew([ada, { name: "Nils", rank: 0, trips: 0, post: "drill" }]);
    const sent = send(send(two, 0, "side-seam", 0), 1, "old-shaft", 0);
    const midway = settle(sent, SEAM);
    expect(midway.finds).toHaveLength(1);
    expect(midway.mountain.expeditions).toHaveLength(1);
    expect(midway.mountain.engineers[0]?.post).toBe("borer");
    expect(onTrip(midway.mountain, "Nils")).toBe(true);
    const both = settle(sent, HOUR);
    expect(both.finds).toHaveLength(2);
    expect(both.mountain.expeditions).toEqual([]);
    const together = send(send(two, 0, "side-seam", 4), 1, "side-seam", 4);
    expect(settle(together, 4 + SEAM).finds).toHaveLength(2);
  });

  it("finds a sketch in the deep dark, once, from the seed", () => {
    const dark = crew([journeyman]);
    const darkSeed = Array.from(
      { length: samples },
      (_, sentAt) => sentAt,
    ).find(
      (sentAt) =>
        send(dark, 0, "deep-dark", sentAt).expeditions[0]?.find.kind ===
        "recipe",
    );
    expect(darkSeed).toBeGreaterThanOrEqual(0);
    const seed = darkSeed ?? 0;
    const first = send(dark, 0, "deep-dark", seed);
    const again = send(dark, 0, "deep-dark", seed);
    expect(again.expeditions[0]?.find).toEqual(first.expeditions[0]?.find);
    expect(first.expeditions[0]?.find).toEqual({
      kind: "recipe",
      id: "engineers-kit",
    });
    const home = settle(first, seed + 4 * HOUR);
    expect(home.finds[0]).toEqual({ kind: "recipe", id: "engineers-kit" });
    expect(home.mountain.recipes).toContain("engineers-kit");
    expect(settle(home.mountain, seed + 4 * HOUR).finds).toEqual([]);
    const known = send(home.mountain, 0, "deep-dark", seed);
    expect(known.expeditions[0]?.find.kind).not.toBe("recipe");
    const unlisted = { ...dark, recipes: [...STARTING_RECIPE_IDS] };
    expect(send(unlisted, 0, "deep-dark", seed).expeditions[0]?.find).toEqual({
      kind: "recipe",
      id: "engineers-kit",
    });
    const pair = crew([
      journeyman,
      { name: "Nils", rank: 1, trips: 3, post: "drill" },
    ]);
    const held = send(pair, 0, "deep-dark", seed);
    const other = send(held, 1, "deep-dark", seed);
    expect(other.expeditions[1]?.find.kind).not.toBe("recipe");
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      expect(
        send(crew(), 0, "side-seam", sentAt).expeditions[0]?.find.kind,
      ).not.toBe("recipe");
      // The old shaft's lamp went with the golden veins (#728).
      expect(
        send(crew(), 0, "old-shaft", sentAt).expeditions[0]?.find.kind,
      ).not.toBe("recipe");
    }

    const stored = send(crew(), 0, "old-shaft", 3);
    const trip = stored.expeditions[0];
    expect(trip).toBeDefined();
    if (trip === undefined) {
      return;
    }
    const forced = {
      ...stored,
      expeditions: [
        { ...trip, find: { kind: "tool" as const, id: "map" as const } },
      ],
    };
    const tool = settle(forced, 3 + HOUR);
    expect(tool.finds[0]).toEqual({ kind: "tool", id: "map" });
    expect(tool.mountain.recipes).not.toContain("engineers-kit");
  });
});

describe("clock skew", () => {
  it("shifts a future sentAt to now and keeps the duration and the find", () => {
    const sent = send(crew(), 0, "side-seam", 50_000);
    const find = sent.expeditions[0]?.find;
    const clamped = settle(sent, 1_000);
    expect(clamped.finds).toEqual([]);
    expect(clamped.mountain.engineers[0]).toMatchObject({
      post: "borer",
      trips: 0,
    });
    expect(onTrip(clamped.mountain, "Ada")).toBe(true);
    expect(clamped.mountain.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt: 1_000,
        returnsAt: 1_000 + SEAM,
        find,
      },
    ]);
    expect(settle(clamped.mountain, 1_000 + SEAM).finds).toEqual(
      settle(sent, 50_000 + SEAM).finds,
    );
    const overflow = settle(
      {
        ...sent,
        expeditions: [
          {
            engineer: "Ada" as const,
            tunnel: "side-seam" as const,
            sentAt: Number.MAX_SAFE_INTEGER - 1_000,
            returnsAt: Number.MAX_SAFE_INTEGER - 1,
            find: { kind: "quiet" as const },
          },
        ],
      },
      Number.MAX_SAFE_INTEGER - 500,
    );
    expect(overflow.mountain.expeditions[0]?.sentAt).toBe(
      Number.MAX_SAFE_INTEGER - 1_000,
    );
  });
});

describe("parse", () => {
  const leader: DutyEngineer = { ...journeyman, post: "tunnel" };
  const trip = {
    engineer: "Ada" as const,
    tunnel: "deep-dark" as const,
    sentAt: 5,
    returnsAt: 5 + 4 * HOUR,
    home: "borer" as const,
    find: { kind: "tool" as const, id: "boots" as const },
  };
  const base = { owned: { helper: 8, borer: 1 }, engineers: [leader] };

  it("accepts a closed trip and a closed shelf, and an older save is unchanged", () => {
    expect(
      gameOf({
        ...base,
        expeditions: [trip],
        marks: { finds: ["map", "whistle"] },
      }),
    ).toMatchObject({
      engineers: [{ ...leader, post: "borer" }],
      expeditions: [
        {
          engineer: trip.engineer,
          tunnel: trip.tunnel,
          sentAt: trip.sentAt,
          returnsAt: trip.returnsAt,
          find: trip.find,
        },
      ],
      finds: ["map", "whistle"],
    });
    const older = gameOf(base);
    expect(older?.expeditions).toEqual([]);
    expect(older?.finds).toEqual([]);
    expect(
      gameOf({ ...base, expeditions: [], marks: { finds: [] } })?.expeditions,
    ).toEqual([]);
    expect(
      gameOf({
        ...base,
        expeditions: [{ ...trip, find: { kind: "quiet" } }],
      })?.expeditions[0]?.find,
    ).toEqual({ kind: "quiet" });
    expect(
      gameOf({
        ...base,
        expeditions: [
          { ...trip, find: { kind: "recipe", id: "engineers-kit" } },
        ],
      })?.expeditions[0]?.find,
    ).toEqual({ kind: "recipe", id: "engineers-kit" });
    const negative = gameOf({
      ...base,
      expeditions: [{ ...trip, sentAt: -20, returnsAt: -10 }],
    });
    expect(negative?.expeditions[0]?.sentAt).toBe(-20);
  });

  it("rejects a bad trip, a duplicate shelf, and a leader who could not have gone", () => {
    for (const expeditions of [
      [{ ...trip, tunnel: "moon" }],
      [{ ...trip, returnsAt: trip.sentAt }],
      [{ ...trip, returnsAt: trip.sentAt - 1 }],
      [{ ...trip, returnsAt: trip.sentAt + MAX_EXPEDITION_MS + 1 }],
      [{ ...trip, home: "tunnel" }],
      [{ ...trip, engineer: "Nils" }],
      [{ ...trip, note: "hi" }],
      [{ ...trip, find: { kind: "tool", id: "turbo" } }],
      [{ ...trip, find: { kind: "quiet", id: "nope" } }],
      [{ ...trip, find: { kind: "engineer", id: "Ada" } }],
      [{ ...trip, find: { kind: "recipe", id: "iron-rails" } }],
      [{ ...trip, find: { kind: "recipe", id: "future-bit" } }],
      [null],
      [{ ...trip, find: null }],
      [{ ...trip, find: { kind: "tool" } }],
      [{ ...trip, find: { kind: "tool", id: 4 } }],
      [{ ...trip, find: ["map"] }],
      new Array(6).fill(trip),
      "Ada",
    ]) {
      expect(gameOf({ ...base, expeditions })).toBeUndefined();
    }
    expect(
      gameOf({
        ...base,
        expeditions: [trip, { ...trip, engineer: "Nils" }],
      }),
    ).toBeUndefined();
    expect(gameOf({ expeditions: [trip] })).toBeUndefined();
    expect(
      gameOf({
        ...base,
        engineers: [{ ...ada, post: "tunnel" }],
        expeditions: [trip],
      }),
    ).toBeUndefined();
    expect(
      gameOf({
        ...base,
        engineers: [{ ...journeyman, post: "borer" }],
        expeditions: [trip],
      }),
    ).toBeUndefined();
    // A find this build does not know, or the same find twice, is a newer
    // build's save (#558): it does not play here.
    for (const finds of ["map", ["turbo"], ["map", "map"]]) {
      expect(gameOf({ ...base, marks: { finds } })).toBeUndefined();
    }
  });

  it("drops a trip whose leader is gone and still comes home", () => {
    const sent = send(crew(), 0, "side-seam", 0);
    const orphan = { ...sent, engineers: [] };
    const home = settle(orphan, SEAM);
    expect(home.mountain.expeditions).toEqual([]);
    expect(home.finds[0]).toMatchObject({ kind: "quiet" });
    const stranger = settle(
      {
        ...sent,
        engineers: [{ name: "Nils", rank: 0, trips: 0, post: "camp" }],
      },
      SEAM,
    );
    expect(stranger.finds[0]).toMatchObject({ kind: "quiet" });
    expect(stranger.mountain.expeditions).toEqual([]);
    expect(stranger.mountain.engineers[0]?.name).toBe("Nils");
  });
});

describe("parseHomecomingNews", () => {
  const tool = {
    engineer: "Ada",
    tunnel: "old-shaft",
    sentAt: 4,
    find: { kind: "tool", id: "map" },
  };

  it("keeps a trustworthy list and drops anything off", () => {
    expect(parseHomecomingNews(tool)).toEqual([]);
    expect(parseHomecomingNews([])).toEqual([]);
    expect(parseHomecomingNews([tool])).toEqual([tool]);
    expect(
      parseHomecomingNews([
        tool,
        {
          engineer: "Nils",
          tunnel: "side-seam",
          sentAt: 1,
          find: { kind: "keepsake", id: "watch" },
        },
        {
          engineer: "Otto",
          tunnel: "old-shaft",
          sentAt: 3,
          find: { kind: "engineer", name: "Mae", joined: true },
        },
        {
          engineer: "Mae",
          tunnel: "side-seam",
          sentAt: 0,
          find: { kind: "quiet", text: "Quiet." },
        },
        {
          engineer: "Ada",
          tunnel: "deep-dark",
          sentAt: 8,
          find: { kind: "recipe", id: "engineers-kit" },
        },
      ]),
    ).toHaveLength(5);
    for (const bad of [
      null,
      [null],
      [[]],
      [{ ...tool, engineer: "Bob" }],
      [{ ...tool, tunnel: 4 }],
      [{ ...tool, tunnel: "mine" }],
      [{ ...tool, sentAt: 1.5 }],
      [{ ...tool, find: null }],
      [{ ...tool, find: [] }],
      [{ ...tool, find: { kind: "tool", id: 1 } }],
      [{ ...tool, find: { kind: "tool", id: "turbo" } }],
      [{ ...tool, find: { kind: "keepsake", id: "map" } }],
      // The relic glimmers left with the relics (#728).
      [{ ...tool, find: { kind: "glimmer", relic: "heart", text: "A" } }],
      [{ ...tool, find: { kind: "engineer", name: "Bob", joined: true } }],
      [{ ...tool, find: { kind: "engineer", name: "Mae", joined: "yes" } }],
      [{ ...tool, find: { kind: "quiet", text: "" } }],
      [{ ...tool, find: { kind: "quiet", text: 1 } }],
      [{ ...tool, find: { kind: "stones" } }],
      [{ ...tool, find: { kind: "recipe", id: "iron-rails" } }],
      [{ ...tool, find: { kind: "recipe", id: "future-bit" } }],
      [tool, { engineer: "Ada" }],
    ]) {
      expect(parseHomecomingNews(bad)).toEqual([]);
    }
  });
});

describe("parseExpeditions reads only a whole trip (#558)", () => {
  const away: DutyEngineer[] = [
    { name: "Ada", rank: 0, trips: 0, post: "tunnel" },
  ];
  const trip = {
    engineer: "Ada",
    tunnel: "old-shaft",
    sentAt: 1_000,
    returnsAt: 1_000 + HOUR,
    home: "borer",
    find: { kind: "tool", id: "map" },
  };

  it("takes a whole trip", () => {
    expect(parseExpeditions([trip], away)).toEqual([trip]);
  });

  it("takes every find the ledger lists, and no other", () => {
    for (const [kind, ids] of Object.entries(TRIP_FIND_IDS)) {
      const finds =
        kind === "quiet"
          ? [{ kind }]
          : ids.filter((id) => id !== "Ada").map((id) => ({ kind, id }));
      for (const find of finds) {
        expect(parseExpeditions([{ ...trip, find }], away)).toEqual([
          { ...trip, find },
        ]);
      }
      expect(
        parseExpeditions([{ ...trip, find: { kind, id: "kiln" } }], away),
      ).toBeUndefined();
    }
    expect(
      parseExpeditions(
        [{ ...trip, find: { kind: "sketch", id: "map" } }],
        away,
      ),
    ).toBeUndefined();
  });

  it("refuses trips with no crew, a trip that is not a record, and a find with no name", () => {
    expect(parseExpeditions([trip], undefined)).toBeUndefined();
    for (const item of [null, "trip", [trip]]) {
      expect(parseExpeditions([item], away)).toBeUndefined();
    }
    for (const find of [
      null,
      [],
      "map",
      { kind: "tool", id: 3 },
      { kind: "tool", name: "map" },
      { kind: "quiet", id: "map" },
      // The relic glimmers left with the relics (#728).
      { kind: "glimmer", id: "heart" },
    ]) {
      expect(parseExpeditions([{ ...trip, find }], away)).toBeUndefined();
    }
  });
});
