// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promoteCost } from "./engineers";
import { type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
} from "./mountain-screen.harness";
import { oneOffStretch } from "./scale";
import { promoteOffer } from "./screen-words";
import { writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The Promote button charges the price it showed (#367), beside the crew suite (which is at
 * its worker's heap limit).
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

describe("a promotion on screen", () => {
  const CLOCK = 1_700_000_000_000;

  it("a price that rose while the confirm sat open steps nobody up, and the button shows the new price", () => {
    // A stone short of the Granite, with a crew that digs it in the next breath. The
    // pocket covers either price, so only the shown price can stop the dearer promotion.
    const mountain: Mountain = {
      ...minedMountain(9_999_999),
      helpers: 20,
      carts: 2,
      drills: 1,
      borers: 1,
      pocket: 9_000_000,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen: CLOCK });
    let at = CLOCK;
    const screen = mountScreen({ storage, now: () => at });
    document.body.append(screen.root);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    if (sheet === null) throw new Error("no engineers sheet");
    const button = sheet.querySelector<HTMLButtonElement>(".engineer-promote");
    if (button === null) throw new Error("no Promote button");
    const before = screen.progress.getSnapshot().mountain;
    const shown = promoteCost(before);
    expect(button.textContent).toBe(promoteOffer(shown));

    button.click();
    // Two seconds on, unpainted, while the confirm sits open: Step up's settle crosses into
    // the Granite.
    at += 2_000;
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();

    const after = screen.progress.getSnapshot().mountain;
    expect(oneOffStretch(after)).toBeGreaterThan(oneOffStretch(before));
    expect(after.engineers).toHaveLength(1);
    expect(after.helpers).toBe(20);
    expect(after.pocket).toBeGreaterThanOrEqual(before.pocket);
    const dearer = promoteCost(after);
    expect(dearer).toBeGreaterThan(shown);
    expect(after.pocket).toBeGreaterThanOrEqual(dearer);
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe(promoteOffer(dearer));

    // Stepped up again at the price now on the button, Nils joins at that price.
    const pocket = after.pocket;
    button.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    const promoted = screen.progress.getSnapshot().mountain;
    expect(promoted.engineers).toHaveLength(2);
    expect(promoted.pocket).toBe(pocket - dearer);
    screen.root.remove();
  });
});
