import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./pwa";

const containerWith = (register: ServiceWorkerContainer["register"]) =>
  ({ register }) as unknown as ServiceWorkerContainer;

describe("registerServiceWorker", () => {
  it("registers /sw.js at the root scope in production", async () => {
    const register = vi.fn(() =>
      Promise.resolve({} as ServiceWorkerRegistration),
    );
    await expect(
      registerServiceWorker({
        container: containerWith(register),
        production: true,
      }),
    ).resolves.toBe("registered");
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("skips in dev so Vite's dev server is never cached", async () => {
    const register = vi.fn();
    await expect(
      registerServiceWorker({
        container: containerWith(register),
        production: false,
      }),
    ).resolves.toBe("skipped");
    expect(register).not.toHaveBeenCalled();
  });

  it("skips when the browser has no service workers", async () => {
    await expect(
      registerServiceWorker({ container: undefined, production: true }),
    ).resolves.toBe("skipped");
  });

  it("reports a failed registration without throwing", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      registerServiceWorker({
        container: containerWith(() => Promise.reject(new Error("blocked"))),
        production: true,
      }),
    ).resolves.toBe("failed");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
