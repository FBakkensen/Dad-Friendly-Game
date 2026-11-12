// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCrewPlate, createOutputGauge, GAUGE_MARKS } from "./board-gauge";

const motion = (reduce: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
        media: query,
      }) as MediaQueryList,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const text = (root: HTMLElement, selector: string): string | null | undefined =>
  root.querySelector(selector)?.textContent;

const face = (root: HTMLElement): string | undefined =>
  root.querySelector<HTMLElement>(".board-gauge-face")?.style
    .backgroundPosition;

const run = (seconds: number, tick: (dt: number) => void): void => {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    tick(1 / 60);
  }
};

describe("createOutputGauge", () => {
  it("reads the rate, its unit and its label, and puts a still needle on its frame", () => {
    motion(true);
    const gauge = createOutputGauge();
    expect(gauge.root.classList.contains("board-gauge")).toBe(true);
    expect(gauge.root.getAttribute("role")).toBe("img");
    gauge.set(974);
    expect(text(gauge.root, ".board-gauge-read")).toBe("974");
    expect(text(gauge.root, ".board-gauge-unit")).toBe("×100");
    expect(gauge.root.getAttribute("aria-label")).toBe(
      "Output: 974 stones a second",
    );
    gauge.tick(0.016);
    expect(face(gauge.root)).toBe("-416px -624px");
  });

  it("steps the unit up as the rate outgrows the dial", () => {
    motion(true);
    const gauge = createOutputGauge();
    gauge.set(12_345);
    expect(text(gauge.root, ".board-gauge-read")).toBe("12.3K");
    expect(text(gauge.root, ".board-gauge-unit")).toBe("×1000");
    expect(gauge.root.getAttribute("aria-label")).toBe(
      "Output: 12.3 thousand stones a second",
    );
    gauge.set(15_001);
    expect(text(gauge.root, ".board-gauge-unit")).toBe("×10K");
  });

  it("reads a bad rate as nothing", () => {
    motion(true);
    const gauge = createOutputGauge();
    gauge.set(Number.NaN);
    gauge.tick(0.016);
    expect(text(gauge.root, ".board-gauge-read")).toBe("0");
    expect(text(gauge.root, ".board-gauge-unit")).toBe("×100");
    expect(gauge.root.getAttribute("aria-label")).toBe(
      "Output: 0 stones a second",
    );
    expect(face(gauge.root)).toBe("0px 0px");
  });

  it("starts at rest on the first frame", () => {
    motion(false);
    const gauge = createOutputGauge();
    expect(face(gauge.root)).toBe("0px 0px");
  });

  it("swings the needle to the rate, jolts on a kick and settles back", () => {
    motion(false);
    const gauge = createOutputGauge();
    gauge.set(750);
    run(3, (dt) => {
      gauge.tick(dt);
    });
    expect(face(gauge.root)).toBe("-1040px -416px");
    gauge.kick(150);
    gauge.tick(0.05);
    expect(face(gauge.root)).not.toBe("-1040px -416px");
    run(3, (dt) => {
      gauge.tick(dt);
    });
    expect(face(gauge.root)).toBe("-1040px -416px");
  });

  it("takes a long gap as one short step", () => {
    motion(false);
    const gauge = createOutputGauge();
    gauge.set(750);
    gauge.tick(3600);
    // One 0.1s step from rest: the needle is 62° up the dial, frame 12.
    expect(face(gauge.root)).toBe("-208px -208px");
  });

  it("holds the needle on the rate under reduced motion, kicks and all", () => {
    motion(true);
    const gauge = createOutputGauge();
    gauge.set(750);
    gauge.tick(0.016);
    gauge.kick(150);
    gauge.tick(0.016);
    expect(face(gauge.root)).toBe("-1040px -416px");
  });

  it("marks the dial 0 to 15 and names it", () => {
    const gauge = createOutputGauge();
    expect(
      [...gauge.root.querySelectorAll(".board-gauge-mark")].map(
        (mark) => mark.textContent,
      ),
    ).toEqual(["0", "5", "10", "15"]);
    expect(text(gauge.root, ".board-gauge-legend")).toBe("Stones a second");
    // The counter's window is the board's nine-slice of its art, so it can be wider than the file (#507).
    const counter = gauge.root.querySelector(
      "span.board-gauge-counter.board-skinned",
    );
    expect(counter?.querySelectorAll("canvas.board-skin")).toHaveLength(1);
    const sheet = gauge.root.querySelector<HTMLElement>(".board-gauge-face");
    expect(sheet?.style.backgroundImage).toContain("gauge-output-sheet");
  });
});

