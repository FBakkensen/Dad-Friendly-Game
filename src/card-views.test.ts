import { describe, expect, it } from "vitest";
import { arrivalCard, welcomeNews, welcomeView } from "./card-views";
import type { Homecoming } from "./expeditions";
import { LAYERS, type Layer } from "./layers";
import type { AwayReport } from "./mountain";
import type { ProgressSnapshot } from "./progress-store";
import { RELICS } from "./relics";
import {
  AWAY_CHEER,
  CREW_GREW_TITLE,
  ENGINEER_WELCOME,
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
  away: undefined,
  crewJoined: undefined,
  engineerJoined: undefined,
  homecomings: [],
  layersArrived: [],
  craftsFitted: [],
  revealed: undefined,
} as unknown as ProgressSnapshot;

const snap = (over: Partial<ProgressSnapshot>): ProgressSnapshot => ({
  ...plain,
  ...over,
});

const report = (over: Partial<AwayReport> = {}): AwayReport => ({
  mined: 1_200_000,
  awayMs: HOUR,
  paidMs: HOUR,
  capped: false,
  heart: 1,
  materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
  ...over,
});

const home = (engineer: "Ada" | "Nils", text: string): Homecoming => ({
  engineer,
  tunnel: "side-seam",
  find: { kind: "quiet", text },
  sentAt: 0,
});

const band = (id: Layer["id"]): Layer => {
  const found = LAYERS.find((layer) => layer.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
};

const fitted = (id: "iron-rails" | "axle-grease", line: string) => ({
  id,
  level: 1,
  line,
});

describe("welcomeNews", () => {
  it("is false on a plain snapshot", () => {
    expect(welcomeNews(plain)).toBe(false);
  });

  it("is true for an away haul, the crew, the engineer and a homecoming", () => {
    expect(welcomeNews(snap({ away: report() }))).toBe(true);
    expect(welcomeNews(snap({ crewJoined: 2 }))).toBe(true);
    expect(welcomeNews(snap({ engineerJoined: true }))).toBe(true);
    expect(welcomeNews(snap({ homecomings: [home("Ada", "Quiet.")] }))).toBe(
      true,
    );
  });
});

describe("welcomeView", () => {
  it("is undefined with no news", () => {
    expect(
      welcomeView(snap({ layersArrived: [band("granite")] })),
    ).toBeUndefined();
  });

  it("follows today's title chain", () => {
    const title = (over: Partial<ProgressSnapshot>) =>
      welcomeView(snap(over))?.title;
    expect(title({ away: report(), crewJoined: 2 })).toBe(WELCOME_AWAY_TITLE);
    expect(title({ crewJoined: 2, engineerJoined: true })).toBe(
      CREW_GREW_TITLE,
    );
    expect(
      title({ engineerJoined: true, homecomings: [home("Ada", "Q.")] }),
    ).toBe(ENGINEER_WELCOME);
    expect(title({ homecomings: [home("Ada", "Q.")] })).toBe(
      WELCOME_HOME_TITLE,
    );
  });

  it("writes the haul in stones", () => {
    expect(
      welcomeView(snap({ away: report({ mined: 1 }) }))?.away?.mined,
    ).toEqual({ count: "+1", unit: "stone" });
    expect(welcomeView(snap({ away: report() }))?.away?.mined).toEqual({
      count: "+1.2 million",
      unit: "stones",
    });
  });

  it("says how long you were gone, with and without the Heart", () => {
    const gone = (heart: number) =>
      welcomeView(snap({ away: report({ heart }) }))?.away?.gone;
    expect(gone(1)).toBe(
      "You were gone 1 hour. Your crew kept digging the whole time.",
    );
    expect(gone(1.25)).toMatch(/The Heart of Patience made it ×1\.25\.$/);
    expect(gone(1.5)).toMatch(/The Heart of Patience made it ×1\.5\.$/);
    expect(welcomeView(snap({ away: report() }))?.away?.cheer).toBe(AWAY_CHEER);
  });

  it("names the crew alone, and under an away haul with the title's words", () => {
    const alone = welcomeView(snap({ crewJoined: 1 }));
    expect(alone?.crew).toBe("1 worker joined to run your machines.");
    expect(alone?.away).toBeUndefined();
    expect(welcomeView(snap({ crewJoined: 3, away: report() }))?.crew).toBe(
      "Your crew grew: 3 workers joined to run your machines.",
    );
    expect(welcomeView(snap({ away: report() }))?.crew).toBeUndefined();
  });

  it("speaks of the engineer only under an away or crew line", () => {
    expect(
      welcomeView(snap({ engineerJoined: true }))?.engineer,
    ).toBeUndefined();
    expect(
      welcomeView(snap({ engineerJoined: true, away: report() }))?.engineer,
    ).toBe(ENGINEER_WELCOME);
    expect(
      welcomeView(snap({ engineerJoined: true, crewJoined: 1 }))?.engineer,
    ).toBe(ENGINEER_WELCOME);
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
      snap({
        away: report(),
        layersArrived: [band("topsoil"), band("granite")],
        craftsFitted: [
          fitted("iron-rails", "Rails fitted."),
          fitted("axle-grease", "Grease fitted."),
        ],
      }),
    );
    expect(view?.layers).toEqual([layerWelcomeWords("granite")]);
    expect(view?.crafts).toEqual(["Rails fitted.", "Grease fitted."]);
  });

  it("names the first material the ore line names", () => {
    expect(
      welcomeView(snap({ away: report() }))?.away?.materials,
    ).toBeUndefined();
    const materials = { clay: 0, iron: 3, crystal: 2, heartstone: 0 };
    expect(
      welcomeView(snap({ away: report({ materials }) }))?.away?.materials,
    ).toEqual({ words: awayMaterialsWords(materials), first: "iron" });
  });
});

describe("arrivalCard", () => {
  const granite = { layersArrived: [band("granite")] };
  const rails = { craftsFitted: [fitted("iron-rails", "Rails fitted.")] };

  it("waits while the welcome has news or a relic is revealed", () => {
    expect(arrivalCard(snap({ ...granite, away: report() }))).toBeUndefined();
    expect(arrivalCard(snap({ ...granite, crewJoined: 1 }))).toBeUndefined();
    expect(
      arrivalCard(snap({ ...granite, revealed: RELICS[0] })),
    ).toBeUndefined();
  });

  it("shows the first arrived layer's words", () => {
    expect(
      arrivalCard(
        snap({ layersArrived: [band("granite"), band("crystal")], ...rails }),
      ),
    ).toEqual({
      kind: "layer",
      band: "granite",
      words: layerCardWords("granite"),
    });
  });

  it("shows craft done only with no layer to tell", () => {
    const craft = {
      kind: "craft",
      recipe: "iron-rails",
      line: "Rails fitted.",
    };
    expect(arrivalCard(snap(rails))).toEqual(craft);
    expect(
      arrivalCard(snap({ layersArrived: [band("topsoil")], ...rails })),
    ).toEqual(craft);
  });

  it("is undefined when neither", () => {
    expect(arrivalCard(plain)).toBeUndefined();
  });
});
