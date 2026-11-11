// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { CHEER_MS, DRAWER_SETTLE_MS } from "./board-drawer";
import { READY_HOLD_MS } from "./board-interaction";
import { type CloudSave } from "./cloud-save";
import { promoteCost } from "./engineers";
import { send } from "./expeditions";
import { formatCompact } from "./format";
import { type Mountain } from "./mountain";
import {
  ENGINEERS_KICK,
  ENGINEERS_SHEET,
  createMemoryStorage,
  engineersOpen,
  mountScreen,
  setReducedMotion,
  stopScreens,
} from "./mountain-screen.harness";
import { odometerFace } from "./odometer";
import { ENGINEER_SHEET_SUB, promoteNeeds, promoteOffer } from "./screen-words";
import { readSessionSave, writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The Engineers drawer on the mounted screen (#455): its doors, its rows and pages, and every
 * press through the board's model (the settle, the page's settle, the Done hold and the red
 * blink). Today's moves are the store's; this reads what the drawer shows of them.
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(async () => {
  vi.useRealTimers();
  await stopScreens();
});

const CLOCK = 1_700_000_000_000;
const PAST_SETTLE = DRAWER_SETTLE_MS + 100;

const adaCrew: Mountain = {
  ...minedMountain(0),
  helpers: 20,
  carts: 2,
  drills: 1,
  borers: 1,
  engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
};
// Nils's price, and a pocket that covers it with 3M to spare.
const nilsPrice = promoteCost(adaCrew);
/** Ada at the borers with a pocket for Nils; the first trip still to teach. */
const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
  ...adaCrew,
  pocket: nilsPrice + 3_000_000,
  ...patch,
});
/** The same, past the first trip's lesson. */
const taughtAda = (patch: Partial<Mountain> = {}): Mountain =>
  withAda({
    engineers: [{ name: "Ada", rank: 0, trips: 1, post: "borer" }],
    seen: ["engineers"],
    taught: ["engineers"],
    ...patch,
  });

type Screen = ReturnType<typeof mountScreen>;

function mount(
  mountain: Mountain,
  {
    now = () => CLOCK,
    tapClock,
    storage = createMemoryStorage(),
  }: { now?: () => number; tapClock?: () => number; storage?: Storage } = {},
): Screen {
  writeSessionSave({ storage, mountain, lastSeen: now() });
  const screen = mountScreen({
    storage,
    now,
    ...(tapClock === undefined ? {} : { tapClock }),
  });
  document.body.append(screen.root);
  return screen;
}

const sheetOf = (screen: Screen): HTMLElement => {
  const found = screen.root.querySelector<HTMLElement>(ENGINEERS_SHEET);
  if (found === null) throw new Error("no Engineers drawer");
  return found;
};
const keyOf = (screen: Screen, id = "engineers"): HTMLButtonElement => {
  const found = screen.root.querySelector<HTMLButtonElement>(
    `.board-key[data-key=${id}]`,
  );
  if (found === null) throw new Error(`no ${id} key`);
  return found;
};
const part = (screen: Screen, selector: string): HTMLButtonElement => {
  const found = sheetOf(screen).querySelector<HTMLButtonElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};
const rowPart = (row: HTMLElement, name: string) =>
  row.querySelector(`.board-row-${name}`)?.textContent;
const herRow = (screen: Screen, name: string): HTMLButtonElement =>
  part(screen, `.engineer-row[data-engineer="${name}"]`);
const postRow = (screen: Screen, post: string): HTMLButtonElement =>
  part(screen, `.engineer-post[data-post="${post}"]`);
const kick = (screen: Screen) => screen.text(ENGINEERS_KICK);
const plateWords = (plate: HTMLElement) =>
  plate.querySelector(".board-platebtn-text")?.textContent;
