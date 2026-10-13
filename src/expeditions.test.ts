import { describe, expect, it } from "vitest";
import {
  KEEPSAKES,
  LOST_TOOLS,
  MAX_EXPEDITION_MS,
  TUNNELS,
  glimmerText,
  send,
  settle,
  recall,
  type TunnelId,
} from "./expeditions";
import { ENGINEER_NAMES, type Engineer } from "./engineers";
import { accrueAway, createMountain, parseMountain } from "./mountain";
import { parseSaveValue, serializeSave } from "./persist";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { RELICS } from "./relics";
import { MOUNTAIN_STONES } from "./scale";

const SEAM = 10 * 60_000;
const HOUR = 60 * 60_000;
const payOf = (heart = 1): number =>
  Math.round(AWAY_PAY_RATE * heart * 1e9) / 1e9;

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };
const journeyman: Engineer = { name: "Ada", rank: 1, trips: 3, post: "borer" };

const crew = (
  engineers: readonly Engineer[] = [ada],
): ReturnType<typeof createMountain> => ({
  ...createMountain(),
  helpers: 8,
  borers: 1,
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
    expect(sent.engineers?.[0]).toMatchObject({ post: "tunnel", trips: 0 });
    expect(sent.pocket).toBe(before.pocket);
    expect(sent.helpers).toBe(before.helpers);
    expect(sent.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt: 5_000,
        returnsAt: 5_000 + SEAM,
        home: "borer",
        find: sent.expeditions?.[0]?.find,
      },
    ]);
    expect(sent.expeditions?.[0]?.find).toBeDefined();
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
    expect(journeymanGone.expeditions?.[0]?.returnsAt).toBe(4 * HOUR);
    const packed: ReturnType<typeof createMountain> = {
      ...before,
      expeditions: ENGINEER_NAMES.map((name) => ({
        engineer: name,
        tunnel: "side-seam" as const,
        sentAt: 0,
        returnsAt: SEAM,
        home: "camp" as const,
        find: { kind: "quiet" as const },
      })),
    };
    expect(send(packed, 0, "side-seam", 0)).toBe(packed);
  });

  it("recalls empty-handed, back at the old post, with no trip and no find", () => {
    const sent = send(crew(), 0, "old-shaft", 80);
    const back = recall(sent, 0);
    expect(back.engineers?.[0]).toEqual(ada);
    expect(back.expeditions).toBeUndefined();
    expect(back.finds).toBeUndefined();
    expect(back.pocket).toBe(sent.pocket);
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
      if (sent.expeditions?.[0]?.find.kind === kind) {
        hits += 1;
      }
    }
    return hits / samples;
  };

  it("is fixed when the party leaves, so a reload or a second settle cannot reroll it", () => {
    const sent = send(crew(), 0, "side-seam", 40);
    const saved = parseSaveValue(
      JSON.parse(
        JSON.stringify(serializeSave({ mountain: sent, lastSeen: 40 })),
      ),
    )?.mountain;
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
      if (sent.expeditions?.[0]?.find.kind === "tool") {
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
    expect(stuffed.expeditions?.[0]?.find.kind).not.toBe("tool");

    const two: ReturnType<typeof createMountain> = {
      ...crew([ada, { name: "Nils", rank: 0, trips: 0, post: "drill" }]),
      drills: 1,
      helpers: 11,
      finds: LOST_TOOLS.filter((id) => id !== "pick"),
    };
    let pickSeed = -1;
    for (let sentAt = 0; sentAt < samples; sentAt += 1) {
      const sent = send(two, 0, "old-shaft", sentAt);
      const find = sent.expeditions?.[0]?.find;
      if (find?.kind === "tool" && find.id === "pick") {
        pickSeed = sentAt;
        break;
      }
    }
    expect(pickSeed).toBeGreaterThanOrEqual(0);
    const first = send(two, 0, "old-shaft", pickSeed);
    const second = send(first, 1, "side-seam", pickSeed);
    expect(second.expeditions?.[1]?.find).not.toEqual({
      kind: "tool",
      id: "pick",
    });
  });

  it("keys a glimmer to the next relic, with no numbers and no question marks", () => {
    for (const relic of RELICS) {
      const mountain = {
        ...crew(),
        remaining: MOUNTAIN_STONES - (relic.depth - 1),
        finds: [...LOST_TOOLS, ...KEEPSAKES],
      };
      const sent = send(mountain, 0, "side-seam", 2);
      expect(sent.expeditions?.[0]?.find).toEqual({
        kind: "glimmer",
        id: relic.id,
      });
      const home = settle(sent, 2 + SEAM);
      const find = home.finds[0];
      expect(find).toMatchObject({ kind: "glimmer", relic: relic.id });
      if (find?.kind === "glimmer") {
        expect(find.text).toBe(glimmerText(relic.id));
        expect(find.text).not.toMatch(/[0-9?]/);
      }
    }
    expect(glimmerText("heart")).toBe(
      "Down there, something beat like a heart.",
    );
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
        expect(back.mountain.engineers?.[1]).toMatchObject({
          name: engineer.name,
          rank: 0,
          trips: 0,
          post: "camp",
        });
        expect(back.mountain.helpers).toBe(mountain.helpers);
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
      remaining: 0,
    };
    const quiet = send(full, 0, "deep-dark", 7);
    expect(quiet.expeditions?.[0]?.find).toEqual({ kind: "quiet" });
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
          post: index === 0 ? "tunnel" : "camp",
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
    expect(quietSeam.expeditions?.[0]?.find).toEqual({ kind: "quiet" });

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
        remaining: 0,
        finds: [...LOST_TOOLS, ...KEEPSAKES],
        expeditions: [
          {
            engineer: "Nils" as const,
            tunnel: "deep-dark" as const,
            sentAt: 1,
            returnsAt: 1 + 4 * HOUR,
            home: "camp" as const,
            find: { kind: "engineer" as const, id: "Mae" as const },
          },
        ],
      },
      0,
      "deep-dark",
      3,
    );
    expect(reserved.expeditions?.[1]?.find).toEqual({ kind: "quiet" });

    const besideATool = send(
      {
        ...crew([
          journeyman,
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
        ]),
        remaining: 0,
        finds: [...LOST_TOOLS, ...KEEPSAKES],
        expeditions: [
          {
            engineer: "Nils" as const,
            tunnel: "old-shaft" as const,
            sentAt: 1,
            returnsAt: 1 + HOUR,
            home: "camp" as const,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
      },
      0,
      "deep-dark",
      8,
    );
    expect(besideATool.expeditions?.[1]?.find).toMatchObject({
      kind: "engineer",
    });
  });

  it("adds a trip and puts the find on the shelf when they come home", () => {
    const sent = send({ ...crew(), finds: ["drawing"] }, 0, "side-seam", 11);
    expect(settle(sent, 11 + SEAM - 1).mountain).toBe(sent);
    const home = settle(sent, 11 + SEAM);
    expect(home.mountain.engineers?.[0]).toMatchObject({
      post: "borer",
      trips: 1,
      rank: 0,
    });
    expect(home.mountain.expeditions).toBeUndefined();
    const find = sent.expeditions?.[0]?.find;
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
            home: "borer" as const,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
        finds: ["pick" as const],
      },
      11 + SEAM,
    );
    expect(repeat.mountain.finds).toEqual(["pick"]);
  });

  it("brings the earlier party home first and leaves the other one out", () => {
    const two = crew([ada, { name: "Nils", rank: 0, trips: 0, post: "drill" }]);
    const sent = send(send(two, 0, "side-seam", 0), 1, "old-shaft", 0);
    const midway = settle(sent, SEAM);
    expect(midway.finds).toHaveLength(1);
    expect(midway.mountain.expeditions).toHaveLength(1);
    expect(midway.mountain.engineers?.[0]?.post).toBe("borer");
    expect(midway.mountain.engineers?.[1]?.post).toBe("tunnel");
    const both = settle(sent, HOUR);
    expect(both.finds).toHaveLength(2);
    expect(both.mountain.expeditions).toBeUndefined();
    const together = send(send(two, 0, "side-seam", 4), 1, "side-seam", 4);
    expect(settle(together, 4 + SEAM).finds).toHaveLength(2);
  });
});

