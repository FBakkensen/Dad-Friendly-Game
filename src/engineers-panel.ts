import { hide } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import { createHowPricer } from "./board-how-art";
import { createAskPage, type AskPage } from "./board-page";
import { rowsOnBoard, type RowsOnBoard } from "./board-row";
import {
  createBroughtPage,
  createEngineerRows,
  createExpeditionChips,
  createPostsPage,
  createTunnelsPage,
  pageRow,
} from "./engineer-parts";
import {
  askedPrice,
  broughtRowView,
  crewOf,
  findHer,
  pageEngineer,
  promoteAskLine,
  broughtStories,
  engineerRowView,
  engineerTeach,
  herPlates,
  listKick,
  pageKick,
  postRowView,
  promoteRowView,
  settlePage,
  tunnelRowView,
  type EngineerCtx,
  type EngineerPage,
  type EngineerTeach,
} from "./engineer-rows";
import { canPromote } from "./engineers";
import { TUNNELS, type TunnelId } from "./expeditions";
import type { Dispatch, ProgressSnapshot } from "./progress-store";
import {
  CALL_BACK,
  ENGINEERS_BACK,
  ENGINEER_SHEET_SUB,
  ENGINEER_SHEET_TITLE,
  KEEP_EXPLORING,
  PROMOTE_NOT_YET,
  PROMOTE_STEP_UP,
  PROMOTE_TITLE,
  TEND_POSTS,
  callBackLabel,
  exploreCheer,
  homeCheer,
  promoteCheer,
  recallConfirm,
  stationCheer,
  type TendPost,
} from "./screen-words";

/*
 * The Engineers drawer (#455), behind the Engineers key: a row per engineer (the walk home in
 * her icon cell while she is out), Brought home once there are keepsakes, and Promote at the
 * end. Her row opens her page of posts with Send exploring or Call her back; the tunnels, the
 * recall and promote asks and Brought home's stories are pages too. engineer-rows.ts says what
 * each shows and engineer-parts.ts builds it. Every press goes through the board's model, and
 * every page change is the shell's showPage, so the second tap of a double tap lands on
 * nothing. Every move is today's, through the screen's dispatch.
 */

/** The drawer's pages, built once. */
interface EngineerPages {
  readonly posts: ReturnType<typeof createPostsPage>;
  readonly tunnels: ReturnType<typeof createTunnelsPage>;
  readonly recall: AskPage;
  readonly promote: AskPage;
  readonly brought: ReturnType<typeof createBroughtPage>;
}

/** The list's parts, built once and placed in this order. */
interface EngineersList {
  readonly rows: ReturnType<typeof createEngineerRows>;
  readonly brought: ReturnType<typeof pageRow>;
  readonly promote: ReturnType<typeof pageRow>;
}

/** What a press reads and moves. */
interface EngineerTaps {
  readonly dispatch: Dispatch;
  readonly getView: () => ProgressSnapshot;
  readonly now: () => number;
  readonly onBoard: RowsOnBoard;
  readonly sheet: () => BoardSheet;
  /** The page shown now. */
  readonly page: () => EngineerPage;
  /** Shows a page, a new screen under the finger. */
  readonly go: (page: EngineerPage) => void;
  /** The Promote price on the row at its last paint (#367). */
  readonly quoted: () => number;
}

/** What a view reads now, from the save. */
function ctxOf(view: ProgressSnapshot, at: number): EngineerCtx {
  return {
    mountain: view.mountain,
    trouble: view.trouble,
    now: at,
    ready: view.ready,
  };
}

/** She, in the crew now. */
type Her = NonNullable<ReturnType<typeof findHer>>;

/** Runs `act` for the engineer the page shown names, while she is still in the crew. */
function withHer(taps: EngineerTaps, act: (her: Her) => void): void {
  const her = findHer(taps.getView().mountain, pageEngineer(taps.page()));
  if (her !== undefined) {
    act(her);
  }
}

/** The page root a page shows, or undefined for the list. */
function rootOf(
  pages: EngineerPages,
  page: EngineerPage,
): HTMLElement | undefined {
  switch (page.kind) {
    case "list":
      return undefined;
    case "engineer":
      return pages.posts.root;
    case "tunnels":
      return pages.tunnels.root;
    case "recall":
      return pages.recall.root;
    case "promote":
      return pages.promote.root;
    case "brought":
      return pages.brought.root;
  }
}

