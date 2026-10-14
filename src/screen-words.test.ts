import { describe, expect, it } from "vitest";
import { KEEPSAKES } from "./expeditions";
import { LOST_TOOLS } from "./lost-tools";
import { JOURNEYMAN_TRIPS, MASTER_TRIPS, type Engineer } from "./engineers";
import { glimmerText } from "./expeditions";
import { RELICS } from "./relics";
import {
  BROUGHT_HOME,
  FOUND_LABEL,
  KEEPSAKES_TITLE,
  PROMOTE_BUTTON,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  PROMOTE_TITLE,
  PROMOTE_WHY,
  BENCH_BUSY,
  BENCH_BUSY_ASIDE,
  BENCH_FREE,
  BENCH_FREE_ASIDE,
  CRAFT_DONE,
  CRAFT_DONE_BUTTON,
  LAYER_ADVICE,
  LAYER_ARRIVAL,
  LAYER_DIG,
  LAYER_EVOCATIVE,
  MOCK_MATERIALS,
  MOCK_MATERIAL_LINE,
  MOCK_RECIPES,
  RECIPE_ON_BENCH,
  needMoreWords,
  RECIPE_WAITING,
  UNFOUND_DEEPER,
  UNFOUND_HINT,
  WORKSHOP_EARLIER,
  WORKSHOP_FREE_ASIDE,
  WORKSHOP_LOCKED,
  WORKSHOP_MORE,
  WORKSHOP_QUIET,
  WORKSHOP_SOUND,
  WORKSHOP_TITLE,
  broughtHomeNames,
  broughtHomeToast,
  benchBusyWords,
  craftPriceWords,
  WORKSHOP_BENCH_BUSY,
  WORKSHOP_CANCEL_CONFIRM,
  craftLevelWords,
  craftTimeWords,
  formatCraftSpeed,
  stoneCostWords,
  materialCostWords,
  materialCountWords,
  refundBackWords,
  timerLeftWords,
  workshopMenuWords,
  keepsakeWords,
  keepsakesBroughtHome,
  lostToolWords,
  cameBack,
  callBackLabel,
  dutyLine,
  dutySentence,
  expeditionChip,
  exploreAside,
  exploreBenefit,
  exploreCheer,
  exploreTitle,
  homeCheer,
  boostOutcome,
  promoteCheer,
  promoteConfirm,
  promoteNeeds,
  buyPriceWords,
  promoteOffer,
  stonesPerSecond,
  rankHint,
  rankLabel,
  recallConfirm,
  stationCheer,
  tendBenefit,
  tendTitle,
  tendingEngineer,
  tendsNote,
  tripDetail,
  tripTitle,
  tunnelLock,
} from "./screen-words";

const ada = (patch: Partial<Engineer> = {}): Engineer => ({
  name: "Ada",
  rank: 0,
  trips: 0,
  post: "borer",
  ...patch,
});

