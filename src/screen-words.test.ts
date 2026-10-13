import { describe, expect, it } from "vitest";
import { KEEPSAKES } from "./expeditions";
import { LOST_TOOLS } from "./lost-tools";
import { JOURNEYMAN_TRIPS, MASTER_TRIPS, type Engineer } from "./engineers";
import { glimmerText } from "./expeditions";
import { RELICS } from "./relics";
import {
  BROUGHT_HOME,
  ENGINEER_STATIONS,
  FOUND_LABEL,
  KEEPSAKES_TITLE,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  keepsakeWords,
  lostToolWords,
  cameBack,
  expeditionChip,
  postWords,
  promoteConfirm,
  promotePriceWords,
  rankHint,
  rankLabel,
  recallConfirm,
  tendingEngineer,
  tendingWords,
  tendsNote,
  tunnelLock,
  tunnelOffer,
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

  it("describes a post and a tending bonus without a percent", () => {
    expect(postWords("camp")).toBe("At camp");
    expect(postWords("tunnel")).toBe("Away in a tunnel");
    expect(postWords("cart")).toBe("Tending the carts");
    expect(postWords("drill")).toBe("Tending the drills");
    expect(postWords("borer")).toBe("Tending the borers");
    expect(postWords("machine")).toBe("Tending the Great Machine");

    expect(tendingWords(ada({ post: "camp" }))).toBeUndefined();
    expect(tendingWords(ada({ post: "tunnel" }))).toBeUndefined();
    expect(tendingWords(ada({ post: "borer" }))).toBe(
      "Your borers hum a little faster while Ada tends them.",
    );
    expect(tendingWords(ada({ name: "Nils", post: "cart" }))).toBe(
      "Your carts hum a little faster while Nils tends them.",
    );
    expect(tendingWords(ada({ name: "Ruth", post: "drill" }))).toBe(
      "Your drills hum a little faster while Ruth tends them.",
    );
    expect(tendingWords(ada({ name: "Mae", post: "machine" }))).toBe(
      "The Great Machine hums a little faster while Mae tends it.",
    );
    for (const post of ["cart", "drill", "borer", "machine"] as const) {
      expect(tendingWords(ada({ post }))).not.toMatch(/%|\d/);
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

  it("prices a promotion and confirms in a full sentence", () => {
    expect(promotePriceWords(2_000_000)).toBe(
      "Promote a worker for 2 million stones",
    );
    expect(promoteConfirm("Nils")).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    expect(PROMOTE_NEEDS_WORKER).not.toMatch(/\d|\?/);
    expect(PROMOTE_CREW_FULL).not.toMatch(/\d|\?/);
    expect(
      ENGINEER_STATIONS.map((station) => station.label).join(" "),
    ).not.toMatch(/\d|\?/);
  });

  it("offers three tunnels in words, and keeps an Apprentice out of the deep dark", () => {
    expect(tunnelOffer("side-seam")).toBe("A quick look down a side seam");
    expect(tunnelOffer("old-shaft")).toBe("About an hour in the old shaft");
    expect(tunnelOffer("deep-dark")).toBe("A long night in the deep dark");
    expect(tunnelLock(0, "side-seam")).toBeUndefined();
    expect(tunnelLock(0, "old-shaft")).toBeUndefined();
    expect(tunnelLock(0, "deep-dark")).toBe(
      "The deep dark waits for a Journeyman.",
    );
    expect(tunnelLock(1, "deep-dark")).toBeUndefined();
    expect(tunnelLock(2, "deep-dark")).toBeUndefined();
    for (const id of ["side-seam", "old-shaft", "deep-dark"] as const) {
      expect(tunnelOffer(id)).not.toMatch(/\d|\?/);
    }
    expect(tunnelLock(0, "deep-dark")).not.toMatch(/\d|\?/);
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
});
