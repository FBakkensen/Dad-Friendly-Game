import { describe, expect, it } from "vitest";
import {
  type Outcome,
  type Step,
  changedCode,
  exitCode,
  gateSteps,
  logTail,
  nextMoves,
  parseArgs,
  planTier,
  splitGitPaths,
  summaryLine,
  totalLine,
} from "./gate";

const step = (name: string, after: readonly string[] = []): Step => ({
  name,
  command: "node",
  args: [],
  tiers: ["full"],
  after,
});

const names = (steps: readonly Step[]) => steps.map((each) => each.name);

describe("changedCode", () => {
  it("keeps code files once, sorted, and drops docs, art, and build output", () => {
    expect(
      changedCode([
        "src/mountain.ts",
        "scripts/play.mjs",
        "docs/DESIGN.md",
        "public/art/worker.png",
        "src/mountain.ts",
        "eslint.config.js",
        "dist/assets/index.js",
        "coverage/lcov.js",
        "node_modules/vite/index.mjs",
        ".gate/logs/lint.log",
        "src/styles.css",
      ]),
    ).toEqual(["eslint.config.js", "scripts/play.mjs", "src/mountain.ts"]);
  });

  it("is empty when no code changed", () => {
    expect(changedCode(["README.md"])).toEqual([]);
  });
});

describe("splitGitPaths", () => {
  it("splits NUL-separated output and drops the trailing empty entry", () => {
    expect(splitGitPaths("src/a.ts\0docs/b md.md\0")).toEqual([
      "src/a.ts",
      "docs/b md.md",
    ]);
    expect(splitGitPaths("")).toEqual([]);
  });
});

describe("gateSteps", () => {
  const fast = (changed: readonly string[]) => {
    const plan = planTier("fast", gateSteps(changed));
    if (plan.kind !== "ok") throw new Error(plan.message);
    return plan.steps;
  };

  it("fast tier typechecks, and lints and tests only the changed files", () => {
    const steps = fast(["src/a.ts", "src/b.ts"]);
    expect(names(steps)).toEqual([
      "typecheck",
      "typecheck:tools",
      "lint:changed",
      "test:related",
    ]);
    const byName = new Map(steps.map((each) => [each.name, each]));
    expect(byName.get("lint:changed")?.args).toEqual(
      expect.arrayContaining(["--cache", "src/a.ts", "src/b.ts"]),
    );
    expect(byName.get("test:related")?.args).toEqual([
      "related",
      "--run",
      "--passWithNoTests",
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(steps.every((each) => each.after.length === 0)).toBe(true);
  });

  it("fast tier only typechecks when no code changed", () => {
    expect(names(fast([]))).toEqual(["typecheck", "typecheck:tools"]);
  });

  it("typecheck is incremental, with its state in the git-ignored gate folder", () => {
    const [typecheck] = fast([]);
    expect(typecheck?.args).toEqual(
      expect.arrayContaining(["--incremental", "--tsBuildInfoFile"]),
    );
    expect(typecheck?.args.join(" ")).toContain(".gate/app.tsbuildinfo");
  });

  it("full tier runs every check, browser and emulator after the static ones", () => {
    const plan = planTier("full", gateSteps(["src/a.ts"]));
    if (plan.kind !== "ok") throw new Error(plan.message);
    expect(names(plan.steps)).toEqual([
      "env",
      "typecheck",
      "typecheck:tools",
      "lint",
      "cycles",
      "format",
      "knip",
      "tokens",
      "coverage",
      "rules",
      "visual",
      "mockups",
    ]);
    const statics = plan.steps.filter((each) => each.after.length === 0);
    const late = plan.steps.filter((each) => each.after.length > 0);
    expect(names(late)).toEqual(["rules", "visual", "mockups"]);
    for (const each of late) {
      expect(each.after).toEqual(
        names(statics).filter((name) => name !== "coverage"),
      );
    }
  });
});

describe("parseArgs", () => {
  it("takes one tier", () => {
    expect(parseArgs(["fast"])).toEqual({ kind: "tier", tier: "fast" });
    expect(parseArgs(["full"])).toEqual({ kind: "tier", tier: "full" });
  });

  it("asks for help", () => {
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["fast", "-h"])).toEqual({ kind: "help" });
  });

  it("rejects a missing, unknown, or extra argument", () => {
    expect(parseArgs([])).toEqual({
      kind: "invalid",
      message: "Pick a tier: fast or full.",
    });
    expect(parseArgs(["slow"])).toEqual({
      kind: "invalid",
      message: "Unknown tier: slow",
    });
    expect(parseArgs(["fast", "full"])).toEqual({
      kind: "invalid",
      message: "Unexpected: full",
    });
  });
});

