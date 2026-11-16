import type { AuthState } from "./auth";
import { ENGINEER_NAMES } from "./engineers";
import type { FieldEvent, FieldEventData } from "./field-log";
import { formatCompact, formatTimeOfDay } from "./format";
import {
  LAYERS,
  materialsFromMined,
  type LayerId,
  type MaterialId,
} from "./layers";
import type { Mountain } from "./mountain";
import type { RowView } from "./row-view";
import { freshMineLines } from "./save-sheet-copy";
import { MOUNTAIN_STONES, minedOut, shownStones, stonesLeft } from "./scale";
import {
  ACCOUNT,
  NOT_SIGNED_IN,
  SIGN_IN,
  SIGN_IN_GOOGLE,
  SIGN_OUT,
  SIGNING_IN,
  TEND_POSTS,
  TROUBLE_FIXED,
  awayDugLine,
  benchStartedLine,
  cameHomeLine,
  craftFittedLine,
  exploreCheer,
  layerCardWords,
  promoteCheer,
  recallConfirm,
  signedInWords,
  stationCheer,
  tierBuyLine,
  upgradeLevelLine,
  machineBuyLine,
  MACHINE_WORDS,
  vehicleBuyLine,
  type TendPost,
  materialCountWords,
} from "./screen-words";
import { TIERS, type MachineId, type TierId } from "./tiers";
import { freshMineOn } from "./line-switch";
import { VEHICLE_IDS } from "./transport";
import { UPGRADES, upgradeById, type UpgradeId } from "./upgrades";
import { RECIPE_IDS, recipeById, type RecipeId } from "./workshop";

/** A material the pocket can name, and its words. */
export type MaterialChip = {
  readonly id: MaterialId;
  readonly text: string;
};

/**
 * Materials the pocket can name. A chip appears once a unit is in hand,
 * or the stones already dug in that band have earned one (spent down to
 * zero still shows). A later band, and a band with only a remainder, stay off.
 */
export function metMaterialChips(mountain: Mountain): readonly MaterialChip[] {
  const have = mountain.stock;
  const earned = materialsFromMined(minedOut(mountain));
  return LAYERS.filter((layer) => {
    const id = layer.material;
    return have[id] > 0 || earned[id] > 0;
  }).map((layer) => ({
    id: layer.material,
    text: materialCountWords(layer.material, have[layer.material]),
  }));
}

/*
 * The Ledger drawer's rows and lines (#375), as pure views: this run's field log as Tonight's
 * lines, the mountain as the stones row, and the account as its row. Display only,
 * no DOM and no art, as upgrade-rows.ts is.
 */

/** Tonight shows this many lines, newest first. */
export const TONIGHT_LINES = 3;

/** One of Tonight's lines: its local time and its words. */
export interface TonightLine {
  readonly time: string;
  readonly text: string;
}

/** The stones row, and the exact count its `title` gives. */
export interface StonesRowView extends RowView {
  readonly title: string;
}

const NONE: readonly string[] = [];

/** What a Ledger row says when it says nothing more. */
const QUIET_ROW = {
  badge: "",
  need: "",
  why: "",
  flag: NONE,
  gain: "",
  price: "",
  dimTag: false,
  verb: "",
  pick: false,
  can: false,
} as const satisfies Partial<RowView>;

/** A known id from a closed list, or undefined for one this build cannot name. */
function known<T extends string>(
  ids: readonly T[],
  id: string | undefined,
): T | undefined {
  return ids.find((each) => each === id);
}

/** A count worth saying: a whole number above zero. */
function counted(count: number | undefined): number | undefined {
  return count !== undefined && Number.isInteger(count) && count > 0
    ? count
    : undefined;
}

const TIER_IDS: readonly TierId[] = TIERS.map((tier) => tier.id);
const LAYER_IDS: readonly LayerId[] = LAYERS.map((layer) => layer.id);
const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((each) => each.id);

/** A line from a known name and a count, when both are there. */
function named<T extends string>(
  ids: readonly T[],
  data: FieldEventData,
  words: (id: T, count: number) => string,
): string | undefined {
  const id = known(ids, data.id);
  const count = counted(data.count);
  return id === undefined || count === undefined ? undefined : words(id, count);
}

/** A line about a recipe this build knows. */
function recipe(
  data: FieldEventData,
  words: (name: string) => string,
): string | undefined {
  const id = known<RecipeId>(RECIPE_IDS, data.id);
  return id === undefined ? undefined : words(recipeById(id).name);
}

/** A line about one of the crew's named engineers. */
function engineer(
  data: FieldEventData,
  words: (name: string) => string,
): string | undefined {
  const name = known(ENGINEER_NAMES, data.id);
  return name === undefined ? undefined : words(name);
}

/** Stones worth saying: more than none. */
function stones(
  data: FieldEventData,
  words: (stones: number) => string,
): string | undefined {
  const count = data.stones;
  return count !== undefined && count > 0 ? words(count) : undefined;
}

/**
 * A worker or a machine bought. A fresh mine names its machines as the frame
 * does ("Bought cart 3."), not by today's names (#708).
 */
function tierLine(id: TierId, count: number): string {
  return freshMineOn() && Object.hasOwn(MACHINE_WORDS, id)
    ? machineBuyLine(MACHINE_WORDS[id as MachineId][0], count)
    : tierBuyLine(id, count);
}

