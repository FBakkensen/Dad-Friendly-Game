import { describe, expect, it } from "vitest";
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import {
  legendStats,
  relicNote,
  relicsKick,
  shelfKeepsakes,
  shelfRowView,
} from "./relic-rows";
import { RELICS, type Relic, type RelicId } from "./relics";
import { minedMountain } from "./test-fixtures";

const relic = (id: RelicId): Relic => {
  const found = RELICS.find((each) => each.id === id);
  if (found === undefined) {
    throw new Error(`no relic ${id}`);
  }
  return found;
};

/** A mountain dug just past a relic's depth: that relic and every one above it found. */
const pastRelic = (id: RelicId): Mountain => minedMountain(relic(id).depth);

describe("shelfRowView: one relic on the shelf (#465)", () => {
  it("a found relic lights green with its virtue and power, and opens its detail", () => {
    const lantern = relic("lantern");
    const view = shelfRowView(pastRelic("lantern"), lantern);
    expect(view.name).toBe("Lantern of Guidance");
    expect(view.info[0]).toBe(
      `The virtue of Guidance. Your power: ${lantern.boost}`,
    );
    expect(view.info[1]).toBe(`Your power: ${lantern.boost}`);
    expect(view.lamp).toBe("green");
    expect(view.state).toBe("found");
    expect(view.can).toBe(true);
    expect(view.aria).toBe("Lantern of Guidance: see your power");
  });

  it("the guided next relic is amber with its tease and today's vague hint", () => {
    const mountain = pastRelic("lantern");
    const view = shelfRowView(mountain, relic("shield"));
    expect(view.info).toEqual([relic("shield").tease]);
    expect(view.why).toMatch(/^Next · /);
    expect(view.lamp).toBe("amber");
    expect(view.state).toBe("locked");
    expect(view.can).toBe(false);
    expect(view.aria).toBe(
      `Shield of Protection. ${relic("shield").tease} ${view.why}`,
    );
  });

  it("a relic further down is dark and quiet: its tease, no hint", () => {
    const view = shelfRowView(pastRelic("lantern"), relic("crown"));
    expect(view.info).toEqual([relic("crown").tease]);
    expect(view.why).toBe("");
    expect(view.lamp).toBe("off");
    expect(view.can).toBe(false);
  });

  it("before the Lantern, the next relic has no hint: the dig is not guided yet", () => {
    const view = shelfRowView(minedMountain(0), relic("lantern"));
    expect(view.why).toBe("");
    expect(view.lamp).toBe("amber");
  });

  it("shows no price, gain or verb: the shelf buys nothing", () => {
    const view = shelfRowView(pastRelic("hammer"), relic("hammer"));
    expect([view.price, view.gain, view.verb, view.need, view.badge]).toEqual([
      "",
      "",
      "",
      "",
      "",
    ]);
  });
});

describe("relicNote: the socket note's words, the shelf's too", () => {
  it("reads the virtue and power once found, the tease before", () => {
    const mountain = pastRelic("lantern");
    expect(relicNote(mountain, relic("lantern")).line).toBe(
      `The virtue of Guidance. Your power: ${relic("lantern").boost}`,
    );
    expect(relicNote(mountain, relic("crown")).line).toBe(
      relic("crown").tease,
    );
    expect(relicNote(mountain, relic("crown")).hint).toBeUndefined();
  });
});

describe("relicsKick: the drawer's resting kick", () => {
  it("counts the relics found, in the sockets' words", () => {
    expect(relicsKick(minedMountain(0))).toBe("0 of 6 found");
    expect(relicsKick(pastRelic("hammer"))).toBe("3 of 6 found");
    expect(relicsKick(minedMountain(MOUNTAIN_STONES))).toBe("6 of 6 found");
  });
});

describe("shelfKeepsakes: the keepsakes on a found relic's detail", () => {
  it("lists the found ones in the shelf's order, and none for no finds", () => {
    expect(shelfKeepsakes(minedMountain(0))).toEqual([]);
    expect(
      shelfKeepsakes({
        ...minedMountain(0),
        finds: ["ribbon", "drawing", "boots"],
      } as Mountain),
    ).toEqual(["drawing", "ribbon"]);
  });
});

describe("legendStats: the finale's one line", () => {
  it("names the stones moved and the crew beside you", () => {
    const mountain = {
      ...minedMountain(MOUNTAIN_STONES),
      helpers: 3,
    } as Mountain;
    expect(legendStats(mountain)).toMatch(
      /^[\d,.]+ stones moved\. Six relics found\. A crew of \d[\d,]* beside you\.$/,
    );
  });
});
