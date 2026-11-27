// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { FrameState } from "./frame-state";
import type { Mountain } from "./mountain";
import { levels, slice2Part2 } from "./part-three.harness";
import type { ProgressStore } from "./progress-store";
import { researchPrice, startResearch } from "./research";
import { createResearchSheet } from "./research-sheet";
import { EMPTY_STOCK, priceAmount } from "./stock";

function makeState(getMountain: () => Mountain): {
  readonly state: FrameState;
  readonly dispatch: ReturnType<typeof vi.fn>;
} {
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const progress = { dispatch } as unknown as ProgressStore;
  const state: FrameState = {
    progress,
    mountain: getMountain,
    amount: () => "one",
    advanceAmount: () => undefined,
    site: () => "city",
    go: () => undefined,
    openWorkforce: () => undefined,
    openTransport: () => undefined,
    openResearch: () => undefined,
    openStage: () => undefined,
    openMachine: () => undefined,
  };
  return { state, dispatch };
}

describe("research-sheet DOM (#779)", () => {
  it("opens, starts, cancels (refund), and installs research projects through dispatch", () => {
    slice2Part2(() => {
      let current: Mountain = levels({
        sunk: true,
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        stock: { brick: 50_000, parts: 50_000 },
      });
      const { state, dispatch } = makeState(() => current);
      const sheet = createResearchSheet(state);
      sheet.open();
      sheet.paint(current);
      expect(sheet.root.hidden).toBe(false);

      // Start Heavy couplings.
      const card = sheet.root.querySelector<HTMLElement>(
        '[data-research="heavyCouplings"]',
      );
      const action = card?.querySelector<HTMLButtonElement>(".research-action");
      expect(action?.textContent).toBe("Start");
      action?.click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "startResearch",
        id: "heavyCouplings",
      });

      // Delivering state -> Cancel button dispatches cancelResearch.
      current = startResearch(current, "heavyCouplings");
      sheet.paint(current);
      expect(action?.textContent).toBe("Cancel");
      action?.click();
      expect(dispatch).toHaveBeenCalledWith({ kind: "cancelResearch" });

      // Ready state -> Install button dispatches installResearch.
      const price = researchPrice("heavyCouplings");
      current = {
        ...current,
        research: {
          ...current.research,
          active: {
            id: "heavyCouplings",
            arrived: {
              ...EMPTY_STOCK,
              stones: priceAmount(price, "stones"),
              brick: priceAmount(price, "brick"),
              cutStone: priceAmount(price, "cutStone"),
              glass: priceAmount(price, "glass"),
              parts: priceAmount(price, "parts"),
            },
          },
        },
      };
      sheet.paint(current);
      expect(action?.textContent).toBe("Install");
      action?.click();
      expect(dispatch).toHaveBeenCalledWith({ kind: "installResearch" });

      // Close button hides sheet.
      sheet.root
        .querySelector<HTMLButtonElement>(".frame-sheet-close")
        ?.click();
      expect(sheet.root.hidden).toBe(true);
    });
  });
});
