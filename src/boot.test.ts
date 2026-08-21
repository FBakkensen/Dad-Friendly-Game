import { describe, expect, it, vi } from "vitest";
import { createAppServices, createOffsetNow, parseBootOptions } from "./boot";
import type { AuthController } from "./auth";
import type { CloudSave } from "./cloud-save";
import { createPocketGrid, dig } from "./grid";

const READY_ENV = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "auth.example",
  VITE_FIREBASE_PROJECT_ID: "proj",
  VITE_FIREBASE_APP_ID: "app",
};

describe("parseBootOptions", () => {
  it("defaults to no memory save and no offset", () => {
    expect(parseBootOptions("")).toEqual({
      memorySave: false,
      idleOffsetMs: 0,
    });
  });

  it("reads memorySave=1", () => {
    expect(parseBootOptions("?memorySave=1").memorySave).toBe(true);
  });

  it("rejects memorySave values other than 1", () => {
    expect(parseBootOptions("?memorySave=true").memorySave).toBe(false);
  });

  it("reads idleOffsetMs", () => {
    expect(parseBootOptions("?idleOffsetMs=5000").idleOffsetMs).toBe(5000);
  });

  it("treats a non-numeric idleOffsetMs as 0", () => {
    expect(parseBootOptions("?idleOffsetMs=later").idleOffsetMs).toBe(0);
  });
});

describe("createOffsetNow", () => {
  it("adds the offset to the base clock", () => {
    const now = createOffsetNow({ base: () => 1000, offsetMs: 250 });
    expect(now()).toBe(1250);
  });
});

describe("createAppServices", () => {
  it("uses unconfigured auth and noop cloud save when env is absent", async () => {
    const importAuth = vi.fn();
    const { auth, progress } = await createAppServices({
      env: {},
      search: "",
      importers: { importAuth, importCloudSave: importAuth },
    });
    expect(auth.getState().kind).toBe("signed-out");
    expect(importAuth).not.toHaveBeenCalled();
    progress.dispose();
  });

  it("memorySave=1 signs in a test user with an in-memory cloud doc", async () => {
    const importAuth = vi.fn();
    const { auth, progress } = await createAppServices({
      env: {},
      search: "?memorySave=1",
      importers: { importAuth, importCloudSave: importAuth },
    });
    expect(auth.getState()).toMatchObject({
      kind: "signed-in",
      user: { uid: "dev-dad" },
    });
    expect(importAuth).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      const snapshot = progress.getSnapshot();
      expect(snapshot.ready).toBe(true);
    });

    progress.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.dispose();
  });

  it("lazy-imports Firebase when the config is ready", async () => {
    const auth: AuthController = {
      getState: () => ({ kind: "signed-out" }),
      subscribe: () => () => undefined,
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const { progress } = await createAppServices({
      env: READY_ENV,
      search: "",
      importers: {
        importAuth: () => Promise.resolve(auth),
        importCloudSave: () => Promise.resolve(cloudSave),
      },
    });
    expect(progress.getSnapshot().saveKind).not.toBe("error");
    progress.dispose();
  });

  it("falls back to noop services when the Firebase import fails", async () => {
    const { auth, progress } = await createAppServices({
      env: READY_ENV,
      search: "",
      importers: {
        importAuth: () => Promise.reject(new Error("offline")),
        importCloudSave: () => Promise.reject(new Error("offline")),
      },
    });
    expect(auth.getState().kind).toBe("signed-out");
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
    progress.dispose();
  });

  it("exposes now() shifted by idleOffsetMs", async () => {
    const { now } = await createAppServices({
      env: {},
      search: "?idleOffsetMs=90000",
      baseNow: () => 1000,
      importers: {
        importAuth: vi.fn(),
        importCloudSave: vi.fn(),
      },
    });
    expect(now()).toBe(91000);
  });

  it("ignores dev flags when devMode is off", async () => {
    const { auth, progress } = await createAppServices({
      env: {},
      search: "?memorySave=1&idleOffsetMs=90000",
      baseNow: () => 1000,
      devMode: false,
      importers: {
        importAuth: vi.fn(),
        importCloudSave: vi.fn(),
      },
    });
    expect(auth.getState().kind).toBe("signed-out");
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
    progress.dispose();
  });
});
