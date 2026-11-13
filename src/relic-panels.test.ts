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
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { createRelicPanels } from "./relic-panels";
import { RELICS, type Relic, type RelicId } from "./relics";
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

const relic = (id: RelicId): Relic => {
  const found = RELICS.find((each) => each.id === id);
  if (found === undefined) {
    throw new Error(`no relic ${id}`);
  }
  return found;
};

/** The view the panel reads, changed in place by each test, and a store that carries. */
interface Fixture {
  view: {
    ready: boolean;
    away: object | undefined;
    revealed: Relic | undefined;
    mountain: Mountain;
  };
  /** Relics still to reveal after the one shown. */
  queue: Relic[];
  card: boolean;
  dismissReveal: Mock<() => void>;
  beforeOpen: Mock<() => void>;
  legacyOpen: Mock<(from: HTMLElement | undefined) => void>;
  panel: ReturnType<typeof createRelicPanels>;
}

/** The store's view of the fixture: its away and its relic as notices. */
function viewOf(fixture: Fixture): ProgressSnapshot {
  const { away, revealed, ...rest } = fixture.view;
  return {
    ...rest,
    notices: [
      ...(away === undefined ? [] : [{ kind: "away", report: away }]),
      ...(revealed === undefined ? [] : [{ kind: "reveal", relic: revealed }]),
    ],
  } as unknown as ProgressSnapshot;
}

function mount(mountain: Mountain, revealed?: Relic): Fixture {
  const fixture = {
    view: { ready: true, away: undefined, revealed, mountain },
    queue: [],
    card: false,
    beforeOpen: vi.fn<() => void>(),
    legacyOpen: vi.fn<(from: HTMLElement | undefined) => void>(),
  } as unknown as Fixture;
  fixture.dismissReveal = vi.fn<() => void>(() => {
    fixture.view.revealed = fixture.queue.shift();
    fixture.panel.render();
  });
  fixture.panel = createRelicPanels({
    progress: {
      dismiss: (what: string) => {
        if (what === "reveal") {
          fixture.dismissReveal();
        }
      },
    } as unknown as ProgressStore,
    getView: () => viewOf(fixture),
    board,
    overSave: () => false,
    cardUp: () => fixture.card,
    beforeOpen: fixture.beforeOpen,
    legacy: { open: fixture.legacyOpen },
  });
  document.body.append(fixture.panel.sheet.root);
  return fixture;
}

const page = (fixture: Fixture, name: string): HTMLElement | null =>
  fixture.panel.sheet.isOpen()
    ? fixture.panel.sheet.root.querySelector<HTMLElement>(
        `.board-sheet-page:not([hidden]) > .relic-${name}-page`,
      )
    : null;

const rows = (fixture: Fixture): HTMLButtonElement[] => [
  ...fixture.panel.sheet.root.querySelectorAll<HTMLButtonElement>(".relic-row"),
];

const escape = (): void => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
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

describe("the relics drawer's shelf (#465)", () => {
  it("opens on the shelf: six rows, the kick, and the other drawers put away first", () => {
    const fixture = mount(minedMountain(relic("shield").depth));
    fixture.panel.open();
    expect(fixture.beforeOpen).toHaveBeenCalledTimes(1);
    expect(fixture.panel.sheet.isOpen()).toBe(true);
    expect(rows(fixture)).toHaveLength(6);
    expect(
      fixture.panel.sheet.root.querySelector(".board-sheet-kick")?.textContent,
    ).toBe("2 of 6 found");
    expect(rows(fixture).map((row) => row.disabled)).toEqual(
      Array.from({ length: 6 }, () => false),
    );
  });

  it("dims every row until the save is in", () => {
    const fixture = mount(minedMountain(0));
    fixture.view.ready = false;
    fixture.panel.render();
    expect(rows(fixture).every((row) => row.disabled)).toBe(true);
  });

  it("a found row opens its detail past the settle; a row not found yet blinks and stays", () => {
    const fixture = mount(minedMountain(relic("shield").depth));
    fixture.panel.open();
    press(rows(fixture)[1]);
    expect(page(fixture, "detail")).toBeNull();
    advance(DRAWER_SETTLE_MS + 50);
    press(rows(fixture)[3]);
    expect(page(fixture, "detail")).toBeNull();
    expect(board.view().blinking.size).toBe(1);
    advance(DRAWER_SETTLE_MS + 50);
    press(rows(fixture)[1]);
    expect(page(fixture, "detail")?.querySelector("h3")?.textContent).toBe(
      "Shield of Protection",
    );
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "detail")?.querySelector(".relic-page-shelf"));
    expect(page(fixture, "detail")).toBeNull();
    expect(fixture.panel.sheet.isOpen()).toBe(true);
  });

  it("a render repaints the open detail: a keepsake brought home shows at once", () => {
    const fixture = mount(minedMountain(relic("shield").depth));
    fixture.panel.open();
    advance(DRAWER_SETTLE_MS + 50);
    press(rows(fixture)[0]);
    const shown = (): string[] =>
      [
        ...(page(fixture, "detail")?.querySelectorAll<HTMLElement>(
          "[data-keepsake]",
        ) ?? []),
      ]
        .filter((item) => !item.hidden)
        .map((item) => item.dataset["keepsake"] ?? "");
    expect(shown()).toEqual([]);
    fixture.view.mountain = { ...fixture.view.mountain, finds: ["watch"] };
    fixture.panel.render();
    expect(shown()).toEqual(["watch"]);
  });

  it("opening it again while it is up goes back to the shelf", () => {
    const fixture = mount(minedMountain(relic("shield").depth));
    fixture.panel.open();
    advance(DRAWER_SETTLE_MS + 50);
    press(rows(fixture)[0]);
    expect(page(fixture, "detail")).not.toBeNull();
    fixture.panel.open();
    expect(page(fixture, "detail")).toBeNull();
    expect(fixture.panel.sheet.isOpen()).toBe(true);
    expect(fixture.beforeOpen).toHaveBeenCalledTimes(1);
  });
});

