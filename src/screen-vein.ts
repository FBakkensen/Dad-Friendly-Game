import { QUICK_VEIN_AWAY_MS } from "./gold-rush";
import { veinWords } from "./screen-words";
import { veinSpot, type VeinSpot } from "./mine-window";
import type { ScreenCtx } from "./screen-context";
import {
  advanceVein,
  pauseVein,
  quickVein,
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
/** A step longer than this was the page asleep; the hidden handler pays that. */
const STEP_MAX_MS = 2000;
/** The wait for the next vein counts play time only, and survives the phone locking. */
const VEIN_WAIT_KEY = "dad-friendly-vein-wait";

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
    /** Late: a card or a drawer hides the mine window. */
    readonly covered: () => boolean;
  },
): {
  tap: () => void;
  reset: () => void;
  step: () => void;
  render: () => void;
  showNote: (words: string, ms: number) => void;
  listen: () => void;
} {
  const { dispatch, now, random, deviceStorage, listening } = ctx;
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
      const raw = (deviceStorage ?? localStorage).getItem(VEIN_WAIT_KEY);
      return raw === null ? undefined : Number(raw);
    } catch {
      return undefined;
    }
  };
  const storeWait = (): void => {
    try {
      (deviceStorage ?? localStorage).setItem(
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
  const quick = createQuickVein(ctx, deps.covered);

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
    const at = now();
    const held = quick.step(veinState, at);
    const next = advanceVein({
      vein: held,
      now: at,
      random,
      gapScale: gapForVeins(),
      glintMs: veinGlintMs(ctx.view().mountain),
    });
    quick.moved(held, next);
    veinState = next;
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
    const rush = quick.take();
    const result = dispatch({ kind: rush ? "tapQuickVein" : "tapVein" });
    const reward = result.kind === "applied" ? result.gained : 0;
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    showNote(veinWords(reward, rush), VEIN_NOTE_MS);
    render();
  };

  const reset = (): void => {
    quick.take();
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

/**
 * The quick vein (#468): a time away of an hour or more makes the next vein
 * glint in 20 seconds, once. It waits, and glints, only while he can see the
 * mine window, so the welcome card or a drawer never costs him the rush.
 */
function createQuickVein(
  ctx: ScreenCtx,
  covered: () => boolean,
): {
  /** Arms for a new long time away, then holds the vein while the window is covered. */
  step: (vein: VeinState, at: number) => VeinState;
  /** A quick glint missed is gone; the next vein is an ordinary one. */
  moved: (before: VeinState, after: VeinState) => void;
  /** Whether the glint is the quick one, and spends it. */
  take: () => boolean;
} {
  let quick = false;
  let armedFor: number | undefined;
  let lastStep: number | undefined;
  return {
    step: (vein, at) => {
      const since = lastStep === undefined ? 0 : at - lastStep;
      lastStep = at;
      const gap = ctx.view().awayGap;
      if (gap !== undefined && gap.at !== armedFor) {
        armedFor = gap.at;
        if (gap.ms >= QUICK_VEIN_AWAY_MS) {
          quick = true;
          return quickVein(at);
        }
      }
      return quick && covered()
        ? pauseVein(vein, Math.min(since, STEP_MAX_MS))
        : vein;
    },
    moved: (before, after) => {
      quick =
        quick && !(before.kind === "glinting" && after.kind === "waiting");
    },
    take: () => {
      const was = quick;
      quick = false;
      return was;
    },
  };
}
