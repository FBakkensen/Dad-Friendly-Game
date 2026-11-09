// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUYS_SETTLE_MS } from "./mountain-screen";
import { type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
} from "./mountain-screen.harness";
import { writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The Upgrades drawer's buys on the mounted screen, beside the crew suite (which is at its
 * worker's heap limit).
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

describe("an Upgrades buy on screen", () => {
  const CLOCK = 1_700_000_000_000;
  const seededWith = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen: CLOCK });
    return storage;
  };
  const drawerOf = (screen: ReturnType<typeof mountScreen>): HTMLElement => {
    const found = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="upgrades"]',
    );
    if (found === null) throw new Error("no Upgrades drawer");
    return found;
  };
  const fingerTap = (target: HTMLElement): void => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  };

  it("a row he has seen but the crew has not opened yet buys nothing and holds no Done", () => {
    // Strong arms opens at three carts. Seen before, it shows and its price is in the pocket,
    // but with two carts the game turns the buy down.
    const mountain: Mountain = {
      ...minedMountain(30_000),
      helpers: 20,
      carts: 2,
      staffed: 2,
      pocket: 10_000_000,
      seen: ["upgrade:tap"],
    };
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(mountain),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    document.body.append(screen.root);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    clock += BUYS_SETTLE_MS + 100;
    const row = drawerOf(screen).querySelector<HTMLButtonElement>(
      'button.board-row[data-upgrade="tap"]',
    );
    if (row === null) throw new Error("no Strong arms row");
    expect(row.hidden).toBe(false);
    expect(row.classList.contains("is-ready")).toBe(true);
    const before = screen.progress.getSnapshot().mountain;

    fingerTap(row);

    const after = screen.progress.getSnapshot().mountain;
    expect(after.pocket).toBe(before.pocket);
    expect(after.upgrades).toEqual(before.upgrades);
    expect(row.classList.contains("is-held")).toBe(false);
    expect(row.querySelector<HTMLElement>(".board-row-verb")?.textContent).toBe(
      "Buy",
    );
  });
});
