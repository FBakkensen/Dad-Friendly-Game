// @vitest-environment happy-dom
import { createBoardHost } from "./board-host";
import { send } from "./expeditions";
import { readSessionSave, writeSessionSave } from "./session-save";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCloudSave } from "./cloud-save";
import { EMPTY_MATERIALS, LAYERS } from "./layers";
import { createMountain, type Mountain } from "./mountain";
import { formatCompact } from "./format";
import { shownStones } from "./scale";
import { BUYS_SETTLE_MS } from "./mountain-screen";
import { createWelcomePanel } from "./welcome-panel";
import { mineView } from "./mine-window";
import { createProgressStore } from "./progress-store";
import { minedMountain } from "./test-fixtures";
import { recipesForMined, startCraft } from "./workshop";
import {
  ENGINEERS_KICK,
  ENGINEERS_SHEET,
  engineersOpen,
  RELICS_BAR,
  RELICS_HINT,
  STONES_INFO,
  REVEAL_PAGE,
  relicPage,
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";

// Animations are opted into per test; most tests want instant numbers.
beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

describe("side tunnels (#147)", () => {
  const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(0),
    pocket: 5_000_000,
    helpers: 20,
    carts: 2,
    drills: 1,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    ...patch,
  });
  /** Past the first trip's lesson: Send exploring opens the tunnels page. */
  const taughtAda = (patch: Partial<Mountain> = {}): Mountain =>
    withAda({ seen: ["engineers"], taught: ["engineers"], ...patch });

  type Screen = ReturnType<typeof mountScreen>;
  /** A control on the Engineers drawer's shown page, or on its list. */
  const inSheet = (screen: Screen, selector: string): HTMLButtonElement => {
    const found = screen.root.querySelector<HTMLButtonElement>(
      `${ENGINEERS_SHEET} ${selector}`,
    );
    if (found === null) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  const kick = (screen: Screen) => screen.text(ENGINEERS_KICK);
  /** Her page, then Send exploring: the tunnels page. */
  const openTunnels = (screen: Screen): HTMLElement => {
    screen.openEngineer("Ada");
    inSheet(screen, ".engineer-explore").click();
    const page = screen.engineersPage();
    if (page === undefined) {
      throw new Error("the tunnels page did not show");
    }
    return page;
  };

  it("sends Ada down a tunnel, and an Apprentice cannot take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: taughtAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const page = openTunnels(screen);
    expect(page.textContent).toContain("Quick look");
    expect(page.textContent).toContain(
      "Back in a few minutes with a small find.",
    );
    expect(page.textContent).toContain("Old shaft");
    expect(page.textContent).toContain(
      "About an hour, often a lost tool or keepsake.",
    );
    expect(page.textContent).toContain("The deep dark");
    expect(page.textContent).toContain("The deep dark waits for a Journeyman.");
    expect(kick(screen)).toBe(
      "While she explores, her machine works without her.",
    );
    const deep = inSheet(
      screen,
      '.engineer-tunnel-row[data-tunnel="deep-dark"]',
    );
    expect(deep.classList.contains("is-locked")).toBe(true);
    deep.click();
    expect(screen.progress.getSnapshot().mountain.expeditions).toEqual([]);

    inSheet(screen, '.engineer-tunnel-row[data-tunnel="old-shaft"]').click();
    expect(kick(screen)).toBe("Ada lights a lamp and heads in!");
    // Her page again: she is out, so Call her back stands where Send exploring was.
    expect(screen.engineersPage()?.classList.contains("engineer-page")).toBe(
      true,
    );
    expect(inSheet(screen, ".engineer-recall").hidden).toBe(false);
    expect(inSheet(screen, ".engineer-explore").hidden).toBe(true);
    const chip = screen.root.querySelector<HTMLElement>(".expedition-chip");
    expect(chip?.hidden).toBe(false);
    expect(chip?.textContent).toBe("Ada1h 0m");
    expect(chip?.getAttribute("aria-label")).toContain(
      "Ada will be gone about an hour.",
    );
    const saved = readSessionSave({ storage })?.mountain;
    expect(saved?.expeditions[0]?.tunnel).toBe("old-shaft");
    expect(saved?.expeditions[0]?.engineer).toBe("Ada");
    expect(saved?.engineers[0]?.post).toBe("tunnel");
    // Once the cheer gives way, the kick is the trip in words; her row says where she is.
    inSheet(screen, ".engineer-list-back").click();
    expect(
      inSheet(screen, '.engineer-row[data-engineer="Ada"] .board-row-info')
        .textContent,
    ).toBe("Exploring the old shaft · gone about an hour");
    screen.root.remove();
  });

  it("recalls with a soft confirm, and a post calls her home first", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: taughtAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    openTunnels(screen);
    inSheet(screen, '.engineer-tunnel-row[data-tunnel="side-seam"]').click();
    inSheet(screen, ".engineer-recall").click();
    const ask = screen.engineersPage();
    expect(ask?.querySelector(".board-page-line")?.textContent).toBe(
      "Ada comes home empty-handed.",
    );
    expect(ask?.querySelector(".board-page-line")?.textContent).not.toMatch(
      /\d|\?/,
    );
    expect(inSheet(screen, ".recall-no").textContent).toBe("Keep exploring");
    expect(inSheet(screen, ".recall-yes").textContent).toBe("Call back");
    inSheet(screen, ".recall-no").click();
    expect(screen.engineersPage()?.classList.contains("engineer-page")).toBe(
      true,
    );
    expect(screen.progress.getSnapshot().mountain.engineers[0]?.post).toBe(
      "tunnel",
    );

    // Escape closes the whole drawer, and the trip goes on.
    inSheet(screen, ".engineer-recall").click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(engineersOpen(screen.root)).toBe(false);
    expect(screen.progress.getSnapshot().mountain.expeditions[0]?.tunnel).toBe(
      "side-seam",
    );

    screen.openEngineer("Ada");
    inSheet(screen, ".engineer-recall").click();
    inSheet(screen, ".recall-yes").click();
    expect(kick(screen)).toBe("Ada is home, empty-handed.");
    expect(screen.progress.getSnapshot().mountain.expeditions).toEqual([]);
    expect(screen.progress.getSnapshot().mountain.engineers[0]).toMatchObject({
      trips: 0,
      post: "borer",
    });
    expect(screen.progress.getSnapshot().mountain.finds).toEqual([]);
    expect(
      screen.root.querySelector<HTMLElement>(".expedition-chip")?.hidden,
    ).toBe(true);

    inSheet(screen, ".engineer-explore").click();
    inSheet(screen, '.engineer-tunnel-row[data-tunnel="side-seam"]').click();
    // A post chosen while she is out calls the party back first.
    inSheet(screen, '.engineer-post[data-post="camp"]').click();
    expect(kick(screen)).toBe("Ada puts the kettle on at camp.");
    expect(screen.progress.getSnapshot().mountain.expeditions).toEqual([]);
    expect(screen.progress.getSnapshot().mountain.engineers[0]).toMatchObject({
      trips: 0,
      post: "camp",
    });
    screen.root.remove();
  });

  it("lets a Journeyman take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: taughtAda({
        engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.openEngineer("Ada");
    expect(kick(screen)).toBe("Ada is resting at camp. Give her a job below.");
    const page = openTunnels(screen);
    expect(page.textContent).not.toContain(
      "The deep dark waits for a Journeyman.",
    );
    expect(page.textContent).toContain(
      "All night, the best chance of a relic hint or a new engineer.",
    );
    const deep = inSheet(
      screen,
      '.engineer-tunnel-row[data-tunnel="deep-dark"]',
    );
    expect(deep.classList.contains("is-locked")).toBe(false);
    deep.click();
    expect(screen.text(".expedition-chip")).toBe("Ada4h 0m");
    expect(
      screen.root.querySelector(".expedition-chip")?.getAttribute("aria-label"),
    ).toContain("Ada will be gone a long night.");
    expect(screen.progress.getSnapshot().mountain.expeditions[0]?.tunnel).toBe(
      "deep-dark",
    );
    screen.root.remove();
  });

  it("says who came back, on the welcome card and while you stay", () => {
    const sent = send(withAda(), 0, "old-shaft", 0);
    const trip = sent.expeditions[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    const found = {
      ...sent,
      expeditions: [
        {
          ...trip,
          sentAt: 0,
          returnsAt: 60 * 60_000,
          find: { kind: "tool" as const, id: "pick" as const },
        },
      ],
    };
    const awayStorage = createMemoryStorage();
    writeSessionSave({ storage: awayStorage, mountain: found, lastSeen: 0 });
    const away = mountScreen({ storage: awayStorage });
    expect(away.root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      false,
    );
    expect(away.text("#welcome-back-title")).toBe("While you were away");
    expect(away.text(".welcome-return")).toBe(
      "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
    );
    expect(away.text(".welcome-return")).not.toMatch(/\d|\?/);
    expect(away.root.querySelector<HTMLElement>(".welcome-mined")?.hidden).toBe(
      false,
    );
    away.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(away.root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      true,
    );
    expect(away.progress.getSnapshot().homecomings).toEqual([]);
    away.progress.dispose();
    away.root.remove();

    vi.useFakeTimers();
    try {
      const start = 1_000_000_000;
      vi.setSystemTime(start);
      const waiting = {
        ...sent,
        expeditions: [
          {
            ...trip,
            sentAt: start,
            returnsAt: start + 5_000,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
      };
      const liveStorage = createMemoryStorage();
      writeSessionSave({
        storage: liveStorage,
        mountain: waiting,
        lastSeen: start,
      });
      const live = mountScreen({ storage: liveStorage });
      expect(
        live.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      expect(live.text(".expedition-chip")).toBe("Ada0:05");
      expect(
        live.root.querySelector(".expedition-chip")?.getAttribute("aria-label"),
      ).toContain("Ada will be back soon.");
      vi.setSystemTime(start + 5_000);
      live.progress.tick();
      expect(live.text("#welcome-back-title")).toBe("Welcome home");
      expect(live.text(".welcome-return")).toBe(
        "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      );
      expect(
        live.root.querySelector<HTMLElement>(".welcome-mined")?.hidden,
      ).toBe(true);
      expect(
        live.root.querySelector<HTMLElement>(".expedition-chip")?.hidden,
      ).toBe(true);
      expect(live.progress.getSnapshot().mountain.finds).toEqual(["pick"]);
      expect(live.progress.getSnapshot().mountain.engineers[0]?.post).toBe(
        "borer",
      );
      live.progress.dispose();
      live.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the tending gain on the row, and it follows a new machine", () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ helpers: 16, pocket: 30_000_000 }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text('.tier[data-tier="borer"] .board-row-flag')).toMatch(
      /Ada tends · \+78\/s$/,
    );
    expect(
      screen.root
        .querySelector('.tier[data-tier="borer"]')
        ?.getAttribute("aria-label"),
    ).toContain("+78 stones/sec");
    screen.openEngineer("Ada");
    const page = screen.engineersPage();
    expect(page?.textContent).toContain(
      "+78 stones/sec. They dig faster, and she clears any jam herself.",
    );
    expect(page?.textContent).toContain("None built yet. ");
    expect(page?.textContent).not.toContain("+0 stones/sec");
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="borer"]')
      ?.click();
    // The buy holds Done on the row; then the flag names the new gain.
    vi.advanceTimersByTime(1_900);
    vi.useRealTimers();
    expect(screen.text('.tier[data-tier="borer"] .board-row-flag')).toMatch(
      /Ada tends · \+156\/s$/,
    );
    expect(page?.textContent).toContain("+156 stones/sec");
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(screen.text('[data-boost="sharper"] .board-row-info')).toContain(
      "a tap",
    );
    expect(screen.text('[data-boost="overtime"] .board-row-info')).toMatch(
      /\/s\.$/,
    );
    screen.root.remove();
  });

  it("names every return on the away card, and again after a locked phone", () => {
    const sent = send(
      send(
        withAda({
          engineers: [
            { name: "Ada", rank: 0, trips: 0, post: "borer" },
            { name: "Nils", rank: 0, trips: 0, post: "drill" },
          ],
        }),
        0,
        "old-shaft",
        0,
      ),
      1,
      "side-seam",
      0,
    );
    const trips = sent.expeditions;
    const found = {
      ...sent,
      expeditions: trips.map((trip) => ({
        ...trip,
        sentAt: 0,
        returnsAt: 60_000,
        find:
          trip.engineer === "Ada"
            ? ({ kind: "tool", id: "pick" } as const)
            : ({ kind: "quiet" } as const),
      })),
    };
    const awayStorage = createMemoryStorage();
    writeSessionSave({ storage: awayStorage, mountain: found, lastSeen: 0 });
    const away = mountScreen({ storage: awayStorage });
    const lines = [...away.root.querySelectorAll(".welcome-return")].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      "Nils came back from a side seam. The tunnel was quiet, and they came home safe.",
    ]);
    expect(lines.join(" ")).not.toMatch(/\d|\?/);
    away.progress.dispose();
    away.root.remove();

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
      const trip = one.expeditions[0];
      if (trip === undefined) {
        throw new Error("expected a trip");
      }
      const waiting = {
        ...one,
        expeditions: [
          {
            ...trip,
            returnsAt: start + 5_000,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
      };
      const storage = createMemoryStorage();
      writeSessionSave({ storage, mountain: waiting, lastSeen: start });
      const live = mountScreen({ storage });
      live.openEngineers();
      expect(engineersOpen(live.root)).toBe(true);
      expect(
        live.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      setVisibility("hidden");
      vi.setSystemTime(start + 5_000);
      setVisibility("visible");
      const notice = live.root.querySelector<HTMLElement>(".welcome-back");
      expect(notice?.hidden).toBe(false);
      expect(live.text("#welcome-back-title")).toBe("Welcome home");
      expect(live.text(".welcome-return")).toBe(
        "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      );
      // The welcome closes the drawer, as every card that opens itself does.
      expect(engineersOpen(live.root)).toBe(false);
      live.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
      expect(notice?.hidden).toBe(true);
      // Continue gives the board back; the key opens the drawer on her, home.
      expect(engineersOpen(live.root)).toBe(false);
      live.openEngineers();
      expect(
        live.root.querySelector(
          `${ENGINEERS_SHEET} .engineer-row[data-engineer="Ada"] .board-row-info`,
        )?.textContent,
      ).toBe("Tending the borers");
      live.progress.dispose();
      live.root.remove();

      const againStorage = createMemoryStorage();
      writeSessionSave({
        storage: againStorage,
        mountain: waiting,
        lastSeen: start,
      });
      vi.setSystemTime(start);
      const first = mountScreen({ storage: againStorage });
      vi.setSystemTime(start + 5_000);
      setVisibility("hidden");
      first.progress.dispose();
      first.root.remove();
      setVisibility("visible");
      const again = mountScreen({ storage: againStorage });
      expect(
        again.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(false);
      expect(again.text(".welcome-return")).toContain("Grandfather's pick");
      again.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
      again.progress.dispose();
      again.root.remove();
      const quiet = mountScreen({ storage: againStorage });
      expect(
        quiet.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      quiet.progress.dispose();
      quiet.root.remove();
    } finally {
      setVisibility("visible");
      vi.useRealTimers();
    }
  });
});

describe("layer card, material line, and craft-done notice", () => {
  const dismissOpen = (root: HTMLElement): void => {
    const visible = (selector: string): HTMLButtonElement | undefined => {
      const button = root.querySelector<HTMLButtonElement>(selector);
      const dialog = button?.closest<HTMLElement>("[role='dialog']");
      if (button === null || dialog?.hidden !== false) {
        return undefined;
      }
      return button;
    };
    for (let step = 0; step < 12; step += 1) {
      const button =
        visible(".welcome-continue") ??
        visible(".relic-page-carry") ??
        visible(".layer-dig") ??
        visible(".craft-accept");
      if (button === undefined) {
        return;
      }
      button.click();
    }
  };

  it("shows only materials met, and a vague hint before the next band", () => {
    const screen = mountScreen();
    expect(screen.text(STONES_INFO)).toBe("");
    expect(screen.text(RELICS_HINT)).toBe(
      "Below the topsoil, the rock turns hard and grey.",
    );
    expect(screen.text(RELICS_HINT)).not.toMatch(
      /\b(clay|iron|crystal|heartstone)\b|\?/i,
    );
    expect(
      screen.root.querySelector<HTMLElement>(".layer-arrival")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".craft-notice")?.hidden,
    ).toBe(true);

    screen.progress.applyMutation(() => ({
      ...minedMountain(12_000_000),
      materials: { clay: 10, iron: 2, crystal: 0, heartstone: 0 },
    }));
    dismissOpen(screen.root);
    expect(screen.text(STONES_INFO)).toContain("Clay 10");
    expect(screen.text(STONES_INFO)).toContain("Iron 2");
    expect(screen.text(STONES_INFO)).not.toContain("Crystal");
    expect(screen.text(STONES_INFO)).not.toContain("Heartstone");
    expect(screen.text(RELICS_HINT)).toBe(
      "Deeper on, the walls start to glitter.",
    );
    expect(screen.text(RELICS_HINT)).not.toMatch(
      /\b(iron|crystal|heartstone)\b|\d|\?/i,
    );
    screen.progress.dispose();
  });

  it("shows the Granite card after the relics, once, with a press-in button", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => minedMountain(10_000_000));
    expect(
      screen.root.querySelector<HTMLElement>(".layer-arrival")?.hidden,
    ).toBe(true);
    // The relics drawer opens itself on each reveal (#465).
    expect(relicPage(screen.root, REVEAL_PAGE)).not.toBeNull();
    const reveal =
      screen.root.querySelector<HTMLButtonElement>(".relic-page-carry");
    reveal?.click();
    reveal?.click();
    expect(relicPage(screen.root, REVEAL_PAGE)).toBeNull();
    const card = screen.root.querySelector<HTMLElement>(".layer-arrival");
    expect(card?.hidden).toBe(false);
    expect(screen.text(".layer-arrival .board-card-face")).toContain(
      "You broke into the Granite!",
    );
    expect(screen.text(".layer-arrival .board-card-face")).toContain(
      "The grey rock rings under every pick.",
    );
    expect(screen.text(".layer-arrival .board-card-face")).toContain(
      "The Granite suits borers. Tough on drills.",
    );
    expect(screen.text(".layer-sketch")).toBe(
      "A sketch for the shed came up with the rock.",
    );
    expect(screen.text(".layer-sketch")).not.toMatch(/[0-9?]/);
    expect(screen.progress.getSnapshot().mountain.recipes).toEqual(
      expect.arrayContaining(["reinforce", "axle-grease"]),
    );
    expect(screen.text(".layer-arrival .board-card-face")).not.toMatch(/\?/);
    expect(screen.text(".layer-dig")).toBe("Dig on");
    screen.root.querySelector<HTMLButtonElement>(".layer-dig")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".layer-arrival")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
  });

  it("hides the hint in the Deep Heart", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => minedMountain(120_000_000));
    dismissOpen(screen.root);
    expect(screen.root.querySelector<HTMLElement>(RELICS_HINT)?.hidden).toBe(
      true,
    );
    expect(
      screen.root
        .querySelector<HTMLElement>(RELICS_BAR)
        ?.getAttribute("aria-label"),
    ).toBe("Progress to the Mantle of the Hero");
    screen.progress.dispose();
  });

  it("folds a band crossed while away into the welcome card", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(9_990_000), helpers: 20 },
      lastSeen: 0,
    });
    const screen = mountScreen({ storage, now: () => 1_800_000 });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(screen.text(".welcome-layer")).toContain(
      "You broke into the Granite!",
    );
    expect(screen.text(".welcome-layer")).toContain(
      "The Granite suits borers. Tough on drills.",
    );
    expect(screen.text(".welcome-layer")).toContain(
      "A sketch for the shed came up with the rock.",
    );
    expect(
      screen.root.querySelector<HTMLElement>(".layer-arrival")?.hidden,
    ).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".layer-arrival")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
  });

  it("names a fitted craft and its real speed, then once is enough", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 1,
        carts: 1,
        pocket: 5_000_000,
        materials: { clay: 20, iron: 20, crystal: 0, heartstone: 0 },
        recipes: recipesForMined(12_000_000),
      },
      lastSeen: 0,
    });
    let clock = 0;
    const screen = mountScreen({ storage, now: () => clock });
    screen.progress.applyMutation((mountain) =>
      startCraft(mountain, "iron-rails", clock),
    );
    const endsAt = screen.progress.getSnapshot().mountain.bench?.endsAt ?? 0;
    while (clock < endsAt) {
      clock = Math.min(endsAt, clock + 9_000);
      screen.progress.tick();
    }
    const notice = screen.root.querySelector<HTMLElement>(".craft-notice");
    expect(notice?.hidden).toBe(false);
    expect(screen.text("#craft-notice-line")).toBe(
      "Your Iron rails are fitted. Carts now 7.5/s.",
    );
    expect(screen.text(".craft-accept")).toBe("The crew feels it");
    screen.root.querySelector<HTMLButtonElement>(".craft-accept")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".craft-notice")?.hidden,
    ).toBe(true);
    screen.progress.tick();
    expect(
      screen.root.querySelector<HTMLElement>(".craft-notice")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
  });

  it("folds a craft finished while away into the welcome card", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 4,
        carts: 1,
        pocket: 5_000_000,
        materials: { clay: 20, iron: 20, crystal: 0, heartstone: 0 },
        recipes: recipesForMined(12_000_000),
        bench: { recipe: "iron-rails", startedAt: 0, endsAt: 60_000 },
      },
      lastSeen: 0,
    });
    // Ten minutes: long enough for the card, not the quiet note (#334).
    const screen = mountScreen({ storage, now: () => 10 * 60_000 });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(screen.text(".welcome-craft")).toBe(
      "Your Iron rails are fitted. Carts now 7.5/s.",
    );
    expect(
      screen.root.querySelector<HTMLElement>(".craft-notice")?.hidden,
    ).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".craft-notice")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
  });

  it("skips a topsoil line on the welcome card", () => {
    const root = document.createElement("div");
    const welcome = createWelcomePanel({
      progress: {
        dismissAway: () => undefined,
      } as unknown as ReturnType<typeof createProgressStore>,
      getView: () =>
        ({
          away: {
            mined: 1,
            awayMs: 120_000,
            paidMs: 120_000,
            capped: false,
            heart: 1,
            materials: EMPTY_MATERIALS,
          },
          layersArrived: [LAYERS[0]],
          craftsFitted: [],
          crewJoined: undefined,
          engineerJoined: undefined,
          homecomings: [],
          mountain: createMountain(),
        }) as unknown as ReturnType<
          ReturnType<typeof createProgressStore>["getSnapshot"]
        >,
      board: createBoardHost({ clock: () => 0 }),
    });
    root.append(welcome.welcome);
    welcome.render();
    expect(root.querySelector<HTMLElement>(".welcome-layer")).toBeNull();
    expect(root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      false,
    );
  });

  it("shows the conflict sheet and saved copies from the Ledger", async () => {
    const cloud = createMemoryCloudSave();
    const screen = mountScreen({ auth: signedIn(), cloudSave: cloud });
    screen.progress.layoutPreview.conflict();
    const sheet = screen.root.querySelector<HTMLElement>(".save-conflict");
    expect(sheet?.hidden).toBe(false);
    expect(
      screen.root.querySelector(".save-conflict .board-card-face"),
    ).not.toBeNull();
    expect(screen.text("#save-conflict-title")).toBe("Two saves found");
    expect(screen.text(".save-conflict-body")).toContain("nothing is lost");
    screen.root
      .querySelector<HTMLButtonElement>(".save-card[data-side='other']")
      ?.click();
    expect(
      screen.root
        .querySelector(".save-card[data-side='other']")
        ?.classList.contains("is-selected"),
    ).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>(".save-conflict-play")
      ?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".save-conflict-confirm")?.hidden,
    ).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>(".save-conflict-commit")
      ?.click();
    await vi.waitFor(() => {
      expect(
        screen.root.querySelector<HTMLElement>(".save-conflict")?.hidden,
      ).toBe(true);
    });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=ledger]")
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".ledger-saved-copies")
      ?.click();
    await vi.waitFor(() => {
      expect(screen.text(".saved-copies")).toContain("Chrome on Android");
    });
    screen.root
      .querySelector<HTMLButtonElement>(".saved-copies .saved-copies-close")
      ?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".saved-copies")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
  });

  it("an open saved copies sheet keeps the focus on a copy's Play through the tick", async () => {
    vi.useFakeTimers();
    try {
      const cloud = createMemoryCloudSave();
      const screen = mountScreen({ auth: signedIn(), cloudSave: cloud });
      document.body.append(screen.root);
      await vi.advanceTimersByTimeAsync(0);
      expect(screen.progress.getSnapshot().ready).toBe(true);
      await cloud.archiveCopy?.({
        uid: "test-dad",
        mountain: { ...screen.progress.getSnapshot().mountain, pocket: 12 },
        lastSeen: 1,
        rev: 1,
        deviceId: "other-device",
        deviceLabel: "Safari on iPhone",
      });
      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=ledger]")
        ?.click();
      screen.root
        .querySelector<HTMLButtonElement>(".ledger-saved-copies")
        ?.click();
      await vi.advanceTimersByTimeAsync(0);
      const play = screen.root.querySelector<HTMLButtonElement>(
        ".saved-copies .save-conflict-play",
      );
      expect(play).not.toBeNull();
      play?.focus();
      expect(document.activeElement).toBe(play);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(document.activeElement).toBe(play);
      screen.root.remove();
      screen.progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("greys out a saved copy from an earlier run", async () => {
    const cloud = createMemoryCloudSave();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: cloud,
      now: () => 80_000,
    });
    await vi.waitFor(() => {
      expect(screen.progress.getSnapshot().ready).toBe(true);
    });
    screen.progress.startOver();
    await vi.waitFor(async () => {
      const saved = await cloud.load({ uid: "test-dad" });
      expect(saved.kind === "found" && saved.mountain.startedAt).toBe(80_000);
    });
    await cloud.archiveCopy?.({
      uid: "test-dad",
      mountain: { ...createMountain(), startedAt: 1, pocket: 12, carts: 2 },
      lastSeen: 1,
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
    });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=ledger]")
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".ledger-saved-copies")
      ?.click();
    await vi.waitFor(() => {
      expect(screen.text(".saved-copies")).toContain(
        "From an earlier run – can't be played now",
      );
    });
    expect(screen.text(".is-earlier-run")).toContain("2 carts");
    expect(screen.text(".is-earlier-run")).toContain("12");
    expect(
      screen.root.querySelector(".is-earlier-run .save-conflict-play"),
    ).toBeNull();
    expect(screen.text(".saved-copies")).not.toMatch(/\?/);
    screen.progress.dispose();
  });
});

