import { describe, expect, it } from "vitest";
import type { Trouble } from "./hazards";
import { haulagePose, haulageRest } from "./haulage";
import {
  MINE_VIEWS,
  machinesBeat,
  machinesRest,
  machinesStep,
  machinesView,
  mineView,
  plusSpot,
  puffSpot,
  veinSpot,
  windowBeats,
  windowScene,
  type Machines,
  type MachinesView,
  type WindowScene,
} from "./mine-window";
import { createMountain, type Mountain } from "./mountain";
import { MOUNTAIN_STONES } from "./scale";

const mined = (stones: number): Mountain => ({
  ...createMountain(),
  remaining: MOUNTAIN_STONES - stones,
});

const scene = (over: Partial<Mountain>, trouble?: Trouble): WindowScene =>
  windowScene({ ...createMountain(), ...over }, trouble);

const trouble = (tier: Trouble["tier"]): Trouble => ({
  kind: tier === "cart" ? "cave-in" : tier === "drill" ? "flood" : "jam",
  tier,
  startedAt: 0,
});

const DT = 0.01;

/**
 * Steps the machines in 0.01s steps and reads the view at each of `times`
 * (seconds from the start; keep them off the timers' edges).
 */
function viewsAt(
  start: Machines,
  at: WindowScene,
  times: readonly number[],
  random: () => number = () => 0.5,
): { readonly views: readonly MachinesView[]; readonly end: Machines } {
  let m = start;
  let t = 0;
  const views: MachinesView[] = [];
  for (const time of times) {
    while (t < time - DT / 2) {
      m = machinesStep(m, DT, at, random).next;
      t += DT;
    }
    views.push(machinesView(m, at));
  }
  return { views, end: m };
}

