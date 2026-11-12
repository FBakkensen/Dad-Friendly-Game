import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILD_PLACEHOLDER,
  appVersion,
  buildId,
  stampServiceWorker,
} from "./build-stamp";

const WORKER = `const CACHE = "dad-mine-shell-v1";\n${BUILD_PLACEHOLDER}\nself.addEventListener("install", () => {});\n`;

describe("buildId", () => {
  it("takes the commit Actions builds, cut to seven characters", async () => {
    await expect(
      buildId({ GITHUB_SHA: "ef0459e4328802e8f9f739737fbe59904de0bf50" }, () =>
        Promise.reject(new Error("unused")),
      ),
    ).resolves.toBe("ef0459e");
  });

  it("asks git when Actions gives no commit", async () => {
    await expect(buildId({}, () => Promise.resolve("99dfac6\n"))).resolves.toBe(
      "99dfac6",
    );
  });

  it("reads local when there is no git either", async () => {
    await expect(
      buildId({}, () => Promise.reject(new Error("not a git repository"))),
    ).resolves.toBe("local");
    await expect(buildId({}, () => Promise.resolve("  "))).resolves.toBe(
      "local",
    );
  });
});

describe("stampServiceWorker", () => {
  it("writes the build into the worker and nothing else", () => {
    const stamped = stampServiceWorker(WORKER, "ef0459e");
    expect(stamped).toContain("// Build: ef0459e");
    expect(stamped).not.toContain(BUILD_PLACEHOLDER);
    expect(stamped.replace("// Build: ef0459e", BUILD_PLACEHOLDER)).toBe(
      WORKER,
    );
  });

  it("gives two builds two different workers, so the browser installs the new one", () => {
    expect(stampServiceWorker(WORKER, "ef0459e")).not.toBe(
      stampServiceWorker(WORKER, "99dfac6"),
    );
  });

  it("fails the build when the worker has lost its placeholder", () => {
    expect(() => stampServiceWorker("const CACHE = 1;\n", "ef0459e")).toThrow(
      /sw\.js/,
    );
  });

  it("refuses an id that is not a short plain word", () => {
    expect(() => stampServiceWorker(WORKER, "a\nevil()")).toThrow();
    expect(() => stampServiceWorker(WORKER, "x".repeat(25))).toThrow();
  });
});

describe("appVersion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is the build vite stamped", () => {
    vi.stubGlobal("__APP_BUILD__", "ef0459e");
    expect(appVersion()).toBe("ef0459e");
  });

  it("reads dev where no build stamped it", () => {
    expect(appVersion()).toBe("dev");
  });
});
