import { describe, expect, it } from "vitest";
import { nextView, siteLamp } from "./next-view";
import { levels, slice2Part1, slice2Part2 } from "./part-three.harness";
import {
  cancelResearch,
  installResearch,
  researchPrice,
  startResearch,
} from "./research";
import { researchDoorView, researchSheetView } from "./research-view";
import { EMPTY_STOCK, priceAmount } from "./stock";
import type { Mountain } from "./mountain";

function withResearchLab(overrides: Partial<Mountain> = {}): Mountain {
  const base = levels({
    sunk: true,
    operational: ["lightTower", "warehouse", "foundry", "researchLab"],
    stock: {
      stones: 100_000,
      brick: 100_000,
      cutStone: 100_000,
      glass: 100_000,
      parts: 100_000,
    },
  });
  return { ...base, ...overrides };
}

describe("research-view (#779)", () => {
  it("hides the Research Lab door when Part 2 is off or Research Lab is not operational", () => {
    slice2Part1(() => {
      expect(researchDoorView(withResearchLab()).open).toBe(false);
    });
    slice2Part2(() => {
      const noLab = withResearchLab({
        operational: ["lightTower", "warehouse", "foundry"],
      });
      expect(researchDoorView(noLab).open).toBe(false);
    });
  });

  it("shows idle, delivering, ready, and done project states plus Next/City green lamp when ready", () => {
    slice2Part2(() => {
      const idle = withResearchLab();
      const doorIdle = researchDoorView(idle);
      expect(doorIdle.open).toBe(true);
      expect(doorIdle.lamp).toBe("dark");
      expect(doorIdle.status).toBe("Choose a project");

      const sheetIdle = researchSheetView(idle);
      expect(sheetIdle.doneCount).toBe(0);
      expect(sheetIdle.cards.every((card) => card.status === "available")).toBe(
        true,
      );

      // Start a project -> delivering (amber lamp), other projects cannot start.
      const delivering = startResearch(idle, "heavyCouplings");
      const doorDeliv = researchDoorView(delivering);
      expect(doorDeliv.lamp).toBe("amber");
      expect(doorDeliv.status).toContain("Delivering");
      expect(siteLamp(delivering, "city")).toBe("amber");

      const sheetDeliv = researchSheetView(delivering);
      const activeCard = sheetDeliv.cards.find(
        (c) => c.id === "heavyCouplings",
      );
      expect(activeCard?.status).toBe("delivering");
      const otherCard = sheetDeliv.cards.find((c) => c.id === "highDraftKilns");
      expect(otherCard?.status).toBe("available");
      if (otherCard?.status === "available") {
        expect(otherCard.canStart).toBe(false);
      }

      // Cancel refunds arrived goods and returns to idle.
      const partial: Mountain = {
        ...delivering,
        stock: { ...EMPTY_STOCK },
        research: {
          ...delivering.research,
          active: {
            id: "heavyCouplings",
            arrived: { ...EMPTY_STOCK, brick: 250, parts: 50 },
          },
        },
      };
      const cancelled = cancelResearch(partial);
      expect(cancelled.research.active).toBeUndefined();
      expect(cancelled.stock.brick).toBe(250);
      expect(cancelled.stock.parts).toBe(50);

      // Fully delivered -> ready (green lamp on door & City tab, Next points to Install research).
      const price = researchPrice("heavyCouplings");
      const ready: Mountain = {
        ...delivering,
        research: {
          ...delivering.research,
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
      expect(researchDoorView(ready).lamp).toBe("green");
      expect(researchDoorView(ready).status).toContain("Ready to install");
      expect(siteLamp(ready, "city")).toBe("green");
      const next = nextView(ready);
      expect(next.kind).toBe("research");
      if (next.kind === "research") {
        expect(next.line).toBe("Install research");
      }

      // Install marks project done.
      const installed = installResearch(ready);
      const sheetDone = researchSheetView(installed);
      expect(sheetDone.doneCount).toBe(1);
      expect(
        sheetDone.cards.find((c) => c.id === "heavyCouplings")?.status,
      ).toBe("done");
    });
  });

  it("honors already-bought Part 1 upgrades as Installed", () => {
    slice2Part2(() => {
      const m = withResearchLab({
        upgrades: {
          ...withResearchLab().upgrades,
          boots: 1,
        },
      });
      const sheet = researchSheetView(m);
      expect(sheet.cards.find((c) => c.id === "workBoots")?.status).toBe(
        "done",
      );
    });
  });
});
