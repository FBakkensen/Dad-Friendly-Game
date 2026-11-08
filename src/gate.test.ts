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
  relativeImports,
  nextMoves,
  parseArgs,
  planTier,
  splitGitPaths,
  summaryLine,
  totalLine,
  USAGE,
} from "./gate";

const step = (name: string, after: readonly string[] = []): Step => ({
  name,
  command: "node",
  args: [],
  tiers: ["full"],
  after,
  env: {},
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
    const plan = planTier("fast", gateSteps(changed, { economy: false }));
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
    const plan = planTier("full", gateSteps(["src/a.ts"], { economy: false }));
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
    // Coverage names no project, so it measures unit and sim together.
    expect(plan.steps.find((each) => each.name === "coverage")?.args).toEqual([
      "run",
      "--coverage",
    ]);
    const statics = plan.steps.filter((each) => each.after.length === 0);
    const late = plan.steps.filter((each) => each.after.length > 0);
    expect(names(late)).toEqual(["rules", "visual", "mockups"]);
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
    expect(lab.map((each) => each.args.at(-2))).toEqual([
      "tools/strategy-lab.ts",
      "tools/generations-lab.ts",
    ]);
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
