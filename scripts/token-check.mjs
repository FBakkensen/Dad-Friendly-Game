/* global console, process */
/**
 * Flags hard-coded colours and spacing on CSS lines added since origin/main.
 * src/tokens.css is the place those values live. Mockups are the approved
 * pictures and are not part of this check.
 */
import { execSync } from "node:child_process";

const diff = execSync("git diff origin/main --unified=0 -- src/*.css", {
  encoding: "utf8",
});

const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const spacing = /(?<![.\w-])\d+px\b/;

let file = "";
const problems = [];
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    file = line.slice(6);
    continue;
  }
  if (
    line.startsWith("--- ") ||
    line.startsWith("@@") ||
    line.startsWith("diff ")
  ) {
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++")) {
    continue;
  }
  if (file.endsWith("/tokens.css") || file === "src/tokens.css") {
    continue;
  }
  const text = line.slice(1);
  const trimmed = text.trim();
  if (
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("//")
  ) {
    continue;
  }
  if (colour.test(text) || spacing.test(text)) {
    problems.push(`${file}: ${trimmed}`);
  }
}

if (problems.length > 0) {
  console.error(
    "Hard-coded colour or spacing in new CSS. Use the variables in src/tokens.css.",
  );
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log("Token check passed.");
