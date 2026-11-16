import { describe, expect, it } from "vitest";
import { createMemoryAuth } from "./auth";
import { createMemoryCloudSave } from "./cloud-save";
import { createLogger } from "./log";
import { applyMerged } from "./save-adopt";
import { createSession } from "./session";
import { createStoreContext, type SaveSide } from "./store-context";
import { createMemoryStorage, minedMountain } from "./test-fixtures";

/** A store's context on its own, as `createProgressStore` builds it. */
function context() {
  return createStoreContext(
    {
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave(),
      logger: createLogger({ limit: 20 }),
      storage: createMemoryStorage(),
      now: () => 1_000,
      tabWriter: undefined,
      cloudWriteGapMs: 0,
      fieldLogWriteGapMs: 0,
      resumeReadTimeoutMs: 0,
      archiveWaitMs: 0,
      deviceId: "device-test",
    },
    createSession(minedMountain(10), 1),
  );
}

const side = (mined: number, rev: number): SaveSide => ({
  mountain: minedMountain(mined),
  lastSeen: 1,
  rev,
  deviceId: "other-device",
  deviceLabel: "Safari on iPhone",
});

describe("applyMerged", () => {
  it("leaves an open sheet as it is: a copy that comes in while it is up is not played", () => {
    const ctx = context();
    const sheet = { local: side(10, 1), remote: side(20, 2) };
    ctx.saveConflict = sheet;
    const before = ctx.session;
    expect(applyMerged(ctx, side(30, 3))).toBe("conflict");
    expect(ctx.session).toBe(before);
    expect(ctx.saveConflict).toBe(sheet);
    expect(ctx.rev).toBe(0);
  });
});
