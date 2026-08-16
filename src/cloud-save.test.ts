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

  it("keeps the session grid and uploads when the cloud has no save", () => {
    expect(applySignedInSave({ local, remote: { kind: "missing" } })).toEqual({
      grid: local,
      upload: true,
    });
  });

  it("keeps the session grid and does not upload when the cloud is down", () => {
    expect(
      applySignedInSave({ local, remote: { kind: "unavailable" } }),
    ).toEqual({ grid: local, upload: false });
  });

  it("keeps the session grid when cloud save is disabled", () => {
    expect(applySignedInSave({ local, remote: { kind: "disabled" } })).toEqual({
      grid: local,
      upload: false,
    });
  });
});

describe("createCloudSave", () => {
  it("uses Firebase when config is ready", () => {
    const stub = createMemoryCloudSave();
    const firebaseCalls: FirebaseWebOptions[] = [];
    const cloud = createCloudSave({
      config: readyConfig,
      createFirebase: ({ options }) => {
        firebaseCalls.push(options);
        return stub;
      },
    });

    expect(firebaseCalls).toEqual([readyConfig.options]);
    expect(cloud).toBe(stub);
  });

  it("stays disabled when config is missing", async () => {
    const cloud = createCloudSave({
      config: { kind: "absent" },
      createFirebase: () => {
        throw new Error("Firebase should not start");
      },
    });

    await expect(cloud.load({ uid: "anyone" })).resolves.toEqual({
      kind: "disabled",
    });
  });
});

describe("createMemoryCloudSave", () => {
  it("round-trips a grid for one uid and notifies watchers", async () => {
    const docs = new Map<string, PocketGrid>();
    const cloud = createMemoryCloudSave({ docs });
    const grid = dig({ grid: createPocketGrid(), index: 4 });
    const seen: string[] = [];
    const stop = cloud.watch({
      uid: "dad",
      onChange: (remote) => {
        seen.push(remote.kind);
      },
    });

    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "missing",
    });
    await expect(cloud.write({ uid: "dad", grid })).resolves.toEqual({
      kind: "ok",
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "found",
      grid,
    });
    expect(docs.get("dad")).toEqual(grid);
    expect(seen).toEqual(["missing", "found"]);
    stop();
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
      kind: "disabled",
    });
  });
});
