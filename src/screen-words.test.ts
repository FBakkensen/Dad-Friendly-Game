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
  PROMOTE_SHORT_POCKET,
  PROMOTE_TITLE,
  PROMOTE_WHY,
  broughtHomeNames,
  broughtHomeToast,
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
  promoteCheer,
  promoteConfirm,
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

  it("says what they are doing, faster by rank, with no numbers", () => {
    expect(dutySentence(ada({ rank: 0, post: "borer" }))).toBe(
      "Ada is tending the borers, they dig a bit faster and she fixes trouble there herself.",
    );
    expect(dutySentence(ada({ rank: 1, post: "borer" }))).toBe(
      "Ada is tending the borers, they dig quite a bit faster and she fixes trouble there herself.",
    );
    expect(dutySentence(ada({ rank: 2, post: "drill" }))).toBe(
      "Ada is tending the drills, they dig much faster and she fixes trouble there herself.",
    );
    expect(dutySentence(ada({ name: "Nils", post: "cart" }))).toBe(
      "Nils is tending the carts, they dig a bit faster and he fixes trouble there himself.",
    );
    expect(dutySentence(ada({ name: "Mae", rank: 1, post: "machine" }))).toBe(
      "Mae is tending the Great Machine, it digs quite a bit faster and she fixes trouble there herself.",
    );
    expect(dutySentence(ada({ name: "Otto", post: "camp" }))).toBe(
      "Otto is resting at camp. Give him a job below.",
    );
    expect(dutySentence(ada({ name: "Ruth", post: "tunnel" }))).toBe(
      "Ruth is out exploring.",
    );
    for (const post of ["cart", "drill", "borer", "machine", "camp"] as const) {
      expect(dutySentence(ada({ post }))).not.toMatch(/\d|\?|%/);
    }
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
    expect(stationCheer("Ada", "drill")).toBe("Ada heads to the drills!");
    expect(stationCheer("Ada", "cart")).toBe("Ada heads to the carts!");
    expect(stationCheer("Ada", "borer")).toBe("Ada heads to the borers!");
    expect(stationCheer("Ada", "machine")).toBe(
      "Ada heads to the Great Machine!",
    );
    expect(stationCheer("Nils", "camp")).toBe(
      "Nils puts the kettle on at camp.",
    );
    for (const post of ["cart", "drill", "borer", "machine", "camp"] as const) {
      expect(tendBenefit(post, "Ada")).not.toMatch(/\d|\?/);
      expect(stationCheer("Ada", post)).not.toMatch(/\d|\?/);
    }
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

  it("explains a promotion without a price, and confirms in a full sentence", () => {
    expect(PROMOTE_TITLE).toBe("Promote a worker");
    expect(PROMOTE_WHY).toBe(
      "A new engineer can tend another machine or explore while the others work.",
    );
    expect(PROMOTE_BUTTON).toBe("Promote");
    expect(PROMOTE_SHORT_POCKET).toBe("The pocket is too light for that.");
    expect(promoteConfirm("Nils")).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    expect(promoteCheer("Ruth")).toBe("Ruth steps up. The crew cheers.");
    expect(
      `${PROMOTE_TITLE} ${PROMOTE_WHY} ${PROMOTE_BUTTON} ${PROMOTE_SHORT_POCKET} ${PROMOTE_NEEDS_WORKER} ${PROMOTE_CREW_FULL}`,
    ).not.toMatch(/\d|\?/);
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
