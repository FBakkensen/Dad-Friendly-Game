// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";

import { upgradeShown } from "./upgrade-reveal";
import { upgradeById, NO_UPGRADES } from "./upgrades";
import { showsDot } from "./teach";

const crews = upgradeById("cartSyn");

describe("rows open at a fixed point in the climb (#250)", () => {
  it("shows an upgrade at its owned count, never for a full pocket", () => {
    const start = createMountain();
    expect(
      upgradeShown(
        { ...start, stock: { ...start.stock, stones: 1e12 } },
        crews,
      ),
    ).toBe(false);
    expect(
      upgradeShown({ ...start, owned: { ...start.owned, cart: 4 } }, crews),
    ).toBe(false);
    expect(
      upgradeShown({ ...start, owned: { ...start.owned, cart: 5 } }, crews),
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

  it("keeps a row once bought or seen", () => {
    const start = createMountain();
    expect(upgradeShown(start, crews)).toBe(false);
    expect(upgradeShown({ ...start, seen: ["upgrade:cartSyn"] }, crews)).toBe(
      true,
    );
    expect(
      upgradeShown(
        { ...start, upgrades: { ...NO_UPGRADES, cartSyn: 1 } },
        crews,
      ),
    ).toBe(true);
  });

  it("puts a dot on each row that shows and is not bought yet", () => {
    const open = {
      ...createMountain(),
      owned: { ...createMountain().owned, cart: 5 },
    };
    expect(showsDot(open, "upgrade:cartSyn")).toBe(true);
    expect(showsDot(createMountain(), "upgrade:cartSyn")).toBe(false);
    expect(
      showsDot(
        { ...open, upgrades: { ...NO_UPGRADES, cartSyn: 1 } },
        "upgrade:cartSyn",
      ),
    ).toBe(false);
  });
});
