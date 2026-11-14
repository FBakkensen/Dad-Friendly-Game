import { describe, expect, it } from "vitest";
import { parseFactors } from "./lab-factors";

describe("parseFactors", () => {
  it("reads id=number pairs, hyphenated recipe ids too", () => {
    expect(parseFactors("line.off=0,recipe.iron-rails.cost=0.5")).toEqual({
      "line.off": 0,
      "recipe.iron-rails.cost": 0.5,
    });
  });

  it("is undefined for no text, and for a pair that is not id=number", () => {
    expect(parseFactors(undefined)).toBeUndefined();
    expect(parseFactors(" ")).toBeUndefined();
    expect(parseFactors("line.off")).toBeUndefined();
    expect(parseFactors("line.off=x")).toBeUndefined();
    expect(parseFactors("line.off=")).toBeUndefined();
    expect(parseFactors("a=1=2")).toBeUndefined();
    expect(parseFactors("a b=1")).toBeUndefined();
  });
});
