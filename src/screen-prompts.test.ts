// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardHost, type BoardHost } from "./board-host";
import type { ProgressStore } from "./progress-store";
import { createSaveConflictPanel } from "./save-conflict-panel";
import {
  createOtherTab,
  createUpdatePrompt,
  showAppUpdate,
} from "./screen-prompts";
import { minedMountain } from "./test-fixtures";

let time = 0;
let board: BoardHost;

beforeEach(() => {
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** A finger's tap: pointerdown, then a click that counts its taps (detail 1). */
const fingerTap = (target: HTMLElement | null): void => {
  target?.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

describe("the update card (#464)", () => {
  it("opens on top from showAppUpdate, focuses Reload and reloads past the settle", () => {
    const onShown = vi.fn();
    const root = createUpdatePrompt(board, onShown);
    document.body.append(root);
    expect(root.matches(".board-card.update-prompt[data-card=update]")).toBe(
      true,
    );
    expect(root.hidden).toBe(true);
    showAppUpdate(document.body);
    expect(root.hidden).toBe(false);
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(board.view().stack).toEqual(["update"]);
    const reload = root.querySelector<HTMLElement>(".update-reload");
    expect(document.activeElement).toBe(reload);
    expect(root.querySelector("#update-prompt-title")?.textContent).toBe(
      "Update available",
    );
    expect(reload?.textContent).toBe("Reload");
    const reloaded = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => undefined);
    time += 100;
    fingerTap(reload);
    expect(reloaded).not.toHaveBeenCalled();
    time += 350;
    fingerTap(reload);
    expect(reloaded).toHaveBeenCalledTimes(1);
  });

  it("conflict and update up together: the conflict resolves, the update stays", () => {
    const update = createUpdatePrompt(board, () => undefined);
    const conflict = createSaveConflictPanel({
      progress: {} as ProgressStore,
      now: () => 0,
      board,
      requestRender: () => undefined,
    });
    document.body.append(update, conflict.root);
    const sideOf = (mined: number) => ({
      mountain: minedMountain(mined),
      lastSeen: 0,
      rev: 1,
      deviceId: "d",
      deviceLabel: "d",
    });
    conflict.render({ local: sideOf(1), remote: sideOf(2) }, false);
    time += 200;
    showAppUpdate(document.body);
    expect(board.view().stack).toEqual(["conflict", "update"]);
    conflict.render(undefined, false);
    expect(board.view().stack).toEqual(["update"]);
    expect(update.hidden).toBe(false);
    // The update still settles from its own open, 200ms after the conflict's.
    const reloaded = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => undefined);
    time += 300;
    fingerTap(update.querySelector(".update-reload"));
    expect(reloaded).not.toHaveBeenCalled();
    time += 200;
    fingerTap(update.querySelector(".update-reload"));
    expect(reloaded).toHaveBeenCalledTimes(1);
  });

  it("an update on a page with no card does nothing", () => {
    expect(() => {
      showAppUpdate(document.createElement("div"));
    }).not.toThrow();
  });
});

describe("the other-tab card (#464)", () => {
  it("plays here past the settle, and focuses Play here once", () => {
    const playHere = vi.fn(() => Promise.resolve());
    const tab = createOtherTab({ playHere } as unknown as ProgressStore, board);
    document.body.append(tab.root);
    expect(tab.root.matches(".board-card.other-tab[data-card=other-tab]")).toBe(
      true,
    );
    tab.paint(true);
    const play = tab.root.querySelector<HTMLElement>(".other-tab-play");
    expect(document.activeElement).toBe(play);
    expect(tab.root.querySelector(".other-tab-body")?.textContent).toContain(
      "Nothing here is lost",
    );
    play?.blur();
    tab.paint(true);
    expect(document.activeElement).not.toBe(play);
    time += 100;
    fingerTap(play);
    expect(playHere).not.toHaveBeenCalled();
    time += 350;
    fingerTap(play);
    expect(playHere).toHaveBeenCalledTimes(1);
    tab.paint(false);
    expect(tab.root.hidden).toBe(true);
    expect(board.view().stack).toEqual([]);
  });
});