/** Each code Tonight can word; any other code is skipped. */
const WORDING: Readonly<
  Record<string, (event: FieldEvent) => string | undefined>
> = {
  "tier.buy": ({ data }) => named(TIER_IDS, data, tierLine),
  "vehicle.buy": ({ data }) => named(VEHICLE_IDS, data, vehicleBuyLine),
  "upgrade.buy": ({ data }) =>
    named(UPGRADE_IDS, data, (id, level) =>
      upgradeLevelLine(upgradeById(id).name, level),
    ),
  "craft.start": ({ data }) => recipe(data, benchStartedLine),
  "craft.done": ({ data }) => recipe(data, craftFittedLine),
  "layer.enter": ({ data }) => {
    const id = known(LAYER_IDS, data.id);
    return id === undefined ? undefined : layerCardWords(id)?.arrival;
  },
  "away.report": ({ data }) => stones(data, awayDugLine),
  "trouble.fix": () => TROUBLE_FIXED,
  "engineer.promote": ({ data }) => engineer(data, promoteCheer),
  "engineer.station": ({ data }) => {
    const post = known<TendPost>(TEND_POSTS, data.source);
    return post === undefined
      ? undefined
      : engineer(data, (name) => stationCheer(name, post));
  },
  "expedition.send": ({ data }) => engineer(data, exploreCheer),
  "expedition.recall": ({ data }) => engineer(data, recallConfirm),
  "expedition.return": ({ data }) => engineer(data, cameHomeLine),
};

/** One event's line, or undefined when Tonight cannot word it truly. */
export function tonightText(event: FieldEvent): string | undefined {
  if (Number.isNaN(Date.parse(event.at))) {
    return undefined;
  }
  return Object.hasOwn(WORDING, event.code)
    ? WORDING[event.code]?.(event)
    : undefined;
}

/** This run's newest lines, newest first: at most {@link TONIGHT_LINES}. */
export function tonightLines(
  events: readonly FieldEvent[],
): readonly TonightLine[] {
  // A Start over, a save set aside for a fresh mountain, or a pass from a
  // ring kept before #729 begins a new Tonight.
  const codes = events.map((each) => each.code);
  const start = Math.max(
    codes.lastIndexOf("run.start-over"),
    codes.lastIndexOf("run.pass"),
    codes.lastIndexOf("save.set-aside"),
  );
  const lines: TonightLine[] = [];
  for (const each of events.slice(start + 1).reverse()) {
    const text = tonightText(each);
    if (text !== undefined) {
      lines.push({ time: formatTimeOfDay(Date.parse(each.at)), text });
    }
    if (lines.length === TONIGHT_LINES) {
      break;
    }
  }
  return lines;
}

/** The stones row: how many are left, the exact count, and the materials met. */
export function stonesRowView(mountain: Mountain): StonesRowView {
  const left = Math.ceil(stonesLeft(mountain));
  const total = shownStones(MOUNTAIN_STONES);
  const name = `${formatCompact(left)} stones left`;
  const materials = metMaterialChips(mountain)
    .map((chip) => chip.text)
    .join(" · ");
  return {
    ...QUIET_ROW,
    name,
    info: materials === "" ? NONE : [materials],
    lamp: "off",
    state: "owned",
    aria: materials === "" ? name : `${name}. ${materials}`,
    title: `${left.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  };
}

/** A fresh mine's two rows (#708): the save card's lines, without the play time. */
export interface FreshLedgerRows {
  readonly stock: RowView;
  readonly crew: RowView;
}

/** A quiet row: a line and the line under it, nothing to do. */
function quietRow(name: string, under: string): RowView {
  return {
    ...QUIET_ROW,
    name,
    info: [under],
    lamp: "off",
    state: "owned",
    aria: `${name}. ${under}`,
  };
}

/**
 * The Ledger's mine in a fresh mine (#708): no depth and no mountain's size.
 * The stone in the stockpile with the project in hand, and the workers with
 * their wagons over the machines, in the save card's words.
 */
export function freshLedgerRows(mountain: Mountain): FreshLedgerRows {
  const lines = freshMineLines(mountain);
  return {
    stock: quietRow(lines.pocket, lines.depth),
    crew: quietRow(lines.crew, lines.machines),
  };
}

/** The account row: who is signed in, and what a tap does. */
export function accountRowView(state: AuthState): RowView {
  const row = { ...QUIET_ROW, name: ACCOUNT };
  switch (state.kind) {
    case "signed-out":
      return {
        ...row,
        info: [NOT_SIGNED_IN],
        verb: SIGN_IN,
        lamp: "off",
        state: "ready",
        can: true,
        aria: SIGN_IN_GOOGLE,
      };
    case "signing-in":
      return {
        ...row,
        info: [SIGNING_IN],
        lamp: "amber",
        state: "running",
        aria: SIGNING_IN,
      };
    case "signed-in": {
      const said = signedInWords(state.user.label);
      return {
        ...row,
        info: [said],
        verb: SIGN_OUT,
        // Signed in is a state, not a thing to do: dark, by the one lamp rule (#509).
        lamp: "off",
        state: "owned",
        can: true,
        aria: `${said}. ${SIGN_OUT}`,
      };
    }
  }
}
