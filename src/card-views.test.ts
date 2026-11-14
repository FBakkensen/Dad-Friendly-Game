import { describe, expect, it } from "vitest";
import { arrivalCard, craftLine, welcomeNews, welcomeView } from "./card-views";
import type { Homecoming } from "./expeditions";
import { LAYERS, type Layer } from "./layers";
import { createMountain, type AwayReport } from "./mountain";
import type { CraftNotice, Notice } from "./session";
import type { ProgressSnapshot } from "./progress-store";
import { RELICS } from "./relics";
import {
  AWAY_CHEER,
  WELCOME_AWAY_TITLE,
  WELCOME_HOME_TITLE,
  awayMaterialsWords,
  cameBack,
  layerCardWords,
  layerWelcomeWords,
} from "./screen-words";
import { minedMountain } from "./test-fixtures";

const HOUR = 3_600_000;

/** A plain snapshot: nothing to tell. */
const plain = {
  mountain: minedMountain(10),
  notices: [],
  homecomings: [],
} as unknown as ProgressSnapshot;

const snap = (over: Partial<ProgressSnapshot>): ProgressSnapshot => ({
  ...plain,
  ...over,
});

/** A snapshot with these notices, in order. */
const news = (...notices: Notice[]): ProgressSnapshot => snap({ notices });

const report = (over: Partial<AwayReport> = {}): AwayReport => ({
  mined: 1_200_000,
  heldForRush: 0,
  awayMs: HOUR,
  paidMs: HOUR,
  capped: false,
  heart: 1,
  materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
  ...over,
});

const away = (over: Partial<AwayReport> = {}): Notice => ({
  kind: "away",
  report: report(over),
});

const home = (engineer: "Ada" | "Nils", text: string): Homecoming => ({
  engineer,
  tunnel: "side-seam",
  find: { kind: "quiet", text },
  sentAt: 0,
});

const band = (id: Layer["id"]): Notice => {
  const found = LAYERS.find((layer) => layer.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return { kind: "layer", layer: found };
};

const fitted = (id: "iron-rails" | "axle-grease"): CraftNotice => ({
  id,
  level: 1,
  mountain: createMountain(),
  at: 0,
});
const craft = (id: "iron-rails" | "axle-grease"): Notice => ({
  kind: "craft",
  craft: fitted(id),
});

describe("welcomeNews", () => {
  it("is false on a plain snapshot", () => {
    expect(welcomeNews(plain)).toBe(false);
  });

  it("is true for an away haul and a homecoming", () => {
    expect(welcomeNews(news(away()))).toBe(true);
    expect(welcomeNews(snap({ homecomings: [home("Ada", "Quiet.")] }))).toBe(
      true,
    );
  });
});

describe("welcomeView", () => {
  it("is undefined with no news", () => {
    expect(welcomeView(news(band("granite")))).toBeUndefined();
  });

  it("follows today's title chain", () => {
    const title = (view: ProgressSnapshot) => welcomeView(view)?.title;
    const homes = [home("Ada", "Q.")];
    expect(title(news(away()))).toBe(WELCOME_AWAY_TITLE);
    expect(title(snap({ notices: [away()], homecomings: homes }))).toBe(
      WELCOME_AWAY_TITLE,
    );
    expect(title(snap({ homecomings: homes }))).toBe(WELCOME_HOME_TITLE);
  });

  it("writes the haul in stones", () => {
    expect(welcomeView(news(away({ mined: 1 })))?.away?.mined).toEqual({
      count: "+1",
      unit: "stone",
    });
    expect(welcomeView(news(away()))?.away?.mined).toEqual({
      count: "+1.2M",
      unit: "stones",
    });
  });

  it("names the stones held for the Gold rush, only when some were (#468)", () => {
    expect(welcomeView(news(away()))?.away?.rush).toBeUndefined();
    expect(welcomeView(news(away({ heldForRush: 3_240 })))?.away?.rush).toBe(
      "3,240 of them wait for your Gold rush: watch for the golden vein.",
    );
  });

  it("says how long you were gone, with and without the Heart", () => {
    const gone = (heart: number) =>
      welcomeView(news(away({ heart })))?.away?.gone;
    expect(gone(1)).toBe(
      "You were gone 1 hour. Your crew kept digging the whole time.",
    );
    expect(gone(1.25)).toMatch(/The Heart of Patience made it ×1\.25\.$/);
    expect(gone(1.5)).toMatch(/The Heart of Patience made it ×1\.5\.$/);
    expect(welcomeView(news(away()))?.away?.cheer).toBe(AWAY_CHEER);
  });

  it("lists two returns in order", () => {
    const ada = home("Ada", "First.");
    const nils = home("Nils", "Second.");
    const view = welcomeView(snap({ homecomings: [ada, nils] }));
    expect(view?.returns).toEqual([
      cameBack(ada.engineer, ada.tunnel, ada.find),
      cameBack(nils.engineer, nils.tunnel, nils.find),
    ]);
  });

  it("skips a layer with no welcome words, and lists two crafts", () => {
    const view = welcomeView(
      news(
        away(),
        band("topsoil"),
        band("granite"),
        craft("iron-rails"),
        craft("axle-grease"),
      ),
    );
    expect(view?.layers).toEqual([layerWelcomeWords("granite")]);
    expect(view?.crafts).toEqual([
      craftLine(fitted("iron-rails")),
      craftLine(fitted("axle-grease")),
    ]);
  });

  it("names the first material the ore line names", () => {
    expect(welcomeView(news(away()))?.away?.materials).toBeUndefined();
    const materials = { clay: 0, iron: 3, crystal: 2, heartstone: 0 };
    expect(welcomeView(news(away({ materials })))?.away?.materials).toEqual({
      words: awayMaterialsWords(materials),
      first: "iron",
    });
  });
});

describe("arrivalCard", () => {
  const granite = band("granite");
  const rails = craft("iron-rails");

  it("waits while the welcome has news or a relic is revealed", () => {
    expect(arrivalCard(news(granite, away()))).toBeUndefined();
    const relic = RELICS[0];
    if (relic === undefined) {
      throw new Error("no relics");
    }
    expect(
      arrivalCard(news(granite, { kind: "reveal", relic })),
    ).toBeUndefined();
  });

  it("shows the first arrived layer's words", () => {
    expect(arrivalCard(news(granite, band("crystal"), rails))).toEqual({
      kind: "layer",
      band: "granite",
      words: layerCardWords("granite"),
    });
  });

  it("shows craft done only with no layer to tell", () => {
    const done = {
      kind: "craft",
      recipe: "iron-rails",
      line: craftLine(fitted("iron-rails")),
    };
    expect(arrivalCard(news(rails))).toEqual(done);
    expect(arrivalCard(news(band("topsoil"), rails))).toEqual(done);
  });

  it("is undefined when neither", () => {
    expect(arrivalCard(plain)).toBeUndefined();
  });
});
