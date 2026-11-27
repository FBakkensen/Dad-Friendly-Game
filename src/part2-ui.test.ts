// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { mountFrameScreen } from "./frame-screen";
import { NO_LEVEL_MACHINES, sinkShaft } from "./mine-levels";
import { levelsView } from "./mine-level-view";
import type { Mountain } from "./mountain";
import { levels, slice2Part1, slice2Part2 } from "./part-three.harness";
import { createProgressStore } from "./progress-store";
import { createMemoryStorage } from "./test-fixtures";

function part2FullMountain(): Mountain {
  const base = levels({
    sunk: true,
    operational: ["lightTower", "warehouse", "foundry", "researchLab"],
    topsoil: 3,
    granite: 3,
    hoisting: 4,
    hoists: 3,
    assigned: { topsoil: 1, granite: 1, crystal: 1 },
    driving: 2,
    building: 1,
    kilns: 1,
    saws: 1,
    stock: {
      stones: 100_000,
      brick: 100_000,
      cutStone: 100_000,
      glass: 100_000,
      parts: 100_000,
    },
  });
  return {
    ...base,
    fleet: { horseWagon: 1, truck: 1 },
    mineLevels: {
      ...base.mineLevels,
      crystal: {
        machines: NO_LEVEL_MACHINES,
        piles: { face: 40, shaft: 60, saw: 0 },
      },
    },
    makers: {
      ...base.makers,
      glassworks: 1,
      partsPress: 1,
      precisionAssembly: 1,
    },
    jobs: {
      ...base.jobs,
      crystalDrilling: 2,
      crystalHaulage: 2,
      glassworks: 2,
      partsPress: 2,
      precisionAssembly: 3,
    },
    owned: {
      ...base.owned,
      helper: base.owned.helper + 15,
    },
    makerBuffers: {
      kiln: { topsoilRock: 120 },
      saw: { graniteRock: 120 },
      glassworks: { crystalRock: 80, stones: 80 },
      partsPress: { brick: 160, cutStone: 80 },
      precisionAssembly: { brick: 120, cutStone: 80, glass: 60 },
    },
    factoryOutput: { parts: 90 },
  };
}

function mountWith(mountain: Mountain) {
  const root = document.createElement("div");
  document.body.append(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: createMemoryStorage(),
    cloudWriteGapMs: 0,
    now: () => 1_000,
  });
  progress.applyMutation(() => mountain);
  const ac = new AbortController();
  const screen = mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    now: () => 1_000,
    signal: ac.signal,
  });
  return {
    root,
    screen,
    cleanup: () => {
      ac.abort();
      root.remove();
    },
  };
}

