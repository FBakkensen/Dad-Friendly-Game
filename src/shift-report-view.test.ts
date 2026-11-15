import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import {
  accrueAway,
  createMountain,
  type AwayReport,
  type NightReport,
} from "./mountain";
import { shiftReport, type ShiftReport } from "./shift-report-view";
import { EMPTY_STOCK } from "./stock";

/** The shift report's words (#663; spec, "The cards"; the prototype's `away`). */
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const NIGHT: NightReport = {
  producedMs: 8 * HOUR,
  stop: "clock",
  deadMs: 0,
  produced: { ...EMPTY_STOCK, stones: 9_720 },
  delivered: { ...EMPTY_STOCK, stones: 9_720 },
  steps: [],
  payFrom: 0.3,
  payTo: 0.3,
};

/** A fresh night's report: away this long, mined this much, and these facts. */
function away(
  awayMs: number,
  mined: number,
  night: Partial<NightReport> = {},
): AwayReport & { readonly night: NightReport } {
  return {
    mined,
    awayMs,
    heldForRush: 0,
    paidMs: Math.min(awayMs, 8 * HOUR),
    capped: awayMs > 8 * HOUR,
    heart: 1,
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    night: {
      ...NIGHT,
      produced: { ...EMPTY_STOCK, stones: mined },
      ...night,
    },
  };
}

const words = (report: ShiftReport): string[] => [
  report.head,
  report.bar.left,
  report.bar.right,
  ...report.lines,
];

/** It says what happened, never what held it back or what to buy. */
function expectNoAdvice(report: ShiftReport): void {
  for (const line of words(report)) {
    expect(line).not.toMatch(/full|hand|limit|bottleneck|buy/i);
  }
}

