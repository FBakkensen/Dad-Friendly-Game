import { describe, expect, it } from "vitest";
import { PLOT_SPANS, buildingX, roadVehicles, siteYard } from "./city-scene";
import { createMountain } from "./mountain";
import { SCENE_W } from "./scene-paint";
import { drivenFleet } from "./transport";

/** The site's yard beside the building in hand (#672; docs/ART.md, the Warehouse). */

const BUILDERS = 3;
const MINER_W = 12;
const HEAP_W = 16;
/** The pictures' widths, in art px: the Light Tower, the Warehouse and the Foundry. */
const TOWER_W = 30;
const WAREHOUSE_W = 46;
const FOUNDRY_W = 45;

describe("the site's yard", () => {
  it("keeps the first plot's yard as it was: the builders, then the heap", () => {
    expect(siteYard(0)).toEqual({ builders: 46, heap: 74 });
  });

  it("puts the Warehouse's yard to its left, clear of its picture and scaffold", () => {
    const yard = siteYard(1);
    const x = buildingX(1);
    // The scaffold's left pole stands 4 art px before the picture.
    const scaffold = x - 4;
    expect(yard.heap + HEAP_W).toBeLessThanOrEqual(yard.builders);
    expect(yard.builders + BUILDERS * 10 + MINER_W - 10).toBeLessThanOrEqual(
      scaffold,
    );
    // Clear of the Light Tower on the first plot, which is operational by then.
    expect(yard.heap).toBeGreaterThanOrEqual(buildingX(0) + TOWER_W + 2);
  });

  it("keeps the Warehouse and its scaffold inside its plot", () => {
    const span = PLOT_SPANS[1];
    const x = buildingX(1);
    expect(span).toBeDefined();
    if (span === undefined) {
      return;
    }
    expect(x - 6).toBeGreaterThanOrEqual(span.x - 1);
    expect(x + WAREHOUSE_W + 6).toBeLessThanOrEqual(span.x + span.w + 1);
  });
});

describe("the Foundry on the third plot (#682)", () => {
  it("stands inside its plot, with the Warehouse's room to spare on its right", () => {
    const span = PLOT_SPANS[2];
    const x = buildingX(2);
    expect(span).toBeDefined();
    if (span === undefined) {
      return;
    }
    expect(x).toBeGreaterThanOrEqual(span.x);
    expect(x + FOUNDRY_W).toBeLessThanOrEqual(span.x + span.w);
    const warehouse = PLOT_SPANS[1];
    expect(span.x + span.w - (x + FOUNDRY_W)).toBe(
      (warehouse?.x ?? 0) + (warehouse?.w ?? 0) - (buildingX(1) + WAREHOUSE_W),
    );
  });

  it("keeps its scaffold clear of the Warehouse and inside the scene", () => {
    const x = buildingX(2);
    // The scaffold's bars reach 6 art px past the picture on each side.
    expect(x - 6).toBeGreaterThan(buildingX(1) + WAREHOUSE_W);
    expect(x + FOUNDRY_W + 6).toBeLessThanOrEqual(SCENE_W);
  });

  it("has the Warehouse's yard: the plots between have no free ground", () => {
    expect(siteYard(2)).toEqual(siteYard(1));
  });
});

describe("the vehicles on the road (#754)", () => {
  it("draws a wagon fleet as wagons, as many as fit", () => {
    expect(roadVehicles({ horseWagon: 5, truck: 0 }, 3)).toEqual([
      "horseWagon",
      "horseWagon",
      "horseWagon",
    ]);
    expect(roadVehicles({ horseWagon: 0, truck: 0 }, 3)).toEqual([]);
  });

  it("draws each truck as a truck, the best carriers first", () => {
    expect(roadVehicles({ horseWagon: 2, truck: 1 }, 3)).toEqual([
      "truck",
      "horseWagon",
      "horseWagon",
    ]);
    expect(roadVehicles({ horseWagon: 1, truck: 4 }, 2)).toEqual([
      "truck",
      "truck",
    ]);
  });

  it("draws in the order the drivers take the vehicles", () => {
    const begin = createMountain();
    const fleet = { horseWagon: 2, truck: 2 };
    const driven = drivenFleet({
      fleet,
      jobs: { ...begin.jobs, driving: 3 },
    });
    expect(roadVehicles(driven, 3)).toEqual(["truck", "truck", "horseWagon"]);
  });
});
