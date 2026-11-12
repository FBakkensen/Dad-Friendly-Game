// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  type CloudSave,
  type CloudWriteResult,
} from "./cloud-save";
import { createLogger } from "./log";
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { noticesOf } from "./session";
import { minedMountain } from "./test-fixtures";

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
const codes = (events: readonly { code: string }[]): string[] =>
  events.map((event) => event.code);

/** A signed-in store on a cloud already holding `mountain`, loaded and ready. */
async function playing(
  mountain: Mountain,
  {
    cloud = createMemoryCloudSave(),
    now = () => 1_000_000,
    auth = createMemoryAuth({ state: { kind: "signed-in", user }, user }),
  }: {
    cloud?: CloudSave;
    now?: () => number;
    auth?: ReturnType<typeof createMemoryAuth>;
  } = {},
) {
  await cloud.write({
    uid: user.uid,
    mountain,
    rev: 1,
    deviceId: "seed-device",
    lastSeen: now(),
  });
  const logger = createLogger({ limit: 20 });
  const progress = createProgressStore({
    auth,
    cloudSave: cloud,
    sessionStorage: createMemoryStorage(),
    logger,
    now,
    cloudWriteGapMs: 0,
    archiveWaitMs: 30,
  });
  await vi.waitFor(() => {
    expect(progress.getSnapshot().ready).toBe(true);
  });
  return { cloud, progress, logger };
}

/** A cloud whose archive answers with `answer` (or never, when undefined). */
function archiveAnswers(answer: CloudWriteResult | undefined): CloudSave {
  const cloud = createMemoryCloudSave();
  return {
    ...cloud,
    archiveCopy: () =>
      answer === undefined
        ? new Promise<CloudWriteResult>(() => undefined)
        : Promise.resolve(answer),
  };
}

