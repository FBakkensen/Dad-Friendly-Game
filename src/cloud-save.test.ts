import { describe, expect, it } from "vitest";
import type { FirebaseWebOptions } from "./auth";
import {
  applySignedInSave,
  createCloudSave,
  createMemoryCloudSave,
  createNoopCloudSave,
} from "./cloud-save";
import { createPocketGrid, dig, type PocketGrid } from "./grid";

const readyConfig = {
  kind: "ready",
  options: {
    apiKey: "key",
    authDomain: "demo.firebaseapp.com",
    projectId: "demo",
    appId: "1:2:web:3",
  },
} as const;

describe("applySignedInSave", () => {
  const local = dig({ grid: createPocketGrid(), index: 0 });
  const remoteGrid = dig({ grid: createPocketGrid(), index: 8 });

  it("uses the cloud grid when one is found", () => {
    expect(
      applySignedInSave({
        local,
        remote: { kind: "found", grid: remoteGrid },
      }),
    ).toEqual({ grid: remoteGrid, upload: false });
  });

  it("keeps local and uploads when the cloud has no save", () => {
    expect(applySignedInSave({ local, remote: { kind: "missing" } })).toEqual({
      grid: local,
      upload: true,
    });
  });

  it("keeps local and does not upload when the cloud is down", () => {
    expect(
      applySignedInSave({ local, remote: { kind: "unavailable" } }),
    ).toEqual({ grid: local, upload: false });
  });
});

describe("createCloudSave", () => {
  it("skips Firebase on localhost", async () => {
    const firebaseCalls: FirebaseWebOptions[] = [];
    const cloud = createCloudSave({
      config: readyConfig,
      hostname: "localhost",
      createFirebase: ({ options }) => {
        firebaseCalls.push(options);
        return createMemoryCloudSave();
      },
    });

    expect(firebaseCalls).toEqual([]);
    await expect(cloud.load({ uid: "local" })).resolves.toEqual({
      kind: "missing",
    });
  });

  it("uses Firebase on a real host when config is ready", () => {
    const stub = createMemoryCloudSave();
    const firebaseCalls: FirebaseWebOptions[] = [];
    const cloud = createCloudSave({
      config: readyConfig,
      hostname: "dad-friendly-game.web.app",
      createFirebase: ({ options }) => {
        firebaseCalls.push(options);
        return stub;
      },
    });

    expect(firebaseCalls).toEqual([readyConfig.options]);
    expect(cloud).toBe(stub);
  });

  it("stays local on a real host when config is missing", async () => {
    const cloud = createCloudSave({
      config: { kind: "absent" },
      hostname: "dad-friendly-game.web.app",
      createFirebase: () => {
        throw new Error("Firebase should not start");
      },
    });

    await expect(cloud.load({ uid: "anyone" })).resolves.toEqual({
      kind: "missing",
    });
  });
});

describe("createMemoryCloudSave", () => {
  it("round-trips a grid for one uid", async () => {
    const docs = new Map<string, PocketGrid>();
    const cloud = createMemoryCloudSave({ docs });
    const grid = dig({ grid: createPocketGrid(), index: 4 });

    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "missing",
    });
    await cloud.write({ uid: "dad", grid });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "found",
      grid,
    });
    expect(docs.get("dad")).toEqual(grid);
  });
});

describe("createNoopCloudSave", () => {
  it("never stores a grid", async () => {
    const cloud = createNoopCloudSave();
    await cloud.write({
      uid: "dad",
      grid: createPocketGrid(),
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "missing",
    });
  });
});