/**
 * A post on her page. Her own post sends nothing; another cheers with its gain and moves her
 * there (a post chosen while out calls the party back first). One that lands holds Done.
 */
function onPost(taps: EngineerTaps, her: Her, post: TendPost): void {
  if (her.engineer.post === post) {
    return;
  }
  const { gain } = postRowView(
    her.engineer,
    her.index,
    post,
    ctxOf(taps.getView(), taps.now()),
    { kind: "none" },
  );
  taps
    .sheet()
    .cheer(
      stationCheer(her.engineer.name, post, gain === "" ? undefined : gain),
    );
  const moved = taps.dispatch({ kind: "station", index: her.index, post });
  if (moved.kind === "applied") {
    taps.onBoard.result(`post:${post}`, "applied");
  }
}

/** Sends her down a tunnel, cheering, and shows her page: she is out now. */
function sendHer(taps: EngineerTaps, her: Her, tunnel: TunnelId): void {
  taps.sheet().cheer(exploreCheer(her.engineer.name));
  taps.dispatch({ kind: "send", index: her.index, tunnel });
  taps.go({ kind: "engineer", name: her.engineer.name });
}

/**
 * Her page's left plate at home: the guided first trip sends the shortest tunnel at once, else
 * the tunnels page.
 */
function onExplore(taps: EngineerTaps, her: Her): void {
  const teach = engineerTeach(ctxOf(taps.getView(), taps.now()));
  if (teach.kind === "trip" && teach.name === her.engineer.name) {
    sendHer(taps, her, TUNNELS[0].id);
    return;
  }
  taps.go({ kind: "tunnels", name: her.engineer.name });
}

/** Call back on the recall ask: she comes home, cheered, and her page shows her at home. */
function callHome(taps: EngineerTaps, her: Her): void {
  taps.sheet().cheer(homeCheer(her.engineer.name));
  taps.dispatch({ kind: "recall", index: her.index });
  taps.go({ kind: "engineer", name: her.engineer.name });
}

/**
 * Step up: pays the price that was on the row when he tapped it (#367). A promotion that lands
 * shows the list with the cheer, and the new engineer's row holds Done; one that cannot (a
 * dearer price, no free worker) shows the list and no cheer.
 */
function stepUp(taps: EngineerTaps): void {
  const view = taps.getView();
  const before = crewOf(view.mountain).length;
  const promoted =
    canPromote(view.mountain) &&
    taps.dispatch({ kind: "promote", price: askedPrice(taps.page()) }).kind ===
      "applied";
  taps.go({ kind: "list" });
  // The new engineer joins at the end of the crew.
  const name = crewOf(taps.getView().mountain)[before]?.name;
  if (promoted && name !== undefined) {
    taps.sheet().cheer(promoteCheer(name));
    taps.onBoard.result(`engineer:${name}`, "applied");
  }
}

/** Her page's and the tunnels page's plates, by what they lead to. */
function onHerPlate(
  taps: EngineerTaps,
  id: "explore" | "recall" | "back" | "tend",
): void {
  if (id === "back") {
    taps.go({ kind: "list" });
    return;
  }
  withHer(taps, (her) => {
    const { name } = her.engineer;
    switch (id) {
      case "explore":
        onExplore(taps, her);
        return;
      case "recall":
        taps.go({ kind: "recall", name });
        return;
      case "tend":
        taps.go({ kind: "engineer", name });
        return;
    }
  });
}

/** The ask that recalls her, and the one that promotes a worker: the safe answer first. */
function buildAsks(
  board: BoardHost,
  taps: EngineerTaps,
): Pick<EngineerPages, "recall" | "promote"> {
  const herPage = (): void => {
    withHer(taps, (her) => {
      taps.go({ kind: "engineer", name: her.engineer.name });
    });
  };
  const recall = createAskPage({
    board,
    layer: "engineers",
    className: "engineer-recall-page",
    title: CALL_BACK,
    line: "",
    answers: [
      {
        label: KEEP_EXPLORING,
        id: "recall-no",
        className: "recall-no",
        act: herPage,
      },
      {
        label: CALL_BACK,
        id: "recall-yes",
        className: "recall-yes",
        act: () => {
          withHer(taps, (her) => {
            callHome(taps, her);
          });
        },
        holdsReady: true,
      },
    ],
  });
  const promote = createAskPage({
    board,
    layer: "engineers",
    className: "engineer-promote-page",
    title: PROMOTE_TITLE,
    line: "",
    answers: [
      {
        label: PROMOTE_NOT_YET,
        id: "promote-no",
        className: "engineer-confirm-no",
        act: () => {
          taps.go({ kind: "list" });
        },
      },
      {
        label: PROMOTE_STEP_UP,
        id: "promote-yes",
        className: "engineer-confirm-yes",
        act: () => {
          stepUp(taps);
        },
        holdsReady: true,
      },
    ],
  });
  return { recall, promote };
}

