import { describe, expect, it } from "vitest";
import {
  type Outcome,
  type Step,
  changedCode,
  exitCode,
  economyChanged,
  gateSteps,
  importClosure,
  LAB_ENTRIES,
  logTail,
  parsePass,
  recordMove,
  relativeImports,
  reuseInputs,
  reusedOutcome,
  nextMoves,
  parseArgs,
  planTier,
  splitGitPaths,
  summaryLine,
  totalLine,
  touchedFiles,
  USAGE,
} from "./gate";

const step = (
  name: string,
  after: readonly string[] = [],
  lane: Step["lane"] = "shared",
): Step => ({
  name,
  command: "node",
  args: [],
  tiers: ["full"],
  after,
  env: {},
  lane,
  reusable: false,
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

describe("touchedFiles", () => {
  it("keeps every changed file once, sorted, of any kind, without build output", () => {
    expect(
      touchedFiles([
        "src/a.ts",
        "docs/b.md",
        "src/a.ts",
        "dist/x.js",
        "coverage/y.json",
      ]),
    ).toEqual(["docs/b.md", "src/a.ts"]);
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
    const plan = planTier("fast", gateSteps(changed, { economy: false }));
    if (plan.kind !== "ok") throw new Error(plan.message);
    return plan.steps;
  };

  it("fast tier typechecks, and lints and tests only the changed files", () => {
    const steps = fast(["src/a.ts", "src/b.ts"]);
    expect(names(steps)).toEqual([
      "typecheck",
      "typecheck:tools",
      "functions",
      "lint:changed",
      "test:related",
    ]);
    const byName = new Map(steps.map((each) => [each.name, each]));
    expect(byName.get("lint:changed")?.args).toEqual(
      expect.arrayContaining(["--cache", "src/a.ts", "src/b.ts"]),
    );
    // The fast tier leaves the long economy sims to the full tier.
    expect(byName.get("test:related")?.args).toEqual([
      "related",
      "--run",
      "--passWithNoTests",
      "--project",
      "unit",
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(steps.every((each) => each.after.length === 0)).toBe(true);
  });

  it("fast tier only typechecks when no code changed", () => {
    expect(names(fast([]))).toEqual([
      "typecheck",
      "typecheck:tools",
      "functions",
    ]);
  });

  it("fast tier checks the format of every changed file, docs and styles too", () => {
    const plan = planTier(
      "fast",
      gateSteps(["src/c.ts"], {
        economy: false,
        touched: ["docs/a.md", "src/b.css", "src/c.ts"],
      }),
    );
    if (plan.kind !== "ok") throw new Error(plan.message);
    const format = plan.steps.find((each) => each.name === "format:changed");
    expect(format?.command).toBe("node_modules/.bin/prettier");
    expect(format?.args).toEqual([
      "--check",
      "--ignore-unknown",
      "docs/a.md",
      "src/b.css",
      "src/c.ts",
    ]);
    expect(format?.tiers).toEqual(["fast"]);
  });

  it("fast tier has no format step when nothing changed", () => {
    const plan = planTier(
      "fast",
      gateSteps([], { economy: false, touched: [] }),
    );
    expect(plan.kind === "ok" && names(plan.steps)).not.toContain(
      "format:changed",
    );
  });

  it("full tier keeps its whole-tree format check and no format:changed", () => {
    const plan = planTier(
      "full",
      gateSteps([], { economy: false, touched: ["docs/a.md"] }),
    );
    if (plan.kind !== "ok") throw new Error(plan.message);
    expect(names(plan.steps)).toContain("format");
    expect(names(plan.steps)).not.toContain("format:changed");
  });

  it("both tiers run the function limits, with nothing before it", () => {
    for (const tier of ["fast", "full"] as const) {
      const plan = planTier(tier, gateSteps([], { economy: false }));
      if (plan.kind !== "ok") throw new Error(plan.message);
      const limits = plan.steps.find((each) => each.name === "functions");
      expect(limits?.command).toBe("node");
      expect(limits?.args).toEqual(["scripts/function-limits.mjs"]);
      expect(limits?.after).toEqual([]);
    }
  });

  it("typecheck is incremental, with its state in the git-ignored gate folder", () => {
    const [typecheck] = fast([]);
    expect(typecheck?.args).toEqual(
      expect.arrayContaining(["--incremental", "--tsBuildInfoFile"]),
    );
    expect(typecheck?.args.join(" ")).toContain(".gate/app.tsbuildinfo");
  });

  it("full tier runs every check, browser and emulator after the static ones", () => {
    const plan = planTier("full", gateSteps(["src/a.ts"], { economy: false }));
    if (plan.kind !== "ok") throw new Error(plan.message);
    expect(names(plan.steps)).toEqual([
      "env",
      "typecheck",
      "typecheck:tools",
      "functions",
      "lint",
      "cycles",
      "format",
      "knip",
      "tokens",
      "coverage",
      "rules",
      "visual",
      "journeys",
      "mockups",
    ]);
    // Coverage names no project, so it measures unit and sim together.
    expect(plan.steps.find((each) => each.name === "coverage")?.args).toEqual([
      "run",
      "--coverage",
    ]);
    const statics = plan.steps.filter((each) => each.after.length === 0);
    const late = plan.steps.filter((each) => each.after.length > 0);
    expect(names(late)).toEqual(["rules", "visual", "journeys", "mockups"]);
    const staticNames = names(statics).filter((name) => name !== "coverage");
    // The emulator is light: it runs beside the tests.
    expect(late[0]?.after).toEqual(staticNames);
    // The browsers wait for the tests, so the long sims never share the
    // cores with ten Chrome pages and run past their timeouts.
    for (const each of late.slice(1)) {
      expect(each.after).toEqual([...staticNames, "coverage"]);
    }
  });
});

describe("the strategy lab in the full tier", () => {
  const steps = (economy: boolean) => {
    const plan = planTier("full", gateSteps([], { economy }));
    if (plan.kind !== "ok") throw new Error(plan.message);
    return plan.steps;
  };

  it("is left out when no economy code changed", () => {
    expect(names(steps(false))).not.toContain("lab");
    expect(names(steps(false))).not.toContain("lab:generations");
  });

  it("runs both strict lab commands beside the browser checks", () => {
    const lab = steps(true).filter((each) => each.name.startsWith("lab"));
    expect(names(lab)).toEqual(["lab", "lab:generations"]);
    for (const each of lab) {
      expect(each.env).toEqual({ LAB_STRICT: "1" });
      expect(each.args).toContain("--ci");
      // Beside the browser checks, after the tests.
      expect(each.after).toEqual(
        steps(true).find((other) => other.name === "visual")?.after,
      );
    }
    expect(
      lab.map((each) => each.args.find((arg) => arg.endsWith("-lab.ts"))),
    ).toEqual(["tools/strategy-lab.ts", "tools/generations-lab.ts"]);
  });

  it("checks the strategy lab's run against the committed pacing ledger (#554)", () => {
    const lab = steps(true).find((each) => each.name === "lab");
    expect(lab?.args.slice(-2)).toEqual(["--ledger", "check"]);
    expect(LAB_ENTRIES).toContain("docs/pacing-ledger.md");
  });

  it("puts the browser checks and both labs in the heavy lane, visual first", () => {
    const heavy = steps(true).filter((each) => each.lane === "heavy");
    expect(names(heavy)).toEqual([
      "visual",
      "journeys",
      "lab",
      "lab:generations",
    ]);
  });

  it("runs the gameplay journeys with Playwright Test's own config (#552)", () => {
    const journeys = steps(false).find((each) => each.name === "journeys");
    expect(journeys?.command).toBe("node_modules/.bin/playwright");
    expect(journeys?.args).toEqual(["test", "-c", "tools/journeys"]);
    expect(journeys?.tiers).toEqual(["full"]);
    expect(journeys?.reusable).toBe(false);
  });

  it("reuses only the two labs", () => {
    const reusable = steps(true).filter((each) => each.reusable);
    expect(names(reusable)).toEqual(["lab", "lab:generations"]);
  });

  it("is never in the fast tier", () => {
    const plan = planTier("fast", gateSteps(["src/a.ts"], { economy: true }));
    expect(plan.kind === "ok" && names(plan.steps)).not.toContain("lab");
  });
});

describe("relativeImports", () => {
  it("finds static, re-exported, side-effect, and dynamic relative imports", () => {
    expect(
      relativeImports(`import a from "./a";
import type { B } from "../b.ts";
export { c } from './c';
import "./side";
const d = await import("./d");
import x from "vitest";
import {
  e,
} from "./e";`),
    ).toEqual(["./a", "../b.ts", "./c", "./side", "./d", "./e"]);
  });
});

describe("importClosure and economyChanged", () => {
  const files = new Map<string, string>([
    ["tools/lab.ts", 'import { run } from "../src/lab/run";'],
    ["src/lab/run.ts", 'import { tiers } from "../tiers";\nimport "./gone";'],
    ["src/tiers.ts", 'import { rate } from "./economy/index.ts";'],
    ["src/economy/index.ts", 'export * from "./rates";'],
    // A cycle back to tiers: seen once, not again.
    ["src/economy/rates.ts", 'import "../tiers";\nexport const rate = 1;'],
    ["src/menu-panel.ts", 'import { tiers } from "./tiers";'],
  ]);
  const read = (path: string) => files.get(path);

  it("follows relative imports from the entries, with or without .ts", () => {
    expect([...importClosure(["tools/lab.ts"], read)].sort()).toEqual([
      "src/economy/index.ts",
      "src/economy/rates.ts",
      "src/lab/run.ts",
      "src/tiers.ts",
      "tools/lab.ts",
    ]);
  });

  it("skips an entry or an import that is not there", () => {
    expect([...importClosure(["tools/missing.ts"], read)]).toEqual([]);
  });

  it("says the economy changed only for a file the lab reaches", () => {
    const closure = importClosure(["tools/lab.ts"], read);
    expect(economyChanged(["src/economy/rates.ts"], closure)).toBe(true);
    expect(economyChanged(["src/menu-panel.ts", "README.md"], closure)).toBe(
      false,
    );
    expect(economyChanged([], closure)).toBe(false);
  });

  it("starts from both lab commands and their loader", () => {
    expect(LAB_ENTRIES).toEqual(
      expect.arrayContaining([
        "tools/strategy-lab.ts",
        "tools/generations-lab.ts",
        "tools/lab-register.mjs",
      ]),
    );
  });
});

describe("parseArgs", () => {
  it("takes one tier", () => {
    expect(parseArgs(["fast"])).toEqual({ kind: "tier", tier: "fast" });
    expect(parseArgs(["full"])).toEqual({ kind: "tier", tier: "full" });
  });

  it("takes signoff alone", () => {
    expect(parseArgs(["signoff"])).toEqual({ kind: "signoff" });
    expect(parseArgs(["signoff", "x"])).toEqual({
      kind: "invalid",
      message: "Unexpected: x",
    });
    expect(USAGE).toContain("signoff");
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

describe("nextMoves in the heavy lane", () => {
  const steps = [step("h1", [], "heavy"), step("h2", [], "heavy"), step("s")];
  const passed: Outcome = { kind: "passed", seconds: 1 };
  const failed: Outcome = { kind: "failed", seconds: 1, code: 1 };

  it("runs one heavy step at a time, in table order", () => {
    expect(names(nextMoves(steps, new Map(), new Set()).start)).toEqual([
      "h1",
      "s",
    ]);
    expect(
      names(nextMoves(steps, new Map(), new Set(["h1", "s"])).start),
    ).toEqual([]);
    expect(
      names(nextMoves(steps, new Map([["h1", passed]]), new Set(["s"])).start),
    ).toEqual(["h2"]);
  });

  it("a failed heavy step frees the lane", () => {
    expect(
      names(nextMoves(steps, new Map([["h1", failed]]), new Set()).start),
    ).toEqual(["h2", "s"]);
  });
});

describe("reuseInputs", () => {
  const lab: Step = {
    ...step("lab"),
    reusable: true,
    env: { LAB_STRICT: "1" },
  };
  const base = {
    step: lab,
    files: [
      ["src/a.ts", "a"],
      ["src/b.ts", "b"],
    ] as const,
    lock: "lock",
    node: "v24.0.0",
  };

  it("changes when any input changes", () => {
    const text = reuseInputs(base);
    const variants = [
      {
        ...base,
        files: [
          ["src/a.ts", "a!"],
          ["src/b.ts", "b"],
        ] as const,
      },
      {
        ...base,
        files: [
          ["src/A.ts", "a"],
          ["src/b.ts", "b"],
        ] as const,
      },
      { ...base, files: [...base.files, ["src/c.ts", "c"]] as const },
      { ...base, lock: "lock2" },
      { ...base, node: "v24.1.0" },
      { ...base, step: { ...lab, args: ["--ci"] } },
      { ...base, step: { ...lab, env: { LAB_STRICT: "0" } } },
    ];
    for (const variant of variants) {
      expect(reuseInputs(variant)).not.toBe(text);
    }
  });

  it("does not depend on the order of the env", () => {
    const two = (env: Record<string, string>) =>
      reuseInputs({ ...base, step: { ...lab, env } });
    expect(two({ A: "1", B: "2" })).toBe(two({ B: "2", A: "1" }));
  });

  it("does not depend on the order the files come in", () => {
    expect(
      reuseInputs({ ...base, files: [base.files[1], base.files[0]] }),
    ).toBe(reuseInputs(base));
  });
});

describe("parsePass", () => {
  it("reads a record back", () => {
    expect(parsePass(JSON.stringify({ key: "k", sha: "abc" }))).toEqual({
      key: "k",
      sha: "abc",
    });
  });

  it("reads anything else as no record, never as a pass", () => {
    for (const text of [
      undefined,
      "not json",
      "{}",
      '{"key":1,"sha":"x"}',
      "null",
    ]) {
      expect(parsePass(text)).toBeUndefined();
    }
  });
});

describe("reusedOutcome", () => {
  const lab: Step = { ...step("lab"), reusable: true };
  const record = { key: "k", sha: "abc1234def" };

  it("reuses a reusable step whose inputs passed before", () => {
    expect(reusedOutcome(lab, "k", record)).toEqual({
      kind: "reused",
      sha: "abc1234def",
    });
  });

  it("runs it when the inputs differ, there is no record, or it never reuses", () => {
    expect(reusedOutcome(lab, "other", record)).toBeUndefined();
    expect(reusedOutcome(lab, "k", undefined)).toBeUndefined();
    expect(reusedOutcome(step("visual"), "k", record)).toBeUndefined();
  });
});

describe("recordMove", () => {
  it("records a pass only when the inputs did not change while it ran", () => {
    expect(recordMove({ passed: true, before: "k", after: "k" })).toBe("write");
    // Edited mid-run: the pass covered a mix of old and new, so it proves neither.
    expect(recordMove({ passed: true, before: "k", after: "k2" })).toBe(
      "delete",
    );
  });

  it("a red run loses the old record", () => {
    expect(recordMove({ passed: false, before: "k", after: "k" })).toBe(
      "delete",
    );
  });
});

describe("nextMoves behind a reused step", () => {
  it("starts a step behind a reused one", () => {
    const steps = [step("lab"), step("after", ["lab"])];
    const moves = nextMoves(
      steps,
      new Map([["lab", { kind: "reused", sha: "abc" } as const]]),
      new Set(),
    );
    expect(names(moves.start)).toEqual(["after"]);
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
    expect(summaryLine("lab", { kind: "reused", sha: "abc1234def" }, 9)).toBe(
      "ok    lab        reused (same inputs passed on abc1234)",
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

  it("counts a reused step as passed, and says how many were reused", () => {
    const reused: Outcome = { kind: "reused", sha: "abc" };
    expect(exitCode([passed, passed, reused])).toBe(0);
    expect(totalLine("full", [passed, passed, reused], 3)).toBe(
      "gate full: 3 passed (1 reused) in 3.0s",
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