describe("sheet buys", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("opens the buys over the rock and shows the next mark as a plain goal", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 13,
        carts: 5,
        drills: 2,
        pocket: 2_500_000,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const dialog = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"]',
    );
    expect(dialog?.classList.contains("is-open")).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    expect(dialog?.classList.contains("is-open")).toBe(true);
    expect(screen.text(".board-rail")).toContain("Buys");
    expect(screen.text(".board-rail")).toContain("Workshop");
    expect(screen.text(".board-rail")).toContain("Engineers");
    expect(screen.text(".board-rail")).toContain("Upgrades");
    expect(
      screen.root
        .querySelector(".board-key[data-key=engineers]")
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe("+6/s");
    expect(
      screen.root
        .querySelector('.tier[data-tier="borer"] .board-row-gain')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.text('.tier[data-tier="borer"] .board-row-name')).toBe(
      "Tunnel borer",
    );
    // The drill's first owned-count mark shows as a plain goal (#252).
    expect(screen.text('.tier[data-tier="drill"] .board-row-info')).toMatch(
      /^\d+ of 10 · Ten drills/,
    );
    expect(screen.text('.tier[data-tier="borer"] .board-row-info')).toMatch(
      /^0 of 5 · /,
    );
    expect(screen.text('.tier[data-tier="drill"]')).not.toMatch(/\?/);
    screen.root
      .querySelector<HTMLButtonElement>(
        '.board-sheet[data-sheet="buys"] .board-sheet-back',
      )
      ?.click();
    expect(dialog?.classList.contains("is-open")).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=workshop]")
      ?.click();
    expect(
      screen.root
        .querySelector(".board-sheet[data-sheet=workshop]")
        ?.classList.contains("is-open"),
    ).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>(
        ".board-sheet[data-sheet=workshop] .board-sheet-back",
      )
      ?.click();
    screen.progress.dispose();
  });

  it("uses drawer rows on buys and upgrades (#373)", () => {
    const screen = mountScreen();
    const tiers = [
      ...screen.root.querySelectorAll('.board-sheet[data-sheet="buys"] .tier'),
    ];
    expect(tiers.length).toBe(6);
    for (const row of tiers) {
      expect(row.classList.contains("board-row")).toBe(true);
      expect(row.classList.contains("sheet-card")).toBe(false);
      expect(row.querySelector(".board-row-icon")).toBeInstanceOf(
        HTMLImageElement,
      );
      expect(row.querySelector(".board-row-name")).not.toBeNull();
      expect(row.querySelector(".board-row-price")).not.toBeNull();
    }
    const rows = [
      ...screen.root.querySelectorAll(
        '.board-sheet[data-sheet="upgrades"] .upgrade',
      ),
    ];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.classList.contains("board-row")).toBe(true);
      expect(row.classList.contains("sheet-card")).toBe(false);
      expect(row.querySelector(".board-row-name")).not.toBeNull();
      expect(row.querySelector(".board-row-price")).not.toBeNull();
    }
    screen.progress.dispose();
  });

  it("keeps the gain and the bill on an unaffordable buy, and says where a locked row opens", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(1_000_000),
        helpers: 18,
        carts: 7,
        drills: 2,
        pocket: 32_500,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const line = (tier: string, selector: string): HTMLElement | null =>
      screen.root.querySelector<HTMLElement>(
        `.tier[data-tier="${tier}"] ${selector}`,
      );
    expect(line("cart", ".board-row-name")?.textContent).toBe("Mine cart");
    expect(line("drill", ".board-row-name")?.textContent).toBe("Steam drill");
    expect(line("drill", ".board-row-gain")?.hidden).toBe(false);
    expect(line("drill", ".board-row-verb")?.textContent).toBe("1 worker");
    expect(line("drill", ".board-row-info")?.hidden).toBe(false);
    expect(line("drill", ".board-row-info")?.textContent).toMatch(
      /^2 of 10 · Ten drills/,
    );
    expect(line("machine", ".board-row-name")?.textContent).toBe(
      "Great Machine",
    );
    expect(line("machine", ".board-row-price")?.textContent).toBe("Locked");
    expect(line("machine", ".board-row-gain")?.hidden).toBe(true);
    // A locked row says where it opens, in words (#250).
    expect(line("machine", ".board-row-info")?.hidden).toBe(false);
    expect(line("machine", ".board-row-info")?.textContent).toBe(
      `The Great Machine joins your crew at ${formatCompact(shownStones(createMountain(), 120_000_000))} stones. Keep digging, Dad!`,
    );
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    const arms = screen.root.querySelector('[data-upgrade="tap"]');
    expect(arms?.classList.contains("is-dear")).toBe(true);
    expect(arms?.querySelector<HTMLElement>(".board-row-info")?.hidden).toBe(
      false,
    );
    expect(arms?.querySelector<HTMLElement>(".board-row-why")?.hidden).toBe(
      false,
    );
    expect(arms?.querySelector(".board-row-info")?.textContent).not.toBe("");
    const roads = screen.root.querySelector('[data-upgrade="drillSyn"]');
    expect(roads?.hasAttribute("hidden")).toBe(true);
    screen.progress.dispose();
  });

  it("shows a huge pocket in short form beside the craft chips", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(1_000), pocket: 32_500, helpers: 4 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    screen.progress.applyMutation((mountain) => ({
      ...mountain,
      pocket: 999_900_000_000_000,
      clocks: { ...mountain.clocks, "blasting-charge": Date.now() + 60_000 },
      bench: {
        recipe: "iron-rails",
        startedAt: Date.now() - 1_000,
        endsAt: Date.now() + 120_000,
      },
    }));
    expect(screen.pocket()).toBe("Stones 999.9T");
    const charge = screen.root.querySelector("[data-craft='blasting-charge']");
    expect(charge?.textContent).toMatch(/Charge/);
    expect(charge?.textContent).toMatch(/×2/);
    expect(charge?.getAttribute("aria-label")).toMatch(/Blasting charge/);
    const rails = screen.root.querySelector("[data-craft='bench']");
    expect(rails?.textContent).toMatch(/Rails/);
    expect(rails?.getAttribute("aria-label")).toMatch(/Iron rails/);
    screen.root.remove();
    screen.progress.dispose();
  });

  it("buys from the title or the why line, and ignores a drag", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 18,
        carts: 7,
        drills: 2,
        pocket: 2_500_000,
        materials: { clay: 10, iron: 4, crystal: 0, heartstone: 0 },
      },
      lastSeen: Date.now(),
    });
    let clock = 0;
    const screen = mountScreen({ storage, tapClock: () => clock });
    const tap = (node: Element): void => {
      node.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 4,
          clientY: 4,
          button: 0,
        }),
      );
      node.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 4,
          clientY: 4,
          button: 0,
        }),
      );
      node.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 }),
      );
    };
    const carts = (): number => screen.progress.getSnapshot().mountain.carts;
    const before = carts();
    const cartWhy = screen.root.querySelector(
      '.tier[data-tier="cart"] .board-row-info',
    );
    if (cartWhy === null) {
      throw new Error("cart why did not render");
    }
    tap(cartWhy);
    expect(carts()).toBe(before + 1);
    const drag = screen.root.querySelector(
      '.tier[data-tier="helper"] .board-row-name',
    );
    if (drag === null) {
      throw new Error("worker name did not render");
    }
    const helpers = screen.progress.getSnapshot().mountain.helpers;
    drag.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        button: 0,
      }),
    );
    drag.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 40,
        clientY: 0,
        button: 0,
      }),
    );
    drag.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 40,
        clientY: 0,
        button: 0,
      }),
    );
    drag.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 40, clientY: 0 }),
    );
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(helpers);
    tap(drag);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(helpers + 1);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    // Past the drawer's settle: a deliberate tap.
    clock += BUYS_SETTLE_MS;
    const why = screen.root.querySelector(
      '[data-upgrade="tap"] .board-row-why',
    );
    if (why === null) {
      throw new Error("upgrade why did not render");
    }
    tap(why);
    expect(screen.progress.getSnapshot().mountain.upgrades.tap).toBe(1);
    screen.root
      .querySelector<HTMLButtonElement>(
        '[data-sheet="upgrades"] .board-sheet-back',
      )
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=workshop]")
      ?.click();
    const craftName = screen.root.querySelector(
      ".workshop-recipe:not([hidden]) .board-row-name",
    );
    if (craftName === null) {
      throw new Error("craft name did not render");
    }
    tap(craftName);
    expect(screen.progress.getSnapshot().mountain.bench).toBeDefined();
    screen.progress.dispose();
  });

  it("leaves a locked workshop closed when its key is tapped", () => {
    const screen = mountScreen();
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=workshop]")
      ?.click();
    expect(
      screen.root
        .querySelector(".board-sheet[data-sheet=workshop]")
        ?.classList.contains("is-open"),
    ).toBe(false);
    screen.progress.dispose();
  });

  it("enables a key only when its sheet will open", () => {
    const fresh = mountScreen();
    const keyOf = (
      root: HTMLElement,
      selector: string,
    ): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(selector);
    expect(keyOf(fresh.root, ".board-key[data-key=buys]")?.disabled).toBe(
      false,
    );
    expect(keyOf(fresh.root, ".board-key[data-key=upgrades]")?.disabled).toBe(
      false,
    );
    expect(keyOf(fresh.root, ".board-key[data-key=workshop]")?.disabled).toBe(
      true,
    );
    expect(keyOf(fresh.root, ".board-key[data-key=engineers]")?.disabled).toBe(
      true,
    );
    keyOf(fresh.root, ".board-key[data-key=upgrades]")?.click();
    expect(
      fresh.root
        .querySelector('.board-sheet[data-sheet="upgrades"]')
        ?.classList.contains("is-open"),
    ).toBe(true);
    fresh.progress.dispose();

    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 13,
        carts: 5,
        drills: 2,
        borers: 1,
        pocket: 2_500_000,
      },
      lastSeen: Date.now(),
    });
    const later = mountScreen({ storage });
    expect(keyOf(later.root, ".board-key[data-key=buys]")?.disabled).toBe(
      false,
    );
    expect(keyOf(later.root, ".board-key[data-key=upgrades]")?.disabled).toBe(
      false,
    );
    expect(keyOf(later.root, ".board-key[data-key=workshop]")?.disabled).toBe(
      false,
    );
    expect(keyOf(later.root, ".board-key[data-key=engineers]")?.disabled).toBe(
      false,
    );
    keyOf(later.root, ".board-key[data-key=workshop]")?.click();
    expect(
      later.root
        .querySelector(".board-sheet[data-sheet=workshop]")
        ?.classList.contains("is-open"),
    ).toBe(true);
    keyOf(later.root, ".board-key[data-key=engineers]")?.click();
    expect(engineersOpen(later.root)).toBe(true);
    // One drawer at a time: the Engineers key closed the Workshop.
    expect(
      later.root
        .querySelector(".board-sheet[data-sheet=workshop]")
        ?.classList.contains("is-open"),
    ).toBe(false);
    later.progress.dispose();
  });
});

