// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth, createUnconfiguredAuth } from "./auth";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import { NO_PROJECT, placeOrder } from "./city";
import { holdFactors } from "./economy/factors";
import { nightReport } from "./frame-cards";
import { END_CARD, FIRST_EVENING } from "./frame-cards-words";
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
    jobs: {
      drilling: 3,
      haulage: 3,
      hoisting: 3,
      driving: 1,
      building: 2,
      kilns: 0,
    },
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
  let clock = at;
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
  /** The clock moves on, and the frame's own second comes round. */
  const second = (ms: number) => {
    clock += ms;
    vi.advanceTimersByTime(1000);
  };
  /** Time passes with the frame still open: the store settles it. */
  const later = (ms: number) => {
    clock += ms;
    progress.tick();
  };
  return {
    root,
    progress,
    screen,
    card,
    press,
    later,
    second,
  };
}

const user = { uid: "dev-dad", label: "Dev Dad" };

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

  it("greets a night in a frame left open, and closes the workforce", () => {
    const { card, root, later } = mount({
      saved: placeOrder(crew(NO_PROJECT)),
      at: 1_000,
    });
    expect(card().shown).toBe(false);
    root.querySelector<HTMLButtonElement>(".frame-workers")?.click();
    const sheet = root.querySelector<HTMLElement>(".frame-sheet");
    expect(sheet?.hidden).toBe(false);
    later(9 * HOUR);
    expect(card()).toMatchObject({ shown: true, kind: "report" });
    expect(card().lines[0]).toBe("Unattended 9 h. Night shift output: 30%.");
    expect(sheet?.hidden).toBe(true);
  });

  it("keeps a hidden frame's night whole: it settles on return, not each minute", () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    try {
      const { card, second } = mount({
        saved: placeOrder(crew(NO_PROJECT)),
        at: 1_000,
      });
      visibility = "hidden";
      // A throttled timer still fires now and then through the night.
      for (let hour = 0; hour < 9; hour += 1) {
        second(HOUR);
      }
      expect(card().shown).toBe(false);
      visibility = "visible";
      second(0);
      expect(card()).toMatchObject({ shown: true, kind: "report" });
      expect(card().lines[0]).toBe("Unattended 9 h. Night shift output: 30%.");
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
      vi.useRealTimers();
    }
  });

  it("waits for a signed-in save, and closes the workforce when its night comes in", async () => {
    const { card, root, progress, load } = await mountSignedIn(
      placeOrder(crew(NO_PROJECT)),
      0,
    );
    expect(progress.getSnapshot().ready).toBe(false);
    expect(card().shown).toBe(false);
    // The frame shows no numbers of the store's new mine while the save loads (#664).
    expect(root.querySelector(".frame")?.hasAttribute("data-loading")).toBe(
      true,
    );
    root.querySelector<HTMLButtonElement>(".frame-workers")?.click();
    const sheet = root.querySelector<HTMLElement>(".frame-sheet");
    expect(sheet?.hidden).toBe(false);
    load();
    await vi.waitFor(() => {
      expect(card()).toMatchObject({ shown: true, kind: "report" });
    });
    expect(sheet?.hidden).toBe(true);
    expect(root.querySelector(".frame")?.hasAttribute("data-loading")).toBe(
      false,
    );
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

  it("closes the Ledger as it comes up, and takes the focus to its key (#708)", () => {
    const { root, progress, card } = mount({
      saved: crew(ROOF_NEARLY_IN),
      at: 1_000,
    });
    root.querySelector<HTMLButtonElement>(".frame-key")?.click();
    const ledger = root.querySelector('.board-sheet[data-sheet="ledger"]');
    expect(ledger?.classList.contains("is-open")).toBe(true);
    root.querySelector<HTMLButtonElement>(".ledger-start-over")?.click();
    progress.applyMutation((mountain) => ({
      ...mountain,
      project: NO_PROJECT,
      operational: ["lightTower"],
    }));
    expect(card()).toMatchObject({ shown: true, kind: "end" });
    expect(ledger?.classList.contains("is-open")).toBe(false);
    expect(document.activeElement).toBe(card().key);
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

describe("the first evening's card", () => {
  it("greets the first evening once", () => {
    const { card, press, screen } = mount();
    expect(card()).toMatchObject({
      shown: true,
      kind: "first",
      title: FIRST_EVENING.title,
      lines: [...FIRST_EVENING.paragraphs],
    });
    expect(card().key?.textContent).toBe("Start");
    press();
    expect(card().shown).toBe(false);
    screen.paint();
    expect(card().shown).toBe(false);
  });

  it("greets a fresh save, but not one with an order or a building up", () => {
    expect(mount({ saved: createMountain(), at: 1_000 }).card().kind).toBe(
      "first",
    );
    expect(
      mount({ saved: placeOrder(crew(NO_PROJECT)), at: 1_000 }).card().shown,
    ).toBe(false);
    const lit = { ...crew(NO_PROJECT), operational: ["lightTower" as const] };
    expect(mount({ saved: lit, at: 1_000 }).card().shown).toBe(false);
  });

  it("is not the first evening when the session opens on a night", () => {
    const { card, press } = mount({ saved: crew(NO_PROJECT), at: 9 * HOUR });
    expect(card().kind).toBe("report");
    press();
    expect(card().shown).toBe(false);
  });

  it("waits for a signed-in save, and greets a fresh one when it loads", async () => {
    const { card, progress, load } = await mountSignedIn(
      createMountain(),
      9 * HOUR,
    );
    expect(card().shown).toBe(false);
    load();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    expect(card().kind).toBe("first");
  });
});

describe("the cards' words", () => {
  it("name no bottleneck, no limit, no best buy, and no hands", () => {
    const words = [
      END_CARD.title,
      ...END_CARD.paragraphs,
      FIRST_EVENING.title,
      ...FIRST_EVENING.paragraphs,
      FIRST_EVENING.key,
    ].join(" ");
    expect(words).not.toMatch(/bottleneck|limit|best buy|\bhands?\b|by hand/i);
  });

  it("say the first evening's words as proposed", () => {
    expect(FIRST_EVENING).toEqual({
      title: "The first evening",
      paragraphs: [
        "One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, and at the shaft until hoisting lifts it up as stone.",
        "Move him between the jobs. Every worker you hire moves more.",
      ],
      key: "Start",
    });
  });
});
