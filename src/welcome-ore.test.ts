import { describe, expect, it } from "vitest";
import { EMPTY_MATERIALS } from "./layers";
import { AWAY_MATERIALS_USE, awayMaterialsWords } from "./screen-words";

describe("welcome-back ore (#247)", () => {
  it("names each ore that came up, shallow first, and nothing when none did", () => {
    expect(awayMaterialsWords(EMPTY_MATERIALS)).toBeUndefined();
    expect(
      awayMaterialsWords({ clay: 3, iron: 12_500, crystal: 0, heartstone: 1 }),
    ).toBe("Ore for the Workshop: +3 clay · +12.5K iron · +1 heartstone");
    expect(AWAY_MATERIALS_USE).not.toMatch(/\?|\d/);
  });
});
