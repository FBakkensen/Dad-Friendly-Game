import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCall } from "./git.ts";

const RANGE = { base: "b".repeat(40), head: "h".repeat(40) };
const SAFE = ["--no-pager", "-c", "core.quotePath=false"];
const QUIET = ["--no-color", "--no-ext-diff", "--no-textconv"];

function args(...input: string[]): string[] {
  const call = gitCall(RANGE, input);
  if (call.kind !== "run") throw new Error(`refused: ${call.message}`);
  return call.args;
}

function refused(...input: string[]): string {
  const call = gitCall(RANGE, input);
  if (call.kind !== "refuse") throw new Error(`ran: ${call.args.join(" ")}`);
  return call.message;
}

describe("gitCall", () => {
  it("diffs the PR's range, with paths only after --", () => {
    expect(args("diff", "--stat", "src/a.ts")).toEqual([
      ...SAFE,
      "diff",
      ...QUIET,
      "--stat",
      `${RANGE.base}...${RANGE.head}`,
      "--",
      "src/a.ts",
    ]);
  });

  it("logs the head, or only the PR's commits, with the revision fenced", () => {
    expect(args("log", "--branch", "--patch", "src/a.ts")).toEqual([
      ...SAFE,
      "log",
      "--max-count=20",
      "--format=%h %ad %s",
      "--date=short",
      "--patch",
      ...QUIET,
      "--end-of-options",
      `${RANGE.base}..${RANGE.head}`,
      "--",
      "src/a.ts",
    ]);
  });

  it("shows one revision after --end-of-options", () => {
    expect(args("show", "HEAD~1:src/a.ts")).toEqual([
      ...SAFE,
      "show",
      ...QUIET,
      "--end-of-options",
      "HEAD~1:src/a.ts",
    ]);
  });

  it("greps with the pattern after -e, even one that looks like an option", () => {
    expect(args("grep", "-i", "-w", "--", "-Otouch", "src")).toEqual([
      ...SAFE,
      "grep",
      "-n",
      "-I",
      "--no-color",
      "-i",
      "-w",
      "-e",
      "-Otouch",
      "--",
      "src",
    ]);
  });

  it("lists files with every argument as a path", () => {
    expect(args("ls-files", "--others", "src")).toEqual([
      ...SAFE,
      "ls-files",
      "--",
      "--others",
      "src",
    ]);
  });

  it.each([
    [["grep", "-iOtouch /tmp/x", "hello"], "unknown option -iOtouch /tmp/x"],
    [["grep", "-O", "touch", "hello"], "unknown option -O"],
    [["grep", "--open-files-in-pager=touch", "x"], "unknown option"],
    [["diff", "--output=/tmp/x"], "unknown option --output=/tmp/x"],
    [["log", "--output=/tmp/x"], "unknown option --output=/tmp/x"],
    [["show", "--output=/tmp/x"], "not a revision"],
    [["show", ":/text"], "not a revision"],
    [["show", "@{-1}"], "not a revision"],
    [["show", "HEAD:a\nb"], "not a revision"],
    [["show", "HEAD", "--ext-diff"], "show takes one revision"],
    [["show"], "show takes one revision"],
    [["grep"], "grep needs a pattern"],
    [["-c", "core.pager=touch /tmp/x", "log"], "review-git:"],
    [["config", "core.pager", "x"], "review-git:"],
  ])("refuses %j", (input, message) => {
    expect(refused(...input)).toContain(message);
  });
});

describe("gitCall on a re-check", () => {
  it("diffs from the last reviewed commit with --since-last", () => {
    const call = gitCall({ ...RANGE, last: "c".repeat(40) }, [
      "diff",
      "--since-last",
      "--stat",
    ]);
    expect(call).toEqual({
      kind: "run",
      args: [
        ...SAFE,
        "diff",
        ...QUIET,
        "--stat",
        "c".repeat(40),
        RANGE.head,
        "--",
      ],
    });
  });

  it("refuses --since-last on a first review", () => {
    expect(refused("diff", "--since-last")).toContain("first review");
  });
});

describe("gitCall paths and limits", () => {
  it("shows a file whose path has spaces and brackets", () => {
    expect(args("show", "HEAD:docs/a b (1).md").at(-1)).toBe(
      "HEAD:docs/a b (1).md",
    );
  });

  it("caps a log with patches at 20 commits", () => {
    expect(args("log", "--patch")).toContain("--max-count=20");
    expect(args("log")).toContain("--max-count=200");
  });
});

describe("the command line", () => {
  const run = (...input: string[]) =>
    execFileSync(process.execPath, ["tools/review/git.ts", ...input], {
      encoding: "utf8",
      env: { ...process.env, REVIEW_BASE: "HEAD", REVIEW_HEAD: "HEAD" },
    });

  it("runs git and prints what it finds", () => {
    expect(run("ls-files", "tools/review/prompt.ts")).toBe(
      "tools/review/prompt.ts\n",
    );
  });

  it("runs through a symlinked path too", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-git-"));
    symlinkSync(resolve("tools/review"), join(dir, "review"));
    const out = execFileSync(
      process.execPath,
      [join(dir, "review/git.ts"), "ls-files", "tools/review/prompt.ts"],
      {
        encoding: "utf8",
        env: { ...process.env, REVIEW_BASE: "HEAD", REVIEW_HEAD: "HEAD" },
      },
    );
    expect(out).toBe("tools/review/prompt.ts\n");
  });

  it("refuses with exit code 2 and runs nothing", () => {
    expect(() => run("grep", "-Otouch", "x")).toThrow(/unknown option/);
  });
});
