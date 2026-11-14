import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changeShape,
  lastReviewed,
  reviewedMarker,
  threadsOf,
  threadsText,
} from "./recheck.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);

describe("lastReviewed", () => {
  it("takes the newest marked post and ignores the rest", () => {
    expect(
      lastReviewed([
        {
          body: `${reviewedMarker(A)}\n## Claude review`,
          at: "2026-11-14T10:00:00Z",
        },
        {
          body: "## Claude review\n\nFailed (`x`)",
          at: "2026-11-14T12:00:00Z",
        },
        { body: `${reviewedMarker(B)}\nre-check`, at: "2026-11-14T11:00:00Z" },
      ]),
    ).toBe(B);
  });

  it("finds nothing before the first review", () => {
    expect(lastReviewed([])).toBeUndefined();
    expect(
      lastReviewed([{ body: "<!-- claude-review reviewed=abc -->", at: "x" }]),
    ).toBeUndefined();
  });
});

describe("changeShape", () => {
  it("drops what merging main moves: blob ids and hunk positions", () => {
    const before =
      "diff --git a/x b/x\nindex 111..222 100644\n@@ -1,2 +1,3 @@ f\n+y";
    const after =
      "diff --git a/x b/x\nindex 333..444 100644\n@@ -9,2 +9,3 @@ g\n+y";
    expect(changeShape(before)).toBe(changeShape(after));
    expect(changeShape(before)).not.toBe(changeShape(`${after}\n+z`));
  });
});

const GRAPHQL = {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              isResolved: true,
              path: "src/a.ts",
              line: null,
              comments: {
                nodes: [
                  { author: { login: "github-actions" }, body: "**Minor**: a" },
                ],
              },
            },
            {
              isResolved: false,
              path: "src/b.ts",
              line: 4,
              comments: {
                nodes: [
                  {
                    author: { login: "github-actions" },
                    body: "**Important**: b",
                  },
                  {
                    author: { login: "FBakkensen" },
                    body: "Fixed in 1234567.",
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

describe("threadsText", () => {
  it("lists open threads first, with every reply", () => {
    expect(threadsText(threadsOf(GRAPHQL))).toBe(
      [
        "### src/b.ts:4 (open)",
        "",
        "**github-actions:** **Important**: b",
        "",
        "**FBakkensen:** Fixed in 1234567.",
        "",
        "### src/a.ts (resolved)",
        "",
        "**github-actions:** **Minor**: a",
      ].join("\n"),
    );
  });

  it("is empty with no threads or a bad answer", () => {
    expect(threadsText(threadsOf({}))).toBe("");
    expect(threadsOf({ data: null })).toEqual([]);
  });
});

describe("the same command", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
      {
        cwd,
        encoding: "utf8",
      },
    ).trim();

  it("keeps a review when only main was merged in, not after a real change", () => {
    const dir = mkdtempSync(join(tmpdir(), "recheck-"));
    git(dir, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.txt"), "1\n2\n3\n");
    writeFileSync(join(dir, "m.txt"), "m\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "base");
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-qb", "pr");
    writeFileSync(join(dir, "a.txt"), "1\n2\n3\n4\n");
    git(dir, "commit", "-qam", "pr");
    const last = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "main");
    writeFileSync(join(dir, "m.txt"), "m2\n");
    git(dir, "commit", "-qam", "main moves");
    const main = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "pr");
    git(dir, "merge", "-q", "main", "-m", "merge main");
    const merged = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "a.txt"), "1\n2\n3\n4\n5\n");
    git(dir, "commit", "-qam", "fix");
    const fixed = git(dir, "rev-parse", "HEAD");
    const same = (head: string) => {
      try {
        execFileSync(
          process.execPath,
          [
            join(process.cwd(), "tools/review/recheck.ts"),
            "same",
            "--base",
            main,
            "--last",
            last,
            "--head",
            head,
          ],
          { cwd: dir },
        );
        return true;
      } catch {
        return false;
      }
    };
    expect(base).not.toBe(main);
    expect(same(merged)).toBe(true);
    expect(same(fixed)).toBe(false);
  });
});
