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

  it("uses the cloud mountain when it has more progress", () => {
    expect(
      applySignedInSave({
        local,
        remote: { kind: "found", mountain: remoteMountain },
      }),
    ).toEqual({ mountain: remoteMountain, upload: false });
  });

  it("keeps the phone and uploads when the phone has more progress", () => {
    expect(
      applySignedInSave({
        local: remoteMountain,
        localLastSeen: 10,
        remote: { kind: "found", mountain: local, lastSeen: 99 },
      }),
    ).toEqual({ mountain: remoteMountain, upload: true });
  });

  it("keeps the phone and does not upload when progress ties", () => {
    expect(
      applySignedInSave({
        local,
        localLastSeen: 4,
        remote: { kind: "found", mountain: { ...local }, lastSeen: 4 },
      }),
    ).toEqual({ mountain: local, upload: false });
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
    await expect(
      cloud.write({
        uid: "dad",
        mountain,
        rev: 1,
        deviceId: "device-dad-1",
      }),
    ).resolves.toEqual({
      kind: "ok",
    });
    await expect(
      cloud.write({
        uid: "dad",
        mountain,
        rev: 1,
        deviceId: "device-dad-1",
      }),
    ).resolves.toEqual({
      kind: "rejected",
      message: "permission-denied",
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "found",
      mountain,
      rev: 1,
      deviceId: "device-dad-1",
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

  it("keeps three unexpired copies and can refuse the archive", async () => {
    const gate = { fail: false };
    const holdEcho = { held: false };
    const cloud = createMemoryCloudSave({ archiveGate: gate, holdEcho });
    const mountain = minedMountain(3);
    holdEcho.held = true;
    await cloud.write({
      uid: "dad",
      mountain,
      rev: 1,
      deviceId: "device-dad-1",
      deviceLabel: "Chrome on Android",
      lastSeen: 5,
    });
    holdEcho.held = false;
    await expect(cloud.load({ uid: "dad" })).resolves.toMatchObject({
      kind: "found",
      deviceLabel: "Chrome on Android",
      rev: 1,
    });
    gate.fail = true;
    await expect(
      cloud.archiveCopy?.({
        uid: "dad",
        mountain,
        lastSeen: 5,
        rev: 1,
        deviceId: "device-dad-1",
        deviceLabel: "Chrome on Android",
      }),
    ).resolves.toEqual({ kind: "failed", message: "unavailable" });
    gate.fail = false;
    for (let index = 0; index < 4; index += 1) {
      await cloud.archiveCopy?.({
        uid: "dad",
        mountain: minedMountain(index + 1),
        lastSeen: index,
        rev: index + 1,
        deviceId: "device-dad-1",
        deviceLabel: "Chrome on Android",
      });
    }
    await cloud.archiveCopy?.({
      uid: "mom",
      mountain,
      lastSeen: 1,
      rev: 1,
      deviceId: "device-mom-1",
      deviceLabel: "Safari on iPhone",
    });
    const now = Date.now();
    const listed = await cloud.listCopies?.({ uid: "dad", now });
    expect(listed).toHaveLength(3);
    expect(listed?.[0]?.mountain.pocket).toBe(4);
    expect(listed?.[2]?.mountain.pocket).toBe(2);
    await expect(
      cloud.listCopies?.({ uid: "dad", now: now + 8 * 24 * 60 * 60 * 1000 }),
    ).resolves.toEqual([]);
  });
});

describe("createNoopCloudSave", () => {
  it("never stores a mountain", async () => {
    const cloud = createNoopCloudSave();
    await cloud.write({
      uid: "dad",
      mountain: createMountain(),
      rev: 1,
      deviceId: "device-dad-1",
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
    await expect(
      cloud.archiveCopy?.({
        uid: "dad",
        mountain: createMountain(),
        lastSeen: 1,
        rev: 1,
        deviceId: "device-dad-1",
        deviceLabel: "Chrome on Android",
      }),
    ).resolves.toEqual({ kind: "ok" });
    await expect(cloud.listCopies?.({ uid: "dad", now: 1 })).resolves.toEqual(
      [],
    );
  });
});

describe("createUnavailableCloudSave", () => {
  it("refuses a field log", async () => {
    const cloud = createUnavailableCloudSave();
    await expect(cloud.load({ uid: "dad", fresh: true })).resolves.toEqual({
      kind: "unavailable",
    });
    await expect(
      cloud.write({
        uid: "dad",
        mountain: createMountain(),
        rev: 1,
        deviceId: "device-123",
      }),
    ).resolves.toEqual({ kind: "failed", message: "unavailable" });
    await expect(
      cloud.archiveCopy?.({
        uid: "dad",
        mountain: createMountain(),
        lastSeen: 1,
        rev: 1,
        deviceId: "device-123",
        deviceLabel: "Chrome on Android",
      }),
    ).resolves.toEqual({ kind: "failed", message: "unavailable" });
    await expect(cloud.listCopies?.({ uid: "dad", now: 1 })).resolves.toEqual(
      [],
    );
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
