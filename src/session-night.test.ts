import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
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
import { shaftPrice } from "./mine-levels";
import { levels, partThree } from "./part-three.harness";

/** The session greets a fresh mine's night by what happened in it (#663). */
const fresh = <T>(body: () => T): T => withFactors({}, body);

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
      kilns: 0,
      graniteDrilling: 0,
      graniteHaulage: 0,
      saws: 0,
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
  it("greets a short night with the shift report", () => {
    fresh(() => {
      const session = back(mine(3, 0, { kind: "unordered" }), 3 * MINUTE);
      const report = firstNotice(session.news, "away")?.report;
      expect(report?.mined).toBe(486);
      expect(report?.night.producedMs).toBe(3 * MINUTE);
    });
  });

  it("greets a night where only transport worked", () => {
    fresh(() => {
      // Nobody on the stages: nothing mined, and the wagon delivers from the pocket.
      const session = back(mine(0, 10_000, foundation), 10 * MINUTE);
      const report = firstNotice(session.news, "away")?.report;
      expect(report?.mined).toBe(0);
      expect(report?.night.delivered.stones).toBe(1_620);
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
      expect(report?.night.steps).toEqual([
        { building: "lightTower", step: 0, atMs: 21_000 },
      ]);
    });
  });

  it("greets a night on a live return, after the open was greeted", () => {
    fresh(() => {
      const open = {
        ...playing(mine(3, 0, { kind: "unordered" })),
        lastSeen: 0,
      };
      const back = step(open, { kind: "tick" }, 9 * 60 * MINUTE).session;
      expect(firstNotice(back.news, "away")?.report.night).toBeDefined();
    });
  });

  it("says nothing when nothing happened, or after a short break", () => {
    fresh(() => {
      const still = back(mine(0, 10_000, { kind: "unordered" }), 10 * MINUTE);
      expect(firstNotice(still.news, "away")).toBeUndefined();
      expect(still.lastSeen).toBe(10 * MINUTE);
      const quick = back(mine(3, 0, { kind: "unordered" }), 50_000);
      expect(firstNotice(quick.news, "away")).toBeUndefined();
      expect(quick.mountain.stock.stones).toBe(135);
    });
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

describe("announcing the Granite when the shaft is sunk (#754)", () => {
  /** Part 3's mine with the Light Tower up, the shaft unsunk, and its price in stock. */
  const ready = (): Mountain =>
    levels({
      sunk: false,
      topsoil: 3,
      hoisting: 3,
      stock: Object.fromEntries(
        shaftPrice().map(({ good, amount }) => [good, amount]),
      ),
    });
  const sink = { kind: "move", move: { kind: "sinkShaft" } } as const;
  const sunk = (): Mountain => levels({ topsoil: 3, hoisting: 3 });
  const granite = { kind: "level", level: "granite" } as const;

  it("announces the Granite once when the shaft is sunk", () => {
    partThree(() => {
      const open = playing(ready());
      const moved = step(open, sink, 1_000).session;
      expect(moved.mountain.mineLevels.granite).toBeDefined();
      const noted = step(moved, { kind: "notice" }, 1_000).session;
      expect(noticesOf(noted.news, "level")).toEqual([granite]);
      const again = step(noted, { kind: "notice" }, 2_000).session;
      expect(noticesOf(again.news, "level")).toEqual([granite]);
      const closed = step(again, { kind: "dismiss", what: "level" }, 3_000);
      expect(noticesOf(closed.session.news, "level")).toEqual([]);
      const after = step(closed.session, { kind: "notice" }, 4_000).session;
      expect(noticesOf(after.news, "level")).toEqual([]);
    });
  });

  it("does not announce a Granite already sunk at load, nor a copy that comes into play rebased", () => {
    partThree(() => {
      const loaded = step(playing(sunk()), { kind: "notice" }, 0).session;
      expect(noticesOf(loaded.news, "level")).toEqual([]);
      const adopted = openBaselines(
        { ...playing(ready()), mountain: sunk() },
        true,
      );
      const noted = step(adopted, { kind: "notice" }, 0).session;
      expect(noticesOf(noted.news, "level")).toEqual([]);
    });
  });

  it("keeps the Granite's notice when the night's report closes", () => {
    partThree(() => {
      // An empty stock: the shaft cannot be paid for during the night, so it
      // is paid for and sunk after the report is up.
      const night = step(
        playing({ ...ready(), stock: EMPTY_STOCK }),
        { kind: "away", since: 0 },
        9 * 60 * MINUTE,
      ).session;
      expect(firstNotice(night.news, "away")).toBeDefined();
      const paid = step(
        night,
        {
          kind: "change",
          update: (m) => ({
            mountain: { ...m, stock: ready().stock },
            events: [],
          }),
        },
        9 * 60 * MINUTE,
      ).session;
      const moved = step(paid, sink, 9 * 60 * MINUTE).session;
      expect(moved.mountain.mineLevels.granite).toBeDefined();
      const noted = step(moved, { kind: "notice" }, 9 * 60 * MINUTE).session;
      expect(noticesOf(noted.news, "level")).toEqual([granite]);
      const closed = step(
        noted,
        { kind: "dismiss", what: "away" },
        9 * 60 * MINUTE,
      ).session;
      expect(firstNotice(closed.news, "away")).toBeUndefined();
      expect(noticesOf(closed.news, "level")).toEqual([granite]);
    });
  });

  it("forgets an unread Granite on a fresh open, and a new run starts with none", () => {
    partThree(() => {
      const moved = step(playing(ready()), sink, 1_000).session;
      const noted = step(moved, { kind: "notice" }, 1_000).session;
      const begun = step(
        noted,
        { kind: "begin", mountain: ready() },
        2_000,
      ).session;
      expect(noticesOf(begun.news, "level")).toEqual([]);
    });
  });
});
