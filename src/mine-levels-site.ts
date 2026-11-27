import { el, hide, mark, setAttr, write } from "./board-dom";
import type { FrameState } from "./frame-state";
import { GOOD_NAMES } from "./frame-view";
import { dropNote, flashNote, listenSteps, moveCount } from "./job-steps";
import {
  CRYSTAL_NOT_REACHED,
  CRYSTAL_SINK_KEY,
  CRYSTAL_SINK_LINE,
  GRANITE_NOT_REACHED,
  HOIST_WAITS_LINE,
  HOIST_WAITS_LINE_ALL,
  SINK_KEY,
  SINK_LINE,
  hoistingRow,
  levelStageTitle,
  mineLevels,
  type LevelsView,
  type MineLevel,
  type ShaftGate,
  type StripCell,
} from "./mine-level-view";
import {
  MINE_LEVEL_IDS,
  type DeeperLevelId,
  type MineLevelId,
} from "./mine-levels";
import { unassignedHoists } from "./cages";
import {
  atArt,
  buildRow,
  paintRow,
  type RowHead,
  type RowParts,
} from "./mine-row";
import { LEVEL, levelPilesOffset, levelTop } from "./mine-scene";
import { LEVEL_NAMES, pileWords } from "./mine-view";
import type { Mountain } from "./mountain";
import { stageCount } from "./next-view";
import { priceIcon } from "./price-icons";
import type { BuyAmount } from "./tiers";

/**
 * The mine's Granite on the site (#680; spec, The mine, With two levels):
 * before the shaft, the Granite's plate under the Topsoil with what it waits
 * for or the Sink key; once sunk, each level's drilling and haulage rows on
 * the level and its two piles under its gallery, and under the keys
 * Hoisting's one row and the strip that assigns the hoists. It paints the
 * pure views (mine-level-view) and changes the game only through
 * `progress.dispatch`. Nothing here says which level a hoist should serve.
 */

/** The Granite's plate before the shaft: under the Topsoil's zone names, in art px. */
const GATE_AT = LEVEL.floor + 11;
/** The plate's and the Sink key's heights and the gap after each, in art px (mine.css). */
const GATE_PLATE = 22;
const GATE_KEY = 26;
const GATE_GAP = 4;

export type GraniteGate = {
  readonly root: HTMLElement;
  /** Paints the gate and says the art px row under it, where "Deeper strata…" goes (ruling 7). */
  readonly paint: (gate: ShaftGate) => number;
};

/** The price on the Sink key: each good's amount with its icon. */
function paintPrice(target: HTMLElement, gate: ShaftGate): void {
  const words =
    gate.kind === "open"
      ? gate.price.map((part) => `${part.good}:${part.text}`).join(" ")
      : "";
  if (target.dataset["price"] === words || gate.kind !== "open") {
    return;
  }
  target.dataset["price"] = words;
  target.replaceChildren(
    ...gate.price.map((part) => {
      const each = el("span", "mine-sink-part");
      const icon = el("img", "mine-key-icon");
      icon.src = priceIcon(part.good) ?? "";
      icon.alt = "";
      each.append(el("span", "board-num", part.text), icon);
      return each;
    }),
  );
}

type GateCopy = {
  readonly level: DeeperLevelId;
  readonly notReached: string;
  readonly key: string;
  readonly line: string;
  readonly at: number;
};

