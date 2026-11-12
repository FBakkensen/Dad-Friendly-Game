import { describe, expect, it } from "vitest";
import type { FieldLogDocument } from "./field-log";
import { createMemoryAuth } from "./auth";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import {
  fieldRingKey,
  keepEvents,
  readKeptEvents,
  type RingScope,
} from "./field-ring";
import { FIELD_RING_GAP_MS } from "./local-saves";
import { createLogger, type LogEvent } from "./log";
import { createMountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { writeSessionSave } from "./session-save";
import { LOADING_LOG_MS } from "./store-actions";
import type { TabWriter } from "./tab-writer";

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

const codes = (events: readonly { code: string }[]): string[] =>
  events.map((event) => event.code);

const user = { uid: "test-dad", label: "Test Dad" };
const guestScope: RingScope = { kind: "guest" };
const dadScope: RingScope = { kind: "account", uid: user.uid };

/** A cloud that never answers: the signed-in save stays loading. */
function silentCloud(): CloudSave {
  return {
    ...createMemoryCloudSave(),
    watch: () => () => {
      return;
    },
  };
}

describe("the field log kept on this device (#479)", () => {
  it("comes back after a reload, with Tonight starting afresh", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const first = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    first.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    first.dispatch({ kind: "buyTier", id: "helper" });
    clock += 5;
    first.startOver();
    first.flush();
    first.dispose();
    expect(codes(readKeptEvents(storage, guestScope))).toEqual([
      "tier.buy",
      "run.start-over",
    ]);

    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(codes(again.fieldLog().events)).toEqual([
      "tier.buy",
      "run.start-over",
    ]);
    expect(again.tonightEvents()).toEqual([]);
    again.dispose();
  });

  it("keeps events without a hide, at most every few seconds", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 10_000 }));
    progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(storage.getItem(fieldRingKey(guestScope))).toBeNull();
    clock += FIELD_RING_GAP_MS;
    progress.dispatch({ kind: "buyTier", id: "helper" });
    // Killed here: no hide, no pagehide.
    expect(codes(readKeptEvents(storage, guestScope))).toEqual([
      "tier.buy",
      "tier.buy",
    ]);
    progress.dispose();
  });

  it("logs a Start over or a pass the store refuses while the save loads", () => {
    const storage = createMemoryStorage();
    const logger = createLogger({ limit: 20 });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: silentCloud(),
      logger,
      sessionStorage: storage,
      now: () => 5_000,
    });
    expect(progress.getSnapshot().ready).toBe(false);
    progress.startOver();
    expect(progress.passTheMine()).toBe(false);
    const refused = progress
      .fieldLog()
      .events.filter((event) => event.code === "run.refused");
    expect(refused.map((event) => event.data)).toEqual([
      { id: "start-over", source: "loading" },
    ]);
    expect(logger.latest()).toMatchObject({
      level: "error",
      code: "run.refused",
      detail: "start-over loading",
    });
    progress.flush();
    expect(codes(readKeptEvents(storage, dadScope))).toContain("run.refused");
    progress.dispose();
  });

  it("logs a pass refused while another tab plays", () => {
    const logger = createLogger({ limit: 20 });
    const reader: TabWriter = {
      seat: () => "other",
      subscribe: () => () => undefined,
      playHere: () => Promise.resolve(),
      onYield: () => undefined,
      confirm: () => undefined,
      release: () => undefined,
      restore: () => undefined,
      dispose: () => undefined,
    };
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      logger,
      sessionStorage: createMemoryStorage(),
      tabWriter: reader,
      now: () => 5_000,
    });
    expect(progress.passTheMine()).toBe(false);
    progress.startOver();
    expect(
      progress
        .fieldLog()
        .events.filter((event) => event.code === "run.refused")
        .map((event) => event.data),
    ).toEqual([{ id: "start-over", source: "other-tab" }]);
    progress.dispose();
  });

  it("says when the save has been loading too long, and when it lands", () => {
    let clock = 0;
    let answer: ((remote: { kind: "missing" }) => void) | undefined;
    const cloud: CloudSave = {
      ...createMemoryCloudSave(),
      watch: ({ onChange }) => {
        answer = onChange;
        return () => {
          return;
        };
      },
    };
    const logger = createLogger({ limit: 20 });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      logger,
      sessionStorage: createMemoryStorage(),
      now: () => clock,
    });
    const stuck = () =>
      progress.fieldLog().events.filter((event) => event.code === "save.stuck");
    progress.tick();
    clock = LOADING_LOG_MS - 1;
    progress.tick();
    expect(stuck()).toEqual([]);
    clock = LOADING_LOG_MS;
    progress.tick();
    progress.tick();
    expect(stuck().map((event) => event.data)).toEqual([
      { source: "unseen", ms: LOADING_LOG_MS },
    ]);
    expect(logger.latest()).toMatchObject({
      level: "error",
      code: "save.stuck",
    });
    answer?.({ kind: "missing" });
    clock += 1_000;
    progress.tick();
    expect(progress.getSnapshot().ready).toBe(true);
    const loaded = progress
      .fieldLog()
      .events.filter((event) => event.code === "save.loaded");
    expect(loaded.map((event) => event.data)).toEqual([
      { ms: LOADING_LOG_MS + 1_000 },
    ]);
    progress.dispose();
  });

  it("logs a device copy the storage refuses, and plays on", () => {
    const storage = createMemoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === fieldRingKey(guestScope)) {
        throw new Error("quota");
      }
      setItem(key, value);
    };
    const logged: LogEvent[] = [];
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      logger: {
        record: (event) => logged.push(event),
        latest: () => logged.at(-1),
      },
      sessionStorage: storage,
      now: () => 1_000,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    progress.dispatch({ kind: "buyTier", id: "helper" });
    progress.flush();
    expect(logged).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "field-log.keep",
        detail: "failed",
      }),
    );
    expect(codes(progress.fieldLog().events)).toEqual(["tier.buy"]);
    progress.dispose();
  });

  it("keeps nothing without storage, and a closed store refuses quietly", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      now: () => 1_000,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    progress.dispatch({ kind: "buyTier", id: "helper" });
    progress.flush();
    expect(codes(progress.fieldLog().events)).toEqual(["tier.buy"]);
    progress.dispose();
    progress.startOver();
    expect(codes(progress.fieldLog().events)).toEqual(["tier.buy"]);
  });

  it("logs a pass refused while the save loads", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...createMountain(), remaining: 0 },
      lastSeen: 1_000,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: silentCloud(),
      sessionStorage: storage,
      now: () => 5_000,
    });
    expect(progress.getSnapshot().mountain.remaining).toBe(0);
    expect(progress.passTheMine()).toBe(false);
    expect(
      progress
        .fieldLog()
        .events.filter((event) => event.code === "run.refused")
        .map((event) => event.data),
    ).toEqual([{ id: "pass", source: "loading" }]);
    progress.dispose();
  });

  it("plays signed in on a device with no storage", async () => {
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave(),
      now: () => 5_000,
    });
    await Promise.resolve();
    expect(progress.getSnapshot().ready).toBe(true);
    progress.flush();
    progress.dispose();
  });

  it("never brings one account's events into another's log", async () => {
    const storage = createMemoryStorage();
    const cloud = createMemoryCloudSave();
    const mom = { uid: "test-mom", label: "Test Mom" };
    const asDad = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => 1_000,
    });
    await Promise.resolve();
    asDad.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    asDad.dispatch({ kind: "buyTier", id: "helper" });
    asDad.flush();
    asDad.dispose();
    expect(codes(readKeptEvents(storage, dadScope))).toContain("tier.buy");

    const asMom = createProgressStore({
      auth: createMemoryAuth({
        state: { kind: "signed-in", user: mom },
        user: mom,
      }),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => 2_000,
    });
    await Promise.resolve();
    expect(codes(asMom.fieldLog().events)).not.toContain("tier.buy");
    asMom.flush();
    expect(
      codes(readKeptEvents(storage, { kind: "account", uid: mom.uid })),
    ).not.toContain("tier.buy");
    asMom.dispose();

    const asGuest = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 3_000,
    });
    expect(codes(asGuest.fieldLog().events)).not.toContain("tier.buy");
    asGuest.dispose();
  });

  it("starts a signed-out page on the guest's events, then the account's once signed in", async () => {
    const storage = createMemoryStorage();
    const guestPage = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 1_000,
    });
    guestPage.applyMutation((mountain) => ({ ...mountain, pocket: 1_000 }));
    guestPage.dispatch({ kind: "buyTier", id: "helper" });
    guestPage.flush();
    guestPage.dispose();
    // The dad's own evening, kept before this reload.
    keepEvents(storage, dadScope, [
      { at: "2026-11-11T21:00:00.000Z", code: "vein.tap", data: { stones: 5 } },
    ]);

    const auth = createMemoryAuth();
    const page = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave(),
      sessionStorage: storage,
      now: () => 2_000,
    });
    expect(codes(page.fieldLog().events)).toEqual(["tier.buy"]);
    page.applyMutation((mountain) => ({ ...mountain, pocket: 2_000 }));
    page.dispatch({ kind: "buyTier", id: "helper" });
    await auth.signIn();
    await Promise.resolve();
    expect(codes(page.fieldLog().events)).toEqual(["vein.tap"]);
    // The guest's last purchase was kept before the account took over.
    expect(codes(readKeptEvents(storage, guestScope))).toEqual([
      "tier.buy",
      "tier.buy",
    ]);
    page.dispose();
  });

  it("puts a Start over refused in another tab into the writer's next cloud log (#484)", async () => {
    const storage = createMemoryStorage();
    const base = createMemoryCloudSave();
    const uploads: FieldLogDocument[] = [];
    const cloud: CloudSave = {
      ...base,
      writeFieldLog: (args) => {
        uploads.push(args.log);
        return base.writeFieldLog(args);
      },
    };
    const reader: TabWriter = {
      seat: () => "other",
      subscribe: () => () => undefined,
      playHere: () => Promise.resolve(),
      onYield: () => undefined,
      confirm: () => undefined,
      release: () => undefined,
      restore: () => undefined,
      dispose: () => undefined,
    };
    const signedIn = () =>
      createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const writer = createProgressStore({
      auth: signedIn(),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => 1_000,
    });
    const other = createProgressStore({
      auth: signedIn(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: reader,
      now: () => 2_000,
    });
    await Promise.resolve();
    other.startOver();
    // Kept on the device at once, not at the next paced write.
    expect(codes(readKeptEvents(storage, dadScope))).toContain("run.refused");
    writer.flush();
    expect(codes(uploads.at(-1)?.events ?? [])).toContain("run.refused");
    other.dispose();
    writer.dispose();
  });
});
