import { layerOf, type LayerId, type MaterialId } from "./layers";
import type { ProgressSnapshot } from "./progress-store";
import {
  AWAY_ORE,
  CREW_GREW_TITLE,
  ENGINEER_WELCOME,
  WELCOME_AWAY_TITLE,
  WELCOME_HOME_TITLE,
  awayCheerWords,
  awayGoneWords,
  awayMaterialsWords,
  awayMinedWords,
  cameBack,
  crewGrewWords,
  layerCardWords,
  layerWelcomeWords,
  rushHeldWords,
  type LayerCardWords,
} from "./screen-words";
import type { RecipeId } from "./workshop";

/*
 * What the self-opening board cards show (#464), made from the store's view: the welcome card,
 * and the one arrival card (a band broken into, else a craft done) that waits behind it. Pure:
 * no DOM and no art.
 */

/** The welcome card has news: an away haul, the crew grew, an engineer stepped up, or someone came home. */
export function welcomeNews(view: ProgressSnapshot): boolean {
  return (
    view.away !== undefined ||
    view.crewJoined !== undefined ||
    view.engineerJoined === true ||
    view.homecomings.length > 0
  );
}

export interface WelcomeAway {
  /** "+1.2 million" and "stones" */
  readonly mined: ReturnType<typeof awayMinedWords>;
  /** "You were gone 9 hours. … ×1.25." */
  readonly gone: string;
  readonly cheer: string;
  /** The stones held for the Gold rush (#468), when an hour away held some. */
  readonly rush: string | undefined;
  /** The ore line, and the first material it names for its icon. */
  readonly materials:
    { readonly words: string; readonly first: MaterialId } | undefined;
}

export interface WelcomeView {
  readonly title: string;
  /** The away haul, when there was one. */
  readonly away: WelcomeAway | undefined;
  readonly crew: string | undefined;
  /** ENGINEER_WELCOME, only under an away or crew line. */
  readonly engineer: string | undefined;
  readonly returns: readonly string[];
  readonly layers: readonly string[];
  readonly crafts: readonly string[];
}

function awayOf(view: ProgressSnapshot): WelcomeAway | undefined {
  const report = view.away;
  if (report === undefined) {
    return undefined;
  }
  const words = awayMaterialsWords(report.materials);
  const first = AWAY_ORE.find((id) => report.materials[id] > 0);
  return {
    mined: awayMinedWords(report.mined),
    gone: awayGoneWords(report),
    cheer: awayCheerWords(report.awayMs, layerOf(view.mountain).id),
    rush:
      report.heldForRush > 0 ? rushHeldWords(report.heldForRush) : undefined,
    materials:
      words === undefined || first === undefined ? undefined : { words, first },
  };
}

/**
 * Today's chain: away, else the crew, else the engineer, else home. It is read only while the
 * welcome has news, so with none of the first three someone came home.
 */
function titleOf(view: ProgressSnapshot): string {
  if (view.away !== undefined) {
    return WELCOME_AWAY_TITLE;
  }
  if (view.crewJoined !== undefined) {
    return CREW_GREW_TITLE;
  }
  if (view.engineerJoined === true) {
    return ENGINEER_WELCOME;
  }
  return WELCOME_HOME_TITLE;
}

/** What the welcome card shows now, or undefined while it has nothing to say. */
export function welcomeView(view: ProgressSnapshot): WelcomeView | undefined {
  if (!welcomeNews(view)) {
    return undefined;
  }
  const joined = view.crewJoined;
  const returns = view.homecomings.map((home) =>
    cameBack(home.engineer, home.tunnel, home.find),
  );
  const underLine = view.away !== undefined || joined !== undefined;
  return {
    title: titleOf(view),
    away: awayOf(view),
    // Alone, the title already says "Your crew grew".
    crew:
      joined === undefined
        ? undefined
        : crewGrewWords(joined, view.away === undefined),
    engineer:
      view.engineerJoined === true && underLine ? ENGINEER_WELCOME : undefined,
    returns,
    layers: view.layersArrived.flatMap((layer) => {
      const line = layerWelcomeWords(layer.id);
      return line === undefined ? [] : [line];
    }),
    crafts: view.craftsFitted.map((fitted) => fitted.line),
  };
}

export type ArrivalCard =
  | {
      readonly kind: "layer";
      readonly band: LayerId;
      readonly words: LayerCardWords;
    }
  | {
      readonly kind: "craft";
      readonly recipe: RecipeId;
      readonly line: string;
    };

/** The layer card, else craft done; neither while the welcome has news or a relic is revealed. */
export function arrivalCard(view: ProgressSnapshot): ArrivalCard | undefined {
  if (welcomeNews(view) || view.revealed !== undefined) {
    return undefined;
  }
  const band = view.layersArrived[0]?.id;
  const words = band === undefined ? undefined : layerCardWords(band);
  if (band !== undefined && words !== undefined) {
    return { kind: "layer", band, words };
  }
  const fitted = view.craftsFitted[0];
  return fitted === undefined
    ? undefined
    : { kind: "craft", recipe: fitted.id, line: fitted.line };
}
