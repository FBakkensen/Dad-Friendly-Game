/* global process */
// Runs the Firestore rules tests, then the field-log reader, in the emulator.
// firebase-tools needs Java 21+; GitHub's runners ship one beside the default
// JDK (JAVA_HOME_21_X64), so use it.
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";

const env = { ...process.env };
const java21 = env.JAVA_HOME_21_X64;
if (java21) {
  env.JAVA_HOME = java21;
  env.PATH = `${join(java21, "bin")}${delimiter}${env.PATH ?? ""}`;
}
const result = spawnSync(
  "npx",
  [
    "firebase",
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    "demo-dad-friendly",
    "vitest run --config rules-test/vitest.config.ts && vitest run --config tools/vitest.config.ts",
  ],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);
