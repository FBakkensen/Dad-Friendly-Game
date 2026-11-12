// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { rowsOnBoard, type RowsOnBoard } from "./board-row";
import { createMountain, MOUNTAIN_STONES, type Mountain } from "./mountain";
import { recipesForMined, NOTHING_KEPT } from "./workshop";
import { benchView } from "./workshop-sheet";
import {
  benchRowView,
  materialPlates,
  type BenchRowView,
} from "./workshop-rows";
import {
  createBenchRow,
  createMaterialPlates,
  createPager,
  type BenchRow,
} from "./workshop-parts";

let time = 0;
let board: BoardHost;
let sheet: BoardSheet;

/** Moves the test's clock and the fake timers together. */
const advance = (ms: number): void => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

/** A finger's tap: down, up, then its click. */
const press = (target: HTMLElement): void => {
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

/** The open Workshop drawer the parts sit in, past or inside its settle. */
const openSheet = (): void => {
  sheet.open();
};

const NOW = 1_700_000_000_000;

function shed(materials: NonNullable<Mountain["materials"]>): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 0,
    helpers: 4,
    carts: 1,
    materials,
    recipes: recipesForMined(12_000_000),
  };
}

function busy(): Mountain {
  return {
    ...shed({ clay: 0, iron: 0, crystal: 0, heartstone: 0 }),
    bench: { recipe: "sturdy-props", startedAt: NOW, endsAt: NOW + 600_000 },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
  sheet = createBoardSheet({
    name: "workshop",
    title: "Workshop",
    infoLabel: "Workshop and materials",
    how: { systems: [], backLabel: "Back to the Workshop" },
    board,
    overSave: () => false,
  });
  document.body.append(sheet.root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the material plates (#374)", () => {
  const mount = (onShow = vi.fn()) => {
    const plates = createMaterialPlates({ board, onShow });
    sheet.place([plates.root]);
    return { plates, onShow };
  };
  const shown = (root: HTMLElement): HTMLButtonElement[] =>
    [...root.querySelectorAll<HTMLButtonElement>("button.workshop-mat")].filter(
      (plate) => !plate.hidden,
    );

  it("two plates show clay and iron: art, count and word", () => {
    const { plates } = mount();
    plates.paint(
      materialPlates(shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 })),
    );
    expect(plates.root.classList.contains("workshop-mats")).toBe(true);
    expect(plates.root.classList.contains("is-packed")).toBe(false);
    const each = shown(plates.root);
    expect(each.map((plate) => plate.dataset["material"])).toEqual([
      "clay",
      "iron",
    ]);
    const [clay, iron] = each;
    expect(clay?.querySelector(":scope > canvas.board-skin")).not.toBeNull();
    const icon = clay?.querySelector<HTMLImageElement>("img.workshop-mat-icon");
    expect(icon?.getAttribute("src")).toContain("src/assets/board/res-clay");
    expect(icon?.getAttribute("width")).toBe("32");
    expect(icon?.getAttribute("height")).toBe("32");
    expect(
      iron?.querySelector("img.workshop-mat-icon")?.getAttribute("src"),
    ).toContain("src/assets/board/res-iron");
    expect(
      clay?.querySelector(".workshop-mat-count.board-num")?.textContent,
    ).toBe("10");
    const word = clay?.querySelector<HTMLElement>(".workshop-mat-word");
    expect(word?.textContent).toBe("clay");
    expect(word?.hidden).toBe(false);
    expect(clay?.getAttribute("aria-label")).toBe(
      "Clay 10. How materials work",
    );
    expect(clay?.disabled).toBe(false);
  });

  it("four plates are packed, with no word shown, and all the board's own art", () => {
    const { plates } = mount();
    plates.paint(
      materialPlates(shed({ clay: 1, iron: 2, crystal: 3, heartstone: 4 })),
    );
    expect(plates.root.classList.contains("is-packed")).toBe(true);
    const each = shown(plates.root);
    expect(each).toHaveLength(4);
    for (const plate of each) {
      expect(
        plate.querySelector<HTMLElement>(".workshop-mat-word")?.hidden,
      ).toBe(true);
      expect(
        plate.querySelector("img.workshop-mat-icon")?.getAttribute("src"),
      ).toMatch(/src\/assets\/board\/res-/);
    }
    expect(each[3]?.getAttribute("aria-label")).toBe(
      "Heartstone 4. How materials work",
    );
  });

  it("three plates are packed too", () => {
    const { plates } = mount();
    plates.paint(
      materialPlates(shed({ clay: 1, iron: 2, crystal: 3, heartstone: 0 })),
    );
    expect(plates.root.classList.contains("is-packed")).toBe(true);
    expect(shown(plates.root)).toHaveLength(3);
  });

  it("a tap past the settle shows the cards; one inside it does not", () => {
    const { plates, onShow } = mount();
    plates.paint(
      materialPlates(shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 })),
    );
    openSheet();
    const clay = shown(plates.root)[0];
    if (clay === undefined) {
      throw new Error("no clay plate");
    }
    time += 100;
    press(clay);
    expect(onShow).not.toHaveBeenCalled();
    time += DRAWER_SETTLE_MS;
    press(clay);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("while the save loads again, the plates are disabled and blank", () => {
    const { plates } = mount();
    plates.paint(
      materialPlates(shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 })),
    );
    plates.paint(undefined);
    const each = shown(plates.root);
    expect(each).toHaveLength(2);
    for (const plate of each) {
      expect(plate.disabled).toBe(true);
      expect(plate.querySelector(".workshop-mat-count")?.textContent).toBe("");
    }
    plates.forget();
  });
});