/** Builds a shaft gate plate + Sink key for Granite or Crystal Caves (#680, #779). */
function createShaftGate(state: FrameState, copy: GateCopy): GraniteGate {
  const root = el("div", "mine-granite");
  root.dataset["gate"] = copy.level;
  atArt(root, copy.at);
  const plate = el("div", "mine-granite-plate");
  const name = el("span", "mine-granite-name", copy.notReached);
  const line = el("span", "mine-granite-line");
  plate.append(name, line);
  const sink = el("button", "mine-sink");
  sink.type = "button";
  const words = el("span", "mine-sink-words");
  words.append(
    el("span", "mine-sink-title", copy.key),
    el("small", "mine-sink-small", copy.line),
  );
  const price = el("span", "mine-sink-price");
  sink.append(words, price);
  root.append(plate, sink);
  let shown: ShaftGate | undefined;
  sink.addEventListener("click", () => {
    if (shown?.kind === "open" && shown.can) {
      void state.progress.dispatch(
        copy.level === "granite"
          ? { kind: "sinkShaft" }
          : { kind: "sinkShaft", level: copy.level },
      );
    }
  });
  return {
    root,
    paint: (gate) => {
      shown = gate;
      write(line, gate.kind === "waits" ? gate.words : "");
      hide(line, gate.kind !== "waits");
      hide(sink, gate.kind !== "open");
      paintPrice(price, gate);
      mark(sink, "can", gate.kind === "open" && gate.can);
      setAttr(
        sink,
        "aria-label",
        gate.kind === "open"
          ? `${copy.key}, for ${gate.price.map((part) => `${part.text} ${GOOD_NAMES[part.good].toLowerCase()}`).join(" and ")}. ${copy.line}`
          : undefined,
      );
      const under = copy.at + GATE_PLATE + GATE_GAP;
      return gate.kind === "open" ? under + GATE_KEY + GATE_GAP : under;
    },
  };
}

/** The Granite's plate under the Topsoil, and the Sink key once the shaft can be sunk (ruling 7). */
export function createGraniteGate(state: FrameState): GraniteGate {
  return createShaftGate(state, {
    level: "granite",
    notReached: GRANITE_NOT_REACHED,
    key: SINK_KEY,
    line: SINK_LINE,
    at: GATE_AT,
  });
}

/** The Crystal Caves plate and Sink key under Granite once the Foundry is up (#779). */
function createCrystalGate(state: FrameState): GraniteGate {
  return createShaftGate(state, {
    level: "crystal",
    notReached: CRYSTAL_NOT_REACHED,
    key: CRYSTAL_SINK_KEY,
    line: CRYSTAL_SINK_LINE,
    at: levelTop(2, true) + GATE_GAP,
  });
}

/** A level on the site: its two rows on the level, and its two piles under its gallery. */
type LevelParts = {
  readonly box: HTMLElement;
  readonly pilesBox: HTMLElement;
  readonly rows: readonly [RowParts, RowParts];
  readonly shaftPile: HTMLElement;
  readonly facePile: HTMLElement;
};

/** "TOPSOIL drilling 1,300 of 1,300/s" over "HAULAGE 1,300 of 1,600/s". */
function rowHeads(level: MineLevelId): readonly [RowHead, RowHead] {
  return [
    {
      name: LEVEL_NAMES[level],
      lead: "drilling",
      title: levelStageTitle(level, "face"),
      level,
    },
    {
      name: "Haulage",
      lead: undefined,
      title: levelStageTitle(level, "haul"),
      level,
    },
  ];
}

function positionLevel(
  parts: LevelParts,
  index: number,
  compact: boolean,
): void {
  const top = levelTop(index, compact);
  atArt(parts.box, top);
  atArt(parts.pilesBox, top + levelPilesOffset(compact));
}

function buildLevel(
  state: FrameState,
  view: MineLevel,
  index: number,
  compact: boolean,
  over: HTMLElement,
): LevelParts {
  const heads = rowHeads(view.level);
  const box = el("div", "mine-level-rows");
  box.dataset["level"] = view.level;
  const rows = [
    buildRow(state, view.rows[0], heads[0]),
    buildRow(state, view.rows[1], heads[1]),
  ] as const;
  box.append(rows[0].root, rows[1].root);
  // Each pile under its heap: the rock at the shaft by the shaft, the drilled rock at the gallery's end.
  const pilesBox = el("div", "mine-piles");
  pilesBox.dataset["level"] = view.level;
  const shaftPile = el("span", "mine-pile");
  shaftPile.dataset["pile"] = "shaft";
  const facePile = el("span", "mine-pile");
  facePile.dataset["pile"] = "face";
  pilesBox.append(shaftPile, facePile);
  over.append(box, pilesBox);
  const parts: LevelParts = { box, pilesBox, rows, shaftPile, facePile };
  positionLevel(parts, index, compact);
  return parts;
}

