import { stonesLeft } from "./scale";
import { stonesPerSecond } from "./mountain";
import { owned, tierById } from "./tiers";
import { bandWords, createMachineBays } from "./board-bays";
import { bayViews } from "./machine-bays";
import { readyNow, type ReadyPick } from "./ready-now";
import {
  createDigButton,
  createReadyPlate,
  type ReadyTap,
} from "./board-ready";
import { createCrewPlate, createOutputGauge } from "./board-gauge";
import { crewCounts } from "./crew-count";
import { createMineWindow } from "./board-window";
import { windowScene } from "./mine-window";
import { effectiveRates } from "./rates";
import { tapWords } from "./screen-words";
import type { BoardNote } from "./board-note";
import type { ScreenCtx } from "./screen-context";

const MINED_OUT = "The mountain is mined out";
/** How far a dig and a local spend kick the output needle, in degrees (#371). */
const DIG_KICK = 150;
/** How far a local spend kicks the needle, in degrees (#371). */
export const SPEND_KICK = 120;

/**
 * The gauge row (#371): the output gauge, the mine window down No. 2 Shaft with the vein and
 * the Legacy plate on it, and the crew plate. The dig button is made after it, so a window
 * tap reaches it through the late `onDug`.
 */
export function createGaugeRow(
  ctx: ScreenCtx,
  deps: {
    readonly vein: { readonly tap: () => void };
    readonly legacyBadge: HTMLElement;
    /** Late: the dig button. A window tap that dug shows on it. */
    readonly onDug: (mined: number) => void;
  },
): {
  root: HTMLElement;
  mine: ReturnType<typeof createMineWindow>;
  dig: () => number;
  kick: (degrees: number) => void;
  paint: () => void;
  tick: (dt: number) => void;
} {
  const gauge = createOutputGauge();
  const crewPlate = createCrewPlate();
  /** The gauge shows what is earned: nothing once the mountain is mined out. */
  const renderGaugeRow = (): void => {
    const { mountain, trouble } = ctx.view();
    gauge.set(
      mountain.remaining > 0
        ? stonesPerSecond(mountain, ctx.now(), trouble)
        : 0,
    );
    crewPlate.set(crewCounts(mountain, ctx.now(), trouble));
  };

  /**
   * A tap on the window: today's rock handler. Returns the stones the tap
   * itself dug: the store settles the crew before the tap, and the crew's
   * stones are the gauge's to show, not the dig's "+N" (#371).
   */
  const dig = (): number => {
    if (!ctx.view().ready) {
      return 0;
    }
    const result = ctx.dispatch({ kind: "dig" });
    const mined = result.kind === "applied" ? result.gained : 0;
    if (mined > 0) {
      gauge.kick(DIG_KICK);
    }
    return mined;
  };

  const mine = createMineWindow({
    // A window tap counts by hand on the red button, which echoes the press.
    onDig: () => {
      const mined = dig();
      if (mined > 0) {
        deps.onDug(mined);
      }
      return mined;
    },
    onVein: deps.vein.tap,
    legacyBadge: deps.legacyBadge,
    random: ctx.random,
  });
  const root = document.createElement("div");
  root.className = "board-gauge-row";
  root.append(gauge.root, mine.root, crewPlate.root);

  /** Whether the window shows a save, so a second load clears it once. */
  let windowDrawn = false;
  const paint = (): void => {
    const left = Math.ceil(stonesLeft(ctx.view().mountain));
    mine.dig.disabled = !ctx.view().playing || left === 0;
    mine.dig.setAttribute(
      "aria-label",
      left === 0
        ? MINED_OUT
        : `Mine window: tap to mine ${tapWords(effectiveRates(ctx.view().mountain, ctx.now()).tapYield)}`,
    );
    // The window draws the save once it has loaded, so the first scene it
    // sees is the save itself and nothing beats for it (#371). A save that
    // loads again (a sign-in, another account) puts it back to its frame.
    if (ctx.view().ready) {
      mine.render(windowScene(ctx.view().mountain, ctx.view().trouble));
      windowDrawn = true;
    } else if (windowDrawn) {
      mine.loading();
      windowDrawn = false;
    }
    renderGaugeRow();
  };

  return {
    root,
    mine,
    dig,
    kick: (degrees) => {
      gauge.kick(degrees);
    },
    paint,
    // The window's machines and the needle move on hard steps, once a frame.
    tick: (dt) => {
      mine.tick(dt);
      gauge.tick(dt);
    },
  };
}