describe("GAUGE_MARKS", () => {
  it("keeps the 0 off the needle at rest, and the 15 level with it (#507)", () => {
    const [zero, , , fifteen] = GAUGE_MARKS;
    expect([zero?.[0], fifteen?.[0]]).toEqual(["0", "15"]);
    // At rest the needle lies from the hub (52, 52) down and left at 45°. This is how far the
    // mark's centre is from that line, on the side the needle rises to, in art px: a figure is
    // under 4 across its corners and the needle about 5 wide there.
    const clear =
      (52 - (zero?.[1] ?? 0) - ((zero?.[2] ?? 0) - 52)) / Math.SQRT2;
    expect(clear).toBeGreaterThanOrEqual(5);
    expect(fifteen?.[2]).toBe(zero?.[2]);
  });
});

describe("createCrewPlate", () => {
  const lampX = (root: HTMLElement): string | undefined =>
    root.querySelector<HTMLElement>("i.board-lamp")?.style.backgroundPositionX;

  it("shows the crew, the free count and an amber lamp", () => {
    const plate = createCrewPlate();
    expect(plate.root.classList.contains("board-crew")).toBe(true);
    expect(plate.root.getAttribute("role")).toBe("img");
    expect(plate.root.querySelector("canvas.board-skin")).not.toBeNull();
    expect(text(plate.root, ".board-crew-legend")).toBe("Crew");
    plate.set({ crew: 56, spare: 1, free: 1 });
    expect(text(plate.root, ".board-crew-n")).toBe("56");
    expect(text(plate.root, ".board-crew-free")).toBe("1 free");
    expect(lampX(plate.root)).toBe("-40px");
    expect(plate.root.classList.contains("is-none")).toBe(false);
    expect(plate.root.getAttribute("aria-label")).toBe(
      "Crew: 56 workers, 1 free",
    );
  });

  it("dims the lamp and the free count when none are free", () => {
    const plate = createCrewPlate();
    plate.set({ crew: 56, spare: 1, free: 1 });
    plate.set({ crew: 1, spare: 0, free: 0 });
    expect(lampX(plate.root)).toBe("0px");
    expect(plate.root.classList.contains("is-none")).toBe(true);
    expect(text(plate.root, ".board-crew-free")).toBe("0 free");
    expect(plate.root.getAttribute("aria-label")).toBe(
      "Crew: 1 worker, 0 free",
    );
  });

  it("shrinks a long crew figure so it stays on the plate", () => {
    const plate = createCrewPlate();
    const n = (): HTMLElement | null =>
      plate.root.querySelector<HTMLElement>(".board-crew-n");
    plate.set({ crew: 999, spare: 0, free: 0 });
    expect(n()?.classList.contains("is-long")).toBe(false);
    expect(n()?.classList.contains("is-longer")).toBe(false);
    plate.set({ crew: 1_998, spare: 1_998, free: 1_998 });
    expect(n()?.textContent).toBe("1,998");
    expect(n()?.classList.contains("is-long")).toBe(true);
    expect(n()?.classList.contains("is-longer")).toBe(false);
    expect(text(plate.root, ".board-crew-free")).toBe("1,998 free");
    const freeCount = plate.root.querySelector(".board-crew-free");
    expect(freeCount?.classList.contains("is-long")).toBe(true);
    expect(plate.root.getAttribute("aria-label")).toBe(
      "Crew: 1,998 workers, 1,998 free",
    );
    plate.set({ crew: 123_456, spare: 0, free: 0 });
    expect(n()?.textContent).toBe("123.4K");
    expect(n()?.classList.contains("is-long")).toBe(false);
    expect(n()?.classList.contains("is-longer")).toBe(true);
    plate.set({ crew: 56, spare: 999, free: 999 });
    expect(freeCount?.classList.contains("is-long")).toBe(false);
    expect(n()?.classList.contains("is-long")).toBe(false);
    expect(n()?.classList.contains("is-longer")).toBe(false);
  });
});
