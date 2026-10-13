import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("field-log command", () => {
  it("prints help before it touches credentials", () => {
    const result = run(
      ["--help"],
      envWithoutEmulator("/no/such/field-log-credentials.json"),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("gcloud auth application-default login");
    expect(result.stdout).toContain("GOOGLE_APPLICATION_CREDENTIALS");
    expect(result.stdout).toContain("--uid");
  });

  it("reports a bad Application Default Credentials file when no emulator is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "field-log-"));
    const file = join(dir, "bad.json");
    writeFileSync(file, "{ not credentials }\n");
    const result = run(["--uid", "dad"], envWithoutEmulator(file));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Could not use Application Default Credentials.",
    );
    expect(result.stderr).toContain("gcloud auth application-default login");
    expect(result.stderr).toContain("GOOGLE_APPLICATION_CREDENTIALS");
  });
});

function envWithoutEmulator(credentials: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST;
  env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  return env;
}

function run(args: readonly string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["tools/field-log.ts", ...args], {
    encoding: "utf8",
    env,
    timeout: 20_000,
  });
}
