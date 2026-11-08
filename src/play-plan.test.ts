import { describe, expect, it } from "vitest";
import {
  PLAY_USAGE,
  actionSlug,
  isPlayOutput,
  labelMatch,
  parseAction,
  parsePlayArgs,
  shotName,
  targetQuery,
} from "./play-plan";

const SAVES = ["fresh", "early", "mid", "late"];

describe("parseAction", () => {
  it("reads a tap by selector, once or repeated", () => {
    expect(parseAction("tap:.mountain")).toEqual({
      kind: "tap",
      target: { by: "selector", selector: ".mountain" },
      times: 1,
    });
    expect(parseAction("tap:.mountain*5")).toEqual({
      kind: "tap",
      target: { by: "selector", selector: ".mountain" },
      times: 5,
    });
  });

  it("reads a tap by accessible name, spaces and all", () => {
    expect(parseAction("label:Back to the mountain")).toEqual({
      kind: "tap",
      target: { by: "label", label: "Back to the mountain" },
      times: 1,
    });
    expect(parseAction("label:Buys *2")).toEqual({
      kind: "tap",
      target: { by: "label", label: "Buys" },
      times: 2,
    });
  });

  it("keeps brackets in a label, since it is matched as text", () => {
    expect(parseAction("label:Promote (2M)")).toEqual({
      kind: "tap",
      target: { by: "label", label: "Promote (2M)" },
      times: 1,
    });
  });

  it("keeps a selector that only contains a star", () => {
    expect(parseAction("tap:.list > *")).toEqual({
      kind: "tap",
      target: { by: "selector", selector: ".list > *" },
      times: 1,
    });
  });

  it("reads a wait in milliseconds or for a selector", () => {
    expect(parseAction("wait:500")).toEqual({ kind: "wait", ms: 500 });
    expect(parseAction("wait:.buys-dialog")).toEqual({
      kind: "waitFor",
      target: { by: "selector", selector: ".buys-dialog" },
    });
  });

  it("refuses unknown, empty, and out-of-range actions", () => {
    expect(parseAction("click:.mountain").kind).toBe("error");
    expect(parseAction("tap").kind).toBe("error");
    expect(parseAction("tap:  ").kind).toBe("error");
    expect(parseAction("wait:60001").kind).toBe("error");
    expect(parseAction("tap:.mountain*0").kind).toBe("error");
    expect(parseAction("tap:.mountain*501").kind).toBe("error");
    expect(parseAction("wait:500ms").kind).toBe("error");
    expect(parseAction("wait:1.5").kind).toBe("error");
  });
});

describe("parsePlayArgs", () => {
  it("defaults to a fresh save on both screens with no actions", () => {
    expect(parsePlayArgs([], SAVES)).toEqual({
      kind: "plan",
      save: "fresh",
      screens: ["phone", "desktop"],
      actions: [],
      out: "play-shots",
      url: undefined,
      phone: { width: 424, height: 924 },
    });
  });

  it("shoots the phone at a chosen size", () => {
    const phone = (value: string) => {
      const plan = parsePlayArgs(["--viewport", value], SAVES);
      return plan.kind === "plan" ? plan.phone : plan.kind;
    };
    expect(phone("424x924")).toEqual({ width: 424, height: 924 });
    expect(phone("424X924")).toEqual({ width: 424, height: 924 });
    expect(phone("360x800")).toEqual({ width: 360, height: 800 });
    expect(phone("424")).toBe("error");
    expect(phone("0x924")).toBe("error");
    expect(phone("424x924x2")).toBe("error");
    expect(phone("9000x924")).toBe("error");
  });

  it("reads options in either form, with actions in order", () => {
    const plan = parsePlayArgs(
      [
        "--save",
        "mid",
        "--screen=phone",
        "tap:.mountain*3",
        "--out",
        "shots",
        "--url=http://127.0.0.1:5173/",
        "label:Buys",
      ],
      SAVES,
    );
    expect(plan).toEqual({
      kind: "plan",
      save: "mid",
      screens: ["phone"],
      actions: [
        {
          kind: "tap",
          target: { by: "selector", selector: ".mountain" },
          times: 3,
        },
        { kind: "tap", target: { by: "label", label: "Buys" }, times: 1 },
      ],
      out: "shots",
      url: "http://127.0.0.1:5173/",
      phone: { width: 424, height: 924 },
    });
  });

  it("picks each screen choice", () => {
    const screens = (value: string) => {
      const plan = parsePlayArgs(["--screen", value], SAVES);
      return plan.kind === "plan" ? plan.screens : plan.kind;
    };
    expect(screens("desktop")).toEqual(["desktop"]);
    expect(screens("both")).toEqual(["phone", "desktop"]);
    expect(screens("tablet")).toBe("error");
  });

  it("answers help", () => {
    expect(parsePlayArgs(["tap:.mountain", "--help"], SAVES)).toEqual({
      kind: "help",
    });
    expect(parsePlayArgs(["-h"], SAVES)).toEqual({ kind: "help" });
  });

  it("names the board's phone and the desktop shot in the help (#370)", () => {
    expect(PLAY_USAGE).toContain("424x924");
    expect(PLAY_USAGE).toContain("1366x768");
    expect(PLAY_USAGE).not.toMatch(/424x830|412x|440x|375x/);
  });

  it("names the saves when one is unknown", () => {
    expect(parsePlayArgs(["--save", "endgame"], SAVES)).toEqual({
      kind: "error",
      message: 'Unknown save "endgame". Saves: fresh, early, mid, late.',
    });
  });

  it("refuses a missing value, an unknown option, and a bad action", () => {
    expect(parsePlayArgs(["--save"], SAVES).kind).toBe("error");
    expect(parsePlayArgs(["--out="], SAVES).kind).toBe("error");
    expect(parsePlayArgs(["--save", "--screen"], SAVES).kind).toBe("error");
    expect(parsePlayArgs(["--fast", "1"], SAVES)).toEqual({
      kind: "error",
      message: "Unknown option --fast.",
    });
    expect(parsePlayArgs(["poke:.mountain"], SAVES).kind).toBe("error");
  });
});