describe("planTier", () => {
  it("keeps only the tier's steps, in table order", () => {
    const fastOnly: Step = { ...step("quick"), tiers: ["fast"] };
    const plan = planTier("full", [step("a"), fastOnly, step("b", ["a"])]);
    expect(plan.kind === "ok" && names(plan.steps)).toEqual(["a", "b"]);
  });

  it("rejects a dependency outside the tier", () => {
    const fastOnly: Step = { ...step("quick"), tiers: ["fast"] };
    expect(planTier("full", [fastOnly, step("b", ["quick"])])).toEqual({
      kind: "invalid",
      message: "b waits on quick, which is not in the full tier.",
    });
  });

  it("rejects a repeated name", () => {
    expect(planTier("full", [step("a"), step("a")])).toEqual({
      kind: "invalid",
      message: "Two steps named a.",
    });
  });

  it("rejects a cycle", () => {
    expect(
      planTier("full", [step("a", ["c"]), step("b", ["a"]), step("c", ["b"])]),
    ).toEqual({ kind: "invalid", message: "a, b, c wait on each other." });
  });

  it("accepts a diamond", () => {
    const plan = planTier("full", [
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
      step("d", ["b", "c"]),
    ]);
    expect(plan.kind).toBe("ok");
  });
});

describe("nextMoves", () => {
  const steps = [step("a"), step("b"), step("c", ["a", "b"]), step("d", ["c"])];
  const passed: Outcome = { kind: "passed", seconds: 1 };
  const failed: Outcome = { kind: "failed", seconds: 1, code: 1 };

  it("starts every independent step at once", () => {
    const moves = nextMoves(steps, new Map(), new Set());
    expect(names(moves.start)).toEqual(["a", "b"]);
    expect(moves.skip).toEqual([]);
  });

  it("does not restart a running or finished step", () => {
    const moves = nextMoves(
      steps,
      new Map<string, Outcome>([["a", passed]]),
      new Set(["b"]),
    );
    expect(moves.start).toEqual([]);
    expect(moves.skip).toEqual([]);
  });

  it("starts a step once all its dependencies passed", () => {
    const moves = nextMoves(
      steps,
      new Map<string, Outcome>([
        ["a", passed],
        ["b", passed],
      ]),
      new Set(),
    );
    expect(names(moves.start)).toEqual(["c"]);
  });

  it("skips a step behind a failed one, and the skip spreads", () => {
    const first = nextMoves(
      steps,
      new Map<string, Outcome>([
        ["a", failed],
        ["b", passed],
      ]),
      new Set(),
    );
    expect(first.start).toEqual([]);
    expect(first.skip.map((each) => [each.step.name, each.because])).toEqual([
      ["c", "a"],
    ]);
    const second = nextMoves(
      steps,
      new Map<string, Outcome>([
        ["a", failed],
        ["b", passed],
        ["c", { kind: "skipped", because: "a" }],
      ]),
      new Set(),
    );
    expect(second.skip.map((each) => [each.step.name, each.because])).toEqual([
      ["d", "c"],
    ]);
  });

  it("skips as soon as one dependency fails, even while another runs", () => {
    const moves = nextMoves(
      steps,
      new Map<string, Outcome>([["a", failed]]),
      new Set(["b"]),
    );
    expect(moves.skip.map((each) => each.step.name)).toEqual(["c"]);
  });
});

describe("summaryLine", () => {
  it("prints one aligned line per outcome", () => {
    expect(summaryLine("typecheck", { kind: "passed", seconds: 4.08 }, 9)).toBe(
      "ok    typecheck  4.1s",
    );
    expect(
      summaryLine("lint", { kind: "failed", seconds: 2.3, code: 1 }, 9),
    ).toBe("FAIL  lint       2.3s  exit 1");
    expect(summaryLine("visual", { kind: "skipped", because: "lint" }, 9)).toBe(
      "skip  visual     blocked by lint",
    );
  });
});

describe("exitCode and totalLine", () => {
  const passed: Outcome = { kind: "passed", seconds: 1 };

  it("is 0 and counts passes when everything passed", () => {
    expect(exitCode([passed, passed])).toBe(0);
    expect(totalLine("fast", [passed, passed], 12.34)).toBe(
      "gate fast: 2 passed in 12.3s",
    );
  });

  it("is 1 and counts failures and skips otherwise", () => {
    const failed: Outcome = { kind: "failed", seconds: 1, code: 2 };
    const skipped: Outcome = { kind: "skipped", because: "lint" };
    expect(exitCode([passed, failed])).toBe(1);
    expect(exitCode([skipped])).toBe(1);
    expect(totalLine("full", [passed, failed], 3)).toBe(
      "gate full: 1 failed in 3.0s",
    );
    expect(totalLine("full", [failed, skipped, skipped], 3)).toBe(
      "gate full: 1 failed, 2 skipped in 3.0s",
    );
  });
});

describe("logTail", () => {
  it("keeps the last lines and drops trailing blank space", () => {
    const log = Array.from({ length: 50 }, (_, i) => `line ${String(i)}`).join(
      "\n",
    );
    const tail = logTail(`${log}\n\n`);
    expect(tail.split("\n")).toHaveLength(40);
    expect(tail.startsWith("line 10\n")).toBe(true);
    expect(tail.endsWith("line 49")).toBe(true);
    expect(logTail("a\nb\nc", 2)).toBe("b\nc");
    expect(logTail("short")).toBe("short");
  });
});