describe("the reveal opens the drawer itself (#465)", () => {
  it("on the next render, with Carry it with pride focused", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    const reveal = page(fixture, "reveal");
    expect(reveal?.querySelector("h3")?.textContent).toBe(
      "You found the Lantern of Guidance",
    );
    expect(document.activeElement).toBe(
      reveal?.querySelector(".relic-page-carry"),
    );
    expect(fixture.beforeOpen).toHaveBeenCalledTimes(1);
  });

  it("hides the i while the reveal is up, and gives it back on the shelf", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    expect(fixture.panel.sheet.info.hidden).toBe(true);
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "reveal")?.querySelector(".relic-page-carry"));
    fixture.panel.open();
    expect(fixture.panel.sheet.info.hidden).toBe(false);
  });

  it("opening over the i cards puts them away", () => {
    const fixture = mount(minedMountain(relic("lantern").depth));
    fixture.panel.open();
    fixture.panel.sheet.showHow(true);
    fixture.view.revealed = relic("lantern");
    fixture.panel.render();
    expect(fixture.panel.sheet.how.hidden).toBe(true);
    expect(page(fixture, "reveal")).not.toBeNull();
  });

  it("waits while welcome back or another card is up", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.view.away = {};
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    fixture.view.away = undefined;
    fixture.card = true;
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    fixture.card = false;
    fixture.panel.render();
    expect(page(fixture, "reveal")).not.toBeNull();
  });

  it("Carry it with pride carries it and shuts the drawer", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "reveal")?.querySelector(".relic-page-carry"));
    expect(fixture.dismissReveal).toHaveBeenCalledTimes(1);
    expect(fixture.panel.sheet.isOpen()).toBe(false);
  });

  it("Escape while the relic is still rising carries it (#523)", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    expect(page(fixture, "reveal")?.classList.contains("is-entering")).toBe(
      true,
    );
    advance(50);
    escape();
    expect(fixture.dismissReveal).toHaveBeenCalledTimes(1);
  });

  it("Back, Escape and the scrim carry it too: closing it is seen", () => {
    const fixture = mount(
      minedMountain(relic("shield").depth),
      relic("lantern"),
    );
    fixture.queue = [relic("shield")];
    fixture.panel.render();
    advance(DRAWER_SETTLE_MS + 50);
    press(fixture.panel.sheet.back);
    expect(fixture.dismissReveal).toHaveBeenCalledTimes(1);
    // The next relic's reveal opens in its place.
    expect(page(fixture, "reveal")?.querySelector("h3")?.textContent).toBe(
      "You found the Shield of Protection",
    );
    advance(DRAWER_SETTLE_MS + 50);
    escape();
    expect(fixture.dismissReveal).toHaveBeenCalledTimes(2);
    expect(fixture.panel.sheet.isOpen()).toBe(false);
  });

  it("a program close (a card came up over it) does not carry it: it comes back after", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    fixture.card = true;
    fixture.panel.sheet.close({ restoreFocus: false, by: "program" });
    fixture.panel.render();
    expect(fixture.dismissReveal).not.toHaveBeenCalled();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    fixture.card = false;
    fixture.panel.render();
    expect(page(fixture, "reveal")).not.toBeNull();
  });

  it("goes when the reveal is carried somewhere else", () => {
    const fixture = mount(
      minedMountain(relic("lantern").depth),
      relic("lantern"),
    );
    fixture.panel.render();
    fixture.view.revealed = undefined;
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    expect(fixture.dismissReveal).not.toHaveBeenCalled();
  });
});

describe("the Legend (#465)", () => {
  const atTheBottom = (): Fixture =>
    mount(minedMountain(MOUNTAIN_STONES), relic("mantle"));

  it("follows the Mantle's Carry on the same open drawer, Stand proud focused", () => {
    const fixture = atTheBottom();
    fixture.panel.render();
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "reveal")?.querySelector(".relic-page-carry"));
    const legend = page(fixture, "legend");
    expect(fixture.panel.sheet.info.hidden).toBe(true);
    expect(legend?.querySelector("h3")?.textContent).toBe(
      "You became a Legend",
    );
    expect(document.activeElement).toBe(
      legend?.querySelector(".relic-page-stand"),
    );
    advance(DRAWER_SETTLE_MS + 50);
    press(legend?.querySelector(".relic-page-stand"));
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
  });

  it("opens itself when the Mantle's reveal was closed by Back, and Escape ends it for the run", () => {
    const fixture = atTheBottom();
    fixture.panel.render();
    advance(DRAWER_SETTLE_MS + 50);
    press(fixture.panel.sheet.back);
    expect(page(fixture, "legend")).not.toBeNull();
    advance(DRAWER_SETTLE_MS + 50);
    escape();
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
  });

  it("Pass to your kid shuts it and opens today's Pass the mine card", () => {
    const fixture = atTheBottom();
    fixture.panel.render();
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "reveal")?.querySelector(".relic-page-carry"));
    advance(DRAWER_SETTLE_MS + 50);
    press(page(fixture, "legend")?.querySelector(".relic-page-pass"));
    expect(fixture.panel.sheet.isOpen()).toBe(false);
    expect(fixture.legacyOpen).toHaveBeenCalledWith(undefined);
    fixture.panel.render();
    expect(fixture.panel.sheet.isOpen()).toBe(false);
  });
});
