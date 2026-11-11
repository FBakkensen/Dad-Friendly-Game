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

/**
 * The base name (no extension, no line number) of the first stack frame outside this file and
 * node_modules: the module that made the call.
 */
function caller(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  for (const frame of frames) {
    const match = /([^/\\()]+)\.tsx?(?::\d+){0,2}\)?\s*$/.exec(frame.trim());
    if (
      match !== null &&
      !frame.includes("node_modules") &&
      !frame.includes("mountain-screen-order.test")
    ) {
      return match[1] ?? "unknown";
    }
  }
  return "unknown";
}

const record = (entry: string): void => {
  log.push(`${entry}@${caller()}`);
};

vi.mock("./board-host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./board-host")>();
  return {
    ...actual,
    createBoardHost: (...args: Parameters<typeof actual.createBoardHost>) => {
      const host = actual.createBoardHost(...args);
      return {
        ...host,
        subscribe: (paint: () => void) => {
          record("host");
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
          record("store");
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
      record(`doc:${type}:${String(isCapture(options))}`);
      addToDocument(type, listener as EventListener, options as never);
    },
  );
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type: string, listener: unknown, options?: unknown) => {
      record(`win:${type}:${String(isCapture(options))}`);
      addToWindow(type, listener as EventListener, options as never);
    },
  );
  const inner = createUnconfiguredAuth();
  const auth: AuthController = {
    ...inner,
    subscribe: (listener) => {
      record("auth");
      return inner.subscribe(listener);
    },
  };
  // A seeded sequence, so the run is the same every time.
  const sequence = [0.31, 0.77, 0.12, 0.58, 0.93, 0.44];
  let next = 0;
  const random = (): number => {
    record("random");
    const value = sequence[next % sequence.length] ?? 0.5;
    next += 1;
    return value;
  };
  const screen = mountScreen({ auth, random });
  const seen = [...log];
  vi.restoreAllMocks();
  return { screen, seen };
}

afterEach(stopScreens);

describe("the screen's build order", () => {
  it("the screen registers its listeners in today's order", () => {
    const { seen } = mountLogged();
    // Entries, in order: the store's own auth watch, the vein's first draw, Buys rows and drawer
    // (with its Escape capture), the Ready plate, the board note, the save line, the Workshop
    // rows and drawer (Escape capture, #374), the menu, Upgrades rows and drawer (Escape
    // capture), saveOnLeave, the bays, the vein's hide and pagehide, the New
    // sign's pointerdown and Escape, then the store subscription.
    // When a task moves a registration into a screen-* file, it changes only the name after "@";
    // the position must not change.
    expect(seen).toEqual([
      "auth@progress-store",
      "random@veins",
      "host@board-row",
      "host@board-drawer",
      "doc:keydown:true@board-drawer",
      "host@board-ready",
      "doc:pointerdown:false@board-note",
      "doc:keydown:false@board-note",
      "doc:keydown:false@board-save",
      "doc:pointerdown:false@board-save",
      "auth@board-save",
      // The relics drawer (#465): its shelf rows, then its shell.
      "host@board-row",
      "host@board-drawer",
      "doc:keydown:true@board-drawer",
      "host@board-row",
      "host@board-drawer",
      "doc:keydown:true@board-drawer",
      // The Ledger drawer (#375): its rows, its Copied hold, its shell, then the account.
      "host@board-row",
      "host@ledger-parts",
      "host@board-drawer",
      "doc:keydown:true@board-drawer",
      "auth@ledger-panel",
      "host@board-row",
      "host@board-drawer",
      "doc:keydown:true@board-drawer",
      "doc:visibilitychange:false@mountain-screen",
      "win:pagehide:false@mountain-screen",
      "host@board-bays",
      "host@board-drawer",
      "doc:visibilitychange:false@screen-vein",
      "win:pagehide:false@screen-vein",
      "doc:pointerdown:false@screen-overlays",
      "doc:keydown:false@screen-overlays",
      "store@screen-run",
    ]);
  });

  it("the effect row holds boosts, the Gold rush, crafts, bench, then the engineers' trips", () => {
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
      [null, null, "effect-chip rush-chip"],
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
      "engineers-dialog",
      "board-card welcome-back",
      "board-card layer-arrival",
      "board-card craft-notice",
      "start-over legacy-dialog",
      "board-card update-prompt",
      "board-card other-tab",
      "saved-copies",
      "board-card save-conflict",
    ]);
  });
});
