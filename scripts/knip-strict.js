// knip exits 0 when it can't load a config file; treat any "ERROR:" line as a failure.
import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";

const result = spawnSync("npx", ["knip", ...process.argv.slice(2)], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (/^ERROR:/m.test(output)) {
  console.error("knip reported errors; failing.");
  process.exit(1);
}
process.exit(result.status ?? 1);
