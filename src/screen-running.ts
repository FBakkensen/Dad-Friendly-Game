import pickUrl from "./assets/pick.png";
import rushUrl from "./assets/board/window-rush-4f.png";
import { BOOSTS, type BoostId } from "./boosts";
import { anyChipActive, createEffectChip, writeChip } from "./effect-row";
import { CRAFT_IDS, runningLabels, rushLabel } from "./screen-chips";
import type { ScreenCtx } from "./screen-context";

/**
 * The Running now list and the vein's note, with the park they wait in while another note shows.
 * The boost, Gold rush, craft and bench chips go into the effect row here, in that order; the
 * engineers' trips land there after.
 */
export function createRunningNow(ctx: ScreenCtx): {
  running: HTMLElement;
  veinNote: HTMLElement;
  effectRow: HTMLElement;
  park: (body: Node) => void;
  parkRoot: HTMLElement;
  chipFor: ReadonlyMap<BoostId, HTMLElement>;
  paint(): void;
} {
  const { tierArt, relicArt } = ctx.art;
  // The vein's note and the quiet away line show in the board note under the
  // window (#371); between shows the note waits in the hidden park below. The
  // board note's status announces them, so the words carry no live region of
  // their own and are read once.
  const veinNote = document.createElement("p");
  veinNote.className = "vein-note";

  // The countdowns running now, one per line: the body of the Running now
  // note the boost dial opens (#370). The engineers' trips land here too.
  const effectRow = document.createElement("div");
  effectRow.className = "effect-row";
  effectRow.setAttribute("aria-label", "Active effects");
  effectRow.hidden = true;
  const runningHead = document.createElement("span");
  runningHead.className = "board-note-h";
  runningHead.textContent = "Running now";
  const runningNone = document.createElement("span");
  runningNone.className = "board-running-none";
  const running = document.createElement("div");
  running.className = "board-running";
  running.append(runningHead, effectRow, runningNone);
  // While another note shows, the list and the vein's note wait here, so the
  // chips and the live words stay in the page.
  const runningPark = document.createElement("div");
  runningPark.className = "board-running-park";
  runningPark.hidden = true;
  runningPark.append(running, veinNote);
  const chipFor = new Map(
    BOOSTS.map((boost) => {
      const chip = createEffectChip(
        "boost-chip",
        boost.id === "sharper" ? pickUrl : tierArt.helper,
      );
      chip.dataset["boost"] = boost.id;
      effectRow.append(chip);
      return [boost.id, chip] as const;
    }),
  );
  // The Gold rush (#468): its icon is the sparkle's first frame.
  const rushChip = createEffectChip("rush-chip", rushUrl);
  rushChip.dataset["rush"] = "gold-rush";
  effectRow.append(rushChip);
  const craftChips = new Map(
    CRAFT_IDS.map((id) => {
      const chip = createEffectChip("craft-chip", relicArt.hammer);
      chip.dataset["craft"] = id;
      effectRow.append(chip);
      return [id, chip] as const;
    }),
  );
  const benchChip = createEffectChip("craft-chip", relicArt.hammer);
  benchChip.dataset["craft"] = "bench";
  effectRow.append(benchChip);

  /** The Running now list: each clock counts down on every paint. */
  const paint = (): void => {
    const labels = runningLabels(ctx.view().mountain, ctx.now());
    writeChip(rushChip, rushLabel(ctx.view().mountain, ctx.now()));
    for (const [id, chip] of craftChips) {
      writeChip(chip, labels.crafts[id]);
    }
    writeChip(benchChip, labels.bench);
    // After every chip above and the engineers' trips have been written.
    const anyRunning = anyChipActive(effectRow);
    effectRow.hidden = !anyRunning;
    runningNone.hidden = anyRunning;
    runningNone.textContent = anyRunning ? "" : "Nothing running";
  };

  return {
    running,
    veinNote,
    effectRow,
    // Back to the park whenever another note has taken its place.
    park: (body) => {
      if (body === running || body === veinNote) runningPark.append(body);
    },
    parkRoot: runningPark,
    chipFor,
    paint,
  };
}
