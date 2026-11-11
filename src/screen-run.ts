import type { BoardHost } from "./board-host";
import { runBoardLoop } from "./board-window";
import type { ProgressSnapshot } from "./progress-store";
import type { ScreenCtx } from "./screen-context";
import { QUIET_NOTE_MS } from "./screen-vein";
import { quietAwayWords } from "./screen-words";
import { firstNotice } from "./session";

type Ticks = { readonly tick: (dt: number) => void };

/**
 * The screen's next view. A save that loads again (ready, then not) tells the board's model,
 * whose holds and blinks spoke of the old save.
 */
function nextView(
  board: BoardHost,
  view: ProgressSnapshot,
  next: ProgressSnapshot,
): ProgressSnapshot {
  if (view.ready && !next.ready) {
    board.send({ kind: "unloaded" });
  }
  return next;
}

/**
 * The built screen starts running: the 1s tick, the frame loop, the vein's and the New sign's
 * page listeners, the store subscription, and the save line's measure once the fonts load. The
 * root calls this last, once every part is built and laid out.
 */
export function runScreen(
  ctx: ScreenCtx,
  deps: {
    readonly paint: () => void;
    readonly setView: (next: ProgressSnapshot) => void;
    readonly vein: {
      readonly step: () => void;
      readonly listen: () => void;
      readonly showNote: (words: string, ms: number) => void;
    };
    readonly gaugeRow: Ticks;
    readonly bays: Ticks;
    readonly overlays: { readonly listen: () => void };
    readonly saveLine: { readonly render: () => void };
  },
): void {
  const { progress, board, signal } = ctx;
  const { paint, setView, vein, gaugeRow, bays, overlays, saveLine } = deps;
  const ticking = setInterval(() => {
    progress.tick();
    vein.step();
    paint();
  }, 1000);
  signal?.addEventListener("abort", () => {
    clearInterval(ticking);
  });
  // The window's machines and the needle move on hard steps, once a frame.
  runBoardLoop((dt) => {
    gaugeRow.tick(dt);
    bays.tick(dt);
  }, signal);
  vein.listen();
  overlays.listen();

  const unsubscribe = progress.subscribe((next) => {
    setView(nextView(board, ctx.view(), next));
    // A short absence pays with a small note, not the welcome card (#334).
    const quiet = firstNotice(ctx.view(), "quiet");
    if (quiet !== undefined) {
      vein.showNote(quietAwayWords(quiet.stones), QUIET_NOTE_MS);
      queueMicrotask(() => {
        progress.dismiss("quiet");
      });
    }
    paint();
  });
  signal?.addEventListener("abort", unsubscribe);
  // The save line fits its words by measuring; measure again once the board's
  // fonts have loaded (happy-dom has no FontFaceSet).
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  void fonts?.ready.then(() => {
    if (signal?.aborted !== true) {
      saveLine.render();
    }
  });
}
