import { formatCount } from "./format";
import { veinSpot } from "./mine-window";
import type { ScreenCtx } from "./screen-context";
import {
  advanceVein,
  pauseVein,
  resumeVein,
  veinGapScale,
  veinGlintMs,
  veinWaitLeft,
  waitForVein,
  type VeinState,
} from "./veins";
import { hasRelic } from "./relics";

/** How long the short-absence note stays (#334). */
export const QUIET_NOTE_MS = 6000;
/** How long the vein's payout note stays. */
const VEIN_NOTE_MS = 4000;
/** The wait for the next vein counts play time only, and survives the phone locking. */
const VEIN_WAIT_KEY = "dad-friendly-vein-wait";

type VeinSpot = ReturnType<typeof veinSpot>;

/**
 * The golden vein: its wait, its glint on the mine window, its payout note, and the pause while
 * the page is hidden. The mine and the board note are made further down the screen, so the
 * root hands them in as arrows that read them when called.
 */
export function createVein(
  ctx: ScreenCtx,
  deps: {
    readonly veinNote: HTMLElement;
    /** Late: the mine window. */
    readonly showVein: (spot: VeinSpot | undefined) => void;
    /** Late: the board note under the mine. */
    readonly showIn: (body: Node, ms: number) => void;
  },
): {
  tap: () => void;
  reset: () => void;
  step: () => void;
  render: () => void;
  showNote: (words: string, ms: number) => void;
  listen: () => void;
} {
  const { dispatch, now, random, veinStorage, listening } = ctx;
  const { veinNote } = deps;

  const gapForVeins = (): number =>
    veinGapScale(
      ctx.view().mountain,
      hasRelic(ctx.view().mountain, "lantern"),
      now(),
    );

  // The wait for the next vein counts play time only, and survives the phone
  // locking or the PWA being closed, so short sessions still add up to a vein.
  const storedWait = (): unknown => {
    try {
      const raw = (veinStorage ?? localStorage).getItem(VEIN_WAIT_KEY);
      return raw === null ? undefined : Number(raw);
    } catch {
      return undefined;
    }
  };
  const storeWait = (): void => {
    try {
      (veinStorage ?? localStorage).setItem(
        VEIN_WAIT_KEY,
        String(Math.round(veinWaitLeft(veinState, now()))),
      );
    } catch {
      // Private mode or full storage: the next session just starts a fresh wait.
    }
  };
  let veinState: VeinState = resumeVein({
    waitLeft: storedWait(),
    now: now(),
    random,
    gapScale: gapForVeins(),
  });
  let hiddenAt: number | undefined;
  let veinNoteUntil = 0;

  const render = (): void => {
    deps.showVein(
      veinState.kind === "glinting" &&
        ctx.view().ready &&
        ctx.view().mountain.remaining > 0
        ? veinSpot(veinState.x, veinState.y)
        : undefined,
    );
    if (now() >= veinNoteUntil) {
      veinNote.textContent = "";
    }
  };

  const step = (): void => {
    if (!ctx.view().ready || ctx.view().mountain.remaining === 0) {
      return;
    }
    veinState = advanceVein({
      vein: veinState,
      now: now(),
      random,
      gapScale: gapForVeins(),
      glintMs: veinGlintMs(ctx.view().mountain),
    });
    render();
  };

  /** The vein's payout or the quiet away line, in the board note under the window. */
  const showNote = (words: string, ms: number): void => {
    veinNote.textContent = words;
    veinNoteUntil = now() + ms;
    deps.showIn(veinNote, ms);
  };

  const tap = (): void => {
    if (veinState.kind !== "glinting" || !ctx.view().ready) {
      return;
    }
    const result = dispatch({ kind: "tapVein" });
    const reward = result.kind === "applied" ? result.gained : 0;
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    showNote(
      `Golden vein! +${formatCount(reward)} ${reward === 1 ? "stone" : "stones"}`,
      VEIN_NOTE_MS,
    );
    render();
  };

  const reset = (): void => {
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    render();
  };

  const listen = (): void => {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") {
          hiddenAt ??= now();
          storeWait();
        } else if (hiddenAt !== undefined) {
          // Veins are for active play: time away is skipped, time played is kept.
          veinState = pauseVein(veinState, now() - hiddenAt);
          hiddenAt = undefined;
          render();
        }
      },
      listening,
    );
    window.addEventListener("pagehide", storeWait, listening);
  };

  return { tap, reset, step, render, showNote, listen };
}
