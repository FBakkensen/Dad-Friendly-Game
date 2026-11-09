/* global console, process, URL */
/**
 * The function ratchet (#408, #418): for each measure, fails when a function in non-test src
 * passes the limit with no ceiling, rises past its ceiling, or when the measure's ceiling
 * list is not exact or rose against the base (origin/main, or FUNCTION_BASE). The rules are
 * in src/function-ratchet.ts.
 *   node scripts/function-ratchet.mjs                 check every measure
 *   node scripts/function-ratchet.mjs --print lines   one measure's over-limit functions, as JSON
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { splitGitPaths } from "../src/gate.ts";
import {
  COMPLEXITY,
  LINES,
  baseFromShow,
  complexityValues,
  isMeasured,
  judgeCeilings,
  measureFunctions,
  parseCeilings,
  problemLine,
} from "../src/function-ratchet.ts";

// Every path below is repo-relative, wherever this was started from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

// The C locale keeps git's messages in English, which baseFromShow reads.
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LC_ALL: "C" },
  });

// Untracked files too: a new file is measured before it is committed.
const files = splitGitPaths(
  git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
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

// Every function's cognitive complexity, from the plugin with a limit of 0 so each one
// reports. No type information is needed, so this is a few seconds, not a full lint.
const complexityLint = new ESLint({
  overrideConfigFile: true,
  // The scored code's own eslint-disable comments must neither hide a score nor name rules
  // this run does not load.
  allowInlineConfig: false,
  overrideConfig: [
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser },
      plugins: { sonarjs },
      rules: { "sonarjs/cognitive-complexity": ["error", 0] },
    },
  ],
});
const complexity = (await complexityLint.lintFiles(files)).flatMap((result) => {
  const path = files.find((each) => result.filePath.endsWith(`/${each}`));
  const fatal = result.messages.find((message) => message.fatal === true);
  if (path === undefined || fatal !== undefined) {
    console.error(
      `function-ratchet: cannot score ${result.filePath}: ${fatal?.message ?? "not a measured file"}`,
    );
    process.exit(1);
  }
  return complexityValues(spansByFile.get(path) ?? [], result.messages);
});

/** Each measure, its ceiling list, and every function's value under it. */
const checks = [
  {
    name: "lines",
    title: "Function lengths",
    measure: LINES,
    ceilings: "scripts/function-ceilings.json",
    values: spans.map((span) => ({ id: span.id, value: span.lines })),
  },
  {
    name: "complexity",
    title: "Function complexity",
    measure: COMPLEXITY,
    ceilings: "scripts/complexity-ceilings.json",
    values: complexity,
  },
];

const printing = process.argv.indexOf("--print");
if (printing !== -1) {
  const check = checks.find((each) => each.name === process.argv[printing + 1]);
  if (check === undefined) {
    console.error(
      `--print takes one of: ${checks.map((each) => each.name).join(", ")}`,
    );
    process.exit(2);
  }
  const over = new Map();
  for (const { id, value } of check.values) {
    if (value > check.measure.limit) {
      over.set(id, Math.max(value, over.get(id) ?? 0));
    }
  }
  console.log(JSON.stringify(Object.fromEntries([...over].sort()), null, 2));
  process.exit(0);
}

/** A list on the base (origin/main, or FUNCTION_BASE), through baseFromShow. */
function baseCeilings(path) {
  const ref = process.env.FUNCTION_BASE ?? "origin/main";
  let outcome;
  try {
    outcome = { kind: "shown", text: git("show", `${ref}:${path}`) };
  } catch (error) {
    outcome = { kind: "failed", message: String(error?.stderr ?? error) };
  }
  try {
    return baseFromShow(outcome);
  } catch (error) {
    console.error(`function-ratchet: ${String(error?.message ?? error)}`);
    process.exit(1);
  }
}

let failed = false;
for (const check of checks) {
  const { measure } = check;
  const problems = judgeCeilings({
    values: check.values,
    ceilings: parseCeilings(readFileSync(check.ceilings, "utf8")),
    base: baseCeilings(check.ceilings),
    measure,
  });
  if (problems.length > 0) {
    failed = true;
    console.error(
      `${check.title}: ${String(problems.length)} problem(s). No function may pass ${measure.unit(measure.limit)}; those in ${check.ceilings} may only come down.`,
    );
    for (const problem of problems) {
      console.error(`- ${problemLine(problem, measure)}`);
    }
    continue;
  }
  const over = new Set(
    check.values
      .filter((each) => each.value > measure.limit)
      .map((each) => each.id),
  ).size;
  console.log(
    `${check.title} passed (${String(over)} over ${measure.unit(measure.limit)}, all at their ceilings).`,
  );
}
process.exit(failed ? 1 : 0);
