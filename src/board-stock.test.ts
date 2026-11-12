// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoostDial, createOdometer } from "./board-stock";
import type { CrewBoost } from "./crew-boost";

const faces = (root: HTMLElement) =>
  [...root.querySelectorAll(".board-drum")].map(
    (d) => d.lastElementChild?.textContent,
  );

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createOdometer", () => {
  it("shows a compact pocket with the point and decimal drums", () => {
    const odo = createOdometer();
    odo.set(412_489);
    expect(odo.root.classList.contains("board-odo")).toBe(true);
    expect(odo.root.getAttribute("role")).toBe("img");
    expect(odo.root.getAttribute("aria-label")).toBe("Stones 412.4K");
    expect(faces(odo.root)).toEqual(["4", "1", "2", "4", "K"]);
    const dot = odo.root.querySelector<HTMLElement>(".board-odo-dot");
    expect(dot?.hidden).toBe(false);
    expect(dot?.style.getPropertyValue("--at")).toBe("68");
    const drums = odo.root.querySelectorAll(".board-drum");
    expect(drums[3]?.classList.contains("is-decimal")).toBe(true);
    expect(drums[2]?.classList.contains("is-decimal")).toBe(false);
    expect(odo.root.querySelector<HTMLElement>(".odo-dec-3")?.hidden).toBe(
      false,
    );
    expect(odo.root.querySelector<HTMLElement>(".odo-dec-1")?.hidden).toBe(
      true,
    );
  });

  it("hides the point and decimal faces for whole numbers", () => {
    const odo = createOdometer();
    odo.set(412_489);
    odo.set(41_380);
    expect(faces(odo.root)).toEqual(["4", "1", "3", "8", "0"]);
    expect(odo.root.querySelector<HTMLElement>(".board-odo-dot")?.hidden).toBe(
      true,
    );
    for (const el of odo.root.querySelectorAll<HTMLElement>(".board-odo-dec")) {
      expect(el.hidden).toBe(true);
    }
    expect(odo.root.querySelector(".is-decimal")).toBeNull();
  });

  it("shows a spend mark for 1.9 seconds", () => {
    const odo = createOdometer();
    const spend = odo.root.querySelector(".board-spend");
    odo.spend(5_868);
    expect(spend?.textContent).toBe("−5,868");
    vi.advanceTimersByTime(1899);
    expect(spend?.textContent).toBe("−5,868");
    vi.advanceTimersByTime(1);
    expect(spend?.textContent).toBe("");
  });

  it("compacts big spends", () => {
    const odo = createOdometer();
    odo.spend(12_345);
    expect(odo.root.querySelector(".board-spend")?.textContent).toBe("−12.3K");
  });

  it("swaps the first set() and rolls the next", () => {
    const animate = vi.fn(() => ({ onfinish: null, getAnimations: () => [] }));
    const proto = Element.prototype as { animate: unknown };
    const original = proto.animate;
    proto.animate = animate;
    try {
      const odo = createOdometer();
      odo.set(41_380);
      expect(animate).not.toHaveBeenCalled();
      expect(faces(odo.root)).toEqual(["4", "1", "3", "8", "0"]);
      odo.set(41_381);
      expect(animate).toHaveBeenCalled();
    } finally {
      proto.animate = original;
    }
  });
});

describe("createBoostDial", () => {
  const overtime: CrewBoost = {
    kind: "running",
    source: "overtime",
    name: "Overtime",
    multiplier: 2,
    leftMs: 7 * 60_000 + 8_000,
    fullMs: 30 * 60_000,
  };
  const text = (root: HTMLElement, sel: string) =>
    root.querySelector(sel)?.textContent;

  it("writes a running boost on the legend and the sprite", () => {
    const dial = createBoostDial({ onOpen: () => undefined });
    dial.set(overtime);
    expect(dial.root.tagName).toBe("BUTTON");
    expect(dial.root.classList.contains("board-dial")).toBe(true);
    expect(text(dial.root, ".board-dial-name")).toBe("Overtime");
    expect(text(dial.root, ".board-dial-mul")).toBe("×2");
    expect(text(dial.root, ".board-dial-left")).toBe("7:08");
    expect(text(dial.root, ".board-dial-word")).toBe("left");
    const sprite = dial.root.querySelector<HTMLElement>(".board-dial-sprite");
    expect(sprite?.style.backgroundPositionX).toBe("-704px");
    expect(dial.root.getAttribute("aria-label")).toBe(
      "Overtime, pace ×2, 7:08 left",
    );
  });

  it("rests, as the crew's Pace (#508)", () => {
    const dial = createBoostDial({ onOpen: () => undefined });
    dial.set(overtime);
    dial.set({ kind: "rested" });
    expect(text(dial.root, ".board-dial-name")).toBe("Pace");
    expect(text(dial.root, ".board-dial-mul")).toBe("×1");
    expect(text(dial.root, ".board-dial-left")).toBe("rested");
    expect(text(dial.root, ".board-dial-word")).toBe("");
    expect(
      dial.root.querySelector<HTMLElement>(".board-dial-sprite")?.style
        .backgroundPositionX,
    ).toBe("0px");
    expect(dial.root.getAttribute("aria-label")).toBe("Pace ×1, rested");
  });

  it("a click opens", () => {
    let opened = 0;
    const dial = createBoostDial({ onOpen: () => void (opened += 1) });
    dial.root.click();
    expect(opened).toBe(1);
  });
});