describe("engineer words", () => {
  it("names a rank with lamps' words, never a digit", () => {
    expect(rankLabel(0)).toBe("Apprentice");
    expect(rankLabel(1)).toBe("Journeyman");
    expect(rankLabel(2)).toBe("Master engineer");
    expect(
      Object.values({ a: rankLabel(0), b: rankLabel(1), c: rankLabel(2) }).join(
        " ",
      ),
    ).not.toMatch(/\d/);
  });

  it("says nearly a rank only one expedition away", () => {
    expect(rankHint(ada({ rank: 0, trips: 0 }))).toBeUndefined();
    expect(
      rankHint(ada({ rank: 0, trips: JOURNEYMAN_TRIPS - 2 })),
    ).toBeUndefined();
    expect(rankHint(ada({ rank: 0, trips: JOURNEYMAN_TRIPS - 1 }))).toBe(
      "nearly a Journeyman",
    );
    expect(rankHint(ada({ rank: 1, trips: JOURNEYMAN_TRIPS }))).toBeUndefined();
    expect(rankHint(ada({ rank: 1, trips: MASTER_TRIPS - 2 }))).toBeUndefined();
    expect(rankHint(ada({ rank: 1, trips: MASTER_TRIPS - 1 }))).toBe(
      "nearly a Master",
    );
    expect(rankHint(ada({ rank: 2, trips: MASTER_TRIPS }))).toBeUndefined();
  });

  it("names the tending gain in stones a second", () => {
    expect(stonesPerSecond(800)).toBe("+800 stones/sec");
    expect(stonesPerSecond(1_200)).toBe("+1,200 stones/sec");
    expect(stonesPerSecond(12_400)).toBe("+12.4K stones/sec");
    expect(stonesPerSecond(3_400_000)).toBe("+3.4M stones/sec");
    expect(stonesPerSecond(0)).toBe("+0 stones/sec");
    expect(dutySentence(ada({ post: "borer" }), "+35 stones/sec")).toBe(
      "Ada is tending the borers: +35 stones/sec.",
    );
    expect(
      dutySentence(ada({ name: "Mae", post: "machine" }), "+3.4M stones/sec"),
    ).toBe("Mae is tending the Great Machine: +3.4M stones/sec.");
    expect(dutySentence(ada({ name: "Nils", post: "cart" }))).toBe(
      "Nils is tending the carts: +0 stones/sec.",
    );
    expect(
      dutySentence(ada({ name: "Ruth", post: "drill" }), "+6 stones/sec"),
    ).toBe("Ruth is tending the drills: +6 stones/sec.");
    expect(dutySentence(ada({ name: "Otto", post: "camp" }))).toBe(
      "Otto is resting at camp. Give him a job below.",
    );
    expect(dutySentence(ada({ name: "Ruth", post: "tunnel" }))).toBe(
      "Ruth is out exploring.",
    );
    expect(dutySentence(ada({ post: "camp" }))).not.toMatch(/\d|\?/);
    expect(dutySentence(ada({ post: "tunnel" }))).not.toMatch(/\d|\?/);
  });

  it("collapses a card to one line, and counts an expedition in words", () => {
    expect(dutyLine(ada({ post: "camp" }))).toBe("Resting at camp");
    expect(dutyLine(ada({ post: "cart" }))).toBe("Tending the carts");
    expect(dutyLine(ada({ post: "drill" }))).toBe("Tending the drills");
    expect(dutyLine(ada({ post: "borer" }))).toBe("Tending the borers");
    expect(dutyLine(ada({ post: "machine" }))).toBe(
      "Tending the Great Machine",
    );
    expect(dutyLine(ada({ post: "tunnel" }))).toBe("Exploring a tunnel");
    const hour = 60 * 60_000;
    expect(
      dutyLine(ada({ post: "tunnel" }), {
        tunnel: "old-shaft",
        leftMs: hour,
      }),
    ).toBe("Exploring the old shaft · gone about an hour");
    expect(
      dutyLine(ada({ post: "tunnel" }), {
        tunnel: "side-seam",
        leftMs: 10 * 60_000,
      }),
    ).toBe("Exploring a side seam · gone a little while");
    expect(
      dutyLine(ada({ post: "tunnel" }), {
        tunnel: "deep-dark",
        leftMs: 4 * hour,
      }),
    ).toBe("Exploring the deep dark · gone a long night");
    expect(
      dutyLine(ada({ post: "tunnel" }), { tunnel: "side-seam", leftMs: 0 }),
    ).toBe("Exploring a side seam · back soon");
    expect(
      dutyLine(ada({ post: "tunnel" }), {
        tunnel: "old-shaft",
        leftMs: hour,
      }),
    ).not.toMatch(/\d|\?/);
  });

  it("names each tend choice and the trouble that hand fixes", () => {
    expect(tendTitle("borer", true)).toBe("The borers · here now");
    expect(tendTitle("borer", false)).toBe("The borers");
    expect(tendTitle("camp", false)).toBe("Rest at camp");
    expect(tendBenefit("cart", "Ada")).toBe(
      "They roll faster, and she shores up cave-ins herself.",
    );
    expect(tendBenefit("drill", "Nils")).toBe(
      "They bite deeper, and he pumps out floods himself.",
    );
    expect(tendBenefit("borer", "Ruth")).toBe(
      "They dig faster, and she clears any jam herself.",
    );
    expect(tendBenefit("machine", "Otto")).toBe(
      "It runs with far fewer workers, and he clears any jam himself.",
    );
    expect(tendBenefit("camp", "Mae")).toBe(
      "Rests by the fire, ready for the next job.",
    );
    expect(tendBenefit("borer", "Ruth", "+35 stones/sec")).toBe(
      "+35 stones/sec. They dig faster, and she clears any jam herself.",
    );
    expect(stationCheer("Ada", "drill", "+6 stones/sec")).toBe(
      "Ada heads to the drills! +6 stones/sec",
    );
    expect(stationCheer("Ada", "cart")).toBe("Ada heads to the carts!");
    expect(stationCheer("Ada", "borer")).toBe("Ada heads to the borers!");
    expect(stationCheer("Ada", "machine", "+3.4K stones/sec")).toBe(
      "Ada heads to the Great Machine! +3.4K stones/sec",
    );
    expect(stationCheer("Nils", "camp", "+9 stones/sec")).toBe(
      "Nils puts the kettle on at camp.",
    );
    for (const post of ["cart", "drill", "borer", "machine"] as const) {
      expect(tendBenefit(post, "Ada")).not.toMatch(/\d|\?/);
    }
    expect(tendBenefit("camp", "Ada", "+1 stones/sec")).not.toMatch(/\d|\?/);
  });

  it("offers three tunnels, and keeps the deep dark for a Journeyman", () => {
    expect(exploreTitle("side-seam")).toBe("Quick look");
    expect(exploreTitle("old-shaft")).toBe("Old shaft");
    expect(exploreTitle("deep-dark")).toBe("The deep dark");
    expect(exploreBenefit("side-seam")).toBe(
      "Back in a few minutes with a small find.",
    );
    expect(exploreBenefit("old-shaft")).toBe(
      "About an hour, often a lost tool or keepsake.",
    );
    expect(exploreBenefit("deep-dark")).toBe(
      "All night, the best chance of a relic hint or a new engineer.",
    );
    expect(exploreAside("Ada", "borer")).toBe(
      "While she explores, her machine works without her.",
    );
    expect(exploreAside("Otto", "drill")).toBe(
      "While he explores, his machine works without him.",
    );
    expect(exploreAside("Nils", "camp")).toBe(
      "No machine slows while he explores.",
    );
    expect(exploreCheer("Ada")).toBe("Ada lights a lamp and heads in!");
    expect(tunnelLock(0, "side-seam")).toBeUndefined();
    expect(tunnelLock(0, "old-shaft")).toBeUndefined();
    expect(tunnelLock(0, "deep-dark")).toBe(
      "The deep dark waits for a Journeyman.",
    );
    expect(tunnelLock(1, "deep-dark")).toBeUndefined();
    expect(tunnelLock(2, "deep-dark")).toBeUndefined();
    expect(callBackLabel("Ada")).toBe("Call her back");
    expect(callBackLabel("Nils")).toBe("Call him back");
    expect(tripTitle("Ada", "old-shaft")).toBe(
      "Ada is exploring the old shaft.",
    );
    expect(tripDetail("Ada", 60 * 60_000)).toBe(
      "Ada will be gone about an hour. She'll bring home whatever is found.",
    );
    expect(tripDetail("Otto", 4 * 60 * 60_000)).toBe(
      "Otto will be gone a long night. He'll bring home whatever is found.",
    );
    expect(homeCheer("Ada")).toBe("Ada is home, empty-handed.");
    for (const id of ["side-seam", "old-shaft", "deep-dark"] as const) {
      expect(`${exploreTitle(id)} ${exploreBenefit(id)}`).not.toMatch(/\d|\?/);
    }
  });

  it("picks the highest rank tending a tier", () => {
    const nils = ada({ name: "Nils", rank: 1, trips: 3, post: "borer" });
    const otto = ada({ name: "Otto", rank: 2, trips: 9, post: "borer" });
    expect(tendingEngineer(undefined, "borer")).toBeUndefined();
    expect(tendingEngineer([ada()], "cart")).toBeUndefined();
    expect(tendingEngineer([ada(), nils], "borer")).toBe(nils);
    expect(tendingEngineer([nils, otto], "borer")).toBe(otto);
    expect(tendingEngineer([ada(), ada({ name: "Mae" })], "borer")?.name).toBe(
      "Ada",
    );
    expect(tendsNote("Ada", "borer")).toBe("Ada tends them.");
    expect(tendsNote("Ada", "machine")).toBe("Ada tends it.");
  });

  it("shows the promotion price, and confirms in a full sentence", () => {
    expect(PROMOTE_TITLE).toBe("Promote a worker");
    expect(PROMOTE_WHY).toBe(
      "A new engineer can tend another machine or explore while the others work.",
    );
    expect(PROMOTE_BUTTON).toBe("Promote");
    expect(buyPriceWords(117_700)).toBe("Buy · 117.7K");
    expect(buyPriceWords(46_000)).toBe("Buy · 46K");
    expect(promoteOffer(2_000_000)).toBe("Promote: 2M stones");
    expect(promoteNeeds(2_000_000)).toBe("Needs 2M stones");
    expect(promoteOffer(1_000_000)).toBe("Promote: 1M stones");
    expect(promoteNeeds(16_000_000)).toBe("Needs 16M stones");
    expect(promoteConfirm("Nils")).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    expect(promoteCheer("Ruth")).toBe("Ruth steps up. The crew cheers.");
    expect(
      `${PROMOTE_WHY} ${PROMOTE_NEEDS_WORKER} ${PROMOTE_CREW_FULL} ${promoteConfirm("Nils")}`,
    ).not.toMatch(/\d|\?/);
  });

  it("states a boost's output in stones", () => {
    expect(
      boostOutcome(
        "sharper",
        "Taps mine ×2 for 10 minutes.",
        2,
        { tapYield: 4, crewPerSecond: 10 },
        false,
      ),
    ).toBe("Taps mine ×2 for 10 minutes. 8 a tap.");
    expect(
      boostOutcome(
        "sharper",
        "Taps mine ×2 for 10 minutes.",
        2,
        { tapYield: 8, crewPerSecond: 10 },
        true,
      ),
    ).toBe("Taps mine ×2 for 10 minutes. 8 a tap.");
    expect(
      boostOutcome(
        "overtime",
        "Your crew mines ×2 for 30 minutes while you play.",
        2,
        { tapYield: 1, crewPerSecond: 400 },
        false,
      ),
    ).toBe("Your crew mines ×2 for 30 minutes while you play. 800/s.");
    expect(
      boostOutcome(
        "overtime",
        "Your crew mines ×2 for 30 minutes while you play.",
        2,
        { tapYield: 1, crewPerSecond: 800 },
        true,
      ),
    ).toBe("Your crew mines ×2 for 30 minutes while you play. 800/s.");
  });

  it("counts an expedition down in words, never a clock", () => {
    const hour = 60 * 60_000;
    expect(expeditionChip("Ada", 4 * hour)).toBe(
      "Ada will be gone a long night.",
    );
    expect(expeditionChip("Ada", 90 * 60_000 + 1)).toBe(
      "Ada will be gone a long night.",
    );
    expect(expeditionChip("Ada", 90 * 60_000)).toBe(
      "Ada will be gone about an hour.",
    );
    expect(expeditionChip("Nils", hour)).toBe(
      "Nils will be gone about an hour.",
    );
    expect(expeditionChip("Ada", 20 * 60_000 + 1)).toBe(
      "Ada will be gone about an hour.",
    );
    expect(expeditionChip("Ada", 20 * 60_000)).toBe(
      "Ada will be gone a little while.",
    );
    expect(expeditionChip("Ada", 10 * 60_000)).toBe(
      "Ada will be gone a little while.",
    );
    expect(expeditionChip("Ada", 2 * 60_000 + 1)).toBe(
      "Ada will be gone a little while.",
    );
    expect(expeditionChip("Ruth", 2 * 60_000)).toBe("Ruth will be back soon.");
    expect(expeditionChip("Ada", 0)).toBe("Ada will be back soon.");
    expect(expeditionChip("Ada", -1)).toBe("Ada will be back soon.");
    expect(expeditionChip("Ada", 4 * hour)).not.toMatch(/\d|\?/);
  });

  it("says who came back and names the find, with no numbers", () => {
    expect(cameBack("Ada", "old-shaft", { kind: "tool", id: "pick" })).toBe(
      "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
    );
    expect(cameBack("Ada", "side-seam", { kind: "tool", id: "lamp" })).toBe(
      "Ada came back from a side seam with an old miner's lamp. Golden veins linger.",
    );
    expect(cameBack("Nils", "deep-dark", { kind: "tool", id: "map" })).toBe(
      "Nils came back from the deep dark with a worn map. Trips come home sooner.",
    );
    expect(cameBack("Ruth", "old-shaft", { kind: "tool", id: "boots" })).toBe(
      "Ruth came back from the old shaft with steel-toe boots. Fewer troubles at the machines.",
    );
    expect(
      cameBack("Ada", "side-seam", { kind: "keepsake", id: "drawing" }),
    ).toBe(
      "Ada came back from a side seam with a child's drawing. It waits on the relic shelf.",
    );
    expect(
      cameBack("Ada", "side-seam", { kind: "keepsake", id: "watch" }),
    ).toBe(
      "Ada came back from a side seam with a pocket watch. It waits on the relic shelf.",
    );
    expect(
      cameBack("Ada", "side-seam", { kind: "keepsake", id: "whistle" }),
    ).toBe(
      "Ada came back from a side seam with a carved whistle. It waits on the relic shelf.",
    );
    expect(
      cameBack("Ada", "side-seam", { kind: "keepsake", id: "pebble" }),
    ).toBe(
      "Ada came back from a side seam with a smooth pebble. It waits on the relic shelf.",
    );
    expect(
      cameBack("Ada", "side-seam", { kind: "keepsake", id: "ribbon" }),
    ).toBe(
      "Ada came back from a side seam with a faded ribbon. It waits on the relic shelf.",
    );
    expect(
      cameBack("Ada", "deep-dark", {
        kind: "engineer",
        name: "Mae",
        joined: true,
      }),
    ).toBe("Ada came back from the deep dark with Mae, who joined the crew.");
    expect(
      cameBack("Ada", "deep-dark", {
        kind: "engineer",
        name: "Mae",
        joined: false,
      }),
    ).toBe(
      "Ada came back from the deep dark. The lost engineer had already found a place.",
    );
    expect(
      cameBack("Ada", "old-shaft", {
        kind: "quiet",
        text: "The tunnel was quiet, and they came home safe.",
      }),
    ).toBe(
      "Ada came back from the old shaft. The tunnel was quiet, and they came home safe.",
    );
    for (const relic of RELICS) {
      const text = glimmerText(relic.id);
      const line = cameBack("Ada", "old-shaft", {
        kind: "glimmer",
        relic: relic.id,
        text,
      });
      expect(line).toBe(`Ada came back from the old shaft. ${text}`);
      expect(line).not.toMatch(/\d|\?/);
    }
    expect(recallConfirm("Ada")).toBe("Ada comes home empty-handed.");
    expect(recallConfirm("Ada")).not.toMatch(/\d|\?/);
  });
});

