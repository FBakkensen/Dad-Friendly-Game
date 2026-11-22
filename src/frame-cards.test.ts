// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth, createUnconfiguredAuth } from "./auth";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import { NO_PROJECT, placeOrder } from "./city";
import { holdFactors } from "./economy/factors";
import { nightReport } from "./frame-cards";
import {
  END_CARD,
  FIRST_EVENING,
  LEVEL_REACHED,
  refineryOpens,
  endCard,
} from "./frame-cards-words";
import { mountFrameScreen } from "./frame-screen";
import { shaftPrice } from "./mine-levels";
import { levels } from "./part-three.harness";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { createMemoryStorage } from "./test-fixtures";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { firstNotice } from "./session";
import { writeSessionSave } from "./session-save";
import { TO_STOCKYARD, shiftReport } from "./shift-report-view";
import { stockpileRoom } from "./stockyard";
import { EMPTY_STOCK } from "./stock";

/** The frame's cards: the shift report and the end card (#663). */

const HOUR = 60 * 60 * 1000;

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({});
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
      graniteDrilling: 0,
      graniteHaulage: 0,
      saws: 0,
      crystalDrilling: 0,
      crystalHaulage: 0,
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

describe("the shift report once the stockyard is open (#671)", () => {
  /**
   * The crew under the Light Tower's roof, its stone a few minutes from full,
   * with a kiln bought (and nobody on it), so no refinery card follows (#672).
   */
  function nearlyFull(): Mountain {
    const lit = {
      ...crew(NO_PROJECT),
      operational: ["lightTower" as const],
      makers: { kiln: 1, saw: 0 },
    };
    return {
      ...lit,
      stock: { ...lit.stock, stones: stockpileRoom(lit, "stones") - 1_000 },
    };
  }

  it("marks when each stockpile filled, and offers the stockyard beside Resume", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { card, root, progress } = mount({
      saved: nearlyFull(),
      at: 9 * HOUR,
    });
    const report = nightReport(progress.getSnapshot());
    if (report === undefined) {
      throw new Error("a fresh night has a report");
    }
    const view = shiftReport(report);
    expect(view.toStockyard).toBe(true);
    expect(card().lines).toContain("Stockyard full: production stopped.");
    const marks = [...root.querySelectorAll(".frame-card-mark")].map(
      (mark) => mark.textContent,
    );
    expect(marks).toEqual(view.marks);
    expect(marks[0]).toMatch(/^Stone full at /);
    const yard = root.querySelector<HTMLButtonElement>(".frame-card-yard");
    expect(yard?.hidden).toBe(false);
    expect(yard?.textContent).toBe(TO_STOCKYARD);
    expect(card().key?.textContent).toBe("Resume");
  });

  it("closes the night and goes to the refinery on To the stockyard", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { card, root, progress } = mount({
      saved: nearlyFull(),
      at: 9 * HOUR,
    });
    root.querySelector<HTMLButtonElement>(".frame-card-yard")?.click();
    expect(nightReport(progress.getSnapshot())).toBeUndefined();
    expect(card().shown).toBe(false);
    expect(
      root.querySelector<HTMLElement>(".frame-scene")?.dataset["site"],
    ).toBe("refinery");
  });

  it("has no stockyard key on a night the stockyard did not stop", () => {
    const { root } = mount({ saved: crew(NO_PROJECT), at: 9 * HOUR });
    expect(root.querySelector<HTMLElement>(".frame-card-yard")?.hidden).toBe(
      true,
    );
    expect(root.querySelectorAll(".frame-card-mark")).toHaveLength(0);
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

  it("opens the refinery in part 2 when the Light Tower's roof goes on, and ends at the Warehouse's (#671)", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { card, press, progress } = mount({
      saved: crew(ROOF_NEARLY_IN),
      at: 1_000,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      project: NO_PROJECT,
      operational: ["lightTower"],
    }));
    expect(card()).toMatchObject({
      shown: true,
      kind: "opens",
      title: refineryOpens().title,
      lines: refineryOpens().paragraphs,
    });
    expect(card().lines.join(" ")).not.toMatch(/later update/);
    press();
    expect(card().shown).toBe(false);
    progress.applyMutation((mountain) => ({
      ...mountain,
      operational: ["lightTower", "warehouse"],
    }));
    expect(card()).toMatchObject({
      shown: true,
      kind: "end",
      title: "The Warehouse: operational",
      lines: endCard("warehouse").paragraphs,
    });
    expect(card().lines).toEqual([
      "Stockyard capacity ×2.",
      "The city is planning its next building. It comes in a later update.",
    ]);
  });

  it("in part 3 the Warehouse's roof opens trucks, and the Foundry's ends the slice (#682)", () => {
    holdFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 });
    const { card, press, progress } = mount({
      saved: { ...crew(NO_PROJECT), operational: ["lightTower"] },
      at: 1_000,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      operational: ["lightTower", "warehouse"],
    }));
    expect(card()).toMatchObject({
      shown: true,
      kind: "built",
      title: "The Warehouse: operational",
    });
    expect(card().lines).toEqual(["Stockyard capacity ×2.", "Opens trucks."]);
    expect(card().lines.join(" ")).not.toMatch(/later update/);
    press();
    expect(card().shown).toBe(false);
    progress.applyMutation((mountain) => ({
      ...mountain,
      operational: ["lightTower", "warehouse", "foundry"],
    }));
    expect(card()).toMatchObject({
      shown: true,
      kind: "end",
      title: "The Foundry: operational",
      lines: endCard("foundry").paragraphs,
    });
    expect(card().lines).toEqual([
      "The city is planning its next building. It comes in a later update.",
    ]);
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
        rockDug: here.rockDug + 5_000,
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

