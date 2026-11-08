// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOdometer } from "./board-stock";

const faces = (root: HTMLElement) =>
  [...root.querySelectorAll(".board-drum")].map((d) => d.lastElementChild?.textContent);

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
    expect(odo.root.querySelector<HTMLElement>(".odo-dec-3")?.hidden).toBe(false);
    expect(odo.root.querySelector<HTMLElement>(".odo-dec-1")?.hidden).toBe(true);
  });

  it("hides the point and decimal faces for whole numbers", () => {
    const odo = createOdometer();
    odo.set(412_489);
    odo.set(41_380);
    expect(faces(odo.root)).toEqual(["4", "1", "3", "8", "0"]);
    expect(odo.root.querySelector<HTMLElement>(".board-odo-dot")?.hidden).toBe(true);
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
});
