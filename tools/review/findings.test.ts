import { describe, expect, it } from "vitest";
import {
  ANSWER_SCHEMA,
  type Answer,
  commentableLines,
  parseAnswer,
  reviewPost,
} from "./findings.ts";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,4 +10,5 @@ function a() {",
  " const x = 1;",
  "-const y = 2;",
  "+const y = 3;",
  "+++ an added line that looks like a header",
  " return x;",
  " }",
  "diff --git a/docs/b.md b/docs/b.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/docs/b.md",
  "@@ -0,0 +1,2 @@",
  "+# B",
  "+text",
  "diff --git a/old.ts b/old.ts",
  "deleted file mode 100644",
  "--- a/old.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-gone",
  "",
].join("\n");

const HEADER = {
  lenses: "code, spec",
  head: "a".repeat(40),
  cost: 0.4,
  runUrl: "https://example.test/run",
};

function answer(findings: Answer["findings"], summary = "Checked it."): Answer {
  return { summary, findings };
}

const finding = (
  over: Partial<Answer["findings"][number]>,
): Answer["findings"][number] => ({
  severity: "minor",
  path: "src/a.ts",
  line: 12,
  title: "t",
  body: "b",
  ...over,
});

describe("commentableLines", () => {
  it("lists the new-side lines of every hunk, context included", () => {
    const lines = commentableLines(DIFF);
    expect([...(lines.get("src/a.ts") ?? [])]).toEqual([10, 11, 12, 13, 14]);
    expect([...(lines.get("docs/b.md") ?? [])]).toEqual([1, 2]);
    expect(lines.has("old.ts")).toBe(false);
  });
});

describe("parseAnswer", () => {
  it("sorts findings most severe first", () => {
    const parsed = parseAnswer({
      summary: "s",
      findings: [
        finding({ severity: "minor" }),
        finding({ severity: "needs-flemming" }),
        finding({ severity: "critical" }),
      ],
    });
    expect(parsed?.findings.map((f) => f.severity)).toEqual([
      "critical",
      "minor",
      "needs-flemming",
    ]);
  });

  it("refuses anything that is not an answer", () => {
    expect(parseAnswer(undefined)).toBeUndefined();
    expect(parseAnswer({ summary: "s" })).toBeUndefined();
    expect(
      parseAnswer({
        summary: "s",
        findings: [finding({ severity: "nit" as "minor" })],
      }),
    ).toBeUndefined();
    expect(
      parseAnswer({ summary: "s", findings: [{ path: "a", line: 1 }] }),
    ).toBeUndefined();
  });

  it("strips a leading ./ and treats a negative line as the whole file", () => {
    const parsed = parseAnswer({
      summary: "s",
      findings: [finding({ path: "./src/a.ts", line: -3 })],
    });
    expect(parsed?.findings[0]).toMatchObject({ path: "src/a.ts", line: 0 });
  });

  it("matches the schema's required fields", () => {
    expect(ANSWER_SCHEMA.required).toEqual(["summary", "findings"]);
    expect(ANSWER_SCHEMA.properties.findings.items.required).toEqual([
      "severity",
      "path",
      "line",
      "title",
      "body",
    ]);
  });
});

describe("reviewPost", () => {
  it("puts a finding on its line when the hunk shows it", () => {
    const post = reviewPost(
      answer([finding({ severity: "important", line: 12, title: "Wrong y" })]),
      DIFF,
      HEADER,
    );
    expect(post.review.comments).toEqual([
      {
        path: "src/a.ts",
        line: 12,
        side: "RIGHT",
        body: expect.stringContaining("**Important**: Wrong y") as string,
      },
    ]);
    expect(post.review.comments[0]?.body).toContain("resolve this thread");
    expect(post.fileComments).toEqual([]);
  });

  it("puts a finding on its file when the line is outside the hunks", () => {
    const post = reviewPost(answer([finding({ line: 99 })]), DIFF, HEADER);
    expect(post.review.comments).toEqual([]);
    expect(post.fileComments).toEqual([
      {
        commit_id: HEADER.head,
        path: "src/a.ts",
        subject_type: "file",
        body: expect.stringContaining("Line 99, outside the diff") as string,
      },
    ]);
  });

  it("can put a finding on a deleted file", () => {
    const post = reviewPost(
      answer([finding({ path: "old.ts", line: 1 })]),
      DIFF,
      HEADER,
    );
    expect(post.fileComments.map((c) => c.path)).toEqual(["old.ts"]);
  });

  it("lists a finding in a file the PR does not touch in the body", () => {
    const post = reviewPost(
      answer([
        finding({ severity: "pre-existing", path: "src/z.ts", line: 4 }),
      ]),
      DIFF,
      HEADER,
    );
    expect(post.review.comments).toEqual([]);
    expect(post.fileComments).toEqual([]);
    expect(post.review.body).toContain("### Outside this PR's files");
    expect(post.review.body).toContain("`src/z.ts:4`: **Pre-existing**");
  });

  it("heads the body with the lenses, the commit, the summary, counts and cost", () => {
    const post = reviewPost(
      answer([finding({}), finding({ severity: "critical" })], "All read."),
      DIFF,
      HEADER,
    );
    expect(post.review.commit_id).toBe(HEADER.head);
    expect(post.review.event).toBe("COMMENT");
    expect(post.review.body).toContain(
      "## Claude review\n\nReviewed as: code, spec, at commit aaaaaaa.\n\nAll read.",
    );
    expect(post.review.body).toContain("Findings: 1 Critical, 1 Minor.");
    expect(post.review.body).toContain("$0.40");
  });

  it("says No findings and posts no threads when there are none", () => {
    const post = reviewPost(answer([]), DIFF, HEADER);
    expect(post.review.body).toContain("No findings.");
    expect(post.review.comments).toEqual([]);
  });

  it("keeps every finding in the fallback comment", () => {
    const post = reviewPost(
      answer([
        finding({ line: 12 }),
        finding({ line: 99 }),
        finding({ path: "x.ts" }),
      ]),
      DIFF,
      HEADER,
    );
    expect(post.fallback.match(/\*\*Minor\*\*/g)).toHaveLength(3);
  });
});
