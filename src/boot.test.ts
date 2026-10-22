import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppServices, parseBootOptions } from "./boot";
import type { AuthController } from "./auth";
import type { CloudSave } from "./cloud-save";
import { minedMountain } from "./test-fixtures";

const firebaseStubs = vi.hoisted(() => ({
  auth: vi.fn(),
  cloudSave: vi.fn(),
}));

vi.mock("./firebase-auth", () => ({ createFirebaseAuth: firebaseStubs.auth }));
vi.mock("./firebase-save", () => ({
  createFirebaseCloudSave: firebaseStubs.cloudSave,
}));

const READY_ENV = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "auth.example",
  VITE_FIREBASE_PROJECT_ID: "proj",
  VITE_FIREBASE_APP_ID: "app",
};

beforeEach(() => {
  firebaseStubs.auth.mockReset();
  firebaseStubs.cloudSave.mockReset();
});

describe("parseBootOptions", () => {
  it("defaults to no memory save", () => {
    expect(parseBootOptions("")).toEqual({
      memorySave: false,
      previewTrouble: false,
      previewConflict: false,
      previewSave: undefined,
      previewCopies: false,
    });
  });

  it("reads memorySave=1", () => {
    expect(parseBootOptions("?memorySave=1").memorySave).toBe(true);
  });

  it("reads trouble=cave-in for the layout check", () => {
    expect(parseBootOptions("?trouble=cave-in").previewTrouble).toBe(true);
    expect(parseBootOptions("?trouble=flood").previewTrouble).toBe(false);
    expect(parseBootOptions("?saves=two").previewConflict).toBe(true);
    expect(parseBootOptions("?saves=one").previewConflict).toBe(false);
    expect(parseBootOptions("?save=loading").previewSave).toBe("loading");
    expect(parseBootOptions("?save=error").previewSave).toBe("error");
    expect(parseBootOptions("?save=nope").previewSave).toBeUndefined();
    expect(parseBootOptions("?copies=shelf").previewCopies).toBe(true);
    expect(parseBootOptions("?copies=one").previewCopies).toBe(false);
  });

  it("rejects memorySave values other than 1", () => {
    expect(parseBootOptions("?memorySave=true").memorySave).toBe(false);
  });
});

describe("createAppServices", () => {
  it("uses unconfigured auth and noop cloud save when env is absent", async () => {
    const { auth, progress } = await createAppServices({ env: {}, search: "" });
    expect(auth.getState().kind).toBe("signed-out");
    expect(firebaseStubs.auth).not.toHaveBeenCalled();
    progress.dispose();
  });

  it("memorySave=1 signs in a test user with an in-memory cloud doc", async () => {
    const { auth, progress } = await createAppServices({
      env: {},
      search: "?memorySave=1",
    });
    expect(auth.getState()).toMatchObject({
      kind: "signed-in",
      user: { uid: "dev-dad" },
    });
    expect(firebaseStubs.auth).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      const snapshot = progress.getSnapshot();
      expect(snapshot.ready).toBe(true);
    });

    progress.applyMutation(() => minedMountain(1));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.dispose();
  });

  it("trouble=cave-in previews a cave-in while developing", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?trouble=cave-in",
    });
    expect(progress.getSnapshot().trouble).toMatchObject({
      kind: "cave-in",
      tier: "cart",
    });
    progress.dispose();
  });

  it("ignores the trouble preview outside dev", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?trouble=cave-in",
      devMode: false,
    });
    expect(progress.getSnapshot().trouble).toBeUndefined();
    progress.dispose();
  });

  it("save=error previews an unreachable save while developing", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?save=error",
    });
    expect(progress.getSnapshot().saveKind).toBe("error");
    progress.dispose();
  });

  it("save=loading keeps the loading line while developing", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?save=loading",
    });
    expect(progress.getSnapshot().saveKind).toBe("loading");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(progress.getSnapshot().saveKind).toBe("loading");
    progress.dispose();
  });

  it("copies=shelf seeds an earlier run and a playable copy", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?copies=shelf",
    });
    const copies = await progress.savedCopies();
    expect(copies.map((copy) => copy.deviceLabel).sort()).toEqual([
      "Kitchen tablet",
      "Old phone",
    ]);
    progress.dispose();
  });

  it("ignores the save-line and copies previews outside dev", async () => {
    const { progress } = await createAppServices({
      env: {},
      search: "?save=error&copies=shelf",
      devMode: false,
    });
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
    expect(await progress.savedCopies()).toEqual([]);
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
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    firebaseStubs.auth.mockReturnValue(auth);
    firebaseStubs.cloudSave.mockReturnValue(cloudSave);
    const { progress } = await createAppServices({
      env: READY_ENV,
      search: "",
    });
    expect(progress.getSnapshot().saveKind).not.toBe("error");
    progress.dispose();
  });

  it("falls back to noop services when the Firebase import fails", async () => {
    firebaseStubs.auth.mockRejectedValue(new Error("offline"));
    firebaseStubs.cloudSave.mockRejectedValue(new Error("offline"));
    const { auth, progress } = await createAppServices({
      env: READY_ENV,
      search: "",
    });
    expect(auth.getState().kind).toBe("signed-out");
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
    progress.dispose();
  });

  it("ignores dev flags when devMode is off", async () => {
    const { auth, progress } = await createAppServices({
      env: {},
      search: "?memorySave=1",
      devMode: false,
    });
    expect(auth.getState().kind).toBe("signed-out");
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
    progress.dispose();
  });
});