describe("the board cards (#464)", () => {
  /** A finger's tap: pointerdown, then a click that counts its taps (detail 1). */
  const fingerTap = (root: HTMLElement, selector: string): void => {
    const target = root.querySelector<HTMLElement>(selector);
    if (target === null) {
      throw new Error(`no ${selector}`);
    }
    target.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
  };
  const shown = (root: HTMLElement, selector: string): boolean =>
    root.querySelector<HTMLElement>(selector)?.hidden === false;

  const awayScreen = (tapClock: () => number) => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(2_000_000), helpers: 4 },
      lastSeen: 0,
    });
    return mountScreen({ storage, now: () => 30 * 60_000, tapClock });
  };

  it("the welcome card is a board card", () => {
    const screen = awayScreen(() => 1000);
    const card = screen.root.querySelector<HTMLElement>(
      ".board-card.welcome-back[data-card=welcome]",
    );
    expect(card?.hidden).toBe(false);
    expect(card?.querySelector(".board-card-face")).not.toBeNull();
    expect(
      card?.querySelector(".board-card-plate.welcome-continue")?.textContent,
    ).toBe("Back to the mountain");
    screen.progress.dispose();
  });

  it("a finger on Back to the mountain in the first 400ms does nothing", () => {
    let tap = 1000;
    const screen = awayScreen(() => tap);
    tap += 100;
    fingerTap(screen.root, ".welcome-continue");
    expect(screen.progress.getSnapshot().away).toBeDefined();
    expect(shown(screen.root, ".welcome-back")).toBe(true);
    tap += 350;
    fingerTap(screen.root, ".welcome-continue");
    expect(screen.progress.getSnapshot().away).toBeUndefined();
    expect(shown(screen.root, ".welcome-back")).toBe(false);
    screen.progress.dispose();
  });

  it("the relic reveal, then the layer card, which settles on its own", () => {
    let tap = 1000;
    const screen = mountScreen({ tapClock: () => tap });
    screen.progress.applyMutation(() => minedMountain(10_000_000));
    // Two relics come up first; each is dismissed by keyboard.
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    expect(shown(screen.root, ".layer-arrival")).toBe(true);
    tap += 100;
    fingerTap(screen.root, ".layer-dig");
    expect(shown(screen.root, ".layer-arrival")).toBe(true);
    tap += 350;
    fingerTap(screen.root, ".layer-dig");
    expect(shown(screen.root, ".layer-arrival")).toBe(false);
    screen.progress.dispose();
  });

  it("the layer card shows the band's view", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => minedMountain(10_000_000));
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    const art = screen.root.querySelector<HTMLImageElement>(
      ".layer-arrival .board-card-art",
    );
    expect(art?.getAttribute("src")).toBe(mineView("granite"));
    expect([art?.width, art?.height]).toEqual([184, 152]);
    screen.progress.dispose();
  });

  it("an open drawer closes when craft done opens, and the card settles", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        helpers: 1,
        carts: 1,
        pocket: 5_000_000,
        materials: { clay: 20, iron: 20, crystal: 0, heartstone: 0 },
        recipes: recipesForMined(12_000_000),
      },
      lastSeen: 0,
    });
    let clock = 0;
    let tap = 1000;
    const screen = mountScreen({
      storage,
      now: () => clock,
      tapClock: () => tap,
    });
    screen.progress.applyMutation((mountain) =>
      startCraft(mountain, "iron-rails", clock),
    );
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    const buys = screen.root.querySelector<HTMLElement>(
      ".board-sheet[data-sheet=buys]",
    );
    expect(buys?.classList.contains("is-open")).toBe(true);
    const endsAt = screen.progress.getSnapshot().mountain.bench?.endsAt ?? 0;
    tap += 5000;
    while (clock < endsAt) {
      clock = Math.min(endsAt, clock + 9_000);
      screen.progress.tick();
    }
    expect(shown(screen.root, ".craft-notice")).toBe(true);
    expect(buys?.classList.contains("is-open")).toBe(false);
    expect(
      screen.root
        .querySelector<HTMLImageElement>(".craft-notice .board-card-art")
        ?.getAttribute("src"),
    ).toContain("mach-cart.png");
    // The card stays on the board's stack: a finger in its first 400ms is its opening's tap.
    tap += 100;
    fingerTap(screen.root, ".craft-accept");
    expect(shown(screen.root, ".craft-notice")).toBe(true);
    tap += 350;
    fingerTap(screen.root, ".craft-accept");
    expect(shown(screen.root, ".craft-notice")).toBe(false);
    screen.progress.dispose();
  });
});
