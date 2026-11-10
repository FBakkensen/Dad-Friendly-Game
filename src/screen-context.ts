import { createUnconfiguredAuth, type AuthController } from "./auth";
import { createBoardHost, type BoardHost } from "./board-host";
import {
  createProgressStore,
  type Dispatch,
  type ProgressSnapshot,
  type ProgressStore,
} from "./progress-store";
import type { RelicId } from "./relics";
import type { TierId } from "./tiers";

/** What the app and the tests hand the screen. */
export type ScreenOptions = {
  root: HTMLElement;
  lanternUrl: string;
  mountainUrl: string;
  stoneUrl: string;
  veinUrl: string;
  tierArt: Readonly<Record<TierId, string>>;
  relicArt: Readonly<Record<RelicId, string>>;
  auth?: AuthController;
  progress?: ProgressStore;
  now?: () => number;
  /**
   * Milliseconds for timing taps against each other. Not `now`: that is the
   * game's clock, which a gate run may stop.
   */
  tapClock?: () => number;
  /** How long a press waited before its handler ran; a test on its own tap clock passes 0. */
  pressAge?: (event: Event) => number;
  random?: () => number;
  /** Where the vein wait is carried between sessions; localStorage by default. */
  veinStorage?: Pick<Storage, "getItem" | "setItem">;
  /** Stops the screen's tick, page listeners and watches. The app never unmounts; tests do. */
  signal?: AbortSignal;
};

/** What every part of the screen shares: the store, the clocks, the board and the art. */
export type ScreenCtx = {
  readonly root: HTMLElement;
  readonly progress: ProgressStore;
  readonly auth: AuthController;
  readonly dispatch: Dispatch;
  readonly view: () => ProgressSnapshot;
  readonly now: () => number;
  readonly random: () => number;
  readonly board: BoardHost;
  readonly signal: AbortSignal | undefined;
  readonly listening: { readonly signal?: AbortSignal };
  readonly art: Pick<
    ScreenOptions,
    | "lanternUrl"
    | "mountainUrl"
    | "stoneUrl"
    | "veinUrl"
    | "tierArt"
    | "relicArt"
  >;
  readonly veinStorage: ScreenOptions["veinStorage"];
  readonly paint: () => void;
};

/**
 * The shared context, with today's defaults. `late` holds the two parts made further down the
 * screen (the repaint, and the odometer with the needle): they are read when called, never built.
 */
export function createScreenCtx(
  {
    root,
    lanternUrl,
    mountainUrl,
    stoneUrl,
    veinUrl,
    tierArt,
    relicArt,
    auth = createUnconfiguredAuth(),
    progress: progressArg,
    now = Date.now,
    tapClock = () => performance.now(),
    pressAge,
    random = Math.random,
    veinStorage,
    signal,
  }: ScreenOptions,
  late: {
    readonly paint: () => void;
    readonly spent: (stones: number) => void;
  },
): { ctx: ScreenCtx; setView: (next: ProgressSnapshot) => void } {
  const progress = progressArg ?? createProgressStore({ auth });
  /**
   * Every change the player makes (#409): a move that took stones rolls the odometer's spend
   * and kicks the needle (made further down; no panel dispatches while it is built). A cloud
   * copy, a restored copy, Start over or Pass the mine never comes here: no spend (#370).
   */
  const dispatch: Dispatch = (move) => {
    const result = progress.dispatch(move);
    if (result.kind === "applied" && result.spent >= 1) {
      late.spent(result.spent);
    }
    return result;
  };
  let view: ProgressSnapshot = progress.getSnapshot();
  const board = createBoardHost({ clock: tapClock, pressAge, signal });
  const listening = signal === undefined ? {} : { signal };
  return {
    ctx: {
      root,
      progress,
      auth,
      dispatch,
      view: () => view,
      now,
      random,
      board,
      signal,
      listening,
      art: { lanternUrl, mountainUrl, stoneUrl, veinUrl, tierArt, relicArt },
      veinStorage,
      paint: late.paint,
    },
    setView: (next) => {
      view = next;
    },
  };
}