function paintLevel(
  parts: LevelParts,
  view: MineLevel,
  mountain: Mountain,
  amount: BuyAmount,
): void {
  for (const [index, row] of view.rows.entries()) {
    const target = parts.rows[index];
    if (target !== undefined) {
      paintRow(target, row, {
        amount,
        lamp: stageCount(mountain, row.stage) > 0,
        pile: false,
      });
    }
  }
  write(parts.shaftPile, pileWords(view.piles.shaft));
  write(parts.facePile, pileWords(view.piles.face));
}

/** One cell of the strip: a level's, with − and +, or the hoists for both in turn. */
type CellParts = {
  readonly root: HTMLElement;
  /** What a tap on the cell's words hits: its name, rate and count. */
  readonly info: HTMLElement;
  readonly name: HTMLElement;
  readonly rate: HTMLElement;
  readonly count: HTMLElement;
  readonly unit: HTMLElement;
  readonly keys:
    | {
        readonly less: HTMLButtonElement;
        readonly more: HTMLButtonElement;
      }
    | undefined;
};

function cellWords(): Pick<CellParts, "name" | "rate" | "count" | "unit"> & {
  readonly head: HTMLElement;
  readonly number: HTMLElement;
} {
  const head = el("span", "mine-strip-head");
  const name = el("span", "mine-strip-name");
  const rate = el("span", "mine-strip-rate board-num");
  head.append(name, rate);
  const number = el("span", "mine-strip-count");
  const count = el("b", "board-num");
  const unit = el("small", "");
  number.append(count, unit);
  return { head, name, rate, count, unit, number };
}

function stripKey(sign: string, className: string): HTMLButtonElement {
  const key = el("button", `frame-step ${className}`, sign);
  key.type = "button";
  return key;
}

/**
 * A level's cell: its name and rate over its count between − and +, each
 * moving what the amount key says (ruling 4). A tap that moves nothing, on
 * the cell's words or on a dark key, writes the hoists' line in the note.
 */
function buildLevelCell(
  state: FrameState,
  level: MineLevelId,
  note: HTMLElement,
  waitsLine: () => string,
): CellParts {
  const root = el("div", "mine-strip-cell");
  root.dataset["place"] = level;
  const words = cellWords();
  const info = el("span", "mine-strip-info");
  info.append(words.head);
  // A tap on the cell's words, off its keys: the name is too short a line to be a key of its own.
  root.addEventListener("click", (event) => {
    if ((event.target as Element).closest("button") === null) {
      flashNote(note, waitsLine());
    }
  });
  const less = stripKey("−", "mine-strip-less");
  const more = stripKey("+", "mine-strip-more");
  const tap = (way: "less" | "more") => (): void => {
    const mountain = state.mountain();
    const there =
      way === "less"
        ? mountain.cages.assigned[level]
        : unassignedHoists(mountain);
    if (there === 0) {
      flashNote(note, waitsLine());
      return;
    }
    dropNote(note);
    const count = moveCount(state.amount(), there);
    void state.progress.dispatch(
      way === "less"
        ? { kind: "unassignHoist", level, count }
        : { kind: "assignHoist", level, count },
    );
  };
  less.addEventListener("click", tap("less"));
  more.addEventListener("click", tap("more"));
  const keys = el("span", "mine-strip-keys");
  keys.append(less, words.number, more);
  root.append(info, keys);
  return { ...words, root, info, keys: { less, more } };
}

/** The hoists for both/all in turn: no keys, only the line on a tap. */
function buildBothCell(note: HTMLElement, waitsLine: () => string): CellParts {
  const root = el("button", "mine-strip-cell");
  root.type = "button";
  root.dataset["place"] = "both";
  const words = cellWords();
  root.append(words.head, words.number);
  root.addEventListener("click", () => {
    flashNote(note, waitsLine());
  });
  return { ...words, root, info: root, keys: undefined };
}