describe("the shift report (#663)", () => {
  it("tells a night the clock stopped: the bar, what came in, what was delivered, and why", () => {
    const report = shiftReport(away(9 * HOUR, 34_560));
    expect(report).toEqual({
      title: "Shift report",
      head: "Unattended 9 h. Night shift output: 30%.",
      // The prototype's `dur`: an hour is under 90 min, so "60 min".
      bar: { produced: 0.89, left: "production 8 h", right: "idle 60 min" },
      lines: [
        "Produced: 34.5K stone.",
        "Transport delivered to orders: 9,720 stone.",
        "A night shift runs 8 h. Production stopped after that.",
      ],
      marks: [],
      toStockyard: false,
      key: "Resume",
    });
    expectNoAdvice(report);
  });

  it("has a bar that is all production for a short night, and no clock line", () => {
    const report = shiftReport(
      away(2 * HOUR, 19_440, {
        producedMs: 2 * HOUR,
        stop: "none",
        delivered: EMPTY_STOCK,
      }),
    );
    expect(report.head).toBe("Unattended 2 h. Night shift output: 30%.");
    expect(report.bar).toEqual({
      produced: 1,
      left: "production, no downtime",
      right: "",
    });
    expect(report.lines).toEqual(["Produced: 19.4K stone."]);
    expectNoAdvice(report);
  });

  it("says no output when the mine stood, names no reason, and keeps a sliver of bar", () => {
    const report = shiftReport(
      away(12 * HOUR, 0, { producedMs: 0, stop: "none" }),
    );
    expect(report.bar).toEqual({
      produced: 0.03,
      left: "production 0 s",
      right: "idle 12 h",
    });
    expect(report.lines).toEqual([
      "No output.",
      "Transport delivered to orders: 9,720 stone.",
    ]);
    expectNoAdvice(report);
  });

  it("lists each step built in, and the roof with what it lit", () => {
    const report = shiftReport(
      away(9 * HOUR, 40_000, {
        steps: [
          { building: "lightTower", step: 0, atMs: HOUR },
          { building: "lightTower", step: 1, atMs: 3 * HOUR },
          { building: "lightTower", step: 2, atMs: 5 * HOUR },
        ],
        payTo: 0.45,
        litAtMs: 5 * HOUR,
      }),
    );
    expect(report.head).toBe(
      "Unattended 9 h. Night shift output 30%, and 45% from the Light Tower's roof.",
    );
    expect(report.lines).toEqual([
      "Produced: 40K stone.",
      "Transport delivered to orders: 9,720 stone.",
      "The Light Tower: foundation complete.",
      "The Light Tower: structure complete.",
      "The Light Tower: operational. Night shift output 45%, up from 30%.",
      "A night shift runs 8 h. Production stopped after that.",
    ]);
    expectNoAdvice(report);
  });

  it("says a roof went on without an output line when the output did not change", () => {
    const report = shiftReport(
      away(9 * HOUR, 40_000, {
        steps: [{ building: "lightTower", step: 2, atMs: HOUR }],
      }),
    );
    expect(report.head).toBe("Unattended 9 h. Night shift output: 30%.");
    expect(report.lines).toContain("The Light Tower: operational.");
  });

  it("says how long as the prototype does", () => {
    const head = (awayMs: number): string =>
      shiftReport(away(awayMs, 0, { stop: "none", producedMs: awayMs })).head;
    expect(head(65_000)).toBe("Unattended 65 s. Night shift output: 30%.");
    expect(head(89_400)).toBe("Unattended 89 s. Night shift output: 30%.");
    expect(head(90_000)).toBe("Unattended 2 min. Night shift output: 30%.");
    expect(head(89 * MINUTE)).toBe(
      "Unattended 89 min. Night shift output: 30%.",
    );
    expect(head(90 * MINUTE)).toBe(
      "Unattended 1 h 30 min. Night shift output: 30%.",
    );
    expect(head(9 * HOUR + 20_000)).toBe(
      "Unattended 9 h. Night shift output: 30%.",
    );
  });

  it("leaves out the clock line when the bar shows no downtime", () => {
    const report = shiftReport(
      away(8 * HOUR + 5 * MINUTE, 1_000, { producedMs: 8 * HOUR }),
    );
    expect(report.bar).toMatchObject({ left: "production, no downtime" });
    expect(report.lines.join(" ")).not.toMatch(/stopped/);
  });

  it("reads a real night from the rules", () => {
    withFactors({ [FRESH_OFF]: 0 }, () => {
      const start = createMountain();
      const night = accrueAway({
        mountain: {
          ...start,
          owned: { ...start.owned, helper: 12 },
          jobs: {
            drilling: 3,
            haulage: 3,
            hoisting: 3,
            driving: 1,
            building: 2,
            kilns: 0,
          },
          project: {
            kind: "delivering",
            site: {
              building: "lightTower",
              step: 2,
              arrived: { ...EMPTY_STOCK, stones: 999_000 },
              onSite: EMPTY_STOCK,
            },
          },
          stock: { ...start.stock, stones: 1_000 },
        },
        lastSeen: 0,
        now: 12 * HOUR,
      });
      const { report } = night;
      if (report.night === undefined) {
        throw new Error("a fresh night has its facts");
      }
      expect(shiftReport({ ...report, night: report.night })).toEqual({
        title: "Shift report",
        head: "Unattended 12 h. Night shift output 30%, and 45% from the Light Tower's roof.",
        bar: { produced: 0.67, left: "production 8 h", right: "idle 4 h" },
        lines: [
          "Produced: 116.1K stone.",
          "Transport delivered to orders: 1,000 stone.",
          "The Light Tower: operational. Night shift output 45%, up from 30%.",
          "A night shift runs 8 h. Production stopped after that.",
        ],
        marks: [],
      toStockyard: false,
      key: "Resume",
      });
    });
  });
});

describe("the shift report once the stockyard is open (#671)", () => {
  it("says what came in of each good, when each stockpile filled, and that the stockyard stopped it", () => {
    const report = shiftReport(
      away(12 * HOUR, 30_000, {
        producedMs: 5 * HOUR,
        stop: "stockyard",
        produced: { ...EMPTY_STOCK, stones: 9_720, brick: 1_200 },
        delivered: EMPTY_STOCK,
        fullAtMs: { brick: 3 * HOUR + 20 * MINUTE, stones: 5 * HOUR },
        payFrom: 0.45,
        payTo: 0.45,
      }),
    );
    expect(report.lines).toEqual([
      "Produced: 9,720 stone, 1,200 brick.",
      "Stockyard full: production stopped.",
    ]);
    expect(report.marks).toEqual([
      "Brick full at 3 h 20 min",
      "Stone full at 5 h",
    ]);
    expect(report.toStockyard).toBe(true);
    for (const line of words(report)) {
      expect(line).not.toMatch(/hand|limit|bottleneck|buy/i);
    }
  });

  it("has no stockyard key or marks on a night nothing filled", () => {
    const report = shiftReport(
      away(2 * HOUR, 19_440, { producedMs: 2 * HOUR, stop: "none" }),
    );
    expect(report.marks).toEqual([]);
    expect(report.toStockyard).toBe(false);
  });
});
