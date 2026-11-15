import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import {
  createSession,
  firstNotice,
  noticesOf,
  openBaselines,
  step,
  type Session,
} from "./session";
import { EMPTY_STOCK } from "./stock";
import type { Project } from "./city";

/** The session greets a fresh mine's night by what happened in it (#663). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const MINUTE = 60 * 1000;

const foundation: Project = {
  kind: "delivering",
  site: {
    building: "lightTower",
    step: 0,
    arrived: EMPTY_STOCK,
    onSite: EMPTY_STOCK,
  },
};

/** A fresh mine with this many on each stage, this pocket and this project. */
function mine(perStage: number, pocket: number, project: Project): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 3 * perStage + 3 },
    jobs: {
      drilling: perStage,
      haulage: perStage,
      hoisting: perStage,
      driving: 1,
      building: 2,
    },
    stock: { ...start.stock, stones: pocket },
    project,
  };
}

function playing(mountain: Mountain): Session {
  return openBaselines(createSession(mountain, 1), true);
}

const back = (mountain: Mountain, awayMs: number): Session =>
  step(playing(mountain), { kind: "away", since: 0 }, awayMs).session;

describe("greeting a fresh mine's night (#663)", () => {
  it("greets a short night with the shift report, never the quiet note", () => {
    fresh(() => {
      const session = back(mine(3, 0, { kind: "unordered" }), 3 * MINUTE);
      expect(noticesOf(session.news, "quiet")).toEqual([]);
      const report = firstNotice(session.news, "away")?.report;
      expect(report?.mined).toBe(486);
      expect(report?.night?.producedMs).toBe(3 * MINUTE);
    });
  });

  it("greets a night where only transport worked", () => {
    fresh(() => {
      // Nobody on the stages: nothing mined, and the wagon delivers from the pocket.
      const session = back(mine(0, 10_000, foundation), 10 * MINUTE);
      const report = firstNotice(session.news, "away")?.report;
      expect(report?.mined).toBe(0);
      expect(report?.night?.delivered.stones).toBe(1_620);
    });
  });

  it("greets a night where only the builders worked and a step was built in", () => {
    fresh(() => {
      // The foundation all arrived, 100 on the site and on hold: the two
      // builders build it in, and nothing leaves the pocket.
      const held: Project = {
        kind: "onHold",
        site: {
          building: "lightTower",
          step: 0,
          arrived: { ...EMPTY_STOCK, stones: 25_000 },
          onSite: { ...EMPTY_STOCK, stones: 100 },
        },
      };
      const session = back(mine(0, 0, held), 10 * MINUTE);
      const report = firstNotice(session.news, "away")?.report;
      expect(report?.night?.steps).toEqual([
        { building: "lightTower", step: 0, atMs: 21_000 },
      ]);
    });
  });

  it("says nothing when nothing happened, or after a short break", () => {
    fresh(() => {
      const still = back(mine(0, 10_000, { kind: "unordered" }), 10 * MINUTE);
      expect(firstNotice(still.news, "away")).toBeUndefined();
      expect(still.lastSeen).toBe(10 * MINUTE);
      const quick = back(mine(3, 0, { kind: "unordered" }), 50_000);
      expect(firstNotice(quick.news, "away")).toBeUndefined();
      expect(noticesOf(quick.news, "quiet")).toEqual([]);
      expect(quick.mountain.stock.stones).toBe(135);
    });
  });

  it("keeps today's quiet note for a short break, and no card when nothing was mined", () => {
    const today = createMountain();
    const crew = { ...today, owned: { ...today.owned, helper: 5 } };
    const short = back(crew, 3 * MINUTE);
    expect(noticesOf(short.news, "quiet")).toHaveLength(1);
    expect(firstNotice(short.news, "away")).toBeUndefined();
    const idle = back(today, 10 * MINUTE);
    expect(firstNotice(idle.news, "away")).toBeUndefined();
    expect(noticesOf(idle.news, "quiet")).toEqual([]);
  });
});

describe("announcing a building that went operational (#663)", () => {
  const lit = (mountain: Mountain): Mountain => ({
    ...mountain,
    project: { kind: "unordered" },
    operational: ["lightTower"],
  });
  const roofLater = mine(3, 0, { kind: "unordered" });

  it("announces the Light Tower once when its roof goes on in play, and closes on dismiss", () => {
    const open = playing(roofLater);
    const changed = step(
      open,
      { kind: "change", update: (m) => ({ mountain: lit(m), events: [] }) },
      1_000,
    ).session;
    const noted = step(changed, { kind: "notice" }, 1_000).session;
    expect(noticesOf(noted.news, "operational")).toEqual([
      { kind: "operational", building: "lightTower" },
    ]);
    const again = step(noted, { kind: "notice" }, 2_000).session;
    expect(noticesOf(again.news, "operational")).toHaveLength(1);
    const closed = step(
      again,
      { kind: "dismiss", what: "operational" },
      3_000,
    ).session;
    expect(noticesOf(closed.news, "operational")).toEqual([]);
  });

  it("keeps the end card open when the night's report closes", () => {
    const open = step(
      playing(roofLater),
      { kind: "change", update: (m) => ({ mountain: lit(m), events: [] }) },
      1_000,
    ).session;
    const noted = step(open, { kind: "notice" }, 1_000).session;
    const closed = step(
      noted,
      { kind: "dismiss", what: "away" },
      2_000,
    ).session;
    expect(firstNotice(closed.news, "operational")?.building).toBe(
      "lightTower",
    );
  });

  it("does not announce a save that already runs it, nor a copy that comes into play rebased", () => {
    const loaded = step(playing(lit(roofLater)), { kind: "notice" }, 0).session;
    expect(noticesOf(loaded.news, "operational")).toEqual([]);
    const adopted = openBaselines(
      { ...playing(roofLater), mountain: lit(roofLater) },
      true,
    );
    const noted = step(adopted, { kind: "notice" }, 0).session;
    expect(noticesOf(noted.news, "operational")).toEqual([]);
  });

  it("announces a roof that went on in a break too short for a report", () => {
    fresh(() => {
      const nearly: Project = {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 2,
          arrived: { ...EMPTY_STOCK, stones: 999_990 },
          onSite: EMPTY_STOCK,
        },
      };
      const away = step(
        playing(mine(3, 1_000, nearly)),
        { kind: "away", since: 0 },
        30_000,
      ).session;
      expect(away.mountain.operational).toEqual(["lightTower"]);
      expect(firstNotice(away.news, "away")).toBeUndefined();
      const noted = step(away, { kind: "notice" }, 30_000).session;
      expect(noticesOf(noted.news, "operational")).toEqual([
        { kind: "operational", building: "lightTower" },
      ]);
    });
  });
});
