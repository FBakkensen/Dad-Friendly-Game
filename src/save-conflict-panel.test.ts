// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardHost, type BoardHost } from "./board-host";
import type {
  ProgressStore,
  SaveConflictView,
  SaveSide,
} from "./progress-store";
import { createSaveConflictPanel } from "./save-conflict-panel";
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
  document.body.replaceChildren();
});

const side = (mined: number, rev: number, label: string): SaveSide => ({
  mountain: minedMountain(mined),
  lastSeen: 0,
  rev,
  deviceId: label,
  deviceLabel: label,
});

const SPLIT: SaveConflictView = {
  local: side(2_000_000, 3, "Chrome on Android"),
  remote: side(9_000_000, 4, "Chrome on Windows"),
};

const mount = () => {
  const chooseSave = vi.fn(() => Promise.resolve("saved" as const));
  let conflict: SaveConflictView | undefined = SPLIT;
  let elsewhere = false;
  const panel = createSaveConflictPanel({
    progress: { chooseSave } as unknown as ProgressStore,
    now: () => 60_000,
    board,
    requestRender: () => {
      panel.render(conflict, elsewhere);
    },
  });
  document.body.append(panel.root);
  panel.render(conflict, elsewhere);
  const find = (selector: string): HTMLElement => {
    const found = panel.root.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new Error(`no ${selector}`);
    }
    return found;
  };
  return {
    panel,
    chooseSave,
    find,
    set: (next: SaveConflictView | undefined, away = false): void => {
      conflict = next;
      elsewhere = away;
      panel.render(conflict, elsewhere);
    },
  };
};

/** A finger's tap: pointerdown, then a click that counts its taps (detail 1). */
const fingerTap = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

const lampX = (button: HTMLElement): string =>
  button.querySelector<HTMLElement>(".board-lamp")?.style.backgroundPositionX ??
  "";

