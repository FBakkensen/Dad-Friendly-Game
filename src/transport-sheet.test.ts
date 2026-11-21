// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { placeOrder } from "./city";
import { createMemoryCloudSave } from "./cloud-save";
import { mountFrameScreen } from "./frame-screen";
import type { FrameState } from "./frame-state";
import type { Mountain } from "./mountain";
import { levels, slice2Part1 } from "./part-three.harness";
import { createProgressStore } from "./progress-store";
import { createTransportSheet } from "./transport-sheet";

function stateOf(
  mountain: Mountain,
  dispatch: (move: unknown) => Promise<void>,
): FrameState {
  return {
    progress: { dispatch },
    mountain: () => mountain,
    amount: () => "one",
    advanceAmount: vi.fn(),
  } as unknown as FrameState;
}

describe("global Transport sheet & Frame integration (#768)", () => {
  it("stays hidden in Slice 1 play and shows Transport chip & hidden City plate under slice2Part1", () => {
    const authOff = createMemoryAuth();
    const storeOff = createProgressStore({
      auth: authOff,
      cloudSave: createMemoryCloudSave(),
    });
    const hostOff = document.createElement("div");
    const screenOff = mountFrameScreen({
      root: hostOff,
      auth: authOff,
      progress: storeOff,
    });
    const chipOff =
      hostOff.querySelector<HTMLButtonElement>(".frame-transport");
    expect(chipOff?.hidden).toBe(true);
    expect(
      hostOff.querySelector(".frame")?.classList.contains("slice2-part1"),
    ).toBe(false);
    expect(screenOff.transportSheet.root.hidden).toBe(true);

    slice2Part1(() => {
      const auth = createMemoryAuth();
      const store = createProgressStore({
        auth,
        cloudSave: createMemoryCloudSave(),
      });
      const host = document.createElement("div");
      const screen = mountFrameScreen({ root: host, auth, progress: store });
      expect(
        host.querySelector(".frame")?.classList.contains("slice2-part1"),
      ).toBe(true);
      const chip = host.querySelector<HTMLButtonElement>(".frame-transport");
      expect(chip?.hidden).toBe(false);
      expect(chip?.textContent).toContain("0/1");
      expect(chip?.textContent).toContain("0/s");

      chip?.click();
      expect(screen.transportSheet.root.hidden).toBe(false);
      screen.transportSheet.root
        .querySelector<HTMLButtonElement>(".frame-sheet-close")
        ?.click();
      expect(screen.transportSheet.root.hidden).toBe(true);

      host
        .querySelector<HTMLButtonElement>('.frame-site[data-site="city"]')
        ?.click();
      expect(host.querySelector<HTMLElement>(".city-plate")?.hidden).toBe(true);
    });
  });

  it("renders open runs, +Wagon key, and dispatches vehicle buy and driver step moves", () => {
    slice2Part1(() => {
      const dispatch = vi.fn(() => Promise.resolve());
      const m = placeOrder(
        levels({
          sunk: false,
          operational: ["lightTower"],
          topsoil: 2,
          hoisting: 2,
          driving: 1,
          building: 1,
          kilns: 1,
          stock: { stones: 5_000 },
          pithead: { topsoil: 90 },
        }),
      );
      const sheet = createTransportSheet(stateOf(m, dispatch));
      sheet.open();
      sheet.paint(m);
      expect(sheet.root.hidden).toBe(false);
      expect(sheet.root.querySelectorAll(".transport-run").length).toBe(4);

      const wagonKey = sheet.root.querySelector<HTMLButtonElement>(
        '.transport-key[data-vehicle="horseWagon"]',
      );
      expect(wagonKey?.hidden).toBe(false);
      expect(wagonKey?.textContent).toContain("+Wagon · 18/s");
      wagonKey?.click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "buyVehicle",
        id: "horseWagon",
      });

      const minus = sheet.root.querySelector<HTMLButtonElement>(
        '.frame-step[data-way="free"]',
      );
      expect(minus).not.toBeNull();
      minus?.click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "freeWorker",
        job: "driving",
        count: 1,
      });
    });
  });
});