describe("lost tools and keepsakes (#148)", () => {
  it("gives every tool and keepsake a warm line with no number and no question mark", () => {
    expect(FOUND_LABEL).toBe("Found");
    expect(BROUGHT_HOME).toBe("Brought home");
    expect(KEEPSAKES_TITLE).toBe("Keepsakes");
    for (const id of LOST_TOOLS) {
      const words = lostToolWords(id);
      expect(words.name.length).toBeGreaterThan(0);
      expect(words.line.length).toBeGreaterThan(0);
      expect(`${words.name} ${words.line}`).not.toMatch(/[0-9?]/);
    }
    for (const id of KEEPSAKES) {
      const words = keepsakeWords(id);
      expect(words.name.length).toBeGreaterThan(0);
      expect(words.story.length).toBeGreaterThan(0);
      expect(`${words.name} ${words.story}`).not.toMatch(/[0-9?]/);
    }
  });

  it("reads keepsakes the engineers brought home, and skips lost tools", () => {
    expect(keepsakesBroughtHome(undefined)).toEqual([]);
    expect(keepsakesBroughtHome(["pick", "lamp"])).toEqual([]);
    expect(keepsakesBroughtHome(["pick", "drawing", "boots", "watch"])).toEqual(
      ["drawing", "watch"],
    );
    expect(broughtHomeNames(["drawing", "watch"])).toBe(
      "A child's drawing, A pocket watch",
    );
    expect(broughtHomeToast(["drawing"])).toBe(
      "A child's drawing. A little figure with a lamp, folded for a pocket.",
    );
    expect(broughtHomeToast(["pebble", "ribbon"])).toBe(
      "A smooth pebble. Warm from a hand that held it. A faded ribbon. Tied until the ends went soft.",
    );
    expect(broughtHomeToast([...KEEPSAKES])).not.toMatch(/[0-9?]/);
  });
});

