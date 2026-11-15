// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth, createUnconfiguredAuth } from "./auth";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import { NO_PROJECT, placeOrder } from "./city";
import { holdFactors } from "./economy/factors";
import { nightReport } from "./frame-cards";
import { END_CARD } from "./frame-cards-words";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { createMemoryStorage } from "./mountain-screen.harness";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { writeSessionSave } from "./session-save";
import { shiftReport } from "./shift-report-view";
import { EMPTY_STOCK } from "./stock";

/** The frame's cards: the shift report and the end card (#663). */

const HOUR = 60 * 60 * 1000;

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [FRESH_OFF]: 0 });
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
});

/** Three on each stage, the wagon's driver and two builders, on this project. */
function crew(project: Mountain["project"], stones = 0): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 12 },
    jobs: { drilling: 3, haulage: 3, hoisting: 3, driving: 1, building: 2 },
    stock: { ...start.stock, stones },
    project,
  };
}

const ROOF_NEARLY_IN: Mountain["project"] = {
  kind: "delivering",
  site: {
    building: "lightTower",
    step: 2,
    arrived: { ...EMPTY_STOCK, stones: 999_000 },
    onSite: EMPTY_STOCK,
  },
};

/** What the card over the frame shows. */
function cardOf(root: HTMLElement) {
  const found = root.querySelector<HTMLElement>(".frame-card");
  if (found === null) {
    throw new Error("the card did not render");
  }
  return {
    shown: !found.hidden,
    kind: found.dataset["card"],
    title: found.querySelector(".frame-card-title")?.textContent,
    lines: [...found.querySelectorAll(".frame-card-line")].map(
      (line) => line.textContent,
    ),
    key: found.querySelector<HTMLButtonElement>(".frame-card-key"),
  };
}

/**
 * The frame on a store at `clock`; `saved` is a save closed at 0, so a clock
 * past it opens on a night.
 */
function mount({ saved, at = 0 }: { saved?: Mountain; at?: number } = {}) {
  const clock = at;
  const storage = createMemoryStorage();
  if (saved !== undefined) {
    writeSessionSave({ storage, mountain: saved, lastSeen: 0 });
  }
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    now: () => clock,
  });
  const screen = mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    now: () => clock,
    signal: unmount.signal,
  });
  const card = () => cardOf(root);
  const press = () => {
    card().key?.click();
  };
  return {
    root,
    progress,
    screen,
    card,
    press,
  };
}

const user = { uid: "dev-slice", label: "Dev Dad" };

/**
 * The frame on a signed-in store whose cloud copy was closed at `closed`,
 * opened at 9 h: the save loads after the frame is up.
 */
async function mountSignedIn(saved: Mountain, closed: number) {
  const storage = createMemoryStorage();
  const cloudSave = createMemoryCloudSave();
  await cloudSave.write({
    uid: user.uid,
    mountain: saved,
    lastSeen: closed,
    rev: 1,
    deviceId: "kitchen-tablet",
  });
  // The cloud answers once `load` is called: the frame is up first.
  let answer = (): void => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const late: CloudSave = {
    ...cloudSave,
    load: (args) => answered.then(() => cloudSave.load(args)),
    watch: (args) => {
      let stop = (): void => undefined;
      void answered.then(() => {
        stop = cloudSave.watch(args);
      });
      return () => {
        stop();
      };
    },
  };
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const auth = createMemoryAuth({ state: { kind: "signed-in", user }, user });
  const progress = createProgressStore({
    auth,
    cloudSave: late,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    now: () => 9 * HOUR,
  });
  mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    now: () => 9 * HOUR,
    signal: unmount.signal,
  });
  return {
    root,
    progress,
    cloudSave,
    card: () => cardOf(root),
    load: answer,
  };
}

describe("the shift report", () => {
  it("greets a night with the report's head, its night bar and its lines", () => {
    const { card, root, progress } = mount({
      saved: crew(NO_PROJECT),
      at: 9 * HOUR,
    });
    const report = nightReport(progress.getSnapshot());
    if (report === undefined) {
      throw new Error("a fresh night has a report");
    }
    const view = shiftReport(report);
    expect(card()).toMatchObject({
      shown: true,
      kind: "report",
      title: "Shift report",
      lines: [view.head, ...view.lines],
    });
    expect(card().key?.textContent).toBe("Resume");
    const produced = root.querySelector<HTMLElement>(".frame-card-produced");
    expect(produced?.style.width).toBe(
      `${String(Math.round(view.bar.produced * 100))}%`,
    );
    expect(root.querySelector(".frame-card-left")?.textContent).toBe(
      "production 8 h",
    );
    expect(root.querySelector(".frame-card-right")?.textContent).toBe(
      view.bar.right,
    );
  });

  it("closes the night through the store on Resume", () => {
    const { card, press, progress } = mount({
      saved: crew(NO_PROJECT),
      at: 9 * HOUR,
    });
    press();
    expect(nightReport(progress.getSnapshot())).toBeUndefined();
    expect(card().shown).toBe(false);
  });

  it("waits for a signed-in save, and closes the workforce when its night comes in", async () => {
    const { card, root, progress, load } = await mountSignedIn(
      placeOrder(crew(NO_PROJECT)),
      0,
    );
    expect(progress.getSnapshot().ready).toBe(false);
    expect(card().shown).toBe(false);
    root.querySelector<HTMLButtonElement>(".frame-workers")?.click();
    const sheet = root.querySelector<HTMLElement>(".frame-sheet");
    expect(sheet?.hidden).toBe(false);
    load();
    await vi.waitFor(() => {
      expect(card()).toMatchObject({ shown: true, kind: "report" });
    });
    expect(sheet?.hidden).toBe(true);
  });
});