/** The list's rows shown, by what they are. */
const listRows = (screen: Screen): string[] =>
  [
    ...sheetOf(screen).querySelectorAll<HTMLElement>(
      ".board-sheet-list > .board-row:not([hidden])",
    ),
  ].map((row) => row.dataset["engineer"] ?? row.dataset["engineers"] ?? "?");
const fingerTap = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
};
const escape = (): void => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
};
const lampX = (row: HTMLElement) =>
  row.querySelector<HTMLElement>(".board-lamp")?.style.backgroundPositionX;
const saved = (screen: Screen) => screen.progress.getSnapshot().mountain;

describe("the Engineers drawer (#455)", () => {
  it("the Engineers key opens a board drawer", () => {
    const screen = mount(withAda());
    keyOf(screen).click();
    expect(engineersOpen(screen.root)).toBe(true);
    expect(listRows(screen)).toEqual(["Ada", "promote"]);
    expect(screen.root.querySelector(".engineers-dialog")).toBeNull();
    expect(keyOf(screen).getAttribute("aria-expanded")).toBe("true");
    expect(screen.text(`${ENGINEERS_SHEET} .board-sheet-title`)).toBe(
      "Your engineers",
    );
    const ada = herRow(screen, "Ada");
    expect(rowPart(ada, "name")).toMatch(/^Ada/);
    expect(rowPart(ada, "badge")).toBe("Apprentice");
    expect(rowPart(ada, "info")).toBe("Tending the borers");
  });

  it("a double tap on the key opens no engineer", () => {
    let clock = 10_000;
    const screen = mount(taughtAda(), { tapClock: () => clock });
    fingerTap(keyOf(screen));
    clock += 150;
    fingerTap(herRow(screen, "Ada"));
    expect(screen.engineersPage()).toBeUndefined();
    clock += 350;
    fingerTap(herRow(screen, "Ada"));
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
  });

  it("a double tap on an engineer lands on no post", () => {
    let clock = 10_000;
    const screen = mount(taughtAda(), { tapClock: () => clock });
    fingerTap(keyOf(screen));
    clock += PAST_SETTLE;
    fingerTap(herRow(screen, "Ada"));
    clock += 100;
    fingerTap(postRow(screen, "drill"));
    expect(saved(screen).engineers?.[0]?.post).toBe("borer");
    clock += 400;
    fingerTap(postRow(screen, "drill"));
    expect(saved(screen).engineers?.[0]?.post).toBe("drill");
    expect(postRow(screen, "drill").classList).toContain("is-held");
    // The page stays, with her at her new post.
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    expect(postRow(screen, "drill").getAttribute("aria-pressed")).toBe("true");
  });

  it("a tap on the key of the open drawer keeps her page", () => {
    const screen = mount(taughtAda());
    screen.openEngineer("Ada");
    keyOf(screen).click();
    expect(engineersOpen(screen.root)).toBe(true);
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
  });

  it("one drawer at a time", () => {
    const screen = mount(withAda());
    keyOf(screen).click();
    keyOf(screen, "buys").click();
    expect(engineersOpen(screen.root)).toBe(false);
    expect(
      screen.root
        .querySelector(".board-sheet[data-sheet=buys]")
        ?.classList.contains("is-open"),
    ).toBe(true);
    keyOf(screen).click();
    expect(engineersOpen(screen.root)).toBe(true);
    expect(
      screen.root
        .querySelector(".board-sheet[data-sheet=buys]")
        ?.classList.contains("is-open"),
    ).toBe(false);
  });

  it("while the save loads again", async () => {
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const auth = createMemoryAuth();
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: taughtAda(), lastSeen: CLOCK });
    const screen = mountScreen({ auth, cloudSave, storage, now: () => CLOCK });
    document.body.append(screen.root);
    screen.openEngineer("Ada");
    expect(part(screen, ".engineer-explore").disabled).toBe(false);
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(engineersOpen(screen.root)).toBe(true);
    // The page stays, its plates and rows disabled.
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    expect(part(screen, ".engineer-explore").disabled).toBe(true);
    expect(part(screen, ".engineer-list-back").disabled).toBe(true);
    expect(postRow(screen, "cart").disabled).toBe(true);
    // Back goes to the Ledger key while the re-load holds the Engineers key.
    expect(keyOf(screen).disabled).toBe(true);
    escape();
    expect(engineersOpen(screen.root)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen, "ledger"));
  });

  it("Escape and the scrim close it, on the list and on a page", () => {
    const screen = mount(taughtAda());
    keyOf(screen).click();
    escape();
    expect(engineersOpen(screen.root)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen));
    screen.openEngineer("Ada");
    escape();
    expect(engineersOpen(screen.root)).toBe(false);
    screen.openEngineer("Ada");
    screen.root
      .querySelector<HTMLElement>(".board-scrim")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(engineersOpen(screen.root)).toBe(false);
    // It opens again on the list.
    keyOf(screen).click();
    expect(screen.engineersPage()).toBeUndefined();
    expect(listRows(screen)).toEqual(["Ada", "promote"]);
  });

  it("a homecoming's welcome closes the drawer", () => {
    vi.useFakeTimers();
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      const start = 1_000_000_000;
      vi.setSystemTime(start);
      const one = send(withAda(), 0, "old-shaft", start);
      const trip = one.expeditions?.[0];
      if (trip === undefined) throw new Error("expected a trip");
      const waiting: Mountain = {
        ...one,
        expeditions: [{ ...trip, returnsAt: start + 5_000 }],
      };
      const storage = createMemoryStorage();
      writeSessionSave({ storage, mountain: waiting, lastSeen: start });
      const screen = mountScreen({ storage });
      document.body.append(screen.root);
      keyOf(screen).click();
      expect(engineersOpen(screen.root)).toBe(true);
      setVisibility("hidden");
      vi.setSystemTime(start + 5_000);
      setVisibility("visible");
      expect(
        screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(false);
      expect(engineersOpen(screen.root)).toBe(false);
      screen.root
        .querySelector<HTMLButtonElement>(".welcome-continue")
        ?.click();
      keyOf(screen).click();
      expect(rowPart(herRow(screen, "Ada"), "info")).toBe("Tending the borers");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the walk home pauses in a shut drawer", () => {
    const screen = mount(send(taughtAda(), 0, "old-shaft", CLOCK));
    keyOf(screen).click();
    const walk = herRow(screen, "Ada").querySelector(".engineer-walk");
    expect(walk).not.toBeNull();
    expect(walk?.classList.contains("is-paused")).toBe(false);
    expect(rowPart(herRow(screen, "Ada"), "info")).toBe(
      "Exploring the old shaft · gone about an hour",
    );
    part(screen, ".board-sheet-back").click();
    expect(walk?.classList.contains("is-paused")).toBe(true);
  });

  it("keeps Engineers on the rail, and opens the drawer once a borer arrives", () => {
    const screen = mount({
      ...minedMountain(10_000_000),
      pocket: 10_000_000,
      helpers: 4,
      drills: 1,
    });
    const key = keyOf(screen);
    expect(key.hidden).toBe(false);
    expect(key.textContent).toContain("Engineers");
    key.click();
    expect(engineersOpen(screen.root)).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="borer"]')
      ?.click();
    expect(key.getAttribute("aria-label")).toContain("Engineers");
    screen.openEngineer("Ada");
    expect(kick(screen)).toBe("Ada is tending the borers: +0 stones/sec.");
  });

  it("calls a party back from the tunnel when a post is chosen", () => {
    const storage = createMemoryStorage();
    const screen = mount(send(withAda(), 0, "side-seam", CLOCK), { storage });
    screen.openEngineer("Ada");
    expect(kick(screen)).toMatch(/^Ada will be gone a little while/);
    expect(kick(screen)).not.toMatch(/\d/);
    expect(part(screen, ".engineer-recall").hidden).toBe(false);
    expect(part(screen, ".engineer-explore").hidden).toBe(true);
    postRow(screen, "camp").click();
    expect(kick(screen)).toBe("Ada puts the kettle on at camp.");
    const mountain = readSessionSave({ storage })?.mountain;
    expect(mountain?.expeditions).toBeUndefined();
    expect(mountain?.engineers?.[0]).toEqual({
      name: "Ada",
      rank: 0,
      trips: 0,
      post: "camp",
    });
    // Her page stays, now with her at home.
    expect(part(screen, ".engineer-explore").hidden).toBe(false);
  });

  it("stations, calls back to camp, and keeps the post through a hire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(CLOCK);
    const storage = createMemoryStorage();
    const screen = mount(taughtAda(), { storage });
    const cart = screen.root.querySelector<HTMLButtonElement>(
      '.tier[data-tier="cart"]',
    );
    screen.openEngineer("Ada");
    expect(kick(screen)).toBe("Ada is tending the borers: +78 stones/sec.");
    expect(rowPart(postRow(screen, "borer"), "name")).toBe(
      "The borers · here now",
    );
    expect(postRow(screen, "borer").getAttribute("aria-pressed")).toBe("true");
    expect(rowPart(postRow(screen, "cart"), "gain")).toBe("+1 stones/sec");
    expect(sheetOf(screen).textContent).toContain(
      "They roll faster, and she shores up cave-ins herself.",
    );
    expect(sheetOf(screen).textContent).toContain(
      "Rests by the fire, ready for the next job.",
    );
    postRow(screen, "cart").click();
    expect(kick(screen)).toBe("Ada heads to the carts! +1 stones/sec");
    expect(postRow(screen, "cart").classList).toContain("is-held");
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "cart",
    );

    postRow(screen, "camp").click();
    expect(saved(screen).engineers?.[0]?.post).toBe("camp");
    // The carts row still holds Done: a second tap sends nothing.
    postRow(screen, "cart").click();
    expect(saved(screen).engineers?.[0]?.post).toBe("camp");
    vi.advanceTimersByTime(READY_HOLD_MS + 100);
    postRow(screen, "cart").click();
    expect(saved(screen).engineers?.[0]?.post).toBe("cart");
    cart?.click();
    expect(saved(screen).carts).toBe(3);
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "cart",
    );
  });

  it("calls an engineer home from a tunnel", () => {
    const storage = createMemoryStorage();
    const screen = mount(
      withAda({
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
      }),
      { storage },
    );
    screen.openEngineer("Ada");
    expect(kick(screen)).toBe("Ada is out exploring.");
    part(screen, ".engineer-recall").click();
    const ask = screen.engineersPage();
    expect(ask?.classList).toContain("engineer-recall-page");
    expect(ask?.querySelector(".board-page-title")?.textContent).toBe(
      "Call her back",
    );
    expect(ask?.querySelector(".board-page-line")?.textContent).toBe(
      "Ada comes home empty-handed.",
    );
    const answers = [...(ask?.querySelectorAll("button") ?? [])];
    expect(answers.map(plateWords)).toEqual(["Keep exploring", "Call back"]);
    // Keep exploring goes back to her page and calls nobody.
    part(screen, ".recall-no").click();
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    expect(saved(screen).engineers?.[0]?.post).toBe("tunnel");
    part(screen, ".engineer-recall").click();
    part(screen, ".recall-yes").click();
    expect(kick(screen)).toBe("Ada is home, empty-handed.");
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "camp",
    );
  });

  it("confirms a promotion on its page, and Not yet spends nothing", () => {
    const storage = createMemoryStorage();
    const screen = mount(withAda(), { storage });
    keyOf(screen).click();
    const promote = part(screen, ".engineer-promote");
    expect(rowPart(promote, "name")).toBe("Promote a worker");
    expect(rowPart(promote, "price")).toBe(formatCompact(nilsPrice));
    expect(rowPart(promote, "verb")).toBe("Promote");
    expect(promote.getAttribute("aria-label")).toContain(
      promoteOffer(nilsPrice),
    );
    expect(rowPart(promote, "info")).toBe(
      "A new engineer can tend another machine or explore while the others work.",
    );
    promote.click();
    const ask = screen.engineersPage();
    expect(ask?.classList).toContain("engineer-promote-page");
    expect(ask?.querySelector(".board-page-line")?.textContent).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    part(screen, ".engineer-confirm-no").click();
    expect(screen.engineersPage()).toBeUndefined();
    expect(saved(screen).helpers).toBe(20);
    expect(screen.pocket()).toBe(
      `Stones ${odometerFace(nilsPrice + 3_000_000).words}`,
    );

    // Escape closes the drawer from the ask, and steps nobody up.
    part(screen, ".engineer-promote").click();
    escape();
    expect(engineersOpen(screen.root)).toBe(false);
    expect(saved(screen).helpers).toBe(20);

    keyOf(screen).click();
    part(screen, ".engineer-promote").click();
    part(screen, ".engineer-confirm-yes").click();
    expect(screen.pocket()).toBe("Stones 3.000M");
    expect(saved(screen).helpers).toBe(19);
    expect(screen.engineersPage()).toBeUndefined();
    expect(kick(screen)).toBe("Nils steps up. The crew cheers.");
    expect(herRow(screen, "Nils").classList).toContain("is-held");
    expect(listRows(screen)).toEqual(["Ada", "Nils", "promote"]);
    expect(readSessionSave({ storage })?.mountain.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
      { name: "Nils", rank: 0, trips: 0, post: "camp" },
    ]);
    part(screen, ".board-sheet-back").click();
    expect(engineersOpen(screen.root)).toBe(false);
  });

  it("a promotion shows its spend on the odometer (#409)", () => {
    const screen = mount(withAda());
    keyOf(screen).click();
    expect(screen.text(".board-spend")).toBe("");
    part(screen, ".engineer-promote").click();
    part(screen, ".engineer-confirm-yes").click();
    expect(saved(screen).engineers).toHaveLength(2);
    expect(screen.text(".board-spend")).toBe(`−${formatCompact(nilsPrice)}`);
  });

  it("does not cheer when Step up is no longer affordable", () => {
    const screen = mount(taughtAda());
    keyOf(screen).click();
    part(screen, ".engineer-promote").click();
    expect(screen.engineersPage()?.classList).toContain(
      "engineer-promote-page",
    );
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    // The page that can no longer promote gives way to the list.
    expect(screen.engineersPage()).toBeUndefined();
    expect(kick(screen)).toBe(ENGINEER_SHEET_SUB);
    expect(saved(screen).engineers).toHaveLength(1);
    expect(saved(screen).pocket).toBe(0);
    expect(saved(screen).helpers).toBe(20);
  });

  it("shows the rank word and a near-rank hint instead of a trip count", () => {
    const screen = mount(
      taughtAda({
        engineers: [
          { name: "Ada", rank: 0, trips: 2, post: "borer" },
          { name: "Nils", rank: 1, trips: 3, post: "drill" },
          { name: "Ruth", rank: 1, trips: 8, post: "cart" },
          { name: "Otto", rank: 2, trips: 9, post: "camp" },
        ],
      }),
    );
    keyOf(screen).click();
    const badge = (name: string) => rowPart(herRow(screen, name), "badge");
    const why = (name: string) => rowPart(herRow(screen, name), "why");
    expect(badge("Ada")).toBe("Apprentice");
    expect(badge("Nils")).toBe("Journeyman");
    expect(badge("Otto")).toBe("Master engineer");
    expect(why("Ada")).toBe("nearly a Journeyman");
    expect(why("Ruth")).toBe("nearly a Master");
    expect(why("Nils") ?? "").toBe("");
    expect(why("Otto") ?? "").toBe("");
    for (const row of sheetOf(screen).querySelectorAll(".engineer-row")) {
      expect(row.querySelector(".board-row-badge")?.textContent).not.toMatch(
        /\d|\?/,
      );
      expect(row.querySelector(".board-row-why")?.textContent).not.toMatch(
        /\d|\?/,
      );
    }
    expect(herRow(screen, "Otto").getAttribute("aria-label")).toContain(
      "Master engineer",
    );
    expect(sheetOf(screen).querySelector(".engineer-rank")).toBeNull();
  });

  it("refuses a promotion when no worker is free, or the crew is full", () => {
    setReducedMotion(false);
    const broke = mount(taughtAda({ helpers: 0 }));
    keyOf(broke).click();
    const promote = part(broke, ".engineer-promote");
    expect(rowPart(promote, "price")).toBe(formatCompact(nilsPrice));
    expect(rowPart(promote, "info")).toBe("No worker is free to step up.");
    promote.click();
    expect(broke.engineersPage()).toBeUndefined();
    expect(lampX(promote)).toBe("-120px");
    broke.root.remove();

    const full = mount(
      taughtAda({
        helpers: 5,
        engineers: [
          { name: "Ada", rank: 0, trips: 1, post: "borer" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
          { name: "Ruth", rank: 0, trips: 0, post: "camp" },
          { name: "Otto", rank: 0, trips: 0, post: "camp" },
          { name: "Mae", rank: 0, trips: 0, post: "camp" },
        ],
      }),
    );
    keyOf(full).click();
    expect(listRows(full)).toEqual([
      "Ada",
      "Nils",
      "Ruth",
      "Otto",
      "Mae",
      "promote",
    ]);
    const crewFull = part(full, ".engineer-promote");
    expect(rowPart(crewFull, "info")).toBe(
      "Every named hand is already an engineer.",
    );
    expect(rowPart(crewFull, "price") ?? "").toBe("");
    expect(rowPart(crewFull, "verb") ?? "").toBe("");
    crewFull.click();
    expect(full.engineersPage()).toBeUndefined();
    herRow(full, "Mae").click();
    expect(kick(full)).toMatch(/^Mae is resting at camp/);
  });

  it("greys promotion when the pocket is light, and a tap blinks red", () => {
    setReducedMotion(false);
    const screen = mount(taughtAda({ pocket: 10 }));
    keyOf(screen).click();
    const promote = part(screen, ".engineer-promote");
    expect(rowPart(promote, "price")).toBe(formatCompact(nilsPrice));
    expect(rowPart(promote, "info")).toBe(promoteNeeds(nilsPrice));
    expect(promote.classList).toContain("is-dim-tag");
    promote.click();
    expect(screen.engineersPage()).toBeUndefined();
    expect(lampX(promote)).toBe("-120px");
  });

  it("shows keepsakes an engineer brought home, and its page tells the stories", () => {
    const quiet = mount(taughtAda({ finds: ["pick"] }));
    keyOf(quiet).click();
    expect(part(quiet, ".engineer-brought").hidden).toBe(true);
    quiet.root.remove();

    const screen = mount(taughtAda({ finds: ["pick", "drawing", "watch"] }));
    keyOf(screen).click();
    expect(listRows(screen)).toEqual(["Ada", "brought", "promote"]);
    const row = part(screen, ".engineer-brought");
    expect(rowPart(row, "name")).toBe("Brought home");
    expect(rowPart(row, "info")).toContain("A child's drawing");
    expect(rowPart(row, "info")).toContain("A pocket watch");
    expect(row.textContent).not.toContain("Grandfather's pick");
    expect(row.textContent).not.toMatch(/\d|\?/);
    row.click();
    const page = screen.engineersPage();
    expect(page?.classList).toContain("engineer-brought-page");
    const stories = [
      ...(page?.querySelectorAll<HTMLElement>(
        ".engineer-brought-story:not([hidden])",
      ) ?? []),
    ].map((story) => story.textContent);
    expect(stories).toEqual([
      "A child's drawing. A little figure with a lamp, folded for a pocket.",
      "A pocket watch. Quiet in the hand. Someone loved it.",
    ]);
    part(screen, ".engineer-list-back").click();
    expect(screen.engineersPage()).toBeUndefined();
  });

  it("a cheer fades from the kick, and a post she already holds sends nothing", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(CLOCK);
      const screen = mount(taughtAda(), { now: () => CLOCK });
      screen.openEngineer("Ada");
      const dispatched = vi.spyOn(screen.progress, "dispatch");
      postRow(screen, "borer").click();
      expect(dispatched).not.toHaveBeenCalled();
      expect(postRow(screen, "borer").classList).not.toContain("is-held");
      expect(kick(screen)).toBe("Ada is tending the borers: +78 stones/sec.");
      postRow(screen, "cart").click();
      expect(kick(screen)).toBe("Ada heads to the carts! +1 stones/sec");
      vi.advanceTimersByTime(READY_HOLD_MS + 100);
      expect(postRow(screen, "cart").classList).not.toContain("is-held");
      vi.advanceTimersByTime(CHEER_MS);
      expect(kick(screen)).toBe("Ada is tending the carts: +1 stones/sec.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends her exploring from the tunnels page, and a locked tunnel blinks red", () => {
    setReducedMotion(false);
    const screen = mount(taughtAda());
    screen.openEngineer("Ada");
    part(screen, ".engineer-explore").click();
    const page = screen.engineersPage();
    expect(page?.classList).toContain("engineer-tunnels-page");
    const deep = part(screen, '.engineer-tunnel-row[data-tunnel="deep-dark"]');
    expect(deep.classList).toContain("is-locked");
    expect(rowPart(deep, "info")).toBe("The deep dark waits for a Journeyman.");
    deep.click();
    expect(saved(screen).expeditions ?? []).toHaveLength(0);
    expect(lampX(deep)).toBe("-120px");
    // Tend a machine goes back to her page.
    part(screen, ".engineer-tend").click();
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    part(screen, ".engineer-explore").click();
    part(screen, '.engineer-tunnel-row[data-tunnel="old-shaft"]').click();
    expect(kick(screen)).toBe("Ada lights a lamp and heads in!");
    expect(saved(screen).expeditions?.[0]?.tunnel).toBe("old-shaft");
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    expect(part(screen, ".engineer-recall").hidden).toBe(false);
    part(screen, ".engineer-list-back").click();
    expect(screen.engineersPage()).toBeUndefined();
    expect(
      herRow(screen, "Ada").querySelector(".engineer-walk"),
    ).not.toBeNull();
  });

  it("a page whose engineer left gives way, and no crew closes the drawer", () => {
    const screen = mount(taughtAda());
    screen.openEngineer("Ada");
    part(screen, ".engineer-explore").click();
    // She went out from elsewhere: the tunnels page gives way to hers.
    screen.progress.applyMutation((current) =>
      send(current, 0, "old-shaft", CLOCK),
    );
    expect(screen.engineersPage()?.classList).toContain("engineer-page");
    screen.progress.applyMutation((current) => ({ ...current, engineers: [] }));
    expect(engineersOpen(screen.root)).toBe(false);
  });

  // The Tending card left the "i" (#455): three cards ran past the drawer at 424x924, and
  // its words are on every post row's gain and line.
  it("the i shows How it works for engineers and expeditions", () => {
    const screen = mount(taughtAda());
    keyOf(screen).click();
    part(screen, ".board-sheet-info").click();
    const how = part(screen, ".board-sheet-how");
    expect(
      [...how.querySelectorAll<HTMLElement>("[data-how]")].map(
        (card) => card.dataset["how"],
      ),
    ).toEqual(["engineers", "expeditions"]);
    const backs = [...how.querySelectorAll("button")].filter(
      (button) =>
        !button.hidden && plateWords(button) === "Back to your engineers",
    );
    expect(backs).toHaveLength(1);
  });
});
