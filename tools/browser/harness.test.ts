import { describe, expect, it, vi } from "vitest";
import { chromePath, startServer } from "./harness.ts";

describe("chromePath", () => {
  it("prefers CHROME_PATH over any installed Chrome", () => {
    expect(chromePath({ CHROME_PATH: "/opt/chrome" }, () => true)).toBe(
      "/opt/chrome",
    );
  });

  it("takes the first google-chrome that exists", () => {
    const only = (p: string): boolean => p === "/usr/local/bin/google-chrome";
    expect(chromePath({}, only)).toBe("/usr/local/bin/google-chrome");
    expect(chromePath({}, () => true)).toBe("/usr/bin/google-chrome");
  });

  it("falls back to /usr/bin/google-chrome when none exists", () => {
    expect(chromePath({}, () => false)).toBe("/usr/bin/google-chrome");
  });
});

describe("startServer", () => {
  it("starts nothing for a given url, and its close does nothing", async () => {
    const start = vi.fn();
    const server = await startServer(
      { port: 4175, url: "http://example.test/" },
      start,
    );
    expect(server.base).toBe("http://example.test/");
    await server.close();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts Vite on the port when no url is given, and closes it", async () => {
    const close = vi.fn(() => Promise.resolve());
    const start = vi.fn(() =>
      Promise.resolve({ base: "http://127.0.0.1:4175/", close }),
    );
    const server = await startServer({ port: 4175, url: undefined }, start);
    expect(start).toHaveBeenCalledWith(4175);
    expect(server.base).toBe("http://127.0.0.1:4175/");
    await server.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