describe("the bench row (#374)", () => {
  let onBoard: RowsOnBoard;
  let bench: BenchRow;
  let mountain: Mountain;
  const onCancel = vi.fn();
  const page = vi.fn(() => {
    sheet.page();
  });

  const view = (): BenchRowView =>
    benchRowView(benchView(mountain, NOW + 60_000), bench.armed());
  let craft = "sturdy-props@" + String(NOW);
  const mountBench = (start: Mountain, signal?: AbortSignal): void => {
    mountain = start;
    craft = "sturdy-props@" + String(NOW);
    onBoard = rowsOnBoard(board, "workshop");
    bench = createBenchRow({
      onBoard,
      page,
      onCancel,
      repaint: () => {
        bench.paint(view());
      },
      craft: () => craft,
      ...(signal === undefined ? {} : { signal }),
    });
    sheet.place([bench.root]);
    bench.paint(view());
  };
  const why = (): string =>
    bench.root.querySelector(".board-row-why")?.textContent ?? "";
  const bar = (): HTMLElement => {
    const found = bench.root.querySelector<HTMLElement>(
      "i.board-row-bar.workshop-bar[role=progressbar]",
    );
    if (found === null) {
      throw new Error("no bar");
    }
    return found;
  };

  beforeEach(() => {
    onCancel.mockClear();
    page.mockClear();
  });

  it("a busy bench shows its name, its clock, the refund and the bar at 10", () => {
    mountBench(busy());
    const root = bench.root;
    expect(root.tagName).toBe("BUTTON");
    expect(root.classList.contains("board-row")).toBe(true);
    expect(root.classList.contains("workshop-bench")).toBe(true);
    expect(root.classList.contains("no-icon")).toBe(true);
    expect(root.dataset["bench"]).toBe("");
    expect(root.querySelector(".board-row-name")?.textContent).toBe(
      "Sturdy props",
    );
    expect(root.querySelector(".board-row-gain")?.textContent).toBe("9:00");
    expect(root.querySelector(".board-row-info")?.textContent).toMatch(
      /^Cancel · /,
    );
    expect(bar().hidden).toBe(false);
    expect(bar().getAttribute("aria-valuemin")).toBe("0");
    expect(bar().getAttribute("aria-valuemax")).toBe("100");
    expect(bar().getAttribute("aria-valuenow")).toBe("10");
    const fill = bar().querySelector<HTMLElement>(":scope > span");
    expect(fill?.style.getPropertyValue("--fill")).toMatch(/^\d+$/);
    expect(Number(fill?.style.getPropertyValue("--fill"))).toBe(16);
  });

  it("a tap past the settle arms it and pages; a second tap at once cancels nothing, one past the settle cancels", () => {
    mountBench(busy());
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    expect(bench.armed()).toBe(true);
    expect(why()).toBe("Tap again to cancel");
    expect(page).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    advance(100);
    press(bench.root);
    expect(onCancel).not.toHaveBeenCalled();
    expect(bench.armed()).toBe(true);
    advance(350);
    press(bench.root);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(bench.armed()).toBe(false);
  });

  it("armed with no second tap, it disarms at 4,000ms", () => {
    mountBench(busy());
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    expect(why()).toBe("Tap again to cancel");
    advance(3_999);
    expect(bench.armed()).toBe(true);
    advance(1);
    expect(bench.armed()).toBe(false);
    expect(why()).toBe("");
  });

  it("disarm() clears the timer", () => {
    mountBench(busy());
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    const repaints = vi.spyOn(bench, "paint");
    bench.disarm();
    expect(bench.armed()).toBe(false);
    advance(5_000);
    expect(repaints).not.toHaveBeenCalled();
  });

  it("keeps the armed cancel only while the same craft is on the bench", () => {
    mountBench(busy());
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    bench.keep(craft);
    expect(bench.armed()).toBe(true);
    // The craft under it finished and another started: the confirm was for the old one.
    bench.keep("sturdy-props@" + String(NOW + 600_000));
    expect(bench.armed()).toBe(false);
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    expect(bench.armed()).toBe(true);
    bench.keep("");
    expect(bench.armed()).toBe(false);
  });

  it("the screen going clears the disarm timer", () => {
    const screen = new AbortController();
    mountBench(busy(), screen.signal);
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    const repaints = vi.spyOn(bench, "paint");
    screen.abort();
    expect(bench.armed()).toBe(false);
    advance(5_000);
    expect(repaints).not.toHaveBeenCalled();
  });

  it("a free bench's tap calls nothing and does not blink", () => {
    mountBench(shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 }));
    expect(bench.root.querySelector(".board-row-name")?.textContent).toBe(
      "The bench is free",
    );
    expect(bar().hidden).toBe(true);
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    expect(bench.armed()).toBe(false);
    expect(page).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(board.view().blinking.size).toBe(0);
  });

  it("an unknown bench shows its clock and bar, and no cancel", () => {
    mountBench({
      ...shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 }),
      kept: {
        ...NOTHING_KEPT,
        bench: { recipe: "future-bit", startedAt: NOW, endsAt: NOW + 600_000 },
      },
    });
    expect(bench.root.querySelector(".board-row-name")?.textContent).toBe(
      "Something is on the bench",
    );
    expect(
      bench.root.querySelector(".board-row-info")?.textContent,
    ).not.toMatch(/Cancel/);
    expect(bar().hidden).toBe(false);
    openSheet();
    advance(DRAWER_SETTLE_MS + 100);
    press(bench.root);
    expect(bench.armed()).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("while the save loads again it is dark and disabled, with no bar", () => {
    mountBench(busy());
    bench.paint(undefined);
    expect((bench.root as HTMLButtonElement).disabled).toBe(true);
    expect(bar().hidden).toBe(true);
  });
});

