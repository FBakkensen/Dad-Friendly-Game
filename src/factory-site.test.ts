// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createFactorySite } from "./factory-site";
import type { FrameState } from "./frame-state";
import { NO_LEVEL_MACHINES } from "./mine-levels";
import type { Mountain } from "./mountain";
import { levels, slice2Part2 } from "./part-three.harness";
import type { ProgressStore } from "./progress-store";

function makeState(mountain: Mountain): {
  readonly state: FrameState;
  readonly dispatch: ReturnType<typeof vi.fn>;
} {
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const progress = { dispatch } as unknown as ProgressStore;
  const state: FrameState = {
    progress,
    mountain: () => mountain,
    amount: () => "one",
    advanceAmount: () => undefined,
    site: () => "factory",
    go: () => undefined,
    openWorkforce: () => undefined,
    openTransport: () => undefined,
    openResearch: () => undefined,
    openStage: () => undefined,
    openMachine: () => undefined,
  };
  return { state, dispatch };
}

describe("factory-site DOM (#779)", () => {
  it("paints output buffer, 2-/3-buffer lines, 2-good buy keys, and dispatches buy/step moves", () => {
    slice2Part2(() => {
      const base = levels({
        sunk: true,
        operational: ["lightTower", "warehouse", "foundry"],
        stock: {
          stones: 50_000,
          brick: 10_000_000,
          cutStone: 10_000_000,
          glass: 10_000_000,
        },
      });
      const mountain: Mountain = {
        ...base,
        mineLevels: {
          ...base.mineLevels,
          crystal: {
            machines: NO_LEVEL_MACHINES,
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        makers: {
          ...base.makers,
          partsPress: 1,
          precisionAssembly: 1,
        },
        jobs: { ...base.jobs, partsPress: 2, precisionAssembly: 0 },
        owned: { ...base.owned, helper: base.owned.helper + 6 },
        makerBuffers: {
          kiln: {},
          saw: {},
          glassworks: {},
          partsPress: { brick: 300, cutStone: 150 },
          precisionAssembly: { brick: 0, cutStone: 100, glass: 100 },
        },
        factoryOutput: { parts: 42 },
      };

      const { state, dispatch } = makeState(mountain);
      const site = createFactorySite(state);
      site.paint(mountain, true, 0);

      expect(site.root.hidden).toBe(false);
      expect(
        site.root.querySelector(".factory-output-text")?.textContent,
      ).toContain("42 of");
      const plates = site.root.querySelectorAll(".factory-plate");
      expect(plates).toHaveLength(2);
      expect(plates[0]?.querySelectorAll(".maker-buf").length).toBe(2);
      expect(plates[1]?.querySelectorAll(".maker-buf").length).toBe(3);

      // 2-good buy keys render both good icons and the "+" separator.
      const pressKey = site.root.querySelector<HTMLButtonElement>(
        ".factory-partsPress-key",
      );
      expect(pressKey?.querySelectorAll(".mine-key-icon").length).toBe(2);
      expect(pressKey?.textContent).toContain(" + ");

      pressKey?.click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "buyMaker",
        id: "partsPress",
      });

      const plus = plates[1]?.querySelector<HTMLButtonElement>(
        'button[data-way="place"]',
      );
      plus?.click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "placeWorker",
        job: "precisionAssembly",
        count: 1,
      });
    });
  });
});