describe("the Granite's card (#754)", () => {
  const PART_THREE = { [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 };
  /** Part 3's mine past the refinery's card: the Light Tower up and a kiln. */
  const working = { topsoil: 3, hoisting: 3, driving: 1, kilns: 1 };
  /** That mine with the shaft unsunk, and these goods. */
  const unsunk = (stock: Partial<Mountain["stock"]> = {}): Mountain =>
    levels({ ...working, sunk: false, stock });
  const price = (): Partial<Mountain["stock"]> =>
    Object.fromEntries(shaftPrice().map(({ good, amount }) => [good, amount]));

  it("shows the Granite's card after a night's report and before a building's", () => {
    holdFactors(PART_THREE);
    const { card, press, progress } = mount({ saved: unsunk(), at: 9 * HOUR });
    expect(card().kind).toBe("report");
    // The Warehouse's roof goes on first, then the shaft is sunk.
    progress.applyMutation((mountain) => ({
      ...mountain,
      operational: ["lightTower", "warehouse"],
      stock: { ...mountain.stock, ...price() },
    }));
    progress.dispatch({ kind: "sinkShaft" });
    expect(progress.getSnapshot().mountain.mineLevels.granite).toBeDefined();
    expect(card().kind).toBe("report");
    press();
    expect(card()).toMatchObject({
      shown: true,
      kind: "level",
      title: "The Granite: reached",
      lines: [
        "A second level, twice as deep, with its own drilling and its own haulage. Nobody works there yet: put workers on it with − and + on the level.",
        "A hoist serves both levels in turn: down to one, up, then down to the other. A trip to the Granite takes twice as long. Under Hoisting, − and + assign a hoist to one level only.",
        "Topsoil rock goes to the kilns. Granite rock goes to the saws, which have their own pile of rock.",
        "Opened: saws in the refinery and locomotives for haulage.",
      ],
    });
    expect(card().key?.textContent).toBe("Continue");
    press();
    // In part 3 the Warehouse is not the last building: its card opens trucks (#682).
    expect(card()).toMatchObject({ shown: true, kind: "built" });
    press();
    expect(card().shown).toBe(false);
  });

  it("its Continue dismisses it, and it does not come again", () => {
    holdFactors(PART_THREE);
    const { card, press, progress, screen } = mount({
      saved: unsunk(price()),
      at: 1_000,
    });
    expect(card().shown).toBe(false);
    progress.dispatch({ kind: "sinkShaft" });
    expect(card()).toMatchObject({ shown: true, kind: "level" });
    expect(card().key?.textContent).toBe(LEVEL_REACHED.key);
    press();
    expect(card().shown).toBe(false);
    expect(firstNotice(progress.getSnapshot(), "level")).toBeUndefined();
    screen.paint();
    expect(card().shown).toBe(false);
  });

  it("is not news for a save already sunk when it loads", () => {
    holdFactors(PART_THREE);
    const { card, screen, progress } = mount({
      saved: levels(working),
      at: 1_000,
    });
    expect(progress.getSnapshot().mountain.mineLevels.granite).toBeDefined();
    screen.paint();
    expect(card().shown).toBe(false);
  });

  it("is not news for a signed-in save already sunk when it loads", async () => {
    holdFactors(PART_THREE);
    const { card, progress, load } = await mountSignedIn(
      levels(working),
      9 * HOUR,
    );
    load();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.mineLevels.granite).toBeDefined();
    });
    expect(card().shown).toBe(false);
  });

  // As the end card: a cloud copy taken over while open keeps the news
  // baselines, so a shaft sunk on another device is told here.
  it("comes up for a copy from another device that sank the shaft", async () => {
    holdFactors(PART_THREE);
    const { card, progress, cloudSave, load } = await mountSignedIn(
      unsunk(),
      9 * HOUR,
    );
    load();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    expect(card().shown).toBe(false);
    const remote = await cloudSave.load({ uid: user.uid });
    if (remote.kind !== "found") {
      throw new Error("the cloud copy is there");
    }
    const here = progress.getSnapshot().mountain;
    await cloudSave.write({
      uid: user.uid,
      mountain: {
        ...here,
        rockDug: here.rockDug + 5_000,
        mineLevels: levels(working).mineLevels,
      },
      lastSeen: 9 * HOUR,
      rev: (remote.rev ?? 0) + 1,
      deviceId: "kitchen-pc",
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.mineLevels.granite).toBeDefined();
    });
    expect(card()).toMatchObject({ shown: true, kind: "level" });
  });

  it("never comes with part 3 off: the shaft cannot be sunk", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { card, progress } = mount({ saved: unsunk(price()), at: 1_000 });
    progress.dispatch({ kind: "sinkShaft" });
    expect(progress.getSnapshot().mountain.mineLevels.granite).toBeUndefined();
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

  it("greets only a mine as it started: one worker, on drilling (#715)", () => {
    expect(mount({ saved: crew(NO_PROJECT), at: 1_000 }).card().shown).toBe(
      false,
    );
    const start = createMountain();
    const moved = {
      ...start,
      jobs: { ...start.jobs, drilling: 0, haulage: 1 },
    };
    expect(mount({ saved: moved, at: 1_000 }).card().shown).toBe(false);
    const hired = { ...start, owned: { ...start.owned, helper: 2 } };
    expect(mount({ saved: hired, at: 1_000 }).card().shown).toBe(false);
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

describe("the refinery's card for a save from part 1 (#672)", () => {
  /** A part 1 save after its last roof: the Light Tower up, nothing since. */
  const partOneDone = (): Mountain => ({
    ...crew(NO_PROJECT, 8_000_000),
    operational: ["lightTower"],
  });

  it("greets a session whose refinery is open and untouched, once, until its key", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { card, press, screen } = mount({ saved: partOneDone(), at: 1_000 });
    expect(card()).toMatchObject({
      shown: true,
      kind: "opens",
      title: refineryOpens().title,
      lines: [...refineryOpens().paragraphs],
    });
    press();
    expect(card().shown).toBe(false);
    screen.paint();
    expect(card().shown).toBe(false);
  });

  it("does not greet once a kiln is bought, the stockyard expanded or the Warehouse ordered", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const kiln = { ...partOneDone(), makers: { kiln: 1, saw: 0 } };
    const expanded = { ...partOneDone(), stockyard: 1 };
    const ordered = placeOrder(partOneDone());
    for (const saved of [kiln, expanded, ordered]) {
      expect(mount({ saved, at: 1_000 }).card().shown).toBe(false);
    }
  });

  it("waits behind the report of the night the session opens on", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const saved = { ...crew(NO_PROJECT), operational: ["lightTower" as const] };
    const { card, press } = mount({ saved, at: 9 * HOUR });
    expect(card().kind).toBe("report");
    press();
    expect(card()).toMatchObject({ shown: true, kind: "opens" });
    press();
    expect(card().shown).toBe(false);
  });

  it("does not greet with part 2 off", () => {
    expect(mount({ saved: partOneDone(), at: 1_000 }).card().shown).toBe(false);
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
      ...refineryOpens().paragraphs,
      ...endCard("warehouse").paragraphs,
      LEVEL_REACHED.title,
      ...LEVEL_REACHED.paragraphs,
    ].join(" ");
    expect(words).not.toMatch(
      /bottleneck|limit|best buy|\bhands?\b|by hand|\bface\b/i,
    );
  });

  it("say the first evening's words as proposed", () => {
    expect(FIRST_EVENING).toEqual({
      title: "The first evening",
      paragraphs: [
        "One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, hoisting lifts it to the pithead, and driving hauls it to the stockyard as stone.",
        "Move him between the jobs. Every worker you hire moves more.",
      ],
      key: "Start",
    });
  });
});
