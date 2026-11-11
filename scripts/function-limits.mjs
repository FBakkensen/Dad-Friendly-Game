/* global console, process, URL */
/**
 * The function limits (#408, #418, #422): fails when any function in non-test src passes
 * 150 lines or a cognitive complexity of 15. There is no allow-list. The rules are in
 * src/function-limits.ts.
 *   node scripts/function-limits.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitGitPaths } from "../src/gate.ts";
import {
  COMPLEXITY,
  LINES,
  complexityLinter,
  complexityValues,
  isMeasured,
  measureFunctions,
  overLimit,
  overLine,
} from "../src/function-limits.ts";

// Every path below is repo-relative, wherever this was started from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

// Untracked files too: a new file is measured before it is committed.
const files = splitGitPaths(
  execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
)
  // A file deleted but not yet committed is still listed: skip what is gone.
  .filter((path) => isMeasured(path) && existsSync(path));
const spansByFile = new Map(
  files.map((path) => [
    path,
    measureFunctions(path, readFileSync(path, "utf8")),
  ]),
);
const spans = [...spansByFile.values()].flat();

const complexity = (await complexityLinter().lintFiles(files)).flatMap(
  (result) => {
    const path = files.find((each) => result.filePath.endsWith(`/${each}`));
    const fatal = result.messages.find((message) => message.fatal === true);
    if (path === undefined || fatal !== undefined) {
      console.error(
        `function-limits: cannot score ${result.filePath}: ${fatal?.message ?? "not a measured file"}`,
      );
      process.exit(1);
    }
    return complexityValues(spansByFile.get(path) ?? [], result.messages);
  },
);

/** Each measure and every function's value under it. */
const checks = [
  {
    title: "Function lengths",
    measure: LINES,
    values: spans.map((span) => ({ id: span.id, value: span.lines })),
  },
  { title: "Function complexity", measure: COMPLEXITY, values: complexity },
];

let failed = false;
for (const { title, measure, values } of checks) {
  const over = overLimit(values, measure);
  if (over.length === 0) {
    console.log(
      `${title} passed: every function is within ${measure.unit(measure.limit)}.`,
    );
    continue;
  }
  failed = true;
  console.error(
    `${title}: ${String(over.length)} function(s) over ${measure.unit(measure.limit)}. There are no exceptions.`,
  );
  for (const each of over) {
    console.error(`- ${overLine(each, measure)}`);
  }
}
process.exit(failed ? 1 : 0);
