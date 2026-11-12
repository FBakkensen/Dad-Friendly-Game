// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { createMemoryCloudSave, fieldLogKey } from "./cloud-save";
import { readDeviceId } from "./device-id";
import type { FieldLogDocument } from "./field-log";
import { minedMountain } from "./test-fixtures";
import { createProgressStore } from "./progress-store";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const user = { uid: "test-dad", label: "Test Dad" };

describe("each device's field log in the cloud (#485)", () => {
  it("the phone and the PC each keep theirs, and neither wipes the other", async () => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const cloud = createMemoryCloudSave({ fieldLogs });
    await cloud.write({
      uid: user.uid,
      mountain: minedMountain(5_000),
      rev: 1,
      deviceId: "seed-device",
      lastSeen: 1_000,
    });
    const open = (storage: Storage) =>
      createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: storage,
        now: () => 1_000,
        cloudWriteGapMs: 0,
      });
    const phoneStorage = createMemoryStorage();
    const pcStorage = createMemoryStorage();
    const phone = open(phoneStorage);
    const pc = open(pcStorage);
    await vi.waitFor(() => {
      expect(phone.getSnapshot().ready).toBe(true);
      expect(pc.getSnapshot().ready).toBe(true);
    });
    phone.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    phone.dispatch({ kind: "buyTier", id: "helper" });
    phone.flush();
    pc.flush();

    const phoneId = readDeviceId(phoneStorage);
    const pcId = readDeviceId(pcStorage);
    expect(phoneId).not.toBe(pcId);
    await vi.waitFor(() => {
      expect(fieldLogs.get(fieldLogKey(user.uid, pcId))).toBeDefined();
    });
    const phoneLog = fieldLogs.get(fieldLogKey(user.uid, phoneId));
    expect(phoneLog?.events.map((event) => event.code)).toContain("tier.buy");
    expect(phoneLog?.snapshot.deviceId).toBe(phoneId);
    expect(fieldLogs.get(fieldLogKey(user.uid, pcId))?.snapshot.deviceId).toBe(
      pcId,
    );
    phone.dispose();
    pc.dispose();
  });
});
