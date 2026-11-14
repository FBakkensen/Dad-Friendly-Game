import { describe, expect, it } from "vitest";
import {
  costOf,
  findingsOf,
  tallyPr,
  tallyTable,
  tallyThreads,
  type Comment,
} from "./tally.ts";

const BOT = "github-actions[bot]";

const finding = (id: number, severity = "Important"): Comment => ({
  id,
  author: BOT,
  body: `**${severity}**: something is off\n\nDetails.`,
  inReplyTo: null,
});

const reply = (id: number, to: number, body: string): Comment => ({
  id,
  author: "FBakkensen",
  body,
  inReplyTo: to,
});

const review = (findings: string, cost: string): string =>
  `<!-- claude-review reviewed=${"a".repeat(40)} -->\n## Claude review\n\nReviewed as: code, at commit aaaaaaa.\n\n${findings}\n\n---\n_Opus 5.5 via \`claude -p\`, paid from the monthly API credit: $${cost}. ([run](https://example.test))_`;

describe("tallyThreads", () => {
  it("counts a thread with a reply naming a commit as fixed", () => {
    const tally = tallyThreads([
      finding(1),
      reply(2, 1, "Fixed in 5bbde5e: the guard now covers it."),
    ]);
    expect(tally).toEqual({ fixed: 1, answered: 0, open: 0 });
  });

  it("reads a fix named with backticks or the word commit", () => {
    const tally = tallyThreads([
      finding(1),
      reply(2, 1, "Fixed in `5bbde5e`."),
      finding(3),
      reply(4, 3, "fixed in commit 5bbde5e4177dcd2888bae48caa0aee6336e557ef"),
    ]);
    expect(tally).toEqual({ fixed: 2, answered: 0, open: 0 });
  });

  it("counts a thread answered without a fix as answered", () => {
    const tally = tallyThreads([
      finding(1, "Minor"),
      reply(2, 1, "Kept as is: the copy is Flemming's."),
    ]);
    expect(tally).toEqual({ fixed: 0, answered: 1, open: 0 });
  });

  it("counts a thread with no reply, or only the bot's, as open", () => {
    const tally = tallyThreads([
      finding(1, "Critical"),
      finding(2, "Needs Flemming"),
      { id: 3, author: BOT, body: "More.", inReplyTo: 2 },
    ]);
    expect(tally).toEqual({ fixed: 0, answered: 0, open: 2 });
  });

  it("ignores comments that are not review findings", () => {
    const tally = tallyThreads([
      { id: 1, author: "FBakkensen", body: "**Minor**: mine", inReplyTo: null },
      { id: 2, author: BOT, body: "A plain note.", inReplyTo: null },
    ]);
    expect(tally).toEqual({ fixed: 0, answered: 0, open: 0 });
  });
});

describe("costOf", () => {
  it("reads the cost from the footer", () => {
    expect(costOf(review("No findings.", "0.66"))).toBe(0.66);
  });

  it("keeps a zero cost apart from no cost", () => {
    expect(costOf(review("No findings.", "0.00"))).toBe(0);
    expect(costOf("Skipped: the API credit is used up.")).toBeUndefined();
  });
});

describe("findingsOf", () => {
  it("adds up the counts on the findings line", () => {
    expect(findingsOf(review("Findings: 1 Important, 2 Minor.", "0.10"))).toBe(
      3,
    );
  });

  it("reads the counts line, not a summary line that starts the same way", () => {
    const body = review(
      "Findings: 2 are pre-existing.\n\nFindings: 1 Critical.",
      "0.10",
    );
    expect(findingsOf(body)).toBe(1);
  });

  it("reads no findings as zero", () => {
    expect(findingsOf(review("No findings.", "0.10"))).toBe(0);
  });
});

describe("tallyPr", () => {
  it("adds up only the bot's Claude reviews", () => {
    const pr = tallyPr({
      number: 595,
      title: "A status",
      posts: [
        { author: BOT, body: review("Findings: 3 Minor.", "0.40") },
        { author: BOT, body: review("Findings: 1 Important.", "0.15") },
        { author: BOT, body: "## Claude review\n\nSkipped: no credit." },
        { author: "FBakkensen", body: review("Findings: 9 Minor.", "9.00") },
      ],
      comments: [finding(1), reply(2, 1, "Fixed in abcdef1.")],
    });
    expect(pr).toEqual({
      number: 595,
      title: "A status",
      reviews: 2,
      findings: 4,
      threads: { fixed: 1, answered: 0, open: 0 },
      cost: 0.55,
    });
  });
});

describe("tallyTable", () => {
  it("writes one row per PR and a total", () => {
    const table = tallyTable([
      {
        number: 1,
        title: "a | b",
        reviews: 1,
        findings: 2,
        threads: { fixed: 1, answered: 1, open: 0 },
        cost: 0.25,
      },
      {
        number: 2,
        title: "c",
        reviews: 2,
        findings: 3,
        threads: { fixed: 0, answered: 0, open: 1 },
        cost: 0.5,
      },
    ]);
    expect(table.split("\n")).toEqual([
      "| PR | Title | Reviews | Findings | Fixed | Answered, kept | No answer | Not a thread | Cost |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| #1 | a \\| b | 1 | 2 | 1 | 1 | 0 | 0 | $0.25 |",
      "| #2 | c | 2 | 3 | 0 | 0 | 1 | 2 | $0.50 |",
      "| **All** | 2 PRs | 3 | 5 | 1 | 1 | 1 | 2 | $0.75 |",
    ]);
  });
});
