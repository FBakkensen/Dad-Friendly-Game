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
import type { ArchivedCopy } from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import type { ProgressStore } from "./progress-store";
import { createSavedCopiesPanel } from "./saved-copies-panel";

let time = 0;
let board: BoardHost;

const advance = async (ms: number): Promise<void> => {
  time += ms;
  await vi.advanceTimersByTimeAsync(ms);
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

type Restore = "saved" | "kept" | "missing";

interface Fixture {
  copies: ArchivedCopy[];
  current: Mountain;
  restoreCopy: Mock<(id: string) => Promise<Restore>>;
  panel: ReturnType<typeof createSavedCopiesPanel>;
}

const copy = (id: string, mountain: Partial<Mountain> = {}): ArchivedCopy => ({
  id,
  mountain: { ...createMountain(), startedAt: 50, pocket: 12, ...mountain },
  lastSeen: 1_000,
  rev: 1,
  deviceId: `device-${id}`,
  deviceLabel: `Safari on iPhone ${id}`,
  reason: "conflict",
  archivedAt: 1_000,
  expiresAt: 1_000 + 7 * 24 * 3_600_000,
});

function mount(copies: ArchivedCopy[]): Fixture {
  const fixture = {
    copies,
    current: { ...createMountain(), startedAt: 50 },
    restoreCopy: vi.fn<(id: string) => Promise<Restore>>(() =>
      Promise.resolve("saved"),
    ),
  } as unknown as Fixture;
  fixture.panel = createSavedCopiesPanel({
    progress: {
      savedCopies: () => Promise.resolve(fixture.copies),
      restoreCopy: fixture.restoreCopy,
      getSnapshot: () => ({ mountain: fixture.current }),
    } as unknown as ProgressStore,
    now: () => time,
    board,
    requestRender: () => {
      fixture.panel.render();
    },
  });
  document.body.append(fixture.panel.root);
  return fixture;
}

const opener = (): HTMLButtonElement => {
  const key = document.createElement("button");
  key.type = "button";
  document.body.append(key);
  return key;
};

const copies = (fixture: Fixture): HTMLElement[] => [
  ...fixture.panel.root.querySelectorAll<HTMLElement>(".saved-copy"),
];

const plays = (fixture: Fixture): HTMLButtonElement[] => [
  ...fixture.panel.root.querySelectorAll<HTMLButtonElement>(
    ".save-conflict-play",
  ),
];

const back = (fixture: Fixture): HTMLButtonElement | null =>
  fixture.panel.root.querySelector(".saved-copies-close");

beforeEach(() => {
  vi.useFakeTimers();
  time = 2_000;
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

describe("the Saved copies card (#466)", () => {
  it("is a board card: each copy an inset with its lines and Play this one, then Back", async () => {
    const fixture = mount([copy("a"), copy("b")]);
    fixture.panel.open(opener());
    await advance(0);
    const { root } = fixture.panel;
    expect(root.classList.contains("board-card")).toBe(true);
    expect(root.dataset["card"]).toBe("copies");
    expect(root.hidden).toBe(false);
    expect(root.querySelector("#saved-copies-title")?.textContent).toBe(
      "Saved copies",
    );
    expect(copies(fixture)).toHaveLength(2);
    expect(
      copies(fixture)[0]?.querySelector(".saved-copy-device")?.textContent,
    ).toBe("Safari on iPhone a");
    expect(
      copies(fixture)[0]?.querySelectorAll(".board-card-line"),
    ).toHaveLength(7);
    expect(plays(fixture).map((each) => each.textContent)).toEqual([
      "Play this one",
      "Play this one",
    ]);
    expect(back(fixture)?.textContent).toBe("Back to the mountain");
    expect(document.activeElement).toBe(back(fixture));
    const empty = root.querySelector<HTMLElement>(".saved-copies-empty");
    expect(empty?.hidden).toBe(true);
  });

  it("says when there are none", async () => {
    const fixture = mount([]);
    fixture.panel.open();
    await advance(0);
    expect(
      fixture.panel.root.querySelector<HTMLElement>(".saved-copies-empty")
        ?.hidden,
    ).toBe(false);
    expect(copies(fixture)).toHaveLength(0);
  });

  it("an earlier run's copy can be played too (#480)", async () => {
    const fixture = mount([copy("old", { startedAt: 1 })]);
    fixture.panel.open();
    await advance(0);
    const [old] = copies(fixture);
    expect(old?.querySelector(".earlier-run")).toBeNull();
    expect(old?.textContent).not.toMatch(/earlier run/);
    expect(plays(fixture)).toHaveLength(1);
    await advance(DRAWER_SETTLE_MS);
    press(plays(fixture)[0]);
    expect(fixture.restoreCopy).toHaveBeenCalledWith("old");
  });

  it("Play this one plays it past the settle, once, and the card goes", async () => {
    const fixture = mount([copy("a")]);
    fixture.panel.open();
    await advance(100);
    press(plays(fixture)[0]);
    expect(fixture.restoreCopy).not.toHaveBeenCalled();
    await advance(DRAWER_SETTLE_MS);
    let finish: (result: Restore) => void = () => undefined;
    fixture.restoreCopy.mockReturnValueOnce(
      new Promise<Restore>((resolve) => {
        finish = resolve;
      }),
    );
    press(plays(fixture)[0]);
    await advance(DRAWER_SETTLE_MS + 50);
    press(plays(fixture)[0]);
    expect(fixture.restoreCopy).toHaveBeenCalledTimes(1);
    expect(fixture.restoreCopy).toHaveBeenCalledWith("a");
    finish("saved");
    await advance(0);
    expect(fixture.panel.root.hidden).toBe(true);
  });

  it("a copy gone or not stored says so, and stays open", async () => {
    const fixture = mount([copy("a")]);
    fixture.restoreCopy.mockResolvedValueOnce("missing");
    fixture.panel.open();
    await advance(DRAWER_SETTLE_MS + 50);
    press(plays(fixture)[0]);
    await advance(0);
    const error = fixture.panel.root.querySelector<HTMLElement>(
      ".save-conflict-error",
    );
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe("That copy is no longer here.");
    fixture.restoreCopy.mockResolvedValueOnce("kept");
    await advance(DRAWER_SETTLE_MS + 50);
    press(plays(fixture)[0]);
    await advance(0);
    expect(error?.textContent).toBe(
      "Couldn't store the other save yet – try again",
    );
    expect(fixture.panel.root.hidden).toBe(false);
  });

  it("Back to the mountain and Escape close it, focus back on what opened it", async () => {
    const fixture = mount([copy("a")]);
    const key = opener();
    fixture.panel.open(key);
    await advance(DRAWER_SETTLE_MS + 50);
    press(back(fixture));
    expect(fixture.panel.root.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
    expect(board.view().stack).not.toContain("copies");

    fixture.panel.open(key);
    await advance(0);
    back(fixture)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(fixture.panel.root.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
  });

  it("a repaint keeps each copy's inset and plate, and writes the line that moved", async () => {
    const fixture = mount([copy("a")]);
    fixture.panel.open();
    await advance(0);
    const [first] = copies(fixture);
    const play = plays(fixture)[0];
    play?.focus();
    const played = (): string =>
      [...(first?.querySelectorAll(".saved-copy-line") ?? [])]
        .map((line) => line.textContent)
        .join(" | ");
    const before = played();
    time += 2 * 24 * 3_600_000;
    fixture.panel.render();
    expect(copies(fixture)[0]).toBe(first);
    expect(plays(fixture)[0]).toBe(play);
    expect(document.activeElement).toBe(play);
    expect(played()).not.toBe(before);
  });
});