describe("workshop mock copy (#193)", () => {
  it("shows real craft numbers and keeps unfound recipes vague", () => {
    expect(WORKSHOP_TITLE).toBe("Workshop");
    expect(BENCH_FREE).toBe("The bench is free");
    expect(BENCH_FREE_ASIDE).toBe("Pick something good for the crew.");
    expect(BENCH_BUSY).toBe("On the bench: Iron rails · 38 min left");
    expect(BENCH_BUSY_ASIDE).toBe("Your crew will feel this one.");
    expect(RECIPE_ON_BENCH).toBe("On the bench");
    expect(RECIPE_WAITING).toBe("Waiting its turn");
    expect(craftPriceWords(4_200_000)).toBe("Craft · 4.2M");
    expect(craftPriceWords(1_800_000)).toBe("Craft · 1.8M");
    expect(craftPriceWords(800_000)).toBe("Craft · 800K");
    expect(needMoreWords(5, "iron")).toBe("Need 5 more iron");
    expect(needMoreWords(12 - 7, "iron")).toBe("Need 5 more iron");
    expect(LAYER_ARRIVAL).toBe("You broke into the Granite!");
    expect(LAYER_EVOCATIVE).toBe("The grey rock rings under every pick.");
    expect(LAYER_ADVICE).toBe("Tough on carts. Drills love it.");
    expect(LAYER_DIG).toBe("Dig on");
    expect(CRAFT_DONE).toBe("Your Iron rails are fitted. Carts now 12/s.");
    expect(CRAFT_DONE_BUTTON).toBe("The crew feels it");
    expect(MOCK_MATERIAL_LINE).toBe("Clay 42 · Iron 7");
    expect(MOCK_MATERIALS.map((item) => item.text).join(" · ")).toBe(
      MOCK_MATERIAL_LINE,
    );

    expect(UNFOUND_HINT).not.toMatch(/[0-9?]/);
    expect(UNFOUND_HINT.toLowerCase()).not.toMatch(
      /diamond|crystal|heartstone|lamp|kit|\brails\b|\bprops\b/,
    );

    const spoken = [
      WORKSHOP_TITLE,
      BENCH_FREE,
      BENCH_FREE_ASIDE,
      BENCH_BUSY,
      BENCH_BUSY_ASIDE,
      RECIPE_ON_BENCH,
      RECIPE_WAITING,
      LAYER_ARRIVAL,
      LAYER_EVOCATIVE,
      LAYER_ADVICE,
      LAYER_DIG,
      CRAFT_DONE,
      CRAFT_DONE_BUTTON,
      UNFOUND_HINT,
      MOCK_MATERIAL_LINE,
      ...MOCK_RECIPES.flatMap((recipe) => [
        recipe.name,
        recipe.effect,
        recipe.time,
        craftPriceWords(recipe.stones),
        ...recipe.materials.map((material) => material.text),
      ]),
    ].join("\n");
    expect(spoken).not.toMatch(/\?/);
    expect(CRAFT_DONE).toMatch(/12\/s/);
    expect(BENCH_BUSY).toMatch(/38 min/);
    for (const recipe of MOCK_RECIPES) {
      expect(recipe.effect).toMatch(/\d/);
      expect(
        recipe.materials.map((material) => material.text).join(" "),
      ).toMatch(/\d/);
      expect(craftPriceWords(recipe.stones)).toMatch(/\d/);
    }
  });
});

