// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";

import { boostShown, upgradeShown } from "./upgrade-reveal";
import { boostById, NO_BOOSTS } from "./boosts";
import { upgradeById, NO_UPGRADES } from "./upgrades";
import { showsDot } from "./teach";

const arms = upgradeById("tap");

describe("rows open at a fixed point in the climb (#250)", () => {
  it("shows an upgrade at its owned count, never for a full pocket", () => {
    const start = createMountain();
    expect(
      upgradeShown({ ...start, stock: { ...start.stock, stones: 1e12 } }, arms),
    ).toBe(false);
    expect(
      upgradeShown({ ...start, owned: { ...start.owned, cart: 2 } }, arms),
    ).toBe(false);
    expect(
      upgradeShown({ ...start, owned: { ...start.owned, cart: 3 } }, arms),
    ).toBe(true);
    const boots = upgradeById("boots");
    expect(
      upgradeShown(
        {
          ...start,
          stock: { ...start.stock, stones: 1e12 },
          owned: { ...start.owned, helper: 9 },
        },
        boots,
      ),
    ).toBe(false);
    expect(
      upgradeShown({ ...start, owned: { ...start.owned, helper: 10 } }, boots),
    ).toBe(true);
  });

  it("shows a boost with the first machine of its tier, never for a full pocket", () => {
    const start = createMountain();
    const sharper = boostById("sharper");
    const overtime = boostById("overtime");
    expect(
      boostShown(
        { ...start, stock: { ...start.stock, stones: 1e12 } },
        sharper,
      ),
    ).toBe(false);
    expect(
      boostShown({ ...start, owned: { ...start.owned, cart: 1 } }, sharper),
    ).toBe(true);
    expect(
      boostShown({ ...start, owned: { ...start.owned, cart: 1 } }, overtime),
    ).toBe(false);
    expect(
      boostShown({ ...start, owned: { ...start.owned, drill: 1 } }, overtime),
    ).toBe(true);
  });

  it("keeps a row once bought or seen", () => {
    const start = createMountain();
    expect(upgradeShown(start, arms)).toBe(false);
    expect(upgradeShown({ ...start, seen: ["upgrade:tap"] }, arms)).toBe(true);
    expect(
      upgradeShown({ ...start, upgrades: { ...NO_UPGRADES, tap: 1 } }, arms),
    ).toBe(true);
    const sharper = boostById("sharper");
    expect(boostShown(start, sharper)).toBe(false);
    expect(
      boostShown({ ...start, boosts: { ...NO_BOOSTS, sharper: 1 } }, sharper),
    ).toBe(true);
    expect(boostShown({ ...start, seen: ["boost:sharper"] }, sharper)).toBe(
      true,
    );
  });

  it("puts a dot on each row that shows and is not bought yet", () => {
    const open = {
      ...createMountain(),
      owned: { ...createMountain().owned, cart: 3 },
    };
    expect(showsDot(open, "upgrade:tap")).toBe(true);
    expect(showsDot(createMountain(), "upgrade:tap")).toBe(false);
    expect(
      showsDot(
        { ...open, upgrades: { ...NO_UPGRADES, tap: 1 } },
        "upgrade:tap",
      ),
    ).toBe(false);
  });
});