describe("clock skew", () => {
  it("shifts a future sentAt to now and keeps the duration and the find", () => {
    const sent = send(crew(), 0, "side-seam", 50_000);
    const find = sent.expeditions?.[0]?.find;
    const clamped = settle(sent, 1_000);
    expect(clamped.finds).toEqual([]);
    expect(clamped.mountain.engineers?.[0]).toMatchObject({
      post: "tunnel",
      trips: 0,
    });
    expect(clamped.mountain.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt: 1_000,
        returnsAt: 1_000 + SEAM,
        home: "borer",
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
            home: "borer" as const,
            find: { kind: "quiet" as const },
          },
        ],
      },
      Number.MAX_SAFE_INTEGER - 500,
    );
    expect(overflow.mountain.expeditions?.[0]?.sentAt).toBe(
      Number.MAX_SAFE_INTEGER - 1_000,
    );
  });
});

describe("away pay", () => {
  const base = {
    ...createMountain(),
    helpers: 11,
    borers: 1,
    drills: 1,
    engineers: [
      ada,
      {
        name: "Nils" as const,
        rank: 0 as const,
        trips: 0,
        post: "drill" as const,
      },
    ],
  };

  it("splits at each return so the tending bonus resumes, including across the cap and after a reload", () => {
    const sent = send(send(base, 0, "side-seam", 0), 1, "old-shaft", 0);
    const adaHome = {
      ...sent,
      engineers: [
        { ...ada, post: "borer" as const },
        sent.engineers?.[1] ?? ada,
      ],
    };
    const bothHome = {
      ...adaHome,
      engineers: [
        adaHome.engineers[0] ?? ada,
        {
          name: "Nils" as const,
          rank: 0 as const,
          trips: 0,
          post: "drill" as const,
        },
      ],
    };
    const pay = payOf();
    const away = accrueAway({ mountain: sent, lastSeen: 0, now: 2 * HOUR });
    expect(away.mined).toBe(
      Math.floor(600 * effectiveRates(sent).crewPerSecond * pay) +
        Math.floor(3_000 * effectiveRates(adaHome).crewPerSecond * pay) +
        Math.floor(3_600 * effectiveRates(bothHome).crewPerSecond * pay),
    );
    expect(away.mined).toBeGreaterThan(
      Math.floor(7_200 * effectiveRates(sent).crewPerSecond * pay),
    );
    expect(away.mountain.engineers?.[0]?.post).toBe("borer");
    expect(away.mountain.engineers?.[1]?.post).toBe("drill");
    expect(away.mountain.engineers?.[0]?.trips).toBe(1);
    expect(away.mountain.expeditions).toBeUndefined();
    expect(away.report).toMatchObject({
      awayMs: 2 * HOUR,
      capped: false,
      heart: 1,
    });

    const stillOut = send(crew([journeyman]), 0, "deep-dark", 0);
    const early = accrueAway({
      mountain: stillOut,
      lastSeen: 0,
      now: 5 * 60_000,
    });
    expect(early.mountain.engineers?.[0]?.post).toBe("tunnel");
    expect(early.mined).toBe(
      Math.floor(300 * effectiveRates(stillOut).crewPerSecond * pay),
    );

    const onTime = accrueAway({
      mountain: stillOut,
      lastSeen: 0,
      now: 4 * HOUR,
    });
    expect(onTime.mountain.engineers?.[0]?.post).toBe("borer");
    expect(onTime.mined).toBe(
      Math.floor(
        ((4 * HOUR) / 1000) * effectiveRates(stillOut).crewPerSecond * pay,
      ),
    );

    const capped = accrueAway({
      mountain: stillOut,
      lastSeen: 0,
      now: 10 * HOUR,
    });
    const tended = {
      ...stillOut,
      engineers: [{ ...journeyman, post: "borer" as const }],
    };
    expect(capped.report.capped).toBe(true);
    expect(capped.mined).toBe(
      Math.floor(2 * 3_600 * effectiveRates(stillOut).crewPerSecond * pay) +
        Math.floor(6 * 3_600 * effectiveRates(tended).crewPerSecond * pay),
    );

    const seam = send(crew(), 0, "side-seam", 0);
    const long = accrueAway({ mountain: seam, lastSeen: 0, now: 20 * HOUR });
    const home = { ...seam, engineers: [{ ...ada }] };
    expect(long.mined).toBe(
      Math.floor(8 * 3_600 * effectiveRates(home).crewPerSecond * pay),
    );
    expect(long.mined).not.toBe(
      Math.floor(8 * 3_600 * effectiveRates(seam).crewPerSecond * pay),
    );
    const saved = parseSaveValue(
      JSON.parse(
        JSON.stringify(serializeSave({ mountain: seam, lastSeen: 0 })),
      ),
    )?.mountain;
    expect(saved).toEqual(seam);
    if (saved !== undefined) {
      const reloaded = accrueAway({
        mountain: saved,
        lastSeen: 0,
        now: 20 * HOUR,
      });
      expect(reloaded.mined).toBe(long.mined);
      expect(reloaded.mountain.finds).toEqual(long.mountain.finds);
      expect(reloaded.mountain.engineers).toEqual(long.mountain.engineers);
    }
  });

  it("keeps the Heart of Patience on every piece of a split absence", () => {
    const hearty = {
      ...crew(),
      remaining: MOUNTAIN_STONES - 45_000_000,
    };
    const sent = send(hearty, 0, "side-seam", 0);
    const home = { ...sent, engineers: [{ ...ada }] };
    const pay = payOf(1.25);
    const away = accrueAway({ mountain: sent, lastSeen: 0, now: 6 * HOUR });
    expect(away.report.heart).toBe(1.25);
    expect(away.mined).toBe(
      Math.floor(600 * effectiveRates(sent).crewPerSecond * pay) +
        Math.floor(
          (6 * 3_600 - 600) * effectiveRates(home).crewPerSecond * pay,
        ),
    );
  });
});