function after(
  start: Machines,
  at: WindowScene,
  seconds: number,
  random: () => number = () => 0.5,
): Machines {
  return viewsAt(start, at, [seconds], random).end;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

describe("mine window", () => {
  it("each band has its own view", () => {
    const urls = Object.values(MINE_VIEWS);
    expect(new Set(urls).size).toBe(4);
    expect(mineView("topsoil")).toContain("mine-view-topsoil");
    expect(mineView("granite")).toContain("mine-view-granite");
    expect(mineView("crystal")).toContain("mine-view-crystal");
    expect(mineView("heart")).toContain("mine-view-heart");
  });

  it("the scene reads counts, band and trouble", () => {
    expect(windowScene(createMountain(), undefined)).toEqual({
      band: "topsoil",
      run: false,
      drill: false,
      borer: false,
      machine: false,
      kid: false,
      carts: 0,
      drills: 0,
      borers: 0,
      trouble: undefined,
      legacy: false,
      rush: false,
    });
    const crew = scene({ helpers: 18, carts: 6 });
    expect(crew.run).toBe(true);
    expect(crew.carts).toBe(6);
    expect(scene({ helpers: 1 }).run).toBe(true);
    expect(scene({ kids: 1 }).run).toBe(true);
    expect(scene({ carts: 1 }).run).toBe(true);
    expect(windowScene(mined(25_000_000), undefined).band).toBe("granite");
    expect(windowScene(mined(60_000_000), undefined).band).toBe("crystal");
    const heart = windowScene(
      { ...mined(130_000_000), machines: 1, kids: 2, legacy: 1 },
      undefined,
    );
    expect(heart.band).toBe("heart");
    expect(heart.machine).toBe(true);
    expect(heart.kid).toBe(true);
    expect(heart.legacy).toBe(true);
    const machines = scene({ drills: 2, borers: 1 });
    expect(machines.drill).toBe(true);
    expect(machines.drills).toBe(2);
    expect(machines.borer).toBe(true);
    expect(machines.borers).toBe(1);
    expect(scene({ carts: 6 }, trouble("cart")).trouble).toBe("cart");
    // the Gold rush shows only with a clock, while it runs (#468)
    const rushing = { ...createMountain(), rushUntil: 90_000, rushBank: 900 };
    expect(windowScene(rushing, undefined).rush).toBe(false);
    expect(windowScene(rushing, undefined, 10_000).rush).toBe(true);
    expect(windowScene(rushing, undefined, 90_000).rush).toBe(false);

    const mountain = deepFreeze({
      ...mined(130_000_000),
      helpers: 18,
      carts: 6,
      machines: 1,
      legacy: 1,
    });
    const copy = structuredClone(mountain);
    windowScene(mountain, trouble("drill"));
    expect(mountain).toEqual(copy);
  });

  it("beats", () => {
    expect(windowBeats(undefined, scene({ carts: 6 }))).toEqual([]);
    expect(windowBeats(scene({ carts: 5 }), scene({ carts: 6 }))).toEqual([
      "cart",
    ]);
    expect(windowBeats(scene({ carts: 5 }), scene({ carts: 30 }))).toEqual([
      "cart",
    ]);
    expect(windowBeats(scene({ drills: 2 }), scene({ drills: 3 }))).toEqual([
      "drill",
    ]);
    expect(windowBeats(scene({ borers: 0 }), scene({ borers: 1 }))).toEqual([
      "first-borer",
    ]);
    expect(windowBeats(scene({ borers: 1 }), scene({ borers: 2 }))).toEqual([]);
    expect(windowBeats(scene({ carts: 6 }), scene({ carts: 0 }))).toEqual([]);
    expect(
      windowBeats(
        scene({ carts: 6, drills: 3, borers: 1 }),
        scene({ carts: 0, drills: 0, borers: 0 }),
      ),
    ).toEqual([]);
    expect(
      windowBeats(
        scene({ carts: 1, drills: 0, borers: 0 }),
        scene({ carts: 2, drills: 1, borers: 3 }),
      ),
    ).toEqual(["cart", "drill", "first-borer"]);
  });

  it("the vein's spot", () => {
    expect(veinSpot(0.35, 0.4)).toEqual({ left: 8, top: 26 });
    expect(veinSpot(0.65, 0.8)).toEqual({ left: 64, top: 48 });
    expect(veinSpot(0.5, 0.6)).toEqual({ left: 36, top: 37 });
    expect(veinSpot(0, 2)).toEqual({ left: 8, top: 48 });
    for (const x of [0, 0.35, 0.4, 0.5, 0.6, 0.65, 1]) {
      for (const y of [0, 0.4, 0.55, 0.7, 0.8, 1]) {
        const spot = veinSpot(x, y);
        expect(Number.isInteger(spot.left)).toBe(true);
        expect(Number.isInteger(spot.top)).toBe(true);
        expect(spot.left).toBeGreaterThanOrEqual(0);
        expect(spot.top).toBeGreaterThanOrEqual(0);
        expect(spot.left + 25).toBeLessThanOrEqual(92);
        expect(spot.top + 26).toBeLessThanOrEqual(76);
      }
    }
    // a bad place still lands inside the view
    const bad = veinSpot(Number.NaN, Number.NaN);
    expect(bad.left + 25).toBeLessThanOrEqual(92);
    expect(bad.top + 26).toBeLessThanOrEqual(76);
    expect(bad.left).toBeGreaterThanOrEqual(8);
    expect(bad.top).toBeGreaterThanOrEqual(26);
  });

  it("the dig puff", () => {
    expect(puffSpot(undefined)).toEqual({ x: 67, y: 30 });
    expect(puffSpot({ x: 50, y: 40 })).toEqual({ x: 42, y: 32 });
    expect(puffSpot({ x: 50.4, y: 39.6 })).toEqual({ x: 42, y: 32 });
    expect(puffSpot({ x: 0, y: 0 })).toEqual({ x: -2, y: -2 });
    expect(puffSpot({ x: 200, y: 200 })).toEqual({ x: 78, y: 62 });
    expect(plusSpot({ x: 67, y: 30 }, 10)).toEqual({ x: 70, y: 28 });
    expect(plusSpot({ x: 90, y: 0 }, 20)).toEqual({ x: 71, y: 1 });
  });

  it("the sheave and steam", () => {
    const quiet = scene({});
    const sheave = viewsAt(machinesRest(), quiet, [0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(sheave.views.map((v) => v.sheave)).toEqual([0, 1, 2, 3, 0]);
    // after a new cart it winds three times as fast for 1.6s
    const fast = viewsAt(
      machinesBeat(machinesRest(), "cart"),
      quiet,
      [0.1, 0.25, 0.35, 1.7, 1.9],
    );
    expect(fast.views.map((v) => v.sheave)).toEqual([1, 3, 1, 0, 1]);
    const steam = viewsAt(machinesRest(), quiet, [0.16, 0.48, 0.8, 1.12, 1.44]);
    expect(steam.views.map((v) => v.steam)).toEqual([0, 1, 2, 3, 0]);
  });

  it("a drill strokes six times, nine after a new one", () => {
    const one = scene({ drills: 1 });
    const strokes = viewsAt(
      machinesRest(),
      one,
      [0.07, 0.21, 0.35, 0.49, 0.63, 3.29, 3.43, 4.4, 5.3, 5.43, 5.57, 5.71],
    );
    expect(strokes.views.map((v) => v.drill)).toEqual([
      0, 1, 2, 1, 0, 1, 0, 0, 0, 0, 1, 2,
    ]);
    const nine = viewsAt(
      machinesBeat(machinesRest(), "drill"),
      one,
      [0.07, 0.21, 3.57, 5.0, 5.1, 7.0, 7.11, 7.25],
    );
    expect(nine.views.map((v) => v.drill)).toEqual([0, 1, 1, 1, 0, 0, 0, 1]);
    // no drill: frame 0
    const none = viewsAt(machinesRest(), scene({}), [0.21, 0.35]);
    expect(none.views.map((v) => v.drill)).toEqual([0, 0]);
  });

  it("a drill beat puffs dust at the drill", () => {
    const one = scene({ drills: 1 });
    const beat = machinesBeat(machinesRest(), "drill");
    const first = machinesStep(beat, 0.01, one, () => 0.5);
    expect(first.events).toEqual([{ kind: "fill", x: 69, y: 53 }]);
    expect(machinesStep(first.next, 0.01, one, () => 0.5).events).toEqual([]);
  });

  it("the run's fills come out as events", () => {
    const crew = scene({ helpers: 1, carts: 1 });
    let m = machinesRest();
    const fills: unknown[] = [];
    for (let i = 0; i < 1500; i += 1) {
      const step = machinesStep(m, DT, crew, () => 0.5);
      m = step.next;
      fills.push(...step.events);
    }
    expect(fills).toEqual([{ kind: "fill", x: 66, y: 29 }]);
  });

  it("a new cart's hoist winds the sheave fast", () => {
    const crew = scene({ helpers: 6, carts: 6 });
    const kinds = new Set<string>();
    let m = machinesBeat(machinesRest(), "cart");
    for (let i = 0; i < 5497; i += 1) {
      const step = machinesStep(m, DT, crew, () => 0.5);
      m = step.next;
      for (const event of step.events) {
        kinds.add(event.kind);
      }
    }
    // the hoist's sheave is spent on the sheave, not given out
    expect([...kinds]).toEqual(["fill"]);
    // 54.97s plus 1.6s and 3s wound three times as fast: 64.17s of turns
    expect(machinesView(m, crew).sheave).toBe(Math.floor(64.17 / 0.2) % 4);
    expect(machinesView(after(machinesRest(), crew, 54.97), crew).sheave).toBe(
      Math.floor(54.97 / 0.2) % 4,
    );
  });

  it("the run rests until there is someone on it", () => {
    const empty = scene({});
    const still = after(machinesRest(), empty, 3);
    expect(machinesView(still, empty).run).toEqual(haulagePose(haulageRest()));
    const crew = scene({ helpers: 1 });
    const moving = after(machinesRest(), crew, 3);
    expect(machinesView(moving, crew).run.tubX).toBeGreaterThan(14);
    // Start over: the run goes home
    const home = machinesStep(moving, 0.01, empty, () => 0.5).next;
    expect(machinesView(home, empty).run).toEqual(haulagePose(haulageRest()));
  });

  it("trouble stops its machine", () => {
    const flood = scene({ drills: 1 }, trouble("drill"));
    const flooded = viewsAt(machinesRest(), flood, [0.21, 0.35, 0.49, 2]);
    expect(flooded.views.map((v) => v.drill)).toEqual([0, 0, 0, 0]);

    const borer = scene({ borers: 1 });
    const jam = scene({ borers: 1 }, trouble("borer"));
    const cutting = after(machinesRest(), borer, 3.45);
    expect(machinesView(cutting, borer).borerDust).toBe(0);
    const jammed = viewsAt(cutting, jam, [0.01, 0.2, 0.4, 5]);
    for (const view of jammed.views) {
      expect(view.borer).toBe(0);
      expect(view.borerDust).toBeUndefined();
    }

    const crew = scene({ helpers: 6, carts: 6 });
    const caveIn = scene({ helpers: 6, carts: 6 }, trouble("cart"));
    const running = after(machinesRest(), crew, 5);
    const pose = machinesView(running, crew).run;
    expect(machinesView(running, crew).caveIn).toBeUndefined();
    expect(machinesView(running, caveIn).caveIn).toBe(0);
    const caving = viewsAt(running, caveIn, [0.06, 0.18, 0.3, 0.42, 3]);
    expect(caving.views.map((v) => v.caveIn)).toEqual([0, 1, 2, 3, 3]);
    for (const view of caving.views) {
      expect(view.run).toEqual(pose);
    }
    const cleared = machinesStep(caving.end, 0.01, crew, () => 0.5).next;
    expect(machinesView(cleared, crew).caveIn).toBeUndefined();
    // the next cave-in falls from the top again
    expect(viewsAt(cleared, caveIn, [0.06]).views[0]?.caveIn).toBe(0);
  });

  it("the Gold rush sparkles loop while it runs, and start over at the next (#468)", () => {
    const calm = scene({});
    const rush: WindowScene = { ...calm, rush: true };
    expect(machinesView(machinesRest(), calm).rush).toBeUndefined();
    expect(machinesView(machinesRest(), rush).rush).toBe(0);
    const sparkling = viewsAt(
      machinesRest(),
      rush,
      [0.08, 0.24, 0.4, 0.56, 0.72],
    );
    expect(sparkling.views.map((v) => v.rush)).toEqual([0, 1, 2, 3, 0]);
    const over = machinesStep(sparkling.end, 0.01, calm, () => 0.5).next;
    expect(machinesView(over, calm).rush).toBeUndefined();
    expect(viewsAt(over, rush, [0.08]).views[0]?.rush).toBe(0);
  });

  it("the tarp comes off the first borer", () => {
    const none = scene({});
    expect(machinesView(machinesRest(), none).tarp).toEqual({ x: 7, y: 55 });
    expect(machinesView(after(machinesRest(), none, 2), none).tarp).toEqual({
      x: 7,
      y: 55,
    });

    const one = scene({ borers: 1 });
    const beat = machinesBeat(machinesRest(), "first-borer");
    expect(machinesView(beat, one).tarp).toEqual({ x: 7, y: 55 });
    const drag = viewsAt(
      beat,
      one,
      [0.25, 0.35, 0.48, 0.57, 0.63, 1.53, 2.49, 2.55],
    );
    expect(drag.views.map((v) => v.tarp)).toEqual([
      { x: 7, y: 55 },
      { x: 7, y: 54 },
      { x: 7, y: 53 },
      { x: 6, y: 53 },
      { x: 5, y: 53 },
      { x: -10, y: 53 },
      { x: -26, y: 53 },
      undefined,
    ]);
    for (const view of drag.views.slice(0, -1)) {
      expect(view.borer).toBe(0);
      expect(view.borerDust).toBeUndefined();
    }

    // the borer then cuts, with a little dust now and then
    const off = after(machinesRest(), one, 0); // a borer bought before the window opened
    expect(machinesView(off, one).tarp).toBeUndefined();
    const cut = viewsAt(
      drag.end,
      one,
      [0.08, 0.24, 0.4, 0.56, 3.3, 3.45, 3.53, 3.62, 3.71, 3.8, 7.2, 7.3],
      () => 0.5,
    );
    expect(cut.views.map((v) => v.borer).slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(cut.views.map((v) => v.borerDust).slice(4)).toEqual([
      undefined,
      0,
      1,
      2,
      3,
      undefined,
      undefined,
      0,
    ]);
    const later = viewsAt(drag.end, one, [7.1, 7.6, 7.75], () => 0.99);
    expect(later.views.map((v) => v.borerDust)).toEqual([
      undefined,
      undefined,
      0,
    ]);
  });

  it("the tarp comes back after Start over", () => {
    const one = scene({ borers: 1 });
    const none = scene({});
    const gone = after(machinesBeat(machinesRest(), "first-borer"), one, 3);
    expect(machinesView(gone, one).tarp).toBeUndefined();
    expect(machinesView(gone, none).tarp).toEqual({ x: 7, y: 55 });
    const reset = machinesStep(gone, 0.01, none, () => 0.5).next;
    expect(machinesView(reset, none).tarp).toEqual({ x: 7, y: 55 });
    expect(machinesView(reset, none).borer).toBe(0);

    // Start over in the middle of the drag
    const midway = after(machinesBeat(machinesRest(), "first-borer"), one, 1);
    expect(machinesView(midway, one).tarp?.x).toBeLessThan(7);
    const back = machinesStep(midway, 0.01, none, () => 0.5).next;
    expect(machinesView(back, none).tarp).toEqual({ x: 7, y: 55 });

    // and the next first borer drags it off again
    const again = viewsAt(machinesBeat(back, "first-borer"), one, [0.35]);
    expect(again.views[0]?.tarp).toEqual({ x: 7, y: 54 });
  });

  it("the vein glints", () => {
    const glint = viewsAt(
      machinesRest(),
      scene({}),
      [0.09, 0.27, 0.45, 0.63, 0.81],
    );
    expect(glint.views.map((v) => v.vein)).toEqual([0, 1, 2, 3, 0]);
  });

  it("time that jumps", () => {
    const crew = scene({ helpers: 6, carts: 6, drills: 1, borers: 1 });
    const rest = machinesView(machinesRest(), crew).run;
    for (const dt of [0.1, 5, 3_600, Number.POSITIVE_INFINITY]) {
      const run = machinesView(
        machinesStep(machinesRest(), dt, crew, () => 0.5).next,
        crew,
      ).run;
      expect(Math.abs(run.tubX - rest.tubX)).toBeLessThanOrEqual(1);
      expect(Math.abs(run.tubY - rest.tubY)).toBeLessThanOrEqual(1);
      expect(Math.abs(run.minerX - rest.minerX)).toBeLessThanOrEqual(1);
      expect(Math.abs(run.cageY - rest.cageY)).toBeLessThanOrEqual(1);
    }
    // hours away moves the machines no further than one capped step
    const capped = machinesStep(machinesRest(), 0.1, crew, () => 0.5).next;
    const hours = machinesStep(machinesRest(), 7_200, crew, () => 0.5).next;
    expect(machinesView(hours, crew)).toEqual(machinesView(capped, crew));
    // a bad dt changes nothing
    for (const dt of [0, -1, Number.NaN]) {
      const step = machinesStep(machinesRest(), dt, crew, () => 0.5);
      expect(machinesView(step.next, crew)).toEqual(
        machinesView(machinesRest(), crew),
      );
      expect(step.events).toEqual([]);
    }
  });

  it("never changes the machines it is given", () => {
    const crew = scene({ helpers: 6, carts: 6, drills: 1, borers: 1 });
    const m = deepFreeze(after(machinesRest(), crew, 4));
    const before = machinesView(m, crew);
    machinesStep(m, 0.1, crew, () => 0.5);
    machinesBeat(m, "cart");
    machinesBeat(m, "drill");
    machinesBeat(m, "first-borer");
    expect(machinesView(m, crew)).toEqual(before);
  });
});