/**
 * The Ready row (#372): the Ready now plate and the red DIG button. The red button digs exactly
 * as a window tap does, and the window shows it.
 */
export function createReadyRow(
  ctx: ScreenCtx,
  deps: {
    readonly dig: () => number;
    readonly mine: { readonly dug: (n: number) => void };
    /** Late: the Buys drawer. */
    readonly openBuys: (from?: HTMLElement) => void;
  },
): {
  root: HTMLElement;
  digButton: ReturnType<typeof createDigButton>;
  paint: (pick: ReadyPick) => void;
} {
  /**
   * A tap on the plate reads the rule again from the store, never the painted
   * pick: a pocket that fell since the last frame buys nothing. A ready pick
   * buys exactly one through the store; a pick being saved for opens Buys.
   */
  const tapReady = (): ReadyTap => {
    const latest = ctx.progress.getSnapshot();
    if (!latest.ready || !latest.playing) {
      return { kind: "nothing" };
    }
    const pick = readyNow(latest.mountain, ctx.now(), latest.trouble);
    if (pick.kind === "saving") {
      deps.openBuys(readyPlate.button);
      return { kind: "opened" };
    }
    if (pick.kind !== "ready") {
      return { kind: "nothing" };
    }
    if (ctx.dispatch({ kind: "buyTier", id: pick.tier }).kind !== "applied") {
      return { kind: "nothing" };
    }
    const count = owned(
      ctx.progress.getSnapshot().mountain,
      tierById(pick.tier),
    );
    return { kind: "bought", tier: pick.tier, count, gain: pick.gain };
  };
  const readyPlate = createReadyPlate({ board: ctx.board, onTap: tapReady });
  // The red button digs exactly as a window tap does, and the window shows it.
  const digButton = createDigButton({
    onPress: () => {
      const mined = deps.dig();
      if (mined > 0) {
        deps.mine.dug(mined);
        digButton.dug(mined);
      }
    },
  });
  readyPlate.root.append(digButton.root);
  /** Until the save is in, nothing from it shows on the plate or the button. */
  const paint = (pick: ReadyPick): void => {
    readyPlate.render(
      ctx.view().ready ? pick : undefined,
      ctx.view().playing && ctx.view().ready,
    );
    // A sign-in or another account loads a save again: back to loading.
    if (!ctx.view().ready) {
      digButton.loading();
      return;
    }
    const tapYield = effectiveRates(ctx.view().mountain, ctx.now()).tapYield;
    if (ctx.view().mountain.remaining === 0) {
      digButton.set(undefined, false, MINED_OUT);
      return;
    }
    digButton.set(
      tapYield,
      ctx.view().playing,
      `Dig: tap to mine ${tapWords(tapYield)}`,
    );
  };

  return { root: readyPlate.root, digButton, paint };
}

/**
 * The machine bays (#372). A tap opens Buys; on a troubled bay it presses or
 * holds the fix through the store, as a Buys card does, and the bay thanks
 * the crew once the trouble is gone.
 */
export function createBays(
  ctx: ScreenCtx,
  deps: {
    readonly note: BoardNote;
    readonly openBuys: (from?: HTMLElement) => void;
  },
): {
  root: HTMLElement;
  paint: (pick: ReadyPick) => void;
  tick: (dt: number) => void;
} {
  const { progress } = ctx;
  const bays = createMachineBays({
    board: ctx.board,
    note: deps.note,
    onOpen: deps.openBuys,
    onTrouble: (tier, how) => {
      (how === "hold" ? progress.fixTrouble : progress.pressTrouble)(tier);
      return progress.getSnapshot().trouble === undefined;
    },
  });
  return {
    root: bays.root,
    /** The bays read the save once it is in; before, only their art shows (#372). */
    paint: (pick) => {
      bays.render(
        ctx.view().ready
          ? bayViews(ctx.view().mountain, ctx.now(), ctx.view().trouble, pick)
          : undefined,
        ctx.view().ready ? bandWords(ctx.view().mountain) : "",
      );
    },
    tick: (dt) => {
      bays.tick(dt);
    },
  };
}
