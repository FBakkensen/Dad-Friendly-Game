import { describe, expect, it } from "vitest";
import { createMemoryAuth } from "./auth";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import { FIELD_RING_KEY, readKeptEvents } from "./field-ring";
import { FIELD_RING_GAP_MS } from "./local-saves";
import { createLogger } from "./log";
import { createProgressStore } from "./progress-store";
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
    expect(codes(readKeptEvents(storage))).toEqual([
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
    expect(storage.getItem(FIELD_RING_KEY)).toBeNull();
    clock += FIELD_RING_GAP_MS;
    progress.dispatch({ kind: "buyTier", id: "helper" });
    // Killed here: no hide, no pagehide.
    expect(codes(readKeptEvents(storage))).toEqual(["tier.buy", "tier.buy"]);
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
    expect(codes(readKeptEvents(storage))).toContain("run.refused");
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
});
