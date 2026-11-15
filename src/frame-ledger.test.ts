// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { DRAWER_SETTLE_MS } from "./board-drawer";
import { holdFactors } from "./economy/factors";
import { tierBuyMove } from "./economy/actions";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { createMemoryStorage } from "./test-fixtures";
import { createProgressStore } from "./progress-store";
import { writeSessionSave } from "./session-save";
import { SOUND_KEY } from "./sound";

/** The order strip's key on slice 1's frame (#708): the Ledger and what it opens. */

/** A finger's tap: down, up, then its click. */
function fingerTap(target: HTMLElement): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
}

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [FRESH_OFF]: 0 });
  document.body.replaceChildren();
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
});

/** A fresh mine some evenings in: stone, machines, workers and a wagon. */
function grown(): Mountain {
  const fresh = createMountain();
  return {
    ...fresh,
    stock: { ...fresh.stock, stones: 1_200_000 },
    owned: { ...fresh.owned, helper: 28, cart: 6, drill: 4, hoist: 3 },
    jobs: { ...fresh.jobs, drilling: 8, haulage: 9, hoisting: 8, driving: 1 },
  };
}

function mount(mountain: Mountain = grown()) {
  const storage = createMemoryStorage();
  writeSessionSave({ storage, mountain, lastSeen: Date.now() });
  const root = document.createElement("div");
  document.body.append(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
  });
  const device = createMemoryStorage();
  mountFrameScreen({
    root,
    auth,
    progress,
    storage: device,
    signal: unmount.signal,
  });
  const find = (selector: string): HTMLElement => {
    const found = root.querySelector(selector);
    if (!(found instanceof HTMLElement)) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  const key = find(".frame-key") as HTMLButtonElement;
  const ledger = find('.board-sheet[data-sheet="ledger"]');
  const isOpen = (): boolean => ledger.classList.contains("is-open");
  const row = (name: string, part: string): string =>
    find(`.ledger-${name} .board-row-${part}`).textContent;
  const shownPage = (): HTMLElement | null =>
    ledger.querySelector<HTMLElement>(
      ".board-sheet-page:not([hidden]) > .ledger-page",
    );
  return { root, progress, device, find, key, ledger, isOpen, row, shownPage };
}