describe("the save conflict card (#464)", () => {
  it("is a board card and pre-selects the side with more stones", () => {
    const { panel, find } = mount();
    expect(panel.root.matches(".board-card.save-conflict")).toBe(true);
    expect(panel.root.dataset["card"]).toBe("conflict");
    expect(panel.root.hidden).toBe(false);
    expect(board.view().stack).toEqual(["conflict"]);
    expect(find("#save-conflict-title").textContent).toBe("Two saves found");
    expect(find(".save-conflict-body").textContent).toContain(
      "nothing is lost",
    );
    const other = find(".save-card[data-side=other]");
    expect(other.getAttribute("aria-pressed")).toBe("true");
    expect(other.classList.contains("board-skinned")).toBe(true);
    // Green is the lamp strip's third frame, 40px apart.
    expect(lampX(other)).toBe("-80px");
    expect(lampX(find(".save-card[data-side=phone]"))).toBe("0px");
    expect(other.getAttribute("aria-label")).toContain("Chrome on Windows");
    expect(document.activeElement).toBe(find(".save-conflict-play"));
  });

  it("a tap on a side selects it and lights its lamp, past the settle", () => {
    const { find } = mount();
    const phone = find(".save-card[data-side=phone]");
    time += 100;
    fingerTap(phone);
    expect(phone.getAttribute("aria-pressed")).toBe("false");
    time += 350;
    fingerTap(phone);
    expect(phone.getAttribute("aria-pressed")).toBe("true");
    expect(phone.classList.contains("is-selected")).toBe(true);
    expect(lampX(phone)).toBe("-80px");
    expect(lampX(find(".save-card[data-side=other]"))).toBe("0px");
  });

  it("a double tap on Play this one never commits", () => {
    const { find, chooseSave } = mount();
    time += 500;
    fingerTap(find(".save-conflict-play"));
    expect(find(".save-conflict-confirm").hidden).toBe(false);
    expect(find(".save-conflict-play").hidden).toBe(true);
    time += 100;
    fingerTap(find(".save-conflict-commit"));
    expect(chooseSave).not.toHaveBeenCalled();
    time += 350;
    fingerTap(find(".save-conflict-commit"));
    expect(chooseSave).toHaveBeenCalledWith("remote");
  });

  it("a second press on the commit plate while the choice is saving does nothing", async () => {
    const { find, chooseSave } = mount();
    let settle: (value: "saved" | "kept") => void = () => undefined;
    chooseSave.mockImplementation(
      () =>
        new Promise<"saved" | "kept">((resolve) => {
          settle = resolve;
        }) as Promise<"saved">,
    );
    find(".save-conflict-play").click();
    const commit = find(".save-conflict-commit");
    commit.click();
    commit.click();
    time += 1000;
    fingerTap(commit);
    expect(chooseSave).toHaveBeenCalledTimes(1);
    // A choice that kept the split (the error line) can be tried again.
    settle("kept");
    await Promise.resolve();
    await Promise.resolve();
    commit.click();
    expect(chooseSave).toHaveBeenCalledTimes(2);
  });

  it("moves the keyboard's focus to the commit plate as Play this one hides", () => {
    const { find } = mount();
    const play = find(".save-conflict-play");
    play.focus();
    play.click();
    expect(play.hidden).toBe(true);
    expect(document.activeElement).toBe(find(".save-conflict-commit"));
  });

  it("a side picked from the confirm goes back to Play this one", () => {
    const { find } = mount();
    find(".save-conflict-play").click();
    find(".save-card[data-side=phone]").click();
    expect(find(".save-conflict-confirm").hidden).toBe(true);
    expect(find(".save-conflict-play").hidden).toBe(false);
    find(".save-card[data-side=other]").click();
    expect(
      find(".save-card[data-side=other]").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the error line, and hides while another tab plays", () => {
    const { panel, find, set } = mount();
    expect(find(".save-conflict-error").hidden).toBe(true);
    set({ ...SPLIT, error: "archive-failed" });
    expect(find(".save-conflict-error").hidden).toBe(false);
    expect(find(".save-conflict-error").textContent).toContain("try again");
    set(SPLIT, true);
    expect(panel.root.hidden).toBe(true);
    expect(board.view().stack).toEqual([]);
  });

  it("pre-selects this phone when it mined more", () => {
    const { find, set } = mount();
    set({ local: SPLIT.remote, remote: SPLIT.local });
    expect(
      find(".save-card[data-side=phone]").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("a new split while the card stays up pre-selects again and leaves the confirm", () => {
    const { panel, find, set } = mount();
    find(".save-card[data-side=phone]").click();
    find(".save-conflict-play").click();
    expect(find(".save-conflict-confirm").hidden).toBe(false);
    set({ local: SPLIT.local, remote: { ...SPLIT.remote, rev: 5 } });
    expect(panel.root.hidden).toBe(false);
    expect(board.view().stack).toEqual(["conflict"]);
    expect(find(".save-conflict-confirm").hidden).toBe(true);
    expect(find(".save-conflict-play").hidden).toBe(false);
    expect(
      find(".save-card[data-side=other]").getAttribute("aria-pressed"),
    ).toBe("true");
    // The same split again keeps a side the player picked.
    find(".save-card[data-side=phone]").click();
    set({ local: SPLIT.local, remote: { ...SPLIT.remote, rev: 5 } });
    expect(
      find(".save-card[data-side=phone]").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("a new split pre-selects again and leaves the confirm", () => {
    const { panel, find, set } = mount();
    find(".save-card[data-side=phone]").click();
    find(".save-conflict-play").click();
    set(undefined);
    expect(panel.root.hidden).toBe(true);
    set({ local: SPLIT.local, remote: { ...SPLIT.remote, rev: 5 } });
    expect(find(".save-conflict-confirm").hidden).toBe(true);
    expect(
      find(".save-card[data-side=other]").getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
