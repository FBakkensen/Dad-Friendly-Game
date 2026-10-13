/* global console, process, URL */
// Prints the toolchain `npm run check` depends on, so CI and Cursor cloud
// agents can be compared line by line. With --strict, fails fast when the
// Node major differs from .nvmrc (the single source of truth for Node).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .trim()
      .split("\n")[0];
  } catch (error) {
    // Report the tool's own error line instead of crashing.
    return (
      String(error.stderr ?? "")
        .trim()
        .split("\n")[0] || "missing"
    );
  }
};
const javaHome = process.env.JAVA_HOME_21_X64 ?? process.env.JAVA_HOME;
const java = javaHome ? `${javaHome}/bin/java` : "java";
const chrome =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((path) =>
    existsSync(path),
  );
const javaRun = spawnSync(java, ["-version"], { encoding: "utf8" });
const javaVersion = javaRun.error
  ? "missing"
  : (javaRun.stderr || javaRun.stdout).trim().split("\n")[0];
const wanted = readFileSync(
  new URL("../.nvmrc", import.meta.url),
  "utf8",
).trim();

console.log(
  `os      ${run("sh", ["-c", ". /etc/os-release && echo $PRETTY_NAME"])}`,
);
console.log(`node    ${process.version} (.nvmrc ${wanted})`);
console.log(`npm     ${run("npm", ["--version"])}`);
console.log(`java    ${javaVersion} (${java})`);
console.log(
  `chrome  ${chrome ? run(chrome, ["--version"]) : "missing"} (${chrome ?? "-"})`,
);

if (process.argv.includes("--strict")) {
  const major = (version) => version.replace(/^v/, "").split(".")[0];
  if (major(process.version) !== major(wanted)) {
    console.error(
      `Node ${process.version} does not match .nvmrc ${wanted}. Run scripts/cloud-setup.sh or nvm use.`,
    );
    process.exit(1);
  }
}