/** Every page of the drawer, each wired to where its presses lead. */
function buildPages(board: BoardHost, taps: EngineerTaps): EngineerPages {
  const onPlate = (id: "explore" | "recall" | "back" | "tend"): void => {
    onHerPlate(taps, id);
  };
  return {
    posts: createPostsPage({
      board,
      onBoard: taps.onBoard,
      onPost: (post) => {
        withHer(taps, (her) => {
          onPost(taps, her, post);
        });
      },
      onPlate,
    }),
    tunnels: createTunnelsPage({
      board,
      onBoard: taps.onBoard,
      onTunnel: (tunnel) => {
        withHer(taps, (her) => {
          sendHer(taps, her, tunnel);
        });
      },
      onPlate,
    }),
    ...buildAsks(board, taps),
    brought: createBroughtPage({
      board,
      onBack: () => {
        taps.go({ kind: "list" });
      },
    }),
  };
}

/** The list: a row per engineer, Brought home, then Promote. */
function buildEngineersList(
  sheet: BoardSheet,
  taps: EngineerTaps,
): EngineersList {
  const { onBoard } = taps;
  const rows = createEngineerRows({
    onBoard,
    onOpen: (name) => {
      taps.go({ kind: "engineer", name });
    },
  });
  const brought = pageRow(
    onBoard,
    {
      className: "engineer-brought",
      data: { engineers: "brought" },
      icon: false,
      id: "brought",
    },
    () => {
      taps.go({ kind: "brought" });
    },
  );
  hide(brought.row.root, true);
  const promote = pageRow(
    onBoard,
    {
      className: "engineer-promote",
      data: { engineers: "promote" },
      icon: false,
      id: "promote",
    },
    () => {
      taps.go({ kind: "promote", price: taps.quoted() });
    },
  );
  sheet.place([...rows.roots, brought.row.root, promote.row.root]);
  return { rows, brought, promote };
}

/** The list's rows from the save: dark until it is in. Returns the Promote row's price. */
function paintList(
  list: EngineersList,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): number {
  const { mountain, ready } = ctx;
  const views = crewOf(mountain).map((engineer) =>
    engineerRowView(engineer, ctx, teach),
  );
  list.rows.paint(views, ready);
  const brought = broughtRowView(mountain.finds);
  hide(list.brought.row.root, brought === undefined);
  list.brought.paint(ready ? brought : undefined);
  const promote = promoteRowView(ctx, teach);
  list.promote.paint(ready ? promote : undefined);
  return promote.cost;
}

/** Her page or the tunnels page, painted for her now; dark until the save is in. */
function paintHers(
  pages: EngineerPages,
  page: Extract<EngineerPage, { readonly kind: "engineer" | "tunnels" }>,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): void {
  const her = findHer(ctx.mountain, page.name);
  const shown = ctx.ready ? her : undefined;
  if (page.kind === "tunnels") {
    pages.tunnels.paint(
      shown &&
        TUNNELS.map((tunnel) => tunnelRowView(shown.engineer, tunnel, teach)),
    );
    return;
  }
  pages.posts.paint(
    shown &&
      TEND_POSTS.map((post) =>
        postRowView(shown.engineer, shown.index, post, ctx, teach),
      ),
    shown && herPlates(shown.engineer, teach),
  );
}

/** The page shown, painted from the save. */
function paintPage(
  pages: EngineerPages,
  page: EngineerPage,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): void {
  switch (page.kind) {
    case "list":
      return;
    case "engineer":
    case "tunnels":
      paintHers(pages, page, ctx, teach);
      return;
    case "recall":
      pages.recall.write(callBackLabel(page.name), recallConfirm(page.name));
      pages.recall.paint(ctx.ready);
      return;
    case "promote":
      pages.promote.write(PROMOTE_TITLE, promoteAskLine(ctx.mountain));
      pages.promote.paint(ctx.ready);
      return;
    case "brought":
      pages.brought.paint(broughtStories(ctx.mountain.finds));
      return;
  }
}

