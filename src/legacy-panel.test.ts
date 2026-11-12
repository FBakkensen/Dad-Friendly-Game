// @vitest-environment happy-dom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { DRAWER_SETTLE_MS } from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { createLegacyPanel } from "./legacy-panel";
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { minedMountain } from "./test-fixtures";

let time = 0;
let board: BoardHost;

const advance = (ms: number): void => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

/** A finger's tap: down, up, then its click. */
const press = (target: Element | null | undefined): void => {
  if (!(target instanceof HTMLElement)) {
    throw new Error("nothing to press");
  }
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

interface Fixture {
  view: { ready: boolean; mountain: Mountain };
  passTheMine: Mock<() => Promise<boolean>>;
  onPassed: Mock<() => void>;
  beforeOpen: Mock<() => void>;
  panel: ReturnType<typeof createLegacyPanel>;
}

function mount(mountain: Mountain): Fixture {
  const fixture = {
    view: { ready: true, mountain },
    passTheMine: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
    onPassed: vi.fn<() => void>(),
    beforeOpen: vi.fn<() => void>(),
  } as unknown as Fixture;
  fixture.panel = createLegacyPanel({
    progress: {
      passTheMine: fixture.passTheMine,
    } as unknown as ProgressStore,
    getView: () => fixture.view as unknown as ProgressSnapshot,
    board,
    onPassed: fixture.onPassed,
    beforeOpen: fixture.beforeOpen,
    requestRender: () => {
      fixture.panel.render();
    },
  });
  document.body.append(fixture.panel.dialog, fixture.panel.badge);
  return fixture;
}

const finished = (): Mountain => minedMountain(MOUNTAIN_STONES);

const plate = (fixture: Fixture, hook: string): HTMLButtonElement | null =>
  fixture.panel.dialog.querySelector<HTMLButtonElement>(`.${hook}`);

const opener = (): HTMLButtonElement => {
  const key = document.createElement("button");
  key.type = "button";
  document.body.append(key);
  return key;
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the Pass the mine card (#466)", () => {
  it("is a board card: an alert dialog described by what passing does, with two plates", () => {
    const fixture = mount(finished());
    const { dialog } = fixture.panel;
    expect(dialog.classList.contains("board-card")).toBe(true);
    expect(dialog.classList.contains("legacy-dialog")).toBe(true);
    expect(dialog.dataset["card"]).toBe("legacy");
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("legacy-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("legacy-detail");
    expect(dialog.querySelector("#legacy-title")?.textContent).toBe(
      "Pass the mine to your kid.",
    );
    expect(
      [...dialog.querySelectorAll(".board-card-plate")].map(
        (each) => each.textContent,
      ),
    ).toEqual(["Not yet", "Pass it on"]);
    fixture.panel.render();
    expect(dialog.querySelector(".legacy-lead")?.textContent).toBe(
      "Legacy ×1.5, for good",
    );
    expect(
      dialog.querySelectorAll(".legacy-rates > li").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("opens only once offered, puts the Ledger away first, and focuses Not yet", () => {
    const fixture = mount(minedMountain(0));
    fixture.panel.open(opener());
    expect(fixture.beforeOpen).toHaveBeenCalledTimes(1);
    expect(fixture.panel.offered()).toBe(false);
    expect(fixture.panel.dialog.hidden).toBe(true);
    fixture.view.mountain = finished();
    fixture.panel.render();
    expect(fixture.panel.offered()).toBe(true);
    expect(fixture.panel.dialog.hidden).toBe(false);
    expect(document.activeElement).toBe(plate(fixture, "legacy-cancel"));
    expect(board.view().stack).toContain("legacy");
  });

  it("is not offered before the save is in", () => {
    const fixture = mount(finished());
    fixture.view.ready = false;
    expect(fixture.panel.offered()).toBe(false);
  });

  it("Not yet and Escape close it and give focus back to what opened it", () => {
    const fixture = mount(finished());
    const key = opener();
    fixture.panel.open(key);
    advance(DRAWER_SETTLE_MS + 50);
    press(plate(fixture, "legacy-cancel"));
    expect(fixture.panel.dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
    expect(board.view().stack).not.toContain("legacy");

    fixture.panel.open(key);
    plate(fixture, "legacy-cancel")?.focus();
    fixture.panel.dialog
      .querySelector(".legacy-cancel")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(fixture.panel.dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
    expect(fixture.passTheMine).not.toHaveBeenCalled();
  });

  it("Pass it on passes past the settle only: the second tap of the one that opened it does nothing", async () => {
    const fixture = mount(finished());
    fixture.panel.open(undefined);
    advance(100);
    press(plate(fixture, "legacy-confirm"));
    expect(fixture.passTheMine).not.toHaveBeenCalled();
    expect(fixture.panel.dialog.hidden).toBe(false);
    advance(DRAWER_SETTLE_MS);
    press(plate(fixture, "legacy-confirm"));
    expect(fixture.passTheMine).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(fixture.onPassed).toHaveBeenCalledTimes(1);
    });
    expect(fixture.panel.dialog.hidden).toBe(true);
  });

  it("a pass the store refuses starts no new run", async () => {
    const fixture = mount(finished());
    fixture.passTheMine.mockResolvedValue(false);
    fixture.panel.open(undefined);
    advance(DRAWER_SETTLE_MS + 50);
    press(plate(fixture, "legacy-confirm"));
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.passTheMine).toHaveBeenCalledTimes(1);
    expect(fixture.onPassed).not.toHaveBeenCalled();
    expect(fixture.panel.dialog.hidden).toBe(true);
  });

  it("the Legacy badge shows from the first pass, with what it does", () => {
    const fixture = mount(minedMountain(0));
    fixture.panel.render();
    expect(fixture.panel.badge.hidden).toBe(true);
    fixture.view.mountain = { ...minedMountain(0), legacy: 1 };
    fixture.panel.render();
    expect(fixture.panel.badge.hidden).toBe(false);
    expect(fixture.panel.badge.textContent).toBe("Legacy ×1.5");
    expect(fixture.panel.badge.getAttribute("aria-label")).toBe(
      "Legacy 1: your crew and taps are ×1.5",
    );
  });
});