describe("targetQuery", () => {
  it("passes selectors through", () => {
    expect(targetQuery({ by: "selector", selector: ".buys-button" })).toBe(
      ".buys-button",
    );
  });
});

describe("labelMatch", () => {
  it("prefers an exact name, then the first name that starts with the label", () => {
    expect(labelMatch(["Menu", "Buys", "Buys more"], "Buys")).toBe(1);
    expect(
      labelMatch(
        ["Menu", "Upgrades, one is affordable", "Upgrades"],
        "Upgrades",
      ),
    ).toBe(2);
    expect(
      labelMatch(["Menu", "Upgrades, one is affordable"], "Upgrades"),
    ).toBe(1);
  });

  it("ignores case and extra spaces, and answers -1 for no match", () => {
    expect(
      labelMatch(["  Back to the   mountain "], "back to the mountain"),
    ).toBe(0);
    expect(labelMatch(["Menu"], "Upgrades")).toBe(-1);
    expect(labelMatch([], "Menu")).toBe(-1);
  });
});

describe("shot names", () => {
  it("numbers each step and says what happened", () => {
    expect(shotName("phone", 0, undefined)).toBe("phone-00-open.png");
    expect(
      shotName("desktop", 3, {
        kind: "tap",
        target: { by: "selector", selector: ".mountain" },
        times: 5,
      }),
    ).toBe("desktop-03-tap-mountain-x5.png");
    expect(
      shotName("phone", 12, {
        kind: "tap",
        target: { by: "label", label: "Back to the mountain" },
        times: 1,
      }),
    ).toBe("phone-12-label-back-to-the-mountain.png");
  });

  it("slugs waits and keeps long names short and file-safe", () => {
    expect(actionSlug({ kind: "wait", ms: 250 })).toBe("wait-250ms");
    expect(
      actionSlug({
        kind: "waitFor",
        target: { by: "selector", selector: ".buys-dialog:not([hidden])" },
      }),
    ).toBe("wait-buys-dialog-not-hidden");
    const long = actionSlug({
      kind: "tap",
      target: { by: "selector", selector: `.a${"-b".repeat(40)}` },
      times: 1,
    });
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("-")).toBe(false);
    expect(
      actionSlug({
        kind: "waitFor",
        target: { by: "selector", selector: "***" },
      }),
    ).toBe("wait");
  });
});

describe("isPlayOutput", () => {
  it("matches only what a run writes", () => {
    expect(isPlayOutput("log.txt")).toBe(true);
    expect(isPlayOutput("phone-00-open.png")).toBe(true);
    expect(isPlayOutput("desktop-12-tap-mountain-x5.png")).toBe(true);
    expect(isPlayOutput("notes.md")).toBe(false);
    expect(isPlayOutput("phone-open.png")).toBe(false);
    expect(isPlayOutput("src")).toBe(false);
  });
});
