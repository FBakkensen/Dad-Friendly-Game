/* global console, process, URL */
/**
 * Fails when CSS added since origin/main hard-codes a colour or a px size,
 * or sets a tap target under --target-min (48px).
 * CSS already on origin/main is the allow-list: those lines are not additions.
 * src/tokens.css is where the raw values live. Mockups are approved pictures
 * and are not part of this check.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findingsInDiff } from "../src/token-check.ts";

try {
  execSync("git rev-parse --verify origin/main", { stdio: "ignore" });
} catch {
  execSync("git fetch origin main --depth=1", { stdio: "inherit" });
}

const diff = execSync("git diff origin/main -U20 -- src", { encoding: "utf8" });
const tokensCss = readFileSync(
  new URL("../src/tokens.css", import.meta.url),
  "utf8",
);
const findings = findingsInDiff(diff, tokensCss);

if (findings.length > 0) {
  console.error(
    "New CSS uses a raw colour, a raw px size, or a tap target under 48px. Use src/tokens.css. CSS already on main is allow-listed.",
  );
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.text} (${finding.kind})`);
  }
  process.exit(1);
}

console.log("Token check passed.");