describe("the order strip's key", () => {
  it("sits at the strip's end, beside the order, and opens the Ledger", () => {
    const { find, key, isOpen } = mount();
    const strip = find(".frame-strip");
    expect([...strip.children]).toEqual([find(".frame-order"), key]);
    expect(key.getAttribute("aria-label")).toBe("Ledger");
    expect(key.getAttribute("aria-haspopup")).toBe("dialog");
    expect(key.getAttribute("aria-expanded")).toBe("false");
    expect(isOpen()).toBe(false);
    key.click();
    expect(isOpen()).toBe(true);
    expect(key.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays open under the second tap of a double tap, which lands on the scrim", () => {
    let clock = 10_000;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { find, key, isOpen } = mount();
    fingerTap(key);
    expect(isOpen()).toBe(true);
    clock += 120;
    fingerTap(find(".board-scrim"));
    expect(isOpen()).toBe(true);
    clock += DRAWER_SETTLE_MS;
    fingerTap(find(".board-scrim"));
    expect(isOpen()).toBe(false);
    now.mockRestore();
  });

  it("leaves the order's tap going to the city", () => {
    const { find, isOpen } = mount();
    find(".frame-order").click();
    expect(find(".frame-scene").dataset["site"]).toBe("city");
    expect(isOpen()).toBe(false);
  });

  it("closes the workforce and a stage's list as it opens the Ledger", () => {
    const { find, key } = mount();
    find(".frame-workers").click();
    expect(find(".frame-sheet").hidden).toBe(false);
    key.click();
    expect(find(".frame-sheet").hidden).toBe(true);
    find(".mine-stage-info").click();
    expect(find(".stage-sheet").hidden).toBe(false);
    key.click();
    expect(find(".stage-sheet").hidden).toBe(true);
  });
});

/** The words a player sees: every shown leaf's text. */
function shown(root: HTMLElement): string {
  return [...root.querySelectorAll<HTMLElement>("*")]
    .filter((node) => node.children.length === 0)
    .filter((node) => node.closest("[hidden]") === null)
    .map((node) => node.textContent)
    .join(" | ");
}

describe("the Ledger in a fresh mine", () => {
  it("reads the stockpile and the crew, and no depth, relic or pass", () => {
    const { key, row, find, ledger } = mount();
    key.click();
    expect(row("stones", "name")).toBe("1.2M stone in the stockpile");
    expect(row("stones", "info")).toBe("The Light Tower · Foundation");
    expect(row("crew", "name")).toBe("28 workers · 1 horse wagon");
    expect(row("crew", "info")).toBe("4 drills · 6 carts · 3 hoists");
    expect(find(".ledger-relics").hidden).toBe(true);
    expect(find(".ledger-pass").hidden).toBe(true);
    expect(find(".board-sheet-info").hidden).toBe(true);
    expect(find(".ledger-stones").getAttribute("title")).toBeNull();
    expect(find(".board-sheet-back").textContent).toBe("Close");
    expect(shown(ledger)).not.toMatch(
      /Infinity|NaN|\bleft\b|\bdeep\b|relic|pocket|mountain|\bface\b|hands/i,
    );
  });

  it("tells tonight's hires", () => {
    const { key, progress, find } = mount();
    progress.dispatch(tierBuyMove("helper", 1));
    key.click();
    expect(find(".ledger-log").textContent).toMatch(/Hired worker 29\./);
  });

  it("turns the sound on from its head, for this device", () => {
    const { key, find, device } = mount();
    key.click();
    const sound = find(".board-sheet-key");
    expect(sound.getAttribute("aria-pressed")).toBe("false");
    sound.click();
    expect(sound.getAttribute("aria-pressed")).toBe("true");
    expect(device.getItem(SOUND_KEY)).not.toBeNull();
  });

  it("opens Saved copies, which goes back to the mine", () => {
    const { key, find, isOpen } = mount();
    key.click();
    find(".ledger-saved-copies").click();
    expect(isOpen()).toBe(false);
    const copies = find(".saved-copies");
    expect(copies.hidden).toBe(false);
    expect(find(".saved-copies-close").textContent).toBe("Close");
    find(".saved-copies-close").click();
    expect(copies.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
  });

  it("asks before it starts over, in a fresh mine's words, then starts a fresh mine", async () => {
    const { key, find, shownPage, progress, isOpen } = mount();
    key.click();
    find(".ledger-start-over").click();
    const page = shownPage();
    expect(page?.querySelector(".ledger-page-title")?.textContent).toBe(
      "Start over?",
    );
    expect(page?.textContent).toMatch(/stone in the stockpile/);
    expect(page?.textContent).not.toMatch(/relic|mountain/i);
    expect(find(".ledger-keep").textContent).toBe("Keep my mine");
    find(".ledger-yes").click();
    await vi.waitFor(() => {
      expect(isOpen()).toBe(false);
    });
    const started = progress.getSnapshot().mountain;
    expect(started.stock.stones).toBe(createMountain().stock.stones);
    expect(started.owned.helper).toBe(createMountain().owned.helper);
    expect(document.activeElement).toBe(key);
  });

  it("closes under a save card", () => {
    const { key, progress, find, isOpen } = mount();
    key.click();
    progress.layoutPreview.conflict();
    expect(find(".save-conflict").hidden).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it("lays the Ledger and Saved copies under the save's cards", () => {
    const { root, find } = mount();
    const children = [...root.children];
    const at = (selector: string): number =>
      children.findIndex((child) => child.matches(selector));
    expect(at(".board-sheet-clip")).toBeGreaterThan(at(".frame"));
    expect(at(".saved-copies")).toBeGreaterThan(at(".board-sheet-clip"));
    expect(at(".update-prompt")).toBeGreaterThan(at(".saved-copies"));
    expect(find(".board-sheet-clip").contains(find(".board-scrim"))).toBe(true);
  });
});
