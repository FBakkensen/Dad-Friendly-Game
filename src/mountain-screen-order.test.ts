// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth, type AuthController } from "./auth";
import { mountScreen, stopScreens } from "./mountain-screen.harness";

/**
 * Characterization of the screen's build order (#431). One interleaved log of every listener the
 * mount registers, and the order the effect row and the root are built in. The literals were
 * printed from the code before the split into screen-* modules; they pin it.
 */
const log: string[] = [];

vi.mock("./board-host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./board-host")>();
  return {
    ...actual,
    createBoardHost: (...args: Parameters<typeof actual.createBoardHost>) => {
      const host = actual.createBoardHost(...args);
      return {
        ...host,
        subscribe: (paint: () => void) => {
          log.push("host");
          return host.subscribe(paint);
        },
      };
    },
  };
});

vi.mock("./progress-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./progress-store")>();
  return {
    ...actual,
    createProgressStore: (
      ...args: Parameters<typeof actual.createProgressStore>
    ) => {
      const store = actual.createProgressStore(...args);
      return {
        ...store,
        subscribe: (listener: Parameters<typeof store.subscribe>[0]) => {
          log.push("store");
          return store.subscribe(listener);
        },
      };
    },
  };
});

const isCapture = (options: unknown): boolean =>
  options === true ||
  (typeof options === "object" &&
    options !== null &&
    "capture" in options &&
    options.capture === true);

function mountLogged() {
  log.length = 0;
  const addToDocument = document.addEventListener.bind(document);
  const addToWindow = window.addEventListener.bind(window);
  vi.spyOn(document, "addEventListener").mockImplementation(
    (type: string, listener: unknown, options?: unknown) => {
      log.push(`doc:${type}:${String(isCapture(options))}`);
      addToDocument(type, listener as EventListener, options as never);
    },
  );
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type: string, listener: unknown, options?: unknown) => {
      log.push(`win:${type}:${String(isCapture(options))}`);
      addToWindow(type, listener as EventListener, options as never);
    },
  );
  const inner = createUnconfiguredAuth();
  const auth: AuthController = {
    ...inner,
    subscribe: (listener) => {
      log.push("auth");
      return inner.subscribe(listener);
    },
  };
  // A seeded sequence, so the run is the same every time.
  const sequence = [0.31, 0.77, 0.12, 0.58, 0.93, 0.44];
  let next = 0;
  const random = (): number => {
    log.push("random");
    const value = sequence[next % sequence.length] ?? 0.5;
    next += 1;
    return value;
  };
  const screen = mountScreen({ auth, random });
  const seen = [...log];
  vi.restoreAllMocks();
  return { screen, seen };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await stopScreens();
});

describe("the screen's build order", () => {
  it("the screen registers its listeners in today's order", () => {
    const { seen } = mountLogged();
    expect(seen).toEqual([
      "auth",
      "random",
      "host",
      "host",
      "doc:keydown:true",
      "host",
      "doc:pointerdown:false",
      "doc:keydown:false",
      "doc:keydown:false",
      "doc:pointerdown:false",
      "auth",
      "auth",
      "host",
      "host",
      "doc:keydown:true",
      "doc:visibilitychange:false",
      "win:pagehide:false",
      "host",
      "host",
      "doc:visibilitychange:false",
      "win:pagehide:false",
      "doc:pointerdown:false",
      "doc:keydown:false",
      "store",
    ]);
  });

  it("the effect row holds boosts, crafts, bench, then the engineers' trips", () => {
    const { screen } = mountLogged();
    const row = screen.root.querySelector(".effect-row");
    const chips = [...(row?.children ?? [])].map((chip) => [
      chip.getAttribute("data-boost"),
      chip.getAttribute("data-craft"),
      chip.className,
    ]);
    expect(chips).toEqual([
      ["sharper", null, "effect-chip boost-chip"],
      ["overtime", null, "effect-chip boost-chip"],
      [null, "blasting-charge", "effect-chip craft-chip"],
      [null, "axle-grease", "effect-chip craft-chip"],
      [null, "crystal-flare", "effect-chip craft-chip"],
      [null, "heartstone-ember", "effect-chip craft-chip"],
      [null, "bench", "effect-chip craft-chip"],
      [null, null, "effect-chip expedition-chip"],
      [null, null, "effect-chip expedition-chip"],
      [null, null, "effect-chip expedition-chip"],
      [null, null, "effect-chip expedition-chip"],
      [null, null, "effect-chip expedition-chip"],
    ]);
  });

  it("the root's children stand in today's order", () => {
    const { screen } = mountLogged();
    expect([...screen.root.children].map((child) => child.className)).toEqual([
      "board-top",
      "board-gauge-row",
      "board-bays board-skinned",
      "board-ready-row",
      "board-rail",
      "board-sign-slot",
      "board-sheet-clip",
      "board-drawer-clip",
      "board-saveline",
      "board-note board-skinned",
      "board-running-park",
      "welcome-back",
      "layer-arrival",
      "craft-notice",
      "relic-reveal",
      "relic-reveal legend",
      "shelf-dialog",
      "relic-reveal relic-detail",
      "start-over",
      "start-over legacy-dialog",
      "game-menu",
      "field-log-sheet",
      "engineers-dialog",
      "workshop-dialog",
      "update-prompt",
      "other-tab",
      "saved-copies",
      "save-conflict",
    ]);
  });
});