/**
 * The page as the drawer shows it: the "i" cards and a close put the list back in a page's
 * place, so a page whose root left the drawer is the list now.
 */
function onScreen(pages: EngineerPages, page: EngineerPage): EngineerPage {
  return rootOf(pages, page)?.parentElement === null ? { kind: "list" } : page;
}

/** The drawer has an engineer to show: the save is in, and the crew is not empty. */
function hasCrew(view: ProgressSnapshot): boolean {
  return view.ready && crewOf(view.mountain).length > 0;
}

/**
 * The Engineers drawer. `open` does nothing until the save is in and there is an engineer; it
 * marks Engineers seen and opens on the list. A page whose subject changed under it gives way
 * (settlePage), and a ready save with no engineers closes the drawer. Back returns focus to the
 * key, or to `fallbackFocus` (the Ledger key) while a re-load holds the Engineers key.
 */
export function createEngineersPanel({
  dispatch,
  getView,
  now,
  board,
  overSave,
  door,
  fallbackFocus,
  chipHost,
  chipIconUrl,
  signal,
}: {
  dispatch: Dispatch;
  getView: () => ProgressSnapshot;
  /** The game's clock: the trips, the gains and the teach. */
  now: () => number;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** The Engineers key on the rail: the shell writes its aria-expanded. */
  door: HTMLButtonElement;
  /** The Ledger key: Back focuses it while a re-load holds the Engineers key. */
  fallbackFocus: HTMLButtonElement;
  /** The Running now note's chip row: the trips' chips stand there. */
  chipHost: HTMLElement;
  /** The helper art on a trip's chip. */
  chipIconUrl: string;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal | undefined;
}): {
  sheet: BoardSheet;
  render(): void;
  open(from?: HTMLElement): void;
} {
  const onBoard = rowsOnBoard(board, "engineers");
  let page: EngineerPage = { kind: "list" };
  let quoted = Number.NaN;
  const taps: EngineerTaps = {
    dispatch,
    getView,
    now,
    onBoard,
    sheet: () => sheet,
    page: () => page,
    go: (next) => {
      page = next;
      sheet.showPage(rootOf(pages, next));
      render();
    },
    quoted: () => quoted,
  };
  const sheet = createBoardSheet({
    name: "engineers",
    title: ENGINEER_SHEET_TITLE,
    infoLabel: "Engineers",
    how: {
      // Tending's card is not here (#455): three ran past the drawer, and a post row says it.
      systems: ["engineers", "expeditions"],
      backLabel: ENGINEERS_BACK,
    },
    board,
    overSave,
    door,
    fallbackFocus,
    onClose: () => {
      list.rows.walk(false);
    },
    onForget: () => {
      onBoard.forget();
      const { posts, tunnels, recall, promote, brought } = pages;
      for (const each of [posts, tunnels, recall, promote, brought]) {
        each.forget();
      }
    },
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(ENGINEER_SHEET_SUB);
  const pages: EngineerPages = buildPages(board, taps);
  const list = buildEngineersList(sheet, taps);
  const chips = createExpeditionChips(chipHost, chipIconUrl);
  const priceHow = createHowPricer(sheet.how, ["engineers", "expeditions"]);

  const render = (): void => {
    const view = getView();
    const ctx = ctxOf(view, now());
    if (view.ready && !hasCrew(view)) {
      sheet.close({ restoreFocus: false, by: "program" });
    }
    const shown = onScreen(pages, page);
    page = settlePage(shown, view.mountain, view.ready);
    if (page.kind !== shown.kind) {
      sheet.showPage(rootOf(pages, page));
    }
    const teach = engineerTeach(ctx);
    sheet.kick(
      page.kind === "list" ? listKick(teach) : pageKick(page, ctx, teach),
    );
    quoted = paintList(list, ctx, teach);
    paintPage(pages, page, ctx, teach);
    chips.paint(view.mountain, ctx.now);
    list.rows.walk(sheet.isOpen());
    priceHow(view.mountain);
  };

  const open = (from?: HTMLElement): void => {
    const view = getView();
    if (!hasCrew(view)) {
      return;
    }
    dispatch({ kind: "markSeen", id: "engineers" });
    if (!sheet.isOpen()) {
      page = { kind: "list" };
      sheet.showPage(undefined);
    }
    sheet.open(from);
    render();
  };

  return { sheet, render, open };
}
