import type { AuthState } from "./auth";
import { BOOSTS } from "./boosts";
import { ENGINEER_NAMES } from "./engineers";
import type { FieldEvent, FieldEventData } from "./field-log";
import { formatCompact, formatTimeOfDay } from "./format";
import { legacyBonus } from "./legacy";
import { legacyWords } from "./legacy-panel";
import { LAYERS, nextLayer, type LayerId } from "./layers";
import type { Mountain } from "./mountain";
import {
  RELICS,
  foundRelics,
  nextRelic,
  relicGoal,
  type RelicId,
} from "./relics";
import type { RowLamp, RowState, RowView } from "./row-view";
import { MOUNTAIN_STONES, shownStones, stonesLeft } from "./scale";
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
  boostStartedLine,
  cameHomeLine,
  craftFittedLine,
  exploreCheer,
  kidMineWords,
  layerCardWords,
  nextLayerHint,
  nextRelicWords,
  promoteCheer,
  recallConfirm,
  relicFoundLine,
  relicProgressLabel,
  RELICS_ALL_FOUND,
  RELICS_UNGUIDED,
  relicsFoundWords,
  signedInWords,
  stationCheer,
  tierBuyLine,
  upgradeLevelLine,
  veinGaveLine,
  type TendPost,
} from "./screen-words";
import { TIERS, type TierId } from "./tiers";
import { UPGRADES, upgradeById, type UpgradeId } from "./upgrades";
import { RECIPE_IDS, recipeById, type RecipeId } from "./workshop";
import { metMaterialChips } from "./workshop-sheet";

/*
 * The Ledger drawer's rows and lines (#375), as pure views: this run's field log as Tonight's
 * lines, the mountain as the stones and relics rows, and the account as its row. Display only,
 * no DOM and no art, as buys-rows.ts, upgrade-rows.ts and workshop-rows.ts are.
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

/** The relics row: which relic it shows, lit or dark, and its bar. */
export interface RelicsRowView extends RowView {
  readonly icon: RelicId;
  readonly lit: boolean;
  readonly progress: number | undefined;
  readonly barLabel: string;
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

/** A boost's line: its name and how long it runs from when it started. */
function boostLine(event: FieldEvent): string | undefined {
  const boost = BOOSTS.find((each) => each.id === event.data.id);
  const runs = Date.parse(event.data.endsAt ?? "") - Date.parse(event.at);
  return boost === undefined || !(runs > 0)
    ? undefined
    : boostStartedLine(boost.name, runs);
}

/** Stones worth saying: more than none. */
function stones(
  data: FieldEventData,
  words: (stones: number) => string,
): string | undefined {
  const count = data.stones;
  return count !== undefined && count > 0 ? words(count) : undefined;
}

/** Each code Tonight can word; any other code is skipped. */
const WORDING: Readonly<
  Record<string, (event: FieldEvent) => string | undefined>
> = {
  "tier.buy": ({ data }) => named(TIER_IDS, data, tierBuyLine),
  "upgrade.buy": ({ data }) =>
    named(UPGRADE_IDS, data, (id, level) =>
      upgradeLevelLine(upgradeById(id).name, level),
    ),
  "boost.start": boostLine,
  "craft.start": ({ data }) => recipe(data, benchStartedLine),
  "craft.done": ({ data }) => recipe(data, craftFittedLine),
  "relic.found": ({ data }) => {
    const relic = RELICS.find((each) => each.id === data.id);
    return relic === undefined ? undefined : relicFoundLine(relic.name);
  },
  "layer.enter": ({ data }) => {
    const id = known(LAYER_IDS, data.id);
    return id === undefined ? undefined : layerCardWords(id)?.arrival;
  },
  "away.report": ({ data }) => stones(data, awayDugLine),
  "vein.tap": ({ data }) => stones(data, veinGaveLine),
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
  // A Start over or a pass begins a new Tonight.
  const codes = events.map((each) => each.code);
  const start = Math.max(
    codes.lastIndexOf("run.start-over"),
    codes.lastIndexOf("run.pass"),
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
  const total = shownStones(mountain, MOUNTAIN_STONES);
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

/** The goal's words: today's guide line, unguided, done or the next relic. */
function goalWords(mountain: Mountain): string {
  const goal = relicGoal(mountain);
  switch (goal.kind) {
    case "unguided":
      return mountain.legacy > 0
        ? kidMineWords(legacyWords(legacyBonus(mountain)))
        : RELICS_UNGUIDED;
    case "done":
      return RELICS_ALL_FOUND;
    case "next":
      return nextRelicWords(goal.name, goal.hint);
  }
}

const GOAL_LAMP: Readonly<
  Record<ReturnType<typeof relicGoal>["kind"], RowLamp>
> = { unguided: "off", next: "amber", done: "green" };

/** The relics row: the count found, the goal, the next layer's hint and the bar. */
export function relicsRowView(mountain: Mountain): RelicsRowView {
  const goal = relicGoal(mountain);
  const name = relicsFoundWords(foundRelics(mountain).length);
  const info = goalWords(mountain);
  const hint = nextLayerHint(nextLayer(mountain)?.id);
  const why = hint ?? "";
  const done = goal.kind === "done";
  const barLabel =
    goal.kind === "next" ? relicProgressLabel(goal.name, hint) : "";
  const state: RowState = done ? "found" : "owned";
  return {
    ...QUIET_ROW,
    name,
    info: [info],
    why,
    lamp: GOAL_LAMP[goal.kind],
    state,
    aria: [name, info, why].filter((part) => part !== "").join(". "),
    // The next relic, dark; once there is none, every relic is found and the Mantle is lit.
    icon: nextRelic(mountain)?.id ?? "mantle",
    lit: done,
    progress: goal.kind === "next" ? goal.percent / 100 : undefined,
    barLabel,
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
        lamp: "green",
        state: "owned",
        can: true,
        aria: `${said}. ${SIGN_OUT}`,
      };
    }
  }
}
