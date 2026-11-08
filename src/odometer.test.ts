import { describe, expect, it } from "vitest";
import { odometerFace } from "./odometer";

const face = (n: number) => {
  const f = odometerFace(n);
  return { drums: f.drums.join(""), point: f.point, words: f.words };
};

describe("odometerFace", () => {
  it("whole numbers under 100,000, padded like a real odometer", () => {
    expect(face(41_380)).toEqual({ drums: "41380", point: -1, words: "41,380" });
    expect(face(7)).toEqual({ drums: "00007", point: -1, words: "7" });
    expect(face(99_999.9)).toEqual({ drums: "99999", point: -1, words: "99,999" });
  });

  it("four figures and a unit from 100K", () => {
    expect(face(100_000)).toEqual({ drums: "1000K", point: 2, words: "100.0K" });
    expect(face(412_489)).toEqual({ drums: "4124K", point: 2, words: "412.4K" });
    expect(face(1_234_567)).toEqual({ drums: "1234M", point: 0, words: "1.234M" });
    expect(face(99_999_999)).toEqual({ drums: "9999M", point: 1, words: "99.99M" });
    expect(face(2.5e9).words).toBe("2.500B");
    expect(face(7.25e12).words).toBe("7.250T");
    expect(face(999_999_999_999_999).words).toBe("999.9T");
  });

  it("rounds down", () => {
    expect(face(999_999).words).toBe("999.9K");
  });

  it(">999T from 1,000T", () => {
    for (const n of [1e15, 5e20]) {
      expect(face(n)).toEqual({ drums: ">999T", point: -1, words: ">999T" });
    }
  });

  it("bad pockets", () => {
    expect(face(NaN)).toEqual({ drums: "00000", point: -1, words: "0" });
    expect(face(-5)).toEqual({ drums: "00000", point: -1, words: "0" });
    expect(face(Infinity).words).toBe(">999T");
  });
});
