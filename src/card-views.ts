import { layerOf, type LayerId, type MaterialId } from "./layers";
import type { ProgressSnapshot } from "./progress-store";
import {
  AWAY_ORE,
  WELCOME_AWAY_TITLE,
  WELCOME_HOME_TITLE,
  awayCheerWords,
  awayGoneWords,
  awayMaterialsWords,
  awayMinedWords,
  cameBack,
  craftFittedWords,
  layerCardWords,
  layerWelcomeWords,
  rushHeldWords,
  type LayerCardWords,
} from "./screen-words";
import { firstNotice, noticesOf, type CraftNotice } from "./session";
import { recipeById, type RecipeId } from "./workshop";
import { fittedEffect } from "./workshop-sheet";

/*
 * What the self-opening board cards show (#464), made from the store's view: the welcome card,
 * and the one arrival card (a band broken into, else a craft done) that waits behind it. Pure:
 * no DOM and no art.
 */

/** The welcome card has news: an away haul, or someone came home. */
export function welcomeNews(view: ProgressSnapshot): boolean {
  return firstNotice(view, "away") !== undefined || view.homecomings.length > 0;
}

export interface WelcomeAway {
  /** "+1.2M" and "stones" */
  readonly mined: ReturnType<typeof awayMinedWords>;
  /** The exact haul behind `mined`'s words, for the gameplay journeys (#552). */
  readonly stones: number;
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
  readonly returns: readonly string[];
  readonly layers: readonly string[];
  readonly crafts: readonly string[];
}

function awayOf(view: ProgressSnapshot): WelcomeAway | undefined {
  const report = firstNotice(view, "away")?.report;
  if (report === undefined) {
    return undefined;
  }
  const words = awayMaterialsWords(report.materials);
  const first = AWAY_ORE.find((id) => report.materials[id] > 0);
  return {
    mined: awayMinedWords(report.mined),
    stones: report.mined,
    gone: awayGoneWords(report),
    cheer: awayCheerWords(report.awayMs, layerOf(view.mountain).id),
    rush:
      report.heldForRush > 0 ? rushHeldWords(report.heldForRush) : undefined,
    materials:
      words === undefined || first === undefined ? undefined : { words, first },
  };
}

/** Away, else home. It is read only while the welcome has news, so without an away someone came home. */
function titleOf(view: ProgressSnapshot): string {
  return firstNotice(view, "away") !== undefined
    ? WELCOME_AWAY_TITLE
    : WELCOME_HOME_TITLE;
}

/** What the welcome card shows now, or undefined while it has nothing to say. */
export function welcomeView(view: ProgressSnapshot): WelcomeView | undefined {
  if (!welcomeNews(view)) {
    return undefined;
  }
  const returns = view.homecomings.map((home) =>
    cameBack(home.engineer, home.tunnel, home.find),
  );
  return {
    title: titleOf(view),
    away: awayOf(view),
    returns,
    layers: noticesOf(view, "layer").flatMap(({ layer }) => {
      const line = layerWelcomeWords(layer.id);
      return line === undefined ? [] : [line];
    }),
    crafts: noticesOf(view, "craft").map(({ craft }) => craftLine(craft)),
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
  if (welcomeNews(view) || firstNotice(view, "reveal") !== undefined) {
    return undefined;
  }
  const band = firstNotice(view, "layer")?.layer.id;
  const words = band === undefined ? undefined : layerCardWords(band);
  if (band !== undefined && words !== undefined) {
    return { kind: "layer", band, words };
  }
  const fitted = firstNotice(view, "craft")?.craft;
  return fitted === undefined
    ? undefined
    : { kind: "craft", recipe: fitted.id, line: craftLine(fitted) };
}

/** A fitted craft in words, with the real effect at the moment it finished. */
export function craftLine(fitted: CraftNotice): string {
  return craftFittedWords(
    recipeById(fitted.id).name,
    fittedEffect(fitted.mountain, fitted.id, fitted.at),
  );
}
