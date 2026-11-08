// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reducedMotion } from "./float-text";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A matchMedia that counts its calls and answers from a live list. */
const counted = (list: { matches: boolean }) => {
  const matchMedia = vi.fn((query: string) => {
    expect(query).toBe("(prefers-reduced-motion: reduce)");
    return list as MediaQueryList;
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
};

describe("reducedMotion", () => {
  it("asks matchMedia once and then reads the list's live answer", () => {
    const list = { matches: false };
    const matchMedia = counted(list);
    expect(reducedMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
    list.matches = true;
    expect(reducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it("asks again when matchMedia is replaced, as a test's stub does", () => {
    counted({ matches: false });
    expect(reducedMotion()).toBe(false);
    const next = counted({ matches: true });
    expect(reducedMotion()).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("counts no matchMedia as reduced motion", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(reducedMotion()).toBe(true);
  });
});
