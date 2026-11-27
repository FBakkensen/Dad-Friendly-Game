import {
  factoryMakers,
  factoryOpen,
  factoryOutputRoom,
  type FactoryMakerId,
} from "./factory";
import { formatCompact } from "./format";
import {
  makerJob,
  makerRate,
  makerWorkersPerUnit,
  runningMakers,
  type MakerJob,
} from "./makers";
import type { Mountain } from "./mountain";
import { crewTimer } from "./rates";
import {
  makerInputBuffers,
  makerKeyView,
  makerMachinesLine,
  makerRecipeLine,
  type InputBufferView,
  type MakerKey,
} from "./refinery-view";
import { MAKER_WORDS, formatSpeed } from "./screen-words";
import { slice2LiveSnapshot } from "./slice2-flow";
import { placeable } from "./workforce";
import { JOB_NAMES } from "./workforce-view";

/**
 * Pure view model for the steady-flow multi-input Factory (Slice 2 Part 2,
 * #779; spec, "What he sees"): Parts Press (2 input buffers), Precision
 * Assembly (3 input buffers once Crystal Caves is open), and the shared
 * `factoryOutput.parts` output buffer awaiting `factoryToStockyardParts`.
 * Reuses the multi-input buffer, recipe, staffing, and key builders from
 * `src/refinery-view.ts`. Never writes the mountain.
 */

export type FactoryLineView = {
  readonly id: FactoryMakerId;
  readonly name: (typeof JOB_NAMES)[MakerJob];
  readonly recipe: string;
  readonly now: string;
  readonly can: string;
  readonly unit: "parts/s";
  readonly machines: string;
  readonly idle?: string;
  readonly standing: boolean;
  readonly buffers: readonly InputBufferView[];
  readonly workers: number;
  readonly job: MakerJob;
  readonly canPlace: boolean;
  readonly canFree: boolean;
  readonly key: MakerKey;
};

export type FactoryOutputView = {
  readonly held: number;
  readonly room: number;
  readonly text: string;
  readonly fill: number;
  readonly full: boolean;
  readonly shipping: string;
};

export type FactoryScene = {
  readonly pressOwned: number;
  readonly pressRunning: boolean;
  readonly assemblyOpen: boolean;
  readonly assemblyOwned: number;
  readonly assemblyRunning: boolean;
  readonly outputFill: number;
};

export type FactoryView = {
  readonly open: boolean;
  readonly lines: readonly FactoryLineView[];
  readonly output: FactoryOutputView;
  readonly scene: FactoryScene;
};

function lineView(
  mountain: Mountain,
  id: FactoryMakerId,
  made: number,
  timer: number,
): FactoryLineView {
  const owned = mountain.makers[id];
  const job = makerJob(id);
  const workers = mountain.jobs[job];
  const running = runningMakers(mountain, id);
  const extra = workers - owned * makerWorkersPerUnit(id);
  return {
    id,
    name: JOB_NAMES[job],
    recipe: makerRecipeLine(id),
    now: formatCompact(made),
    can: formatCompact(makerRate(mountain, id) * timer),
    unit: "parts/s",
    machines: makerMachinesLine(id, owned, running),
    ...(extra > 0
      ? { idle: `+ ${String(extra)} without a ${MAKER_WORDS[id][0]}` }
      : {}),
    standing: running > 0 && made <= 0,
    buffers: makerInputBuffers(mountain, id),
    workers,
    job,
    canPlace: placeable(mountain, job) > 0,
    canFree: workers > 0,
    key: makerKeyView(mountain, id),
  };
}

export function factoryView(mountain: Mountain): FactoryView {
  const open = factoryOpen(mountain);
  if (!open) {
    return {
      open: false,
      lines: [],
      output: {
        held: 0,
        room: 0,
        text: "0 of 0",
        fill: 0,
        full: false,
        shipping: "0/s",
      },
      scene: {
        pressOwned: 0,
        pressRunning: false,
        assemblyOpen: false,
        assemblyOwned: 0,
        assemblyRunning: false,
        outputFill: 0,
      },
    };
  }
  const timer = crewTimer();
  const snap = slice2LiveSnapshot(mountain);
  const ids = factoryMakers(mountain);
  const lines = ids.map((id) =>
    lineView(mountain, id, snap.makerOut[id] * timer, timer),
  );
  const held = mountain.factoryOutput.parts;
  const room = factoryOutputRoom(mountain);
  const fill = room > 0 ? Math.min(1, held / room) : 0;
  const full = room > 0 && held >= room;
  const shipping = `${formatSpeed(snap.runRates.factoryToStockyardParts * timer)}/s`;
  return {
    open: true,
    lines,
    output: {
      held,
      room,
      text: `${formatCompact(held)} of ${formatCompact(room)}`,
      fill,
      full,
      shipping,
    },
    scene: {
      pressOwned: mountain.makers.partsPress,
      pressRunning: snap.makerOut.partsPress > 0,
      assemblyOpen: ids.includes("precisionAssembly"),
      assemblyOwned: mountain.makers.precisionAssembly,
      assemblyRunning: snap.makerOut.precisionAssembly > 0,
      outputFill: fill,
    },
  };
}