describe("parse", () => {
  const leader: Engineer = { ...journeyman, post: "tunnel" };
  const trip = {
    engineer: "Ada" as const,
    tunnel: "deep-dark" as const,
    sentAt: 5,
    returnsAt: 5 + 4 * HOUR,
    home: "borer" as const,
    find: { kind: "tool" as const, id: "lamp" as const },
  };
  const base = {
    remaining: 10,
    pocket: 0,
    helpers: 8,
    carts: 0,
    drills: 0,
    borers: 1,
    machines: 0,
    kids: 0,
    engineers: [leader],
  };

  it("accepts a closed trip and a closed shelf, and an older save is unchanged", () => {
    expect(
      parseMountain({
        ...base,
        expeditions: [trip],
        finds: ["pick", "whistle"],
      }),
    ).toMatchObject({
      expeditions: [trip],
      finds: ["pick", "whistle"],
    });
    const older = parseMountain(base);
    expect(older?.expeditions).toBeUndefined();
    expect(older?.finds).toBeUndefined();
    expect(
      parseMountain({ ...base, expeditions: [], finds: [] })?.expeditions,
    ).toBeUndefined();
    expect(
      parseMountain({
        ...base,
        expeditions: [{ ...trip, find: { kind: "quiet" } }],
      })?.expeditions?.[0]?.find,
    ).toEqual({ kind: "quiet" });
    const negative = parseMountain({
      ...base,
      expeditions: [{ ...trip, sentAt: -20, returnsAt: -10 }],
    });
    expect(negative?.expeditions?.[0]?.sentAt).toBe(-20);
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
      [null],
      [{ ...trip, find: null }],
      [{ ...trip, find: { kind: "tool" } }],
      [{ ...trip, find: { kind: "tool", id: 4 } }],
      [{ ...trip, find: ["pick"] }],
      new Array(6).fill(trip),
      "Ada",
    ]) {
      expect(parseMountain({ ...base, expeditions })).toBeUndefined();
    }
    expect(
      parseMountain({
        ...base,
        expeditions: [trip, { ...trip, engineer: "Nils" }],
      }),
    ).toBeUndefined();
    expect(
      parseMountain({
        remaining: 10,
        pocket: 0,
        helpers: 0,
        expeditions: [trip],
      }),
    ).toBeUndefined();
    expect(
      parseMountain({
        ...base,
        engineers: [{ ...ada, post: "tunnel" }],
        expeditions: [trip],
      }),
    ).toBeUndefined();
    expect(
      parseMountain({
        ...base,
        engineers: [{ ...journeyman, post: "borer" }],
        expeditions: [trip],
      }),
    ).toBeUndefined();
    for (const finds of [
      ["pick", "pick"],
      ["turbo"],
      "pick",
      new Array(10).fill("pick"),
    ]) {
      expect(parseMountain({ ...base, finds })).toBeUndefined();
    }
  });

  it("drops a trip whose leader is gone and still comes home", () => {
    const sent = send(crew(), 0, "side-seam", 0);
    const orphan = { ...sent };
    delete orphan.engineers;
    const home = settle(orphan, SEAM);
    expect(home.mountain.expeditions).toBeUndefined();
    expect(home.finds[0]).toMatchObject({ kind: "quiet" });
    const stranger = settle(
      {
        ...sent,
        engineers: [{ name: "Nils", rank: 0, trips: 0, post: "tunnel" }],
      },
      SEAM,
    );
    expect(stranger.finds[0]).toMatchObject({ kind: "quiet" });
    expect(stranger.mountain.expeditions).toBeUndefined();
    expect(stranger.mountain.engineers?.[0]?.name).toBe("Nils");
  });
});
