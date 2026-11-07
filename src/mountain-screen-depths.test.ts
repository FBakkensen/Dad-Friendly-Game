// @vitest-environment happy-dom
import { send } from "./expeditions";
import { readSessionSave, writeSessionSave } from "./session-save";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCloudSave } from "./cloud-save";
import { EMPTY_MATERIALS, LAYERS } from "./layers";
import { createMountain, type Mountain } from "./mountain";
import { formatCompact } from "./format";
import { shownStones } from "./scale";
import { createWelcomePanel } from "./welcome-panel";
import { createProgressStore } from "./progress-store";
import { minedMountain } from "./test-fixtures";
import { recipesForMined, startCraft } from "./workshop";
import {
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

  const openSheet = (root: HTMLElement): HTMLElement => {
    const button = root.querySelector<HTMLButtonElement>(".engineers-button");
    button?.click();
    const sheet = root.querySelector<HTMLElement>(".engineers-dialog");
    if (sheet === null) {
      throw new Error("engineers sheet did not render");
    }
    return sheet;
  };

  it("sends Ada down a tunnel, and an Apprentice cannot take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const ada = sheet.querySelector('[data-name="Ada"]');
    ada?.querySelector<HTMLButtonElement>(".engineer-explore")?.click();
    expect(ada?.textContent).toContain("Quick look");
    expect(ada?.textContent).toContain(
      "Back in a few minutes with a small find.",
    );
    expect(ada?.textContent).toContain("Old shaft");
    expect(ada?.textContent).toContain(
      "About an hour, often a lost tool or keepsake.",
    );
    expect(ada?.textContent).toContain("The deep dark");
    expect(ada?.textContent).toContain("The deep dark waits for a Journeyman.");
    expect(ada?.textContent).toContain(
      "While she explores, her machine works without her.",
    );
    const deep = ada?.querySelector<HTMLButtonElement>(
      '[data-tunnel="deep-dark"]',
    );
    expect(deep?.disabled).toBe(true);
    deep?.click();
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();

    ada?.querySelector<HTMLButtonElement>('[data-tunnel="old-shaft"]')?.click();
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring the old shaft.",
    );
    expect(screen.text(".engineer-trip-detail")).toBe(
      "Ada will be gone about an hour. She'll bring home whatever is found.",
    );
    expect(screen.text(".engineer-toast")).toBe(
      "Ada lights a lamp and heads in!",
    );
    expect(ada?.classList.contains("is-lit")).toBe(true);
    expect(ada?.querySelector<HTMLElement>(".engineer-recall")?.hidden).toBe(
      false,
    );
    expect(ada?.querySelector<HTMLElement>(".engineer-explore")?.hidden).toBe(
      true,
    );
    const chip = screen.root.querySelector<HTMLElement>(".expedition-chip");
    expect(chip?.hidden).toBe(false);
    expect(chip?.textContent).toBe("Ada1h 0m");
    expect(chip?.getAttribute("aria-label")).toContain(
      "Ada will be gone about an hour.",
    );
    const saved = readSessionSave({ storage })?.mountain;
    expect(saved?.expeditions?.[0]?.tunnel).toBe("old-shaft");
    expect(saved?.expeditions?.[0]?.engineer).toBe("Ada");
    expect(saved?.engineers?.[0]?.post).toBe("tunnel");
    screen.root.remove();
  });

  it("recalls with a soft confirm, and a post calls her home first", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    sheet
      .querySelector<HTMLButtonElement>('[data-tunnel="side-seam"]')
      ?.click();
    const recall = sheet.querySelector<HTMLButtonElement>(".engineer-recall");
    expect(recall?.hidden).toBe(false);
    recall?.click();
    expect(screen.text(".recall-line")).toBe("Ada comes home empty-handed.");
    expect(screen.text(".recall-line")).not.toMatch(/\d|\?/);
    expect(screen.text(".recall-no")).toBe("Keep exploring");
    expect(screen.text(".recall-yes")).toBe("Call back");
    sheet.querySelector<HTMLButtonElement>(".recall-no")?.click();
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring a side seam.",
    );
    expect(sheet.querySelector<HTMLElement>(".recall-confirm")?.hidden).toBe(
      true,
    );

    recall?.click();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sheet.hidden).toBe(false);
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring a side seam.",
    );

    recall?.click();
    sheet.querySelector<HTMLButtonElement>(".recall-yes")?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is tending the borers: +78 stones/sec.",
    );
    expect(screen.text(".engineer-toast")).toBe("Ada is home, empty-handed.");
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.engineers?.[0]).toMatchObject(
      { trips: 0, post: "borer" },
    );
    expect(screen.progress.getSnapshot().mountain.finds).toBeUndefined();
    expect(
      screen.root.querySelector<HTMLElement>(".expedition-chip")?.hidden,
    ).toBe(true);

    sheet
      .querySelector<HTMLButtonElement>('[data-tunnel="side-seam"]')
      ?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-recall")?.click();
    sheet.querySelector<HTMLButtonElement>('[data-post="camp"]')?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    expect(sheet.querySelector<HTMLElement>(".recall-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.engineers?.[0]?.trips).toBe(
      0,
    );
    screen.root.remove();
  });

  it("lets a Journeyman take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({
        engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const ada = sheet.querySelector('[data-name="Ada"]');
    expect(ada?.querySelector(".engineer-doing")?.textContent).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    ada?.querySelector<HTMLButtonElement>(".engineer-explore")?.click();
    expect(ada?.textContent).not.toContain(
      "The deep dark waits for a Journeyman.",
    );
    expect(ada?.textContent).toContain(
      "All night, the best chance of a relic hint or a new engineer.",
    );
    const deep = ada?.querySelector<HTMLButtonElement>(
      '[data-tunnel="deep-dark"]',
    );
    expect(deep?.disabled).toBe(false);
    deep?.click();
    expect(screen.text(".expedition-chip")).toBe("Ada4h 0m");
    expect(
      screen.root.querySelector(".expedition-chip")?.getAttribute("aria-label"),
    ).toContain("Ada will be gone a long night.");
    expect(
      screen.progress.getSnapshot().mountain.expeditions?.[0]?.tunnel,
    ).toBe("deep-dark");
    screen.root.remove();
  });

  it("says who came back, on the welcome card and while you stay", () => {
    const sent = send(withAda(), 0, "old-shaft", 0);
    const trip = sent.expeditions?.[0];
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
      expect(live.progress.getSnapshot().mountain.engineers?.[0]?.post).toBe(
        "borer",
      );
      live.progress.dispose();
      live.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the tending gain on the card, and it follows a new machine", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ helpers: 16, pocket: 30_000_000 }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text('[data-tier="borer"] .engineer-gain')).toBe(
      "+78 stones/sec",
    );
    expect(
      screen.root
        .querySelector('[data-tier="borer"]')
        ?.getAttribute("aria-label"),
    ).toContain("+78 stones/sec");
    const sheet = openSheet(screen.root);
    sheet.querySelector<HTMLButtonElement>(".engineer-tend")?.click();
    expect(sheet.textContent).toContain(
      "+78 stones/sec. They dig faster, and she clears any jam herself.",
    );
    expect(sheet.textContent).toContain("None built yet. ");
    expect(sheet.textContent).not.toContain("+0 stones/sec");
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="borer"]')
      ?.click();
    expect(screen.text('[data-tier="borer"] .engineer-gain')).toBe(
      "+156 stones/sec",
    );
    expect(sheet.textContent).toContain("+156 stones/sec");
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(screen.text('[data-boost="sharper"] .upgrade-effect')).toContain(
      "a tap",
    );
    expect(screen.text('[data-boost="overtime"] .upgrade-effect')).toMatch(
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
    const trips = sent.expeditions ?? [];
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
      const trip = one.expeditions?.[0];
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
      openSheet(live.root);
      expect(
        live.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      setVisibility("hidden");
      vi.setSystemTime(start + 5_000);
      setVisibility("visible");
      const notice = live.root.querySelector<HTMLElement>(".welcome-back");
      expect(notice?.hidden).toBe(false);
      expect(notice?.classList.contains("is-homecoming")).toBe(true);
      expect(live.text("#welcome-back-title")).toBe("Welcome home");
      expect(live.text(".welcome-return")).toBe(
        "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      );
      expect(
        live.root.querySelector<HTMLElement>(".engineers-dialog")?.hidden,
      ).toBe(false);
      live.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
      expect(notice?.hidden).toBe(true);
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
        visible(".reveal-continue") ??
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
    expect(screen.text(".material-line")).toBe("");
    expect(screen.text(".layer-hint")).toBe(
      "Below the topsoil, the rock turns hard and grey.",
    );
    expect(screen.text(".layer-hint")).not.toMatch(
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
    expect(screen.text(".material-line")).toContain("Clay 10");
    expect(screen.text(".material-line")).toContain("Iron 2");
    expect(screen.text(".material-line")).not.toContain("Crystal");
    expect(screen.text(".material-line")).not.toContain("Heartstone");
    expect(screen.text(".layer-hint")).toBe(
      "Deeper on, the walls start to glitter.",
    );
    expect(screen.text(".layer-hint")).not.toMatch(
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
    expect(
      screen.root.querySelector<HTMLElement>(".relic-reveal")?.hidden,
    ).toBe(false);
    const reveal =
      screen.root.querySelector<HTMLButtonElement>(".reveal-continue");
    reveal?.click();
    reveal?.click();
    const card = screen.root.querySelector<HTMLElement>(".layer-arrival");
    expect(card?.hidden).toBe(false);
    expect(screen.text(".layer-card")).toContain("You broke into the Granite!");
    expect(screen.text(".layer-card")).toContain(
      "The grey rock rings under every pick.",
    );
    expect(screen.text(".layer-card")).toContain(
      "The Granite suits borers. Tough on drills.",
    );
    expect(screen.text(".layer-sketch")).toBe(
      "A sketch for the shed came up with the rock.",
    );
    expect(screen.text(".layer-sketch")).not.toMatch(/[0-9?]/);
    expect(screen.progress.getSnapshot().mountain.recipes).toEqual(
      expect.arrayContaining(["reinforce", "axle-grease"]),
    );
    expect(screen.text(".layer-card")).not.toMatch(/\?/);
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
    expect(screen.root.querySelector<HTMLElement>(".layer-hint")?.hidden).toBe(
      true,
    );
    expect(
      screen.root
        .querySelector<HTMLElement>(".guide-bar")
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
    });
    root.append(welcome.welcome);
    welcome.render();
    expect(root.querySelector<HTMLElement>(".welcome-layer")).toBeNull();
    expect(root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      false,
    );
  });

  it("shows the conflict sheet and saved copies from the menu", async () => {
    const cloud = createMemoryCloudSave();
    const screen = mountScreen({ auth: signedIn(), cloudSave: cloud });
    screen.progress.previewConflict();
    const sheet = screen.root.querySelector<HTMLElement>(".save-conflict");
    expect(sheet?.hidden).toBe(false);
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
    screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
    screen.root.querySelector<HTMLButtonElement>(".saved-copies-link")?.click();
    await vi.waitFor(() => {
      expect(screen.text(".saved-copies")).toContain("Chrome on Android");
    });
    screen.root
      .querySelector<HTMLButtonElement>(".saved-copies .menu-close")
      ?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".saved-copies")?.hidden,
    ).toBe(true);
    screen.progress.dispose();
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
    screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
    screen.root.querySelector<HTMLButtonElement>(".saved-copies-link")?.click();
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
    const dialog = screen.root.querySelector<HTMLElement>(".buys-dialog");
    expect(dialog?.hidden).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".buys-button")?.click();
    expect(dialog?.hidden).toBe(false);
    expect(screen.text(".pocket-rate")).toMatch(/stones\/s$/);
    expect(screen.text(".layer-line")).toContain("The Granite");
    expect(screen.text(".layer-line")).toContain("Suits borers.");
    expect(screen.text(".thumb-bar")).toContain("Buys");
    expect(screen.text(".thumb-bar")).toContain("Workshop");
    expect(screen.text(".thumb-bar")).toContain("Engineers");
    expect(screen.text(".thumb-bar")).toContain("Upgrades");
    expect(
      screen.root.querySelector(".engineers-button")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.text('[data-tier="cart"] .tier-gain')).toBe("+6/s each");
    expect(screen.text('[data-tier="cart"] .tier-needs')).toBe(
      "Needs 1 worker",
    );
    expect(screen.text('[data-tier="cart"] .tier-why')).toBe(
      "Hauls what the crew already cut.",
    );
    expect(screen.text('[data-tier="drill"] .tier-needs')).toBe(
      "Needs 1 worker",
    );
    expect(screen.text('[data-tier="drill"] .tier-why')).toBe(
      "Bites the wall while you rest.",
    );
    expect(
      screen.root
        .querySelector('[data-tier="drill"] .tier-why')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      screen.root
        .querySelector('[data-tier="borer"] .tier-gain')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.text('[data-tier="borer"] .tier-why')).toBe(
      "Chews a tunnel you can walk from.",
    );
    expect(screen.text('[data-tier="borer"] .tier-name')).toBe("Tunnel borer");
    // The drill's first owned-count mark shows as a plain goal (#252).
    expect(
      screen.root
        .querySelector('[data-tier="drill"] .tier-preview')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.text('[data-tier="drill"] .tier-preview')).toMatch(
      /^\d+ of 10 · Ten drills/,
    );
    expect(screen.text('[data-tier="drill"]')).not.toMatch(/\?/);
    screen.root.querySelector<HTMLButtonElement>(".buys-close")?.click();
    expect(dialog?.hidden).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".thumb-workshop")?.click();
    expect(
      screen.root.querySelector(".workshop-dialog")?.hasAttribute("hidden"),
    ).toBe(false);
    screen.root.querySelector<HTMLButtonElement>(".workshop-close")?.click();
    screen.progress.dispose();
  });

  it("uses one sheet card on buys and upgrades", () => {
    const screen = mountScreen();
    const cards = [
      ...screen.root.querySelectorAll(
        ".buys-dialog .tier, .upgrades-dialog .upgrade",
      ),
    ];
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      expect(card.classList.contains("sheet-card")).toBe(true);
      expect(card.querySelector(".sheet-card-icon")).toBeInstanceOf(
        HTMLImageElement,
      );
      expect(card.querySelector(".sheet-card-title")).not.toBeNull();
      expect(card.querySelector(".sheet-card-price")).not.toBeNull();
      expect(card.querySelector(".sheet-card-body")).not.toBeNull();
    }
    const buysPad = getComputedStyle(
      screen.root.querySelector(".buys-dialog .sheet-card") as Element,
    ).padding;
    const upgradePad = getComputedStyle(
      screen.root.querySelector(".upgrades-dialog .sheet-card") as Element,
    ).padding;
    expect(buysPad).toBe(upgradePad);
    screen.progress.dispose();
  });

  it("keeps the effect and the why on an unaffordable buy, and hides a locked row", () => {
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
        `[data-tier="${tier}"] ${selector}`,
      );
    expect(line("cart", ".tier-name")?.textContent).toBe("Mine cart");
    expect(line("drill", ".tier-name")?.textContent).toBe("Steam drill");
    expect(line("drill", ".tier-gain")?.hidden).toBe(false);
    expect(line("drill", ".tier-needs")?.hidden).toBe(false);
    expect(line("drill", ".tier-why")?.hidden).toBe(false);
    expect(line("drill", ".tier-why")?.textContent).toBe(
      "Bites the wall while you rest.",
    );
    expect(line("machine", ".tier-name")?.textContent).toBe("Great Machine");
    expect(line("machine", ".tier-cost")?.textContent).toBe("Locked");
    expect(line("machine", ".tier-gain")?.hidden).toBe(true);
    // A locked card says where it opens, in words (#250).
    expect(line("machine", ".tier-why")?.hidden).toBe(false);
    expect(line("machine", ".tier-why")?.textContent).toBe(
      `The Great Machine joins your crew at ${formatCompact(shownStones(createMountain(), 120_000_000))} stones. Keep digging, Dad!`,
    );
    expect(line("machine", ".tier-rate")?.textContent).toBe(
      `Machine · ${formatCompact(shownStones(createMountain(), 120_000_000))}`,
    );
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    const arms = screen.root.querySelector('[data-upgrade="tap"]');
    expect(arms?.classList.contains("is-dear")).toBe(true);
    expect(arms?.querySelector<HTMLElement>(".upgrade-effect")?.hidden).toBe(
      false,
    );
    expect(arms?.querySelector<HTMLElement>(".upgrade-why")?.hidden).toBe(
      false,
    );
    expect(arms?.querySelector(".upgrade-effect")?.textContent).not.toBe("");
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
      chargeUntil: Date.now() + 60_000,
      bench: {
        recipe: "iron-rails",
        startedAt: Date.now() - 1_000,
        endsAt: Date.now() + 120_000,
      },
    }));
    expect(screen.text(".pocket")).toContain("T stones");
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
    const screen = mountScreen({ storage });
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
    const cartWhy = screen.root.querySelector('[data-tier="cart"] .tier-why');
    if (cartWhy === null) {
      throw new Error("cart why did not render");
    }
    tap(cartWhy);
    expect(carts()).toBe(before + 1);
    const drag = screen.root.querySelector('[data-tier="helper"] .tier-name');
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
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    const why = screen.root.querySelector('[data-upgrade="tap"] .upgrade-why');
    if (why === null) {
      throw new Error("upgrade why did not render");
    }
    tap(why);
    expect(screen.progress.getSnapshot().mountain.upgrades?.tap).toBe(1);
    screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();
    screen.root.querySelector<HTMLButtonElement>(".thumb-workshop")?.click();
    const craftName = screen.root.querySelector(".workshop-card h3");
    if (craftName === null) {
      throw new Error("craft name did not render");
    }
    tap(craftName);
    expect(screen.progress.getSnapshot().mountain.bench).toBeDefined();
    screen.progress.dispose();
  });

  it("leaves a locked workshop closed when the thumb bar is tapped", () => {
    const screen = mountScreen();
    screen.root.querySelector<HTMLButtonElement>(".thumb-workshop")?.click();
    expect(
      screen.root.querySelector(".workshop-dialog")?.hasAttribute("hidden"),
    ).toBe(true);
    screen.progress.dispose();
  });

  it("enables a thumb button only when its sheet will open", () => {
    const fresh = mountScreen();
    const thumb = (
      root: HTMLElement,
      selector: string,
    ): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(selector);
    expect(thumb(fresh.root, ".buys-button")?.disabled).toBe(false);
    expect(thumb(fresh.root, ".upgrades-button")?.disabled).toBe(false);
    expect(thumb(fresh.root, ".thumb-workshop")?.disabled).toBe(true);
    expect(thumb(fresh.root, ".engineers-button")?.disabled).toBe(true);
    thumb(fresh.root, ".upgrades-button")?.click();
    expect(
      fresh.root.querySelector(".upgrades-dialog")?.hasAttribute("hidden"),
    ).toBe(false);
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
    expect(thumb(later.root, ".buys-button")?.disabled).toBe(false);
    expect(thumb(later.root, ".upgrades-button")?.disabled).toBe(false);
    expect(thumb(later.root, ".thumb-workshop")?.disabled).toBe(false);
    expect(thumb(later.root, ".engineers-button")?.disabled).toBe(false);
    thumb(later.root, ".thumb-workshop")?.click();
    expect(
      later.root.querySelector(".workshop-dialog")?.hasAttribute("hidden"),
    ).toBe(false);
    thumb(later.root, ".engineers-button")?.click();
    expect(
      later.root.querySelector(".engineers-dialog")?.hasAttribute("hidden"),
    ).toBe(false);
    later.progress.dispose();
  });
});
