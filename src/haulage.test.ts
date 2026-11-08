import { describe, expect, it } from "vitest";
import {
  haulageNewCart,
  haulagePose,
  haulageRest,
  haulageStep,
  type Haulage,
  type HaulageEvent,
  type HaulagePose,
} from "./haulage";

type Tick = {
  readonly t: number;
  readonly pose: HaulagePose;
  readonly events: readonly HaulageEvent[];
};

/** Steps the run for `seconds`, recording the pose and events after each step. */
function run(
  start: Haulage,
  seconds: number,
  dt = 0.1,
  at?: { readonly t: number; readonly change: (h: Haulage) => Haulage },
): { readonly end: Haulage; readonly ticks: readonly Tick[] } {
  let h = start;
  const ticks: Tick[] = [];
  const steps = Math.round(seconds / dt);
  for (let i = 1; i <= steps; i += 1) {
    const t = Math.round(i * dt * 1000) / 1000;
    const { next, events } = haulageStep(h, dt, false);
    h = next;
    if (at && Math.abs(t - at.t) < dt / 2) {
      h = at.change(h);
    }
    ticks.push({ t, pose: haulagePose(h), events });
  }
  return { end: h, ticks };
}

function eventsOf(ticks: readonly Tick[], kind: HaulageEvent["kind"]) {
  return ticks.flatMap((tick) =>
    tick.events
      .filter((event) => event.kind === kind)
      .map((event) => ({ t: tick.t, event })),
  );
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

describe("haulage", () => {
  it("rests at the cage", () => {
    expect(haulagePose(haulageRest())).toEqual({
      tubX: 14,
      tubY: 8,
      full: false,
      minerX: 4,
      minerY: -1,
      minerFrame: 0,
      minerBehind: false,
      cageX: 11,
      cageY: -3,
    });
  });

  it("pushes out one art px every 0.2s", () => {
    const { ticks } = run(haulageRest(), 9);
    const arrive = ticks.find((tick) => tick.pose.tubX === 58);
    expect(arrive?.t).toBeGreaterThanOrEqual(8.7);
    expect(arrive?.t).toBeLessThanOrEqual(8.9);
    let x = 14;
    for (const tick of ticks) {
      expect(Math.abs(tick.pose.tubX - x)).toBeLessThanOrEqual(1);
      x = tick.pose.tubX;
    }
    // he pushes east, hands on the tub's end
    const pushing = ticks[20]?.pose;
    expect(pushing?.minerX).toBe((pushing?.tubX ?? 0) - 10);
    expect(pushing?.minerFrame).toBeLessThanOrEqual(3);
    expect(pushing?.minerBehind).toBe(false);
  });

  it("heaped at the face", () => {
    const { ticks } = run(haulageRest(), 15);
    const heaped = ticks.find((tick) => tick.pose.full);
    expect(heaped?.t).toBeGreaterThanOrEqual(10.1);
    expect(heaped?.t).toBeLessThanOrEqual(10.4);
    expect(heaped?.pose.tubY).toBe(5);
    expect(heaped?.pose.minerBehind).toBe(true);
    const fills = eventsOf(ticks, "fill");
    expect(fills).toHaveLength(1);
    expect(fills[0]?.event).toEqual({ kind: "fill", x: 66, y: 29 });
    expect(fills[0]?.t).toBe(heaped?.t);
  });

  it("tips at the cage", () => {
    const { end, ticks } = run(haulageRest(), 25);
    const heaped = ticks.findIndex((tick) => tick.pose.full);
    const tipped = ticks.slice(heaped).find((tick) => !tick.pose.full);
    expect(tipped?.t).toBeGreaterThanOrEqual(22.0);
    expect(tipped?.t).toBeLessThanOrEqual(22.6);
    expect(tipped?.pose.tubX).toBe(14);
    expect(tipped?.pose.tubY).toBe(8);
    const fills = eventsOf(ticks, "fill");
    expect(fills.map((fill) => fill.event)).toEqual([
      { kind: "fill", x: 66, y: 29 },
      { kind: "fill", x: 10, y: 30 },
    ]);
    expect(fills[1]?.t).toBe(tipped?.t);
    // and then he takes it out again
    const after = run(end, 4);
    expect(after.ticks.at(-1)?.pose.tubX).toBeGreaterThan(14);
  });

  it("a new cart rides the cage", () => {
    const { ticks } = run(haulageNewCart(haulageRest()), 55);
    const sheaves = eventsOf(ticks, "sheave");
    expect(sheaves.map((sheave) => sheave.event)).toEqual([
      { kind: "sheave", seconds: 3 },
    ]);
    const visitStart = ticks.findIndex(
      (tick, i) => i > 50 && tick.pose.tubX === 14,
    );
    expect(ticks[visitStart]?.t).toBeGreaterThan(20);
    expect(sheaves[0]?.t).toBeGreaterThan(ticks[visitStart]?.t ?? 0);
    const visitEnd = ticks.findIndex(
      (tick, i) => i > visitStart && tick.pose.tubX > 14,
    );
    const visit = ticks.slice(visitStart, visitEnd);
    expect(Math.min(...visit.map((tick) => tick.pose.cageY))).toBe(-25);
    expect(visit.at(-1)?.pose.cageY).toBe(-3);
    for (const tick of visit) {
      // the tub rides on the cage's deck
      expect([8, 11]).toContain(tick.pose.tubY - tick.pose.cageY);
    }
    const down = visit.findIndex((tick) => tick.pose.cageY === -25);
    const landed = visit.slice(down).find((tick) => tick.pose.cageY === -3);
    expect(landed?.pose.full).toBe(false);
    expect(landed?.pose.tubY).toBe(8);
    // no tip at the handover: the only fills are the faces and the next tip
    const fillsInVisit = eventsOf(visit, "fill");
    expect(fillsInVisit).toEqual([]);
    // the run goes out again, and the next cage visit tips as usual
    expect(visitEnd).toBeGreaterThan(visitStart);
    const fills = eventsOf(ticks, "fill").map((fill) => fill.event);
    expect(fills).toEqual([
      { kind: "fill", x: 66, y: 29 },
      { kind: "fill", x: 66, y: 29 },
      { kind: "fill", x: 10, y: 30 },
    ]);
  });

  it("a new cart during a tip waits for the next cage visit", () => {
    const { ticks } = run(haulageRest(), 60, 0.1, {
      t: 21.5,
      change: haulageNewCart,
    });
    const fills = eventsOf(ticks, "fill");
    expect(fills[1]?.event).toEqual({ kind: "fill", x: 10, y: 30 });
    const sheaves = eventsOf(ticks, "sheave");
    expect(sheaves).toHaveLength(1);
    expect(sheaves[0]?.t).toBeGreaterThan(40);
  });

  it("hold freezes the run", () => {
    const mid = run(haulageRest(), 3).end;
    const before = haulagePose(mid);
    let h = mid;
    for (let i = 0; i < 50; i += 1) {
      const { next, events } = haulageStep(h, 0.1, true);
      expect(events).toEqual([]);
      h = next;
    }
    expect(haulagePose(h)).toEqual(before);
    expect(haulagePose(haulageStep(h, 0.1, false).next)).toEqual(
      haulagePose(haulageStep(mid, 0.1, false).next),
    );
  });

  it("whole pixels, real frames", () => {
    for (const dt of [1 / 60, 0.1]) {
      const { ticks } = run(haulageRest(), 120, dt, {
        t: 30,
        change: haulageNewCart,
      });
      expect(eventsOf(ticks, "sheave")).toHaveLength(1);
      for (const { pose } of ticks) {
        for (const value of [
          pose.tubX,
          pose.tubY,
          pose.minerX,
          pose.minerY,
          pose.minerFrame,
          pose.cageX,
          pose.cageY,
        ]) {
          expect(Number.isInteger(value)).toBe(true);
        }
        expect(pose.minerFrame).toBeGreaterThanOrEqual(0);
        expect(pose.minerFrame).toBeLessThanOrEqual(17);
      }
    }
  });

  it("a long gap is one capped 0.1s step: no skipped face or cage", () => {
    let h = haulageNewCart(haulageRest());
    let x = 14;
    let faces = 0;
    let cageTop = -3;
    for (let i = 0; i < 600; i += 1) {
      const gap = haulageStep(h, 3 * 3600, false);
      const tenth = haulageStep(h, 0.1, false);
      expect(haulagePose(gap.next)).toEqual(haulagePose(tenth.next));
      expect(gap.events).toEqual(tenth.events);
      h = gap.next;
      const pose = haulagePose(h);
      expect(Math.abs(pose.tubX - x)).toBeLessThanOrEqual(1);
      if (pose.tubX === 58 && x === 57) {
        faces += 1;
      }
      cageTop = Math.min(cageTop, pose.cageY);
      x = pose.tubX;
    }
    expect(faces).toBeGreaterThanOrEqual(2);
    expect(cageTop).toBe(-25);
  });

  it("a bad dt does nothing", () => {
    const mid = run(haulageRest(), 3).end;
    for (const dt of [Number.NaN, -1, 0]) {
      const { next, events } = haulageStep(mid, dt, false);
      expect(haulagePose(next)).toEqual(haulagePose(mid));
      expect(events).toEqual([]);
      // and it leaves no trace for the steps that follow
      expect(run(next, 10).ticks).toEqual(run(mid, 10).ticks);
    }
  });

  it("is deterministic and never mutates its argument", () => {
    const a = run(haulageRest(), 60, 1 / 60, { t: 5, change: haulageNewCart });
    const b = run(haulageRest(), 60, 1 / 60, { t: 5, change: haulageNewCart });
    expect(a.ticks).toEqual(b.ticks);

    let h = deepFreeze(haulageNewCart(haulageRest()));
    for (let i = 0; i < 600; i += 1) {
      h = deepFreeze(haulageStep(h, 0.1, false).next);
    }
    const rest = haulageRest();
    const before = haulagePose(rest);
    haulageStep(rest, 0.1, false);
    haulageNewCart(rest);
    expect(haulagePose(rest)).toEqual(before);
  });
});
