// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { rowsOnBoard, type RowsOnBoard } from "./board-row";
import {
  POST_ART,
  createBroughtPage,
  createEngineerRows,
  createExpeditionChips,
  createPostsPage,
  createTunnelsPage,
  createWalk,
} from "./engineer-parts";
import {
  broughtStories,
  engineerRowView,
  herPlates,
  postRowView,
  tunnelRowView,
  type EngineerCtx,
  type EngineerTeach,
} from "./engineer-rows";
import type { Engineer } from "./engineers";
import { TUNNELS, type Expedition } from "./expeditions";
import type { Mountain } from "./mountain";
import { TEND_POSTS } from "./screen-words";
import { minedMountain } from "./test-fixtures";

const NOW = 5_000_000;
const MINUTE = 60_000;

let time = 0;
let reduced = false;
let board: BoardHost;
let sheet: BoardSheet;
let onBoard: RowsOnBoard;

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

function find(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

const button = (root: ParentNode, selector: string): HTMLButtonElement => {
  const found = find(root, selector);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${selector} is no button`);
  }
  return found;
};

const words = (plate: HTMLElement): string =>
  plate.querySelector(".board-platebtn-text")?.textContent ?? "";

const trip = (
  engineer: Engineer["name"],
  patch: Partial<Expedition> = {},
): Expedition => ({
  engineer,
  tunnel: "old-shaft",
  sentAt: NOW,
  returnsAt: NOW + 40 * MINUTE,
  home: "borer",
  find: { kind: "quiet" },
  ...patch,
});

const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
  ...minedMountain(0),
  pocket: 5_000_000,
  helpers: 20,
  carts: 2,
  drills: 1,
  borers: 1,
  engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  ...patch,
});

const adaOut = (): Mountain =>
  withAda({
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
    expeditions: [trip("Ada")],
  });

const fiveCrew = (): Mountain =>
  withAda({
    engineers: [
      { name: "Ada", rank: 1, trips: 3, post: "borer" },
      { name: "Nils", rank: 0, trips: 0, post: "camp" },
      { name: "Ruth", rank: 2, trips: 9, post: "drill" },
      { name: "Otto", rank: 0, trips: 0, post: "tunnel" },
      { name: "Mae", rank: 0, trips: 0, post: "cart" },
    ],
    expeditions: [trip("Otto", { home: "camp" })],
    finds: ["drawing", "watch"],
  });

const ctxOf = (mountain: Mountain): EngineerCtx => ({
  mountain,
  trouble: undefined,
  now: NOW,
  ready: true,
});

const NONE: EngineerTeach = { kind: "none" };
const TRIP: EngineerTeach = { kind: "trip", name: "Ada" };

const crewOf = (mountain: Mountain): readonly Engineer[] =>
  mountain.engineers ?? [];

const rowViews = (mountain: Mountain, teach: EngineerTeach = NONE) =>
  crewOf(mountain).map((engineer) =>
    engineerRowView(engineer, ctxOf(mountain), teach),
  );

const ada = (mountain: Mountain): Engineer => {
  const found = crewOf(mountain)[0];
  if (found === undefined) {
    throw new Error("no Ada");
  }
  return found;
};

const postViews = (mountain: Mountain, teach: EngineerTeach = NONE) =>
  TEND_POSTS.map((post) =>
    postRowView(ada(mountain), 0, post, ctxOf(mountain), teach),
  );

const tunnelViews = (mountain: Mountain, teach: EngineerTeach = NONE) =>
  TUNNELS.map((tunnel) => tunnelRowView(ada(mountain), tunnel, teach));

/** The drawer open, and past its settle. */
const openPast = (): void => {
  sheet.open();
  advance(DRAWER_SETTLE_MS + 50);
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  reduced = false;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => reduced,
  });
  sheet = createBoardSheet({
    name: "engineers",
    title: "Your engineers",
    infoLabel: "Engineers",
    how: { systems: [], backLabel: "Back to your engineers" },
    board,
    overSave: () => false,
  });
  onBoard = rowsOnBoard(board, "engineers");
  document.body.append(sheet.root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the walk home (#455)", () => {
  it("is the board's miner in an inset tunnel mouth, at 2x", () => {
    const walk = createWalk();
    expect(walk.root.tagName).toBe("SPAN");
    expect(walk.root.classList.contains("engineer-walk")).toBe(true);
    expect(walk.root.getAttribute("aria-hidden")).toBe("true");
    expect(
      walk.root.querySelector(":scope > canvas.board-skin"),
    ).not.toBeNull();
    const walker = find(walk.root, "i.engineer-walker");
    expect(walker.style.backgroundImage).toContain("miner-18f");
  });

  it("paint(false) pauses it in a shut drawer, and paint(true) walks again", () => {
    const walk = createWalk();
    walk.paint(false);
    expect(walk.root.classList.contains("is-paused")).toBe(true);
    walk.paint(true);
    expect(walk.root.classList.contains("is-paused")).toBe(false);
  });
});

describe("the engineer rows (#455)", () => {
  const mount = () => {
    const onOpen = vi.fn();
    const rows = createEngineerRows({ onBoard, onOpen });
    sheet.place(rows.roots);
    return { rows, onOpen };
  };
  const shown = (rows: { roots: readonly HTMLElement[] }): HTMLElement[] =>
    [...sheet.list.querySelectorAll<HTMLElement>(".engineer-row")].filter(
      (row) => rows.roots.includes(row) && !row.hidden,
    );

  it("five engineers give five shown rows, in the crew's order", () => {
    const { rows } = mount();
    const mountain = fiveCrew();
    rows.paint(rowViews(mountain), true);
    expect(rows.roots).toHaveLength(5);
    expect(shown(rows).map((row) => row.dataset["engineer"])).toEqual([
      "Ada",
      "Nils",
      "Ruth",
      "Otto",
      "Mae",
    ]);
    for (const row of shown(rows)) {
      expect(row.tagName).toBe("BUTTON");
      expect(row.classList.contains("board-row")).toBe(true);
    }
  });

  it("an engineer not in the crew keeps her row hidden", () => {
    const { rows } = mount();
    rows.paint(rowViews(withAda()), true);
    expect(shown(rows).map((row) => row.dataset["engineer"])).toEqual(["Ada"]);
  });

  it("follows a crew in another order", () => {
    const { rows } = mount();
    const mountain = withAda({
      engineers: [
        { name: "Ruth", rank: 0, trips: 0, post: "camp" },
        { name: "Ada", rank: 0, trips: 0, post: "borer" },
      ],
    });
    rows.paint(rowViews(mountain), true);
    expect(shown(rows).map((row) => row.dataset["engineer"])).toEqual([
      "Ruth",
      "Ada",
    ]);
    rows.paint(rowViews(fiveCrew()), true);
    expect(shown(rows).map((row) => row.dataset["engineer"])).toEqual([
      "Ada",
      "Nils",
      "Ruth",
      "Otto",
      "Mae",
    ]);
  });

  it("an out row's icon cell holds the walk and no img; home again, the worker", () => {
    const { rows } = mount();
    rows.paint(rowViews(adaOut()), true);
    const row = find(sheet.list, '.engineer-row[data-engineer="Ada"]');
    expect(row.querySelector(".engineer-walk")).not.toBeNull();
    expect(row.querySelector("img.board-row-icon")).toBeNull();
    rows.paint(rowViews(withAda()), true);
    expect(row.querySelector(".engineer-walk")).toBeNull();
    expect(
      row.querySelector("img.board-row-icon")?.getAttribute("src"),
    ).toContain("mach-worker");
  });

  it("a New row has teach-new and the flag New", () => {
    const { rows } = mount();
    rows.paint(rowViews(withAda(), TRIP), true);
    const row = find(sheet.list, '.engineer-row[data-engineer="Ada"]');
    expect(row.classList.contains("teach-new")).toBe(true);
    expect(find(row, ".board-row-flag").textContent).toBe("New");
    rows.paint(rowViews(withAda()), true);
    expect(row.classList.contains("teach-new")).toBe(false);
  });

  it("before the save is in, the rows keep their names, dark and disabled", () => {
    const { rows } = mount();
    rows.paint(rowViews(withAda()), false);
    const row = button(sheet.list, '.engineer-row[data-engineer="Ada"]');
    expect(row.hidden).toBe(false);
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain("Ada");
  });

  it("a tap past the settle opens her, and one inside it does not", () => {
    const { rows, onOpen } = mount();
    rows.paint(rowViews(withAda()), true);
    const row = find(sheet.list, '.engineer-row[data-engineer="Ada"]');
    sheet.open();
    advance(100);
    press(row);
    expect(onOpen).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(row);
    expect(onOpen).toHaveBeenCalledWith("Ada");
  });

  it("walks only while the drawer is open", () => {
    const { rows } = mount();
    rows.paint(rowViews(adaOut()), true);
    const walk = find(sheet.list, ".engineer-walk");
    rows.walk(false);
    expect(walk.classList.contains("is-paused")).toBe(true);
    rows.walk(true);
    expect(walk.classList.contains("is-paused")).toBe(false);
  });
});

describe("her page of posts (#455)", () => {
  const mount = () => {
    const onPost = vi.fn();
    const onPlate = vi.fn();
    const page = createPostsPage({ board, onBoard, onPost, onPlate });
    return { page, onPost, onPlate };
  };
  const posts = (root: HTMLElement): HTMLButtonElement[] => [
    ...root.querySelectorAll<HTMLButtonElement>(".engineer-post"),
  ];

  it("five posts with their machines' art, her own pressed, the others with their gain", () => {
    const { page } = mount();
    const mountain = withAda();
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    expect(page.root.classList.contains("board-page")).toBe(true);
    expect(page.root.classList.contains("engineer-page")).toBe(true);
    const rows = posts(page.root);
    expect(rows.map((row) => row.dataset["post"])).toEqual([...TEND_POSTS]);
    for (const row of rows) {
      const post = row.dataset["post"] as (typeof TEND_POSTS)[number];
      const src = row.querySelector("img.board-row-icon")?.getAttribute("src");
      expect(src).toBe(POST_ART[post]);
      expect(src).toContain("/assets/board/mach-");
    }
    const borer = find(page.root, '.engineer-post[data-post="borer"]');
    expect(borer.getAttribute("aria-pressed")).toBe("true");
    // Her own post's gain is the page's kick, so its column is empty.
    expect(find(borer, ".board-row-gain").textContent).toBe("");
    expect(
      find(page.root, '.engineer-post[data-post="cart"] .board-row-gain')
        .textContent,
    ).toMatch(/^\+[\d.,]+[KMBT]? stones\/sec$/);
    expect(
      find(page.root, '.engineer-post[data-post="drill"]').getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });

  it("the plates read Send exploring and the way back, or Call her back while out", () => {
    const { page } = mount();
    const home = withAda();
    page.paint(postViews(home), herPlates(ada(home), NONE));
    const plates = find(page.root, ".engineer-page-plates");
    const explore = find(plates, ".engineer-explore");
    const recall = find(plates, ".engineer-recall");
    const back = find(plates, ".engineer-list-back");
    expect(explore.hidden).toBe(false);
    expect(recall.hidden).toBe(true);
    expect(words(explore)).toBe("Send exploring");
    expect(explore.getAttribute("aria-label")).toBe("Send exploring");
    expect(words(back)).toBe("Back to your engineers");
    const out = adaOut();
    page.paint(postViews(out), herPlates(ada(out), NONE));
    expect(explore.hidden).toBe(true);
    expect(recall.hidden).toBe(false);
    expect(words(recall)).toBe("Call her back");
  });

  it("the guided first trip's words fit to Send exploring when the plate is too narrow", () => {
    const { page } = mount();
    const mountain = withAda();
    const explore = find(page.root, ".engineer-explore");
    // The words are measured against the plate: a centred overflow never scrolls the plate.
    const text = find(explore, ".board-platebtn-text");
    Object.defineProperty(explore, "clientWidth", { value: 160 });
    Object.defineProperty(text, "scrollWidth", {
      get: () => (words(explore).length > 16 ? 220 : 150),
    });
    page.paint(postViews(mountain, TRIP), herPlates(ada(mountain), TRIP));
    expect(words(explore)).toBe("Send exploring");
    expect(explore.getAttribute("aria-label")).toBe(
      "Send Ada exploring · 10 min",
    );
  });

  it("under the trip teach, the left plate is the guided first trip", () => {
    const { page } = mount();
    const mountain = withAda();
    page.paint(postViews(mountain, TRIP), herPlates(ada(mountain), TRIP));
    const explore = find(page.root, ".engineer-explore");
    expect(["Send Ada exploring · 10 min", "Send exploring"]).toContain(
      words(explore),
    );
    expect(explore.getAttribute("aria-label")).toBe(
      "Send Ada exploring · 10 min",
    );
    expect(explore.classList.contains("teach-new")).toBe(true);
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    expect(explore.classList.contains("teach-new")).toBe(false);
  });

  it("a post press inside the settle sends nothing; past it, it posts", () => {
    const { page, onPost } = mount();
    const mountain = withAda();
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    openPast();
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, '.engineer-post[data-post="drill"]'));
    expect(onPost).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, '.engineer-post[data-post="drill"]'));
    expect(onPost).toHaveBeenCalledWith("drill");
  });

  it("a plate past the settle names itself and how it came", () => {
    const { page, onPlate } = mount();
    const mountain = withAda();
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    openPast();
    sheet.showPage(page.root);
    advance(DRAWER_SETTLE_MS + 50);
    press(find(page.root, ".engineer-explore"));
    press(find(page.root, ".engineer-list-back"));
    expect(onPlate.mock.calls).toEqual([
      ["explore", "finger"],
      ["back", "finger"],
    ]);
    const out = adaOut();
    page.paint(postViews(out), herPlates(ada(out), NONE));
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, ".engineer-recall"));
    expect(onPlate).toHaveBeenLastCalledWith("recall", "finger");
  });

  it("before the save is in, the rows are dark and the plates disabled", () => {
    const { page } = mount();
    page.paint(undefined, undefined);
    for (const row of posts(page.root)) {
      expect(row.disabled).toBe(true);
    }
    for (const plate of page.root.querySelectorAll<HTMLButtonElement>(
      ".engineer-page-plates .board-platebtn",
    )) {
      expect(plate.disabled).toBe(true);
    }
    const mountain = withAda();
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    expect(button(page.root, ".engineer-explore").disabled).toBe(false);
  });

  it("forget drops a plate's finger-down time", () => {
    const { page, onPlate } = mount();
    const mountain = withAda();
    page.paint(postViews(mountain), herPlates(ada(mountain), NONE));
    const back = find(page.root, ".engineer-list-back");
    sheet.open();
    sheet.showPage(page.root);
    advance(100);
    back.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    page.forget();
    advance(DRAWER_SETTLE_MS);
    back.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(onPlate).toHaveBeenCalledWith("back", "finger");
  });
});

describe("the tunnels page (#455)", () => {
  const mount = () => {
    const onTunnel = vi.fn();
    const onPlate = vi.fn();
    const page = createTunnelsPage({ board, onBoard, onTunnel, onPlate });
    return { page, onTunnel, onPlate };
  };
  const lampX = (row: HTMLElement): string =>
    find(row, ".board-lamp").style.backgroundPositionX;

  it("three tunnels with no icon, then Tend a machine and the way back", () => {
    const { page } = mount();
    page.paint(tunnelViews(withAda()));
    expect(page.root.classList.contains("engineer-tunnels-page")).toBe(true);
    const rows = [
      ...page.root.querySelectorAll<HTMLElement>(".engineer-tunnel-row"),
    ];
    expect(rows.map((row) => row.dataset["tunnel"])).toEqual(
      TUNNELS.map((tunnel) => tunnel.id),
    );
    for (const row of rows) {
      expect(row.classList.contains("no-icon")).toBe(true);
    }
    expect(words(find(page.root, ".engineer-tend"))).toBe("Tend a machine");
    expect(words(find(page.root, ".engineer-list-back"))).toBe(
      "Back to your engineers",
    );
  });

  it("the deep dark is locked for an Apprentice, and a press blinks it red", () => {
    const { page, onTunnel } = mount();
    page.paint(tunnelViews(withAda()));
    openPast();
    sheet.showPage(page.root);
    advance(DRAWER_SETTLE_MS + 50);
    const deep = find(
      page.root,
      '.engineer-tunnel-row[data-tunnel="deep-dark"]',
    );
    expect(deep.classList.contains("is-locked")).toBe(true);
    press(deep);
    expect(onTunnel).not.toHaveBeenCalled();
    const frames = new Set<string>([lampX(deep)]);
    for (let step = 0; step < 6; step += 1) {
      advance(70);
      frames.add(lampX(deep));
    }
    expect(frames.has("-120px")).toBe(true);
  });

  it("under reduced motion, a locked tunnel does not blink", () => {
    reduced = true;
    board = createBoardHost({
      clock: () => time,
      pressAge: () => 0,
      reduced: () => reduced,
    });
    onBoard = rowsOnBoard(board, "engineers");
    sheet = createBoardSheet({
      name: "engineers",
      title: "Your engineers",
      infoLabel: "Engineers",
      how: { systems: [], backLabel: "Back to your engineers" },
      board,
      overSave: () => false,
    });
    document.body.append(sheet.root);
    const { page } = mount();
    page.paint(tunnelViews(withAda()));
    openPast();
    sheet.showPage(page.root);
    advance(DRAWER_SETTLE_MS + 50);
    const deep = find(
      page.root,
      '.engineer-tunnel-row[data-tunnel="deep-dark"]',
    );
    press(deep);
    for (let step = 0; step < 6; step += 1) {
      advance(70);
      expect(lampX(deep)).not.toBe("-120px");
    }
  });

  it("an open tunnel past the settle sends her, and a plate names itself", () => {
    const { page, onTunnel, onPlate } = mount();
    page.paint(tunnelViews(withAda()));
    openPast();
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, '.engineer-tunnel-row[data-tunnel="side-seam"]'));
    expect(onTunnel).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, '.engineer-tunnel-row[data-tunnel="side-seam"]'));
    expect(onTunnel).toHaveBeenCalledWith("side-seam");
    press(find(page.root, ".engineer-tend"));
    press(find(page.root, ".engineer-list-back"));
    expect(onPlate.mock.calls).toEqual([
      ["tend", "finger"],
      ["back", "finger"],
    ]);
    page.forget();
  });

  it("before the save is in, the tunnels are dark", () => {
    const { page } = mount();
    page.paint(undefined);
    for (const row of page.root.querySelectorAll<HTMLButtonElement>(
      ".engineer-tunnel-row",
    )) {
      expect(row.disabled).toBe(true);
    }
  });
});

describe("the Brought home page (#455)", () => {
  it("tells each story at 16px, with no digit, and Back past the settle", () => {
    const onBack = vi.fn();
    const page = createBroughtPage({ board, onBack });
    page.paint(broughtStories(fiveCrew().finds));
    expect(page.root.classList.contains("board-page")).toBe(true);
    expect(page.root.classList.contains("engineer-brought-page")).toBe(true);
    expect(find(page.root, "h3.board-page-title").textContent).toBe(
      "Brought home",
    );
    const stories = [
      ...page.root.querySelectorAll<HTMLElement>("p.engineer-brought-story"),
    ].filter((story) => !story.hidden);
    expect(stories).toHaveLength(2);
    expect(stories[0]?.textContent).toMatch(/^A child's drawing\. /);
    expect(stories.map((story) => story.textContent).join(" ")).not.toMatch(
      /\d/,
    );
    openPast();
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, ".engineer-list-back"));
    expect(onBack).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, ".engineer-list-back"));
    expect(onBack).toHaveBeenCalledWith("finger");
    page.forget();
  });
});

describe("the expedition chips (#455)", () => {
  it("shows a trip's engineer and clock in the Running now note, and hides the rest", () => {
    const host = document.createElement("div");
    const chips = createExpeditionChips(host, "/helper.png");
    const shownChips = (): HTMLElement[] =>
      [...host.querySelectorAll<HTMLElement>(".expedition-chip")].filter(
        (chip) => !chip.hidden,
      );
    expect(host.querySelectorAll(".expedition-chip")).toHaveLength(5);
    chips.paint(
      withAda({
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
        expeditions: [trip("Ada", { returnsAt: NOW + 60 * MINUTE })],
      }),
      NOW,
    );
    expect(shownChips()).toHaveLength(1);
    expect(shownChips()[0]?.textContent).toBe("Ada1h 0m");
    expect(shownChips()[0]?.getAttribute("aria-label")).toContain(
      "Ada will be gone about an hour.",
    );
    chips.paint(withAda(), NOW);
    expect(shownChips()).toHaveLength(0);
  });
});
