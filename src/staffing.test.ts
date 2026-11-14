import { describe, expect, it } from "vitest";
import {
  fillForLine,
  staffMachines,
  type StaffSlot,
  type Staffing,
} from "./staffing";

function stonesOf(slots: readonly StaffSlot[], running: Staffing): number {
  return slots.reduce(
    (total, slot) => total + running[slot.id] * slot.speed,
    0,
  );
}

/** Every staffing there is, for small crews. */
function bruteBest(slots: readonly StaffSlot[], hands: number): number {
  const [slot, ...rest] = slots;
  if (slot === undefined) {
    return 0;
  }
  let best = 0;
  for (let n = 0; n <= slot.count && n * slot.staff <= hands; n += 1) {
    best = Math.max(
      best,
      n * slot.speed + bruteBest(rest, hands - n * slot.staff),
    );
  }
  return best;
}

function slots(
  carts: number,
  drills: number,
  borers: number,
  machines: number,
  speeds: { cart: number; drill: number; borer: number; machine: number },
  machineStaff = 10,
): StaffSlot[] {
  return [
    {
      id: "machine",
      staff: machineStaff,
      count: machines,
      speed: speeds.machine,
    },
    { id: "borer", staff: 8, count: borers, speed: speeds.borer },
    { id: "drill", staff: 1, count: drills, speed: speeds.drill },
    { id: "cart", staff: 1, count: carts, speed: speeds.cart },
  ];
}

describe("staffMachines (#500)", () => {
  it("keeps 7 faster drills running rather than start a second borer", () => {
    // Each drill beats an eighth of a borer, so 16 hands stay on drills.
    const crew = slots(0, 200, 2, 0, {
      cart: 6,
      drill: 600,
      borer: 3_000,
      machine: 0,
    });
    const fifteen = staffMachines(crew, 15);
    const sixteen = staffMachines(crew, 16);
    expect(fifteen.borer).toBe(0);
    expect(fifteen.drill).toBe(15);
    expect(sixteen.borer).toBe(0);
    expect(sixteen.drill).toBe(16);
  });

  it("still runs the borer when it beats the drills its hands leave", () => {
    const crew = slots(0, 3, 1, 0, {
      cart: 6,
      drill: 36,
      borer: 357,
      machine: 0,
    });
    const running = staffMachines(crew, 10);
    expect(running.borer).toBe(1);
    expect(running.drill).toBe(2);
  });

  it("runs two borers over a machine that would strand six hands", () => {
    const crew = slots(0, 0, 2, 1, {
      cart: 6,
      drill: 36,
      borer: 900,
      machine: 1_000,
    });
    const running = staffMachines(crew, 16);
    expect(running.borer).toBe(2);
    expect(running.machine).toBe(0);
  });

  it("keeps the bigger machines on a tie", () => {
    const crew = slots(0, 8, 1, 0, {
      cart: 6,
      drill: 10,
      borer: 80,
      machine: 0,
    });
    expect(staffMachines(crew, 8).borer).toBe(1);
  });

  it("is the best staffing there is, and one more hand never mines less", () => {
    let seed = 7;
    const next = (top: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % top;
    };
    for (let round = 0; round < 300; round += 1) {
      const crew = slots(
        next(12),
        next(12),
        next(5),
        next(4),
        {
          cart: 1 + next(40),
          drill: 1 + next(120),
          borer: 1 + next(900),
          machine: 1 + next(2_400),
        },
        next(2) === 0 ? 10 : 5,
      );
      let before = -1;
      for (let hands = 0; hands <= 60; hands += 1) {
        const running = staffMachines(crew, hands);
        const stones = stonesOf(crew, running);
        expect(stones).toBeCloseTo(bruteBest(crew, hands), 6);
        const used = crew.reduce(
          (total, slot) => total + running[slot.id] * slot.staff,
          0,
        );
        expect(used).toBeLessThanOrEqual(hands);
        expect(stones).toBeGreaterThanOrEqual(before);
        before = stones;
      }
    }
  });
});

describe("fillForLine (#534)", () => {
  const SPEEDS = { cart: 6, drill: 36, borer: 357, machine: 2100 };

  it("keeps the big machines and fills the one-hand machines for the line", () => {
    const staffing: Staffing = {
      cart: 0,
      hoist: 0,
      drill: 0,
      borer: 1,
      train: 0,
      machine: 0,
    };
    // Ten hands: eight on the borer (the face), two left for carts (the haul).
    const filled = fillForLine(
      slots(5, 5, 1, 0, SPEEDS),
      10,
      staffing,
      20,
      true,
    );
    expect(filled.borer).toBe(1);
    expect(filled.cart).toBe(2);
  });

  it("gives the staffing back when its big machines need more hands than there are", () => {
    const staffing: Staffing = {
      cart: 0,
      hoist: 0,
      drill: 0,
      borer: 2,
      train: 0,
      machine: 0,
    };
    expect(
      fillForLine(slots(5, 5, 2, 0, SPEEDS), 10, staffing, 20, false),
    ).toBe(staffing);
  });
});