describe("a new run keeps the mountain he left in Saved copies (#480)", () => {
  it("Start over keeps it, and Play this one brings it back as a new run", async () => {
    let clock = 1_000_000;
    const left = { ...minedMountain(40_000), helpers: 3, startedAt: 500 };
    const { cloud, progress } = await playing(left, { now: () => clock });

    clock += 60_000;
    await expect(progress.startOver()).resolves.toBe(true);
    expect(progress.getSnapshot().mountain.pocket).toBe(0);
    const fresh = progress.getSnapshot().mountain.startedAt;
    expect(fresh).toBe(clock);
    const copies = await progress.savedCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0]?.reason).toBe("start-over");
    expect(copies[0]?.mountain.helpers).toBe(3);
    expect(codes(progress.fieldLog().events)).toContain("run.start-over");

    clock += 60_000;
    await expect(progress.restoreCopy(copies[0]?.id ?? "")).resolves.toBe(
      "saved",
    );
    const back = progress.getSnapshot().mountain;
    expect(back.helpers).toBe(3);
    expect(back.remaining).toBe(left.remaining);
    // A new run: later than the one in play, so the later-run rule keeps it.
    expect(back.startedAt).toBe(clock);
    expect(back.startedAt).toBeGreaterThan(fresh);
    await vi.waitFor(async () => {
      const saved = await cloud.load({ uid: user.uid });
      expect(saved.kind === "found" && saved.mountain.helpers).toBe(3);
      expect(saved.kind === "found" && saved.mountain.startedAt).toBe(clock);
    });
    const after = await progress.savedCopies();
    // The fresh run had nothing mined, so the restore kept no copy of it.
    expect(after.map((copy) => copy.reason)).toEqual(["start-over"]);
    progress.dispose();
  });

  it("does not find its relics and layers again when it comes back", async () => {
    const { progress } = await playing({
      ...minedMountain(60_000_000),
      startedAt: 500,
    });
    await expect(progress.startOver()).resolves.toBe(true);
    const [copy] = await progress.savedCopies();
    await expect(progress.restoreCopy(copy?.id ?? "")).resolves.toBe("saved");
    expect(progress.getSnapshot().mountain.remaining).toBe(
      copy?.mountain.remaining,
    );
    expect(noticesOf(progress.getSnapshot(), "reveal")).toEqual([]);
    expect(noticesOf(progress.getSnapshot(), "layer")).toEqual([]);
    expect(codes(progress.fieldLog().events)).not.toContain("relic.found");
    progress.dispose();
  });

  it("pays no time away to an earlier run brought back", async () => {
    let clock = 1_000_000;
    const left = { ...minedMountain(40_000), helpers: 50, startedAt: 500 };
    const { progress } = await playing(left, { now: () => clock });
    await expect(progress.startOver()).resolves.toBe(true);
    const [copy] = await progress.savedCopies();
    const pocket = copy?.mountain.pocket ?? -1;

    clock += 6 * 60 * 60 * 1000;
    await expect(progress.restoreCopy(copy?.id ?? "")).resolves.toBe("saved");
    expect(progress.getSnapshot().mountain.pocket).toBe(pocket);
    progress.dispose();
  });

  it("passing the mine keeps the finished mine, and it can be passed again", async () => {
    let clock = 1_000_000;
    const { progress } = await playing(
      { ...minedMountain(MOUNTAIN_STONES - 10), startedAt: 500 },
      { now: () => clock },
    );
    progress.applyMutation((mountain) => ({ ...mountain, remaining: 0 }));
    clock += 10;
    await expect(progress.passTheMine()).resolves.toBe(true);
    expect(progress.getSnapshot().mountain.legacy).toBe(1);
    const [copy] = await progress.savedCopies();
    expect(copy?.reason).toBe("pass");
    expect(copy?.mountain.remaining).toBe(0);
    expect(copy?.mountain.legacy).toBe(0);

    clock += 10;
    await expect(progress.restoreCopy(copy?.id ?? "")).resolves.toBe("saved");
    expect(progress.getSnapshot().mountain.legacy).toBe(0);
    clock += 10;
    // The Legacy comes from the mine itself, so passing it again adds one, not two.
    await expect(progress.passTheMine()).resolves.toBe(true);
    expect(progress.getSnapshot().mountain.legacy).toBe(1);
    progress.dispose();
  });

  it("keeps the mountain in play when the copy is refused, and says so", async () => {
    const left = { ...minedMountain(40_000), helpers: 3, startedAt: 500 };
    const { progress, logger } = await playing(left, {
      cloud: archiveAnswers({ kind: "failed", message: "unavailable" }),
    });
    await expect(progress.startOver()).resolves.toBe(false);
    expect(progress.getSnapshot().mountain.helpers).toBe(3);
    expect(progress.getSnapshot().mountain.startedAt).toBe(500);
    expect(logger.latest()).toMatchObject({
      level: "error",
      code: "save.archive",
      detail: "start-over unavailable",
    });
    const last = progress.fieldLog().events.at(-1);
    expect(last).toMatchObject({
      code: "save.archive",
      data: { id: "start-over", source: "unavailable" },
    });
    expect(codes(progress.fieldLog().events)).not.toContain("run.start-over");
    progress.dispose();
  });

  it("keeps the mountain in play when the copy write throws", async () => {
    const memory = createMemoryCloudSave();
    const { progress, logger } = await playing(
      { ...minedMountain(40_000), startedAt: 500 },
      {
        cloud: {
          ...memory,
          archiveCopy: () => Promise.reject(new Error("offline")),
        },
      },
    );
    await expect(progress.passTheMine()).resolves.toBe(false);
    await expect(progress.startOver()).resolves.toBe(false);
    expect(progress.getSnapshot().mountain.startedAt).toBe(500);
    expect(logger.latest()?.detail).toBe("start-over rejected");
    progress.dispose();
  });

  it("restores nothing where a copy cannot be kept first", async () => {
    const memory = createMemoryCloudSave();
    await memory.archiveCopy?.({
      uid: user.uid,
      mountain: { ...minedMountain(9), startedAt: 500 },
      lastSeen: 1,
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      reason: "conflict",
    });
    const noShelf: CloudSave = {
      load: memory.load,
      write: memory.write,
      writeFieldLog: memory.writeFieldLog,
      watch: memory.watch,
      ...(memory.listCopies === undefined
        ? {}
        : { listCopies: memory.listCopies }),
    };
    const { progress } = await playing(
      { ...minedMountain(40_000), startedAt: 500 },
      { cloud: noShelf },
    );
    const [copy] = await progress.savedCopies();
    await expect(progress.restoreCopy(copy?.id ?? "")).resolves.toBe("kept");
    expect(progress.getSnapshot().mountain.pocket).toBe(40_000);
    progress.dispose();
  });

  it("gives up on a copy that does not land in time", async () => {
    const left = { ...minedMountain(40_000), helpers: 3, startedAt: 500 };
    const { progress, logger } = await playing(left, {
      cloud: archiveAnswers(undefined),
    });
    const started = progress.startOver();
    // One run at a time: a second press while the first is keeping the mountain does nothing.
    await expect(progress.startOver()).resolves.toBe(false);
    expect(progress.fieldLog().events.at(-1)).toMatchObject({
      code: "run.refused",
      data: { id: "start-over", source: "keeping" },
    });
    await expect(started).resolves.toBe(false);
    expect(progress.getSnapshot().mountain.helpers).toBe(3);
    expect(logger.latest()?.detail).toBe("start-over timeout");
    progress.dispose();
  });

  it("starts no run on the save he signed out of while the copy was on its way", async () => {
    let land: (result: CloudWriteResult) => void = () => undefined;
    const memory = createMemoryCloudSave();
    const cloud: CloudSave = {
      ...memory,
      archiveCopy: () =>
        new Promise<CloudWriteResult>((resolve) => {
          land = resolve;
        }),
    };
    const auth = createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const { progress } = await playing(
      { ...minedMountain(40_000), startedAt: 500 },
      { cloud, auth },
    );
    const started = progress.startOver();
    await auth.signOut();
    land({ kind: "ok" });
    await expect(started).resolves.toBe(false);
    expect(codes(progress.fieldLog().events)).not.toContain("run.start-over");
    progress.dispose();
  });

  it("restores nothing when the save moved on while the old one was kept", async () => {
    let land: (result: CloudWriteResult) => void = () => undefined;
    const memory = createMemoryCloudSave();
    await memory.archiveCopy?.({
      uid: user.uid,
      mountain: { ...minedMountain(9), startedAt: 500 },
      lastSeen: 1,
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      reason: "conflict",
    });
    const cloud: CloudSave = {
      ...memory,
      archiveCopy: () =>
        new Promise<CloudWriteResult>((resolve) => {
          land = resolve;
        }),
    };
    const { progress } = await playing(
      { ...minedMountain(40_000), startedAt: 500 },
      { cloud },
    );
    const [copy] = await progress.savedCopies();
    const restored = progress.restoreCopy(copy?.id ?? "");
    await vi.waitFor(() => {
      expect(codes(progress.fieldLog().events)).not.toContain("save.restore");
    });
    progress.dispose();
    land({ kind: "ok" });
    await expect(restored).resolves.toBe("kept");
  });

  it("starts over at once when nothing has been mined, and keeps no copy", async () => {
    const { progress } = await playing({ ...minedMountain(0), startedAt: 500 });
    const started = progress.startOver();
    expect(progress.getSnapshot().mountain.startedAt).toBe(1_000_000);
    await expect(started).resolves.toBe(true);
    await expect(progress.savedCopies()).resolves.toEqual([]);
    progress.dispose();
  });

  it("does not start the new run when another device's run arrived meanwhile", async () => {
    let land: (result: CloudWriteResult) => void = () => undefined;
    const memory = createMemoryCloudSave();
    const cloud: CloudSave = {
      ...memory,
      archiveCopy: () =>
        new Promise<CloudWriteResult>((resolve) => {
          land = resolve;
        }),
    };
    const { progress } = await playing(
      { ...minedMountain(40_000), startedAt: 500 },
      { cloud },
    );
    const started = progress.startOver();
    const saved = await cloud.load({ uid: user.uid });
    await cloud.write({
      uid: user.uid,
      mountain: { ...minedMountain(7), startedAt: 900 },
      rev: (saved.kind === "found" ? (saved.rev ?? 0) : 0) + 1,
      deviceId: "other-device",
      lastSeen: 1_000_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.startedAt).toBe(900);
    });
    land({ kind: "ok" });
    await expect(started).resolves.toBe(false);
    expect(progress.getSnapshot().mountain.startedAt).toBe(900);
    expect(progress.getSnapshot().mountain.pocket).toBe(7);
    progress.dispose();
  });

  it("starts over at once signed out, where there is no shelf", async () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => 2_000,
    });
    progress.applyMutation((mountain) => ({ ...mountain, remaining: 10 }));
    const started = progress.startOver();
    expect(progress.getSnapshot().mountain.remaining).toBe(MOUNTAIN_STONES);
    await expect(started).resolves.toBe(true);
    progress.dispose();
  });
});
