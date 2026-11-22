// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { createMemoryStorage } from "./test-fixtures";
import { createProgressStore } from "./progress-store";
import {
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  SAVE_CONFLICT_TITLE,
} from "./screen-words";
import { showAppUpdate } from "./screen-prompts";
import { SESSION_SAVE_KEY } from "./session-save";
import { createMemoryBus, createTabWriter, type TabWriter } from "./tab-writer";

/** The cards that keep the save safe, on slice 1's frame (#707). */

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({});
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
});

function mount({
  storage = createMemoryStorage(),
  tabWriter,
}: { storage?: Storage; tabWriter?: TabWriter } = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    ...(tabWriter === undefined ? {} : { tabWriter }),
  });
  mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    signal: unmount.signal,
  });
  const card = (selector: string): HTMLElement => {
    const found = root.querySelector(selector);
    if (!(found instanceof HTMLElement)) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  const text = (selector: string): string =>
    root.querySelector(selector)?.textContent ?? "";
  return { root, progress, card, text };
}

describe("the save's cards on the frame", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("are laid over the frame after the shift report, in the board's order, hidden at first", () => {
    const { root, card } = mount();
    const children = [...root.children];
    const at = [
      ".frame-card",
      ".update-prompt",
      ".other-tab",
      ".save-conflict",
    ].map((hook) => children.indexOf(card(hook)));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    for (const hook of [".save-conflict", ".other-tab", ".update-prompt"]) {
      expect(card(hook).matches(".board-card")).toBe(true);
      expect(card(hook).hidden).toBe(true);
    }
  });

  it("close the frame's sheets as they come up", () => {
    const { card, root, progress } = mount();
    root.querySelector<HTMLElement>(".frame-workers")?.click();
    expect(card(".frame-sheet").hidden).toBe(false);
    progress.layoutPreview.conflict();
    expect(card(".save-conflict").hidden).toBe(false);
    expect(card(".frame-sheet").hidden).toBe(true);
    root.querySelector<HTMLElement>(".frame-workers")?.click();
    showAppUpdate(root);
    expect(card(".frame-sheet").hidden).toBe(true);
  });

  it("asks for the update when the save came from a later build, and writes nothing", () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ version: 12, lastSeen: 1 });
    storage.setItem(SESSION_SAVE_KEY, raw);
    const { card, text, root } = mount({ storage });
    expect(card(".update-prompt").hidden).toBe(false);
    expect(text("#update-prompt-title")).toBe("Update available");
    // A hide saves at once on a playable save; a later build's save stays as it was.
    root.querySelector<HTMLButtonElement>(".frame-hire")?.click();
    window.dispatchEvent(new Event("pagehide"));
    expect(storage.getItem(SESSION_SAVE_KEY)).toBe(raw);
  });

  it("shows the update card when a new build waits, and Reload reloads", () => {
    const { card, root } = mount();
    const reload = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => undefined);
    showAppUpdate(root);
    expect(card(".update-prompt").hidden).toBe(false);
    card(".update-reload").click();
    expect(reload).toHaveBeenCalled();
    reload.mockRestore();
  });

  it("shows two saves with a fresh mine's lines, and asks before it switches", () => {
    const { card, text, progress } = mount();
    progress.layoutPreview.conflict();
    expect(card(".save-conflict").hidden).toBe(false);
    expect(text("#save-conflict-title")).toBe(SAVE_CONFLICT_TITLE);
    const words = card(".save-conflict").textContent;
    expect(words).toMatch(/stone in the stockpile/);
    expect(words).not.toMatch(/\bdeep\b|pocket|engineer|Infinity|NaN/);
    card(".save-conflict-play").click();
    expect(card(".save-conflict-confirm").hidden).toBe(false);
    expect(card(".save-conflict-play").hidden).toBe(true);
  });

  it("shows the other tab's card, and Play here plays here", async () => {
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const writer = (tabId: string) =>
      createTabWriter({
        tabId,
        storage,
        bus,
        handoffMs: 0,
        yieldWaitMs: 30,
      });
    const first = mount({ storage, tabWriter: writer("tab-first1") });
    const second = mount({ storage, tabWriter: writer("tab-second") });
    expect(first.card(".other-tab").hidden).toBe(true);
    expect(second.card(".other-tab").hidden).toBe(false);
    expect(second.text("#other-tab-title")).toBe(OTHER_TAB_TITLE);
    expect(second.text(".other-tab-play")).toBe(OTHER_TAB_PLAY);
    second.card(".other-tab-play").click();
    await vi.waitFor(() => {
      expect(second.card(".other-tab").hidden).toBe(true);
    });
    expect(first.card(".other-tab").hidden).toBe(false);
    first.progress.dispose();
    second.progress.dispose();
  });
});