describe("the pager (#374)", () => {
  const mountPager = (onPage = vi.fn()) => {
    const pager = createPager({ board, onPage });
    sheet.place([pager.root]);
    return { pager, onPage };
  };
  const plate = (root: HTMLElement, cls: string): HTMLButtonElement => {
    const found = root.querySelector<HTMLButtonElement>(`.${cls}`);
    if (found === null) {
      throw new Error(`no ${cls}`);
    }
    return found;
  };

  it("is hidden when there is one page", () => {
    const { pager } = mountPager();
    pager.paint(0, 1);
    expect(pager.root.hidden).toBe(true);
    expect(pager.root.classList.contains("workshop-pager")).toBe(true);
  });

  it("on page 1 of 2 Earlier hides and More shows, each in its own column", () => {
    const { pager } = mountPager();
    pager.paint(0, 2);
    expect(pager.root.hidden).toBe(false);
    const earlier = plate(pager.root, "workshop-earlier");
    const more = plate(pager.root, "workshop-more");
    expect(earlier.classList.contains("board-platebtn")).toBe(true);
    expect(earlier.textContent).toBe("Earlier");
    expect(more.textContent).toBe("More to make");
    expect(earlier.hidden).toBe(true);
    expect(more.hidden).toBe(false);
    // Both stay in the pager, in their order: the hidden one keeps its column (board.css).
    expect([...pager.root.querySelectorAll(".board-platebtn")]).toEqual([
      earlier,
      more,
    ]);
    pager.paint(1, 2);
    expect(earlier.hidden).toBe(false);
    expect(more.hidden).toBe(true);
  });

  it("a press past the settle pages; one inside it pages nothing", () => {
    const { pager, onPage } = mountPager();
    pager.paint(0, 2);
    openSheet();
    const more = plate(pager.root, "workshop-more");
    time += 100;
    press(more);
    expect(onPage).not.toHaveBeenCalled();
    time += DRAWER_SETTLE_MS;
    press(more);
    expect(onPage).toHaveBeenCalledWith(1);
    pager.paint(1, 2);
    time += DRAWER_SETTLE_MS;
    press(plate(pager.root, "workshop-earlier"));
    expect(onPage).toHaveBeenLastCalledWith(-1);
    pager.forget();
  });
});