describe("the end card", () => {
  it("follows the report of a night that put the Light Tower's roof on", () => {
    const { card, press } = mount({
      saved: crew(ROOF_NEARLY_IN, 1_000),
      at: 12 * HOUR,
    });
    expect(card().kind).toBe("report");
    expect(card().lines).toContain(
      "The Light Tower: operational. Night shift output 45%, up from 30%.",
    );
    press();
    expect(card()).toMatchObject({
      shown: true,
      kind: "end",
      title: "The Light Tower: operational",
      lines: [
        "Night shift output 45%, up from 30%.",
        "The city is planning its next building. It comes in a later update.",
      ],
    });
    expect(card().key?.textContent).toBe("Continue");
    expect(END_CARD.key).toBe("Continue");
    press();
    expect(card().shown).toBe(false);
  });

  it("comes up when the roof goes on in play", () => {
    const { card, progress } = mount({
      saved: crew(ROOF_NEARLY_IN),
      at: 1_000,
    });
    expect(card().shown).toBe(false);
    progress.applyMutation((mountain) => ({
      ...mountain,
      project: NO_PROJECT,
      operational: ["lightTower"],
    }));
    expect(card()).toMatchObject({ shown: true, kind: "end" });
  });

  it("is not news for a signed-in save whose roof is already on when it loads", async () => {
    const lit = { ...crew(NO_PROJECT), operational: ["lightTower" as const] };
    const { card, progress, load } = await mountSignedIn(lit, 9 * HOUR);
    expect(progress.getSnapshot().mountain.operational).toEqual([]);
    load();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.operational).toEqual([
        "lightTower",
      ]);
    });
    expect(card().shown).toBe(false);
  });

  it("comes up for a roof that went on in a break too short for a report", () => {
    const nearly: Mountain["project"] = {
      kind: "delivering",
      site: {
        building: "lightTower",
        step: 2,
        arrived: { ...EMPTY_STOCK, stones: 999_990 },
        onSite: EMPTY_STOCK,
      },
    };
    const { card, progress } = mount({
      saved: crew(nearly, 1_000),
      at: 30_000,
    });
    expect(progress.getSnapshot().mountain.operational).toEqual(["lightTower"]);
    expect(nightReport(progress.getSnapshot())).toBeUndefined();
    expect(card()).toMatchObject({ shown: true, kind: "end" });
  });

  // A cloud copy taken over while open keeps the news baselines (as the
  // board's bands and crafts do), so a roof put on elsewhere is told here.
  it("comes up for a copy from another device that put the roof on", async () => {
    const { card, progress, cloudSave, load } = await mountSignedIn(
      crew(ROOF_NEARLY_IN),
      9 * HOUR,
    );
    load();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    const remote = await cloudSave.load({ uid: user.uid });
    if (remote.kind !== "found") {
      throw new Error("the cloud copy is there");
    }
    const here = progress.getSnapshot().mountain;
    await cloudSave.write({
      uid: user.uid,
      mountain: {
        ...here,
        remaining: here.remaining - 5_000,
        project: NO_PROJECT,
        operational: ["lightTower"],
      },
      lastSeen: 9 * HOUR,
      rev: (remote.rev ?? 0) + 1,
      deviceId: "kitchen-pc",
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.operational).toEqual([
        "lightTower",
      ]);
    });
    expect(card()).toMatchObject({ shown: true, kind: "end" });
  });

  it("is not news for a save whose roof is already on", () => {
    const lit = { ...crew(NO_PROJECT), operational: ["lightTower" as const] };
    const { card, screen } = mount({ saved: lit, at: 1_000 });
    screen.paint();
    expect(card().shown).toBe(false);
  });
});

describe("the cards' words", () => {
  it("name no bottleneck, no limit, no best buy, and no hands", () => {
    const words = [END_CARD.title, ...END_CARD.paragraphs].join(" ");
    expect(words).not.toMatch(/bottleneck|limit|best buy|\bhands?\b|by hand/i);
  });
});