describe("workshop sheet copy (#199)", () => {
  it("states costs, clocks, and a calm refund", () => {
    expect(workshopMenuWords(undefined)).toBe("Workshop");
    expect(workshopMenuWords(9 * 60_000)).toBe("Workshop · 9:00");
    expect(benchBusyWords("Iron rails", 8 * 60_000 + 12_000)).toBe(
      "On the bench: Iron rails · 8:12 left",
    );
    expect(benchBusyWords("Iron rails", 0)).toBe(
      "On the bench: Iron rails · ready",
    );
    expect(timerLeftWords("Axle grease", 18 * 60_000 + 40_000)).toBe(
      "Axle grease · 18:40 left",
    );
    expect(craftTimeWords(10 * 60_000)).toBe("10 min");
    expect(craftTimeWords(60 * 60_000)).toBe("1 h");
    expect(craftTimeWords(4 * 60 * 60_000)).toBe("4 h");
    expect(craftTimeWords(3 * 60 * 60_000 + 12 * 60_000)).toBe("3 h 12 min");
    expect(formatCraftSpeed(8.5)).toBe("8.5");
    expect(formatCraftSpeed(10.625)).toBe("10.6");
    expect(formatCraftSpeed(10.66)).toBe("10.7");
    expect(formatCraftSpeed(3500)).toBe("3,500");
    expect(formatCraftSpeed(12_000)).toBe("12K");
    expect(timerLeftWords("Axle grease", -1)).toBe("Axle grease · 0:00 left");
    expect(formatCraftSpeed(-2)).toBe("0");
    expect(materialCountWords("iron", 2)).toBe("Iron 2");
    expect(materialCostWords(4, "heartstone")).toBe("4 heartstone");
    expect(stoneCostWords(500_000)).toBe("500K stones");
    expect(craftLevelWords(1, 2)).toBe("Level 1 of 2");
    expect(WORKSHOP_BENCH_BUSY).toBe("Bench busy");
    expect(WORKSHOP_CANCEL_CONFIRM).toBe("Tap again to cancel");
    expect(refundBackWords([])).toBe("Cancel · nothing comes back");
    expect(refundBackWords(["1 iron"])).toBe("Cancel · 1 iron back");
    expect(refundBackWords(["75K stones", "3 clay"])).toBe(
      "Cancel · 75K stones and 3 clay back",
    );
    expect(refundBackWords(["250K stones", "10 clay", "4 iron"])).toBe(
      "Cancel · 250K stones, 10 clay, and 4 iron back",
    );
    const lines = [
      WORKSHOP_LOCKED,
      WORKSHOP_FREE_ASIDE,
      WORKSHOP_QUIET,
      WORKSHOP_SOUND,
      WORKSHOP_EARLIER,
      WORKSHOP_MORE,
      UNFOUND_DEEPER,
      WORKSHOP_BENCH_BUSY,
      WORKSHOP_CANCEL_CONFIRM,
      craftLevelWords(1, 5),
      stoneCostWords(1),
      workshopMenuWords(60_000),
      benchBusyWords("Axle grease", 60_000),
      refundBackWords(["1 iron"]),
      refundBackWords([]),
    ].join("\n");
    expect(lines).not.toMatch(/\?/);
    expect(UNFOUND_DEEPER).not.toMatch(/[0-9?]/);
    expect(WORKSHOP_FREE_ASIDE.toLowerCase()).toMatch(/little/);
  });
});
