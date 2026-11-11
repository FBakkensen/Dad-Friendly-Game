/* global console */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failures, sections, table } from "./registry.mjs";

/** table() turns data into section() and check() calls (#441). */
const PHONE = [390, 844];
const PC = [1280, 800];
let logged = [];

beforeEach(() => {
  sections.length = 0;
  failures.length = 0;
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line) => {
    logged.push(line);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const runAll = async () => {
  for (const { run } of sections) await run();
};

/** A page opener that records its opens and closes in `events`. */
const opener = (events) => async (viewport, scenario) => {
  events.push(`open ${String(viewport[0])} ${scenario.name}`);
  return {
    page: { scenario },
    close: async () => {
      events.push(`close ${String(viewport[0])} ${scenario.name}`);
    },
  };
};

describe("table", () => {
  it("per scenario registers one section per screen and scenario, screen-major", async () => {
    const events = [];
    table({
      screens: [PHONE, PC],
      scenarios: [{ name: "a" }, { name: "b" }],
      section: (vp, s) => `t ${JSON.stringify(vp)} ${s.name}`,
      prefix: ({ size, scenario }) => `${size} ${scenario.name}:`,
      open: opener(events),
      expect: [{ run: () => [[true, "fine"]] }],
    });
    expect(sections.map((s) => s.label)).toEqual([
      "t [390,844] a",
      "t [390,844] b",
      "t [1280,800] a",
      "t [1280,800] b",
    ]);
    await sections[3].run();
    expect(events).toEqual(["open 1280 b", "close 1280 b"]);
    expect(logged).toEqual(["ok   1280x800 b: fine"]);
  });

  it("per screen registers one section per screen that runs every scenario in order", async () => {
    const events = [];
    table({
      per: "screen",
      screens: [PHONE, PC],
      scenarios: [{ name: "a" }, { name: "b" }],
      section: (vp) => `t ${JSON.stringify(vp)} rail`,
      prefix: ({ size, scenario }) => `${size} ${scenario.name}:`,
      open: opener(events),
      expect: [],
    });
    expect(sections.map((s) => s.label)).toEqual([
      "t [390,844] rail",
      "t [1280,800] rail",
    ]);
    await sections[0].run();
    expect(events).toEqual([
      "open 390 a",
      "close 390 a",
      "open 390 b",
      "close 390 b",
    ]);
  });

  it("records each [ok, tail] pair as a check under the prefix", async () => {
    table({
      screens: [PHONE],
      scenarios: [{ name: "a" }],
      section: () => "t",
      prefix: ({ size, scenario, row }) =>
        `${size} ${String(row.name)} drawer, ${scenario.name}:`,
      rows: [{ name: "buys" }],
      open: opener([]),
      expect: [
        {
          run: (at) => [
            [true, `one at ${at.size}`],
            [false, `two for ${at.row.name}`],
          ],
        },
        { run: async () => [[true, "three"]] },
      ],
    });
    await runAll();
    expect(logged).toEqual([
      "ok   390x844 buys drawer, a: one at 390x844",
      "FAIL 390x844 buys drawer, a: two for buys",
      "ok   390x844 buys drawer, a: three",
    ]);
    expect(failures).toEqual(["390x844 buys drawer, a: two for buys"]);
  });

  it("skips a row or an expectation whose when is false", async () => {
    table({
      screens: [PHONE],
      scenarios: [{ name: "a" }, { name: "b" }],
      section: () => "t",
      prefix: ({ scenario, row }) => `${row.name} ${scenario.name}:`,
      rows: [
        { name: "x" },
        { name: "y", when: (scenario) => scenario.name === "b" },
      ],
      open: opener([]),
      expect: [
        { run: () => [[true, "always"]] },
        {
          when: (at) => at.scenario.name === "a",
          run: () => [[true, "a only"]],
        },
      ],
    });
    await runAll();
    expect(logged).toEqual([
      "ok   x a: always",
      "ok   x a: a only",
      "ok   x b: always",
      "ok   y b: always",
    ]);
  });

  it("defaults to one empty row and runs each row's enter before and leave after", async () => {
    const events = [];
    table({
      screens: [PHONE],
      scenarios: [{ name: "a" }],
      section: () => "t",
      prefix: () => "p:",
      open: opener(events),
      expect: [
        {
          run: (at) => {
            events.push(`expect ${JSON.stringify(at.row)}`);
            return [];
          },
        },
      ],
    });
    await runAll();
    expect(events).toEqual(["open 390 a", "expect {}", "close 390 a"]);

    sections.length = 0;
    events.length = 0;
    table({
      screens: [PHONE],
      scenarios: [{ name: "a" }],
      rows: [
        {
          name: "r",
          enter: (at) => events.push(`enter ${at.row.name}`),
          leave: (at) => events.push(`leave ${at.row.name}`),
        },
      ],
      section: () => "t",
      prefix: () => "p:",
      open: opener(events),
      expect: [
        {
          run: () => {
            events.push("expect");
            return [];
          },
        },
      ],
    });
    await runAll();
    expect(events).toEqual([
      "open 390 a",
      "enter r",
      "expect",
      "leave r",
      "close 390 a",
    ]);
  });

  it("closes the page even when an expectation throws", async () => {
    const events = [];
    table({
      screens: [PHONE],
      scenarios: [{ name: "a" }],
      section: () => "t",
      prefix: () => "p:",
      open: opener(events),
      expect: [
        {
          run: () => {
            throw new Error("boom");
          },
        },
      ],
    });
    await expect(runAll()).rejects.toThrow("boom");
    expect(events).toEqual(["open 390 a", "close 390 a"]);
  });

  it("calls after(viewport) once each screen's sections are registered", () => {
    table({
      screens: [PHONE, PC],
      scenarios: [{ name: "a" }],
      section: (vp, s) => `t ${JSON.stringify(vp)} ${s.name}`,
      prefix: () => "p:",
      open: opener([]),
      expect: [],
      after: (vp) => {
        sections.push({ label: `flow ${JSON.stringify(vp)}`, run: () => {} });
      },
    });
    expect(sections.map((s) => s.label)).toEqual([
      "t [390,844] a",
      "flow [390,844]",
      "t [1280,800] a",
      "flow [1280,800]",
    ]);
  });
});
