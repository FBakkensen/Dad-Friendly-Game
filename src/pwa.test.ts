import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, watchForAppUpdate } from "./pwa";

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

  it("prompts when a newer controller takes over, not on the first one", () => {
    let controller: ServiceWorker | null = null;
    const listeners = new Map<string, Set<() => void>>();
    const container = {
      get controller() {
        return controller;
      },
      addEventListener: (type: string, listener: () => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    } as unknown as ServiceWorkerContainer;
    const registration = {
      waiting: null,
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration;
    const onUpdate = vi.fn();
    const stop = watchForAppUpdate({
      container,
      registration,
      onUpdate,
      subscribeVisible: () => () => undefined,
    });
    listeners.get("controllerchange")?.forEach((listener) => {
      listener();
    });
    expect(onUpdate).not.toHaveBeenCalled();
    controller = {} as ServiceWorker;
    listeners.get("controllerchange")?.forEach((listener) => {
      listener();
    });
    expect(onUpdate).not.toHaveBeenCalled();
    listeners.get("controllerchange")?.forEach((listener) => {
      listener();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    stop();
  });

  it("prompts immediately when a worker is already waiting", () => {
    const onUpdate = vi.fn();
    const container = {
      controller: {} as ServiceWorker,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as ServiceWorkerContainer;
    watchForAppUpdate({
      container,
      registration: {
        waiting: {} as ServiceWorker,
        update: vi.fn(() => Promise.resolve()),
      } as unknown as ServiceWorkerRegistration,
      onUpdate,
      subscribeVisible: () => () => undefined,
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("checks for a new build when the page becomes visible", () => {
    const update = vi.fn(() => Promise.resolve());
    let visible: () => void = () => undefined;
    const container = {
      controller: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as ServiceWorkerContainer;
    const stop = watchForAppUpdate({
      container,
      registration: {
        waiting: null,
        update,
      } as unknown as ServiceWorkerRegistration,
      onUpdate: () => undefined,
      subscribeVisible: (listener) => {
        visible = listener;
        return () => undefined;
      },
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    visible();
    expect(update).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    visible();
    expect(update).toHaveBeenCalledTimes(1);
    stop();
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
