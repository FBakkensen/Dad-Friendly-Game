import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * How the Claude review is doing (#586), over the merged PRs: how many
 * findings it posted, how many the thread fixed, how many it answered and
 * left as they were, how many got no answer, and what the reviews cost. It
 * reads only what the review job posted and the replies to it.
 */

export type Comment = {
  id: number;
  author: string;
  body: string;
  inReplyTo: number | null;
};

export type ThreadTally = { fixed: number; answered: number; open: number };

const BOT = "github-actions[bot]";
const FIXED = /\bfixed in [0-9a-f]{7,40}\b/i;
const SEVERITY =
  /^\*\*(Critical|Important|Minor|Pre-existing|Needs Flemming)\*\*:/;

/** Each finding thread the review posted, by how the thread answered it. */
export function tallyThreads(comments: readonly Comment[]): ThreadTally {
  const tally: ThreadTally = { fixed: 0, answered: 0, open: 0 };
  const findings = comments.filter(
    (c) => c.author === BOT && c.inReplyTo === null && SEVERITY.test(c.body),
  );
  for (const finding of findings) {
    const replies = comments.filter(
      (c) => c.inReplyTo === finding.id && c.author !== BOT,
    );
    if (replies.some((reply) => FIXED.test(reply.body))) tally.fixed++;
    else if (replies.length > 0) tally.answered++;
    else tally.open++;
  }
  return tally;
}

const COST = /paid from the monthly API credit: \$(\d+(?:\.\d+)?)/;

/** The cost a review or review comment names, in dollars, if it names one. */
export function costOf(body: string): number | undefined {
  const match = COST.exec(body);
  return match ? Number(match[1]) : undefined;
}

/** Findings a review body counts ("Findings: 1 Important, 2 Minor."). */
export function findingsOf(body: string): number {
  const line = /^Findings: (.+)\.$/m.exec(body)?.[1];
  if (line === undefined) return 0;
  return line
    .split(", ")
    .map((part) => Number(/^(\d+) /.exec(part)?.[1] ?? 0))
    .reduce((a, b) => a + b, 0);
}

export type PrTally = {
  number: number;
  title: string;
  reviews: number;
  findings: number;
  threads: ThreadTally;
  cost: number;
};

export function tallyPr(input: {
  number: number;
  title: string;
  /** The review bodies and issue comments the bot posted. */
  posts: readonly { author: string; body: string }[];
  comments: readonly Comment[];
}): PrTally {
  const ours = input.posts.filter(
    (post) => post.author === BOT && post.body.includes("## Claude review"),
  );
  return {
    number: input.number,
    title: input.title,
    reviews: ours.filter((post) => costOf(post.body) !== undefined).length,
    findings: ours.reduce((sum, post) => sum + findingsOf(post.body), 0),
    threads: tallyThreads(input.comments),
    cost: ours.reduce((sum, post) => sum + (costOf(post.body) ?? 0), 0),
  };
}

export function tallyTable(prs: readonly PrTally[]): string {
  const rows = prs.map(
    (pr) =>
      `| #${String(pr.number)} | ${pr.title.replaceAll("|", "\\|")} | ${String(pr.reviews)} | ${String(pr.findings)} | ${String(pr.threads.fixed)} | ${String(pr.threads.answered)} | ${String(pr.threads.open)} | $${pr.cost.toFixed(2)} |`,
  );
  const sum = (pick: (pr: PrTally) => number) =>
    prs.reduce((total, pr) => total + pick(pr), 0);
  const total = `| **All** | ${String(prs.length)} PRs | ${String(sum((p) => p.reviews))} | ${String(sum((p) => p.findings))} | ${String(sum((p) => p.threads.fixed))} | ${String(sum((p) => p.threads.answered))} | ${String(sum((p) => p.threads.open))} | $${sum((p) => p.cost).toFixed(2)} |`;
  return [
    "| PR | Title | Reviews | Findings | Fixed | Answered, kept | No answer | Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    total,
  ].join("\n");
}

// The command line: `node tools/review/tally.ts [--since <date>]`.

/**
 * Every item of a REST list, page by page. `--paginate` follows GitHub's
 * `repositories/<id>` links, which some proxies refuse, so the pages are
 * asked for by number.
 */
function api<T>(path: string, maxPages = 50): T[] {
  const items: T[] = [];
  const join = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page++) {
    const out = execFileSync(
      "gh",
      ["api", `${path}${join}per_page=100&page=${String(page)}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const batch = JSON.parse(out) as T[];
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

type Pull = { number: number; title: string; merged_at: string | null };
type Posted = { user: { login: string }; body: string | null };
type ReviewComment = {
  id: number;
  user: { login: string };
  body: string;
  in_reply_to_id?: number;
};

function main(args: readonly string[]): void {
  const repo = process.env.REPO ?? "FBakkensen/Dad-Friendly-Game";
  const at = args.indexOf("--since");
  const since = at >= 0 ? (args[at + 1] ?? "") : "2026-11-14";
  const pulls = api<Pull>(
    `repos/${repo}/pulls?state=closed&sort=updated&direction=desc`,
    5,
  ).filter((pull) => pull.merged_at !== null && pull.merged_at >= since);
  const prs = pulls.map((pull) => {
    const posted = [
      ...api<Posted>(`repos/${repo}/pulls/${String(pull.number)}/reviews`),
      ...api<Posted>(`repos/${repo}/issues/${String(pull.number)}/comments`),
    ].map((p) => ({ author: p.user.login, body: p.body ?? "" }));
    const comments = api<ReviewComment>(
      `repos/${repo}/pulls/${String(pull.number)}/comments`,
    ).map((c) => ({
      id: c.id,
      author: c.user.login,
      body: c.body,
      inReplyTo: c.in_reply_to_id ?? null,
    }));
    return tallyPr({
      number: pull.number,
      title: pull.title,
      posts: posted,
      comments,
    });
  });
  console.log(
    tallyTable(
      prs.filter((pr) => pr.reviews > 0).sort((a, b) => a.number - b.number),
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
