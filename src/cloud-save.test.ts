import { describe, expect, it } from "vitest";
import {
  applySignedInSave,
  createMemoryCloudSave,
  createNoopCloudSave,
  createUnavailableCloudSave,
} from "./cloud-save";
import { APP_VERSION, snapshot, type FieldLogDocument } from "./field-log";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

describe("applySignedInSave", () => {
  const local = minedMountain(1);
  const remoteMountain = minedMountain(9);

  it("uses the cloud mountain when one is found", () => {
    expect(
      applySignedInSave({
        local,
        remote: { kind: "found", mountain: remoteMountain },
      }),
    ).toEqual({ mountain: remoteMountain, upload: false });
  });

  it("keeps the session mountain and uploads when the cloud has no save", () => {
    expect(applySignedInSave({ local, remote: { kind: "missing" } })).toEqual({
      mountain: local,
      upload: true,
    });
  });

  it("keeps the session mountain and does not upload when the cloud is down", () => {
    expect(
      applySignedInSave({ local, remote: { kind: "unavailable" } }),
    ).toEqual({ mountain: local, upload: false });
  });

  it("keeps the session mountain when cloud save is disabled", () => {
    expect(applySignedInSave({ local, remote: { kind: "disabled" } })).toEqual({
      mountain: local,
      upload: false,
    });
  });
});

describe("createMemoryCloudSave", () => {
  it("round-trips a mountain for one uid and notifies watchers", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const mountain = minedMountain(5);
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
    await expect(cloud.write({ uid: "dad", mountain })).resolves.toEqual({
      kind: "ok",
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "found",
      mountain,
    });
    expect(docs.get("dad")).toEqual(mountain);
    expect(seen).toEqual(["missing", "found"]);
    stop();
  });

  it("overwrites one field log per uid", async () => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const cloud = createMemoryCloudSave({ fieldLogs });
    const mountain = createMountain();
    const log: FieldLogDocument = {
      snapshot: snapshot(mountain, effectiveRates(mountain, 1), 1, APP_VERSION),
      events: [{ at: "2026-01-02T03:04:05.000Z", code: "tier.buy", data: {} }],
      updatedAt: 1,
    };
    await expect(cloud.writeFieldLog({ uid: "dad", log })).resolves.toEqual({
      kind: "ok",
    });
    expect(fieldLogs.get("dad")).toEqual(log);

    const next = { ...log, updatedAt: 2 };
    await cloud.writeFieldLog({ uid: "dad", log: next });
    expect(fieldLogs.get("dad")).toEqual(next);
    expect(fieldLogs.size).toBe(1);
  });
});

describe("createNoopCloudSave", () => {
  it("never stores a mountain", async () => {
    const cloud = createNoopCloudSave();
    await cloud.write({
      uid: "dad",
      mountain: createMountain(),
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "disabled",
    });
    await expect(
      cloud.writeFieldLog({
        uid: "dad",
        log: {
          snapshot: snapshot(
            createMountain(),
            effectiveRates(createMountain(), 1),
            1,
            APP_VERSION,
          ),
          events: [],
          updatedAt: 1,
        },
      }),
    ).resolves.toEqual({ kind: "ok" });
  });
});

describe("createUnavailableCloudSave", () => {
  it("refuses a field log", async () => {
    const cloud = createUnavailableCloudSave();
    await expect(
      cloud.writeFieldLog({
        uid: "dad",
        log: {
          snapshot: snapshot(
            createMountain(),
            effectiveRates(createMountain(), 1),
            1,
            APP_VERSION,
          ),
          events: [],
          updatedAt: 1,
        },
      }),
    ).resolves.toEqual({ kind: "failed", message: "unavailable" });
  });
});