function paintCell(parts: CellParts, cell: StripCell): void {
  write(parts.name, cell.name);
  write(parts.rate, `${cell.rate}/s`);
  write(parts.count, String(cell.count));
  write(parts.unit, cell.unit);
  setAttr(
    parts.info,
    "aria-label",
    `${cell.name}: ${String(cell.count)} ${cell.unit}, ${cell.rate}/s.`,
  );
  if (parts.keys === undefined) {
    return;
  }
  mark(parts.keys.less, "can", cell.canLess);
  mark(parts.keys.more, "can", cell.canMore);
  setAttr(
    parts.keys.less,
    "aria-label",
    `Assign fewer hoists to the ${cell.name}`,
  );
  setAttr(
    parts.keys.more,
    "aria-label",
    `Assign more hoists to the ${cell.name}`,
  );
}

export type LevelsSite = {
  /** Each level's rows and piles, over the canvas. */
  readonly over: HTMLElement;
  /** Hoisting's row and the strip, under the keys. */
  readonly foot: HTMLElement;
  /** Paints both from the paint's view and says whether a + can place a worker now. */
  readonly paint: (mountain: Mountain, view: LevelsView) => boolean;
};

/** The two or three levels, built from the mountain's first view with the Granite open (#680, #779). */
export function createLevelsSite(
  state: FrameState,
  note: HTMLElement,
): LevelsSite {
  const mountain = state.mountain();
  const over = el("div", "mine-levels");
  const initialLevels = mineLevels(mountain);
  const initialCompact = initialLevels.length >= 3;
  mark(over, "compact", initialCompact);
  const levels = new Map<MineLevelId, LevelParts>(
    initialLevels.map((view, index) => [
      view.level,
      buildLevel(state, view, index, initialCompact, over),
    ]),
  );
  let crystalGate: GraniteGate | undefined;
  listenSteps(over, state, note);
  const foot = el("div", "mine-hoisting");
  const lift = buildRow(state, hoistingRow(mountain));
  const strip = el("div", "mine-strip");
  let cellCount = 3;
  const waitsLine = (): string =>
    cellCount >= 4 ? HOIST_WAITS_LINE_ALL : HOIST_WAITS_LINE;
  const cellMap = new Map<MineLevelId | "both", CellParts>([
    ...MINE_LEVEL_IDS.map(
      (level) =>
        [level, buildLevelCell(state, level, note, waitsLine)] as const,
    ),
    ["both", buildBothCell(note, waitsLine)],
  ]);
  for (const parts of cellMap.values()) {
    strip.append(parts.root);
  }
  foot.append(lift.root, strip);
  listenSteps(lift.root, state, note);
  return {
    over,
    foot,
    paint: (current, view) => {
      const amount = state.amount();
      const compact = view.levels.length >= 3 || view.crystalGate !== undefined;
      mark(over, "compact", compact);
      for (const [index, level] of view.levels.entries()) {
        let parts = levels.get(level.level);
        if (parts === undefined) {
          parts = buildLevel(state, level, index, compact, over);
          levels.set(level.level, parts);
        }
        hide(parts.box, false);
        hide(parts.pilesBox, false);
        positionLevel(parts, index, compact);
        paintLevel(parts, level, current, amount);
      }
      for (const [id, parts] of levels) {
        if (!view.levels.some((each) => each.level === id)) {
          hide(parts.box, true);
          hide(parts.pilesBox, true);
        }
      }
      if (view.crystalGate !== undefined) {
        if (crystalGate === undefined) {
          crystalGate = createCrystalGate(state);
          over.append(crystalGate.root);
        }
        hide(crystalGate.root, false);
        crystalGate.paint(view.crystalGate);
      } else if (crystalGate !== undefined) {
        hide(crystalGate.root, true);
      }
      const row = view.hoisting;
      paintRow(lift, row, {
        amount,
        lamp: stageCount(current, "lift") > 0,
        pile: row.pile !== undefined,
      });
      cellCount = view.strip.length;
      mark(strip, "four", cellCount >= 4);
      const visibleCells: HTMLElement[] = [];
      for (const cell of view.strip) {
        const parts = cellMap.get(cell.place);
        if (parts !== undefined) {
          paintCell(parts, cell);
          visibleCells.push(parts.root);
        }
      }
      if (
        strip.childElementCount !== visibleCells.length ||
        visibleCells.some((node, index) => strip.children[index] !== node)
      ) {
        strip.replaceChildren(...visibleCells);
      }
      return row.canPlace;
    },
  };
}
