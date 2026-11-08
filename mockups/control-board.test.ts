import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatCompact } from "../src/format.ts";
import { hardnessOf } from "../src/layers.ts";
import {
  MILESTONES,
  milestoneLine,
  milestoneMultiplier,
} from "../src/milestones.ts";
import { tierById, tierCost, type TierId } from "../src/tiers.ts";

/**
 * The control-board reference mockup (#377) is plain HTML that opens from
 * any static server, so it cannot import src/. Its game numbers sit in one
 * JSON block instead, and this test keeps that block equal to the game
 * (#387).
 */
type MockNumbers = {
  readonly growth: { readonly machine: number; readonly worker: number };
  readonly tiers: Readonly<
    Record<string, { readonly firstCost: number; readonly perSecond: number }>
  >;
  readonly granite: Readonly<Record<string, number>>;
  readonly milestones: {
    readonly multiplier: number;
    readonly reachedLine: string;
    readonly marks: Readonly<
      Record<string, readonly { readonly at: number; readonly goal: string }[]>
    >;
  };
};

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "control-board/index.html"),
  "utf8",
);
const block =
  /<script type="application\/json" id="game-numbers">([\s\S]*?)<\/script>/u.exec(
    html,
  );
const mock = JSON.parse(block?.[1] ?? "null") as MockNumbers;
const BOARD_TIERS: readonly TierId[] = ["helper", "cart", "drill", "borer"];
/** The mockup's curve, as written in index.html. */
const curve = (first: number, growth: number, n: number): number =>
  Math.ceil(Number((first * growth ** n).toPrecision(12)));

describe("control-board mockup numbers", () => {
  it("has the game-numbers block", () => {
    expect(block).not.toBeNull();
  });

  it.each(BOARD_TIERS)("prices and speeds %s as src/tiers.ts", (id) => {
    const tier = tierById(id);
    const row = mock.tiers[id];
    expect(row).toEqual({
      firstCost: tier.firstCost,
      perSecond: tier.perSecond,
    });
    const growth = tier.staff === 0 ? mock.growth.worker : mock.growth.machine;
    for (const n of [0, 1, 10, 25, 30, 56, 100]) {
      expect(curve(row?.firstCost ?? 0, growth, n)).toBe(tierCost(tier, n));
    }
  });

  it("keeps only the tiers the board shows", () => {
    expect(Object.keys(mock.tiers).sort()).toEqual([...BOARD_TIERS].sort());
  });

  it("slows and favours machines in the Granite as src/layers.ts", () => {
    for (const id of BOARD_TIERS) {
      expect(mock.granite[id] ?? 1).toBe(hardnessOf(2, id));
    }
  });

  it.each(BOARD_TIERS)("marks %s as src/milestones.ts", (id) => {
    expect(mock.milestones.marks[id]).toEqual(MILESTONES[id]);
  });

  it("doubles on a mark and words the line as src/milestones.ts", () => {
    const cart = MILESTONES.cart ?? [];
    const [first, second] = cart;
    expect(first && second).toBeTruthy();
    if (first === undefined || second === undefined) return;
    expect(milestoneMultiplier("cart", first.at)).toBe(
      mock.milestones.multiplier,
    );
    expect(milestoneLine("cart", first.at, formatCompact)).toBe(
      `${mock.milestones.reachedLine} ${String(first.at)} of ${String(second.at)} · ${second.goal}`,
    );
  });
});