describe("Slice 2 Part 2 UI gating & screens (#779)", () => {
  it("hides every Part 2 UI surface when SLICE_2_PART_2_OFF is on (today's play)", () => {
    slice2Part1(() => {
      const m = part2FullMountain();
      const { root, cleanup } = mountWith(m);
      try {
        // Mine: only 2 levels and 3 hoist strip cells.
        expect(root.querySelectorAll(".mine-level-rows")).toHaveLength(2);
        expect(root.querySelectorAll(".mine-strip-cell")).toHaveLength(3);
        // Top strip: only 3 piles (stone, brick, cutStone); glass & parts DOM absent.
        expect(
          root.querySelector(".frame-top")?.getAttribute("data-piles"),
        ).toBe("3");
        expect(root.querySelectorAll(".frame-top .frame-pile")).toHaveLength(3);
        expect(root.querySelector('.frame-pile[data-good="glass"]')).toBeNull();
        expect(root.querySelector('.frame-pile[data-good="parts"]')).toBeNull();
        // Research sheet DOM absent.
        expect(root.querySelector(".research-sheet")).toBeNull();
        // Factory tab hidden & Factory DOM completely absent.
        const factoryTab = root.querySelector<HTMLButtonElement>(
          '.frame-site[data-site="factory"]',
        );
        expect(factoryTab?.hidden).toBe(true);
        expect(root.querySelector(".factory")).toBeNull();
        // Refinery: only 2 plates (Kilns & Saws), no Glassworks.
        root
          .querySelector<HTMLButtonElement>('.frame-site[data-site="refinery"]')
          ?.click();
        expect(root.querySelectorAll(".refinery-plate")).toHaveLength(2);
        // City: 3 skyline tags, Research Lab door DOM completely absent.
        root
          .querySelector<HTMLButtonElement>('.frame-site[data-site="city"]')
          ?.click();
        expect(root.querySelectorAll(".city-tag")).toHaveLength(3);
        expect(root.querySelector(".city-research-door")).toBeNull();
      } finally {
        cleanup();
      }
    });
  });

  it("renders 3-level Mine + 4-cell strip, Refinery Glassworks, Factory, and City Research Lab + sheet when Part 2 is on", () => {
    slice2Part2(() => {
      const m = part2FullMountain();
      const view = levelsView(m);
      expect(view?.levels.map((l) => l.level)).toEqual([
        "topsoil",
        "granite",
        "crystal",
      ]);
      expect(view?.strip.map((c) => c.place)).toEqual([
        "topsoil",
        "granite",
        "crystal",
        "both",
      ]);
      expect(view?.strip[3]?.name).toBe("All in turn");

      const { root, cleanup } = mountWith(m);
      try {
        // Top strip attaches and shows all 5 piles (stone, brick, cutStone, glass, parts).
        expect(
          root.querySelector(".frame-top")?.getAttribute("data-piles"),
        ).toBe("5");
        expect(root.querySelectorAll(".frame-top .frame-pile")).toHaveLength(5);
        const glassPile = root.querySelector<HTMLElement>(
          '.frame-pile[data-good="glass"]',
        );
        const partsPile = root.querySelector<HTMLElement>(
          '.frame-pile[data-good="parts"]',
        );
        expect(glassPile).not.toBeNull();
        expect(glassPile?.hidden).toBe(false);
        expect(partsPile).not.toBeNull();
        expect(partsPile?.hidden).toBe(false);
        // Research sheet and Factory DOM are attached.
        expect(root.querySelector(".research-sheet")).not.toBeNull();
        expect(root.querySelector(".factory")).not.toBeNull();
        // Mine shows 3 levels + 4-cell hoist strip.
        expect(root.querySelectorAll(".mine-level-rows")).toHaveLength(3);
        expect(root.querySelectorAll(".mine-strip-cell")).toHaveLength(4);
        expect(
          root.querySelector(".mine-strip")?.classList.contains("four"),
        ).toBe(true);

        // Refinery shows 3 plates including Glassworks with 2 input buffers and 2-good buy key.
        root
          .querySelector<HTMLButtonElement>('.frame-site[data-site="refinery"]')
          ?.click();
        const plates = root.querySelectorAll(".refinery-plate");
        expect(plates).toHaveLength(3);
        const gwPlate = root.querySelector(
          '.refinery-plate[data-maker="glassworks"]',
        );
        expect(gwPlate?.querySelectorAll(".maker-buf")).toHaveLength(2);
        expect(
          gwPlate?.querySelectorAll(".refinery-glassworks-key .mine-key-icon"),
        ).toHaveLength(2);

        // Factory tab opens steady-flow Factory with 2 lines and output buffer.
        const factoryTab = root.querySelector<HTMLButtonElement>(
          '.frame-site[data-site="factory"]',
        );
        expect(factoryTab?.hidden).toBe(false);
        factoryTab?.click();
        expect(root.querySelectorAll(".factory-plate")).toHaveLength(2);
        expect(
          root.querySelector(".factory-output-text")?.textContent,
        ).toContain("90 of");

        // City shows 4 skyline tags and Research Lab door opening the Research sheet.
        root
          .querySelector<HTMLButtonElement>('.frame-site[data-site="city"]')
          ?.click();
        expect(root.querySelectorAll(".city-tag")).toHaveLength(4);
        const door = root.querySelector<HTMLButtonElement>(
          ".city-research-door",
        );
        expect(door?.hidden).toBe(false);
        door?.click();
        const sheet = root.querySelector<HTMLElement>(".research-sheet");
        expect(sheet?.hidden).toBe(false);
        expect(
          sheet?.querySelectorAll(".research-card").length,
        ).toBeGreaterThan(0);
      } finally {
        cleanup();
      }
    });
  });

  it("shows Crystal Caves shaft gate behind Foundry when unsunk under Part 2 and sinks into 3 levels", () => {
    slice2Part2(() => {
      const unsunk = levels({
        sunk: true,
        operational: ["lightTower", "warehouse", "foundry"],
        stock: { stones: 500_000, brick: 2_000_000, cutStone: 2_000_000 },
      });
      const before = levelsView(unsunk);
      expect(before?.crystalGate?.kind).toBe("open");
      expect(before?.levels).toHaveLength(2);
      const after = levelsView(sinkShaft(unsunk, "crystal"));
      expect(after?.crystalGate).toBeUndefined();
      expect(after?.levels).toHaveLength(3);
    });
  });
});
