import { patched, type MountainPatch } from "../test-fixtures";
import { describe, expect, it } from "vitest";
import { buildingById, buildingsInPlay } from "../city";
import { withFactors } from "../economy/factors";
import { createMountain, type Mountain } from "../mountain";
import { PLAY_FACTORS } from "../part-switch";
import { MOUNTAIN_STONES } from "../scale";
import { machinesInPlay, tierById } from "../tiers";
import {
  createLedgerLog,
  endHash,
  ledgerDiff,
  renderLedger,
  type LedgerEntry,
} from "./ledger";
import { DAY_MS, HOUR_MS } from "./targets";
import { createWorld, type World } from "./world";

function at(clock: number, mountain: Mountain): World {
  return { ...createWorld(1, mountain), clock };
}

function dug(mined: number, over: MountainPatch = {}): Mountain {
  return patched(
    { ...createMountain(), remaining: MOUNTAIN_STONES - mined },
    over,
  );
}

/** The live game's mine: the fresh mine with part 2 (#737). */
function inPlay<T>(body: () => T): T {
  return withFactors(PLAY_FACTORS, body);
}

describe("pacing ledger", () => {
  it("a building's day is the day it is first operational", () => {
    inPlay(() => {
      const machine = machinesInPlay()[0];
      if (machine === undefined) {
        throw new Error("the game has no machine");
      }
      const log = createLedgerLog();
      log.observe(at(0, createMountain()));
      log.observe(at(6 * HOUR_MS, dug(1_000)));
      log.observe(
        at(
          DAY_MS,
          dug(2_000, {
            operational: ["lightTower"],
            owned: { ...createMountain().owned, [machine]: 1 },
          }),
        ),
      );
      log.observe(at(2 * DAY_MS, dug(3_000, { operational: ["lightTower"] })));
      const end = at(
        3 * DAY_MS,
        dug(4_000, { operational: ["lightTower", "warehouse"] }),
      );
      log.observe(end);
      const entry = log.entry({
        policyId: "alpha",
        seed: 2,
        finishDay: 4,
        end,
      });

      expect(entry.policyId).toBe("alpha");
      expect(entry.seed).toBe(2);
      expect(entry.buildings).toEqual({ lightTower: 2, warehouse: 4 });
      expect(entry.machines[machine]).toBe(2);
      expect(entry.finishDay).toBe(4);
      expect(entry.endHash).toBe(endHash(end));
      expect(Object.keys(entry.machines)).toEqual([...machinesInPlay()]);
    });
  });

  it("leaves a building the run never put a roof on empty, and an unfinished run has no finish", () => {
    inPlay(() => {
      const log = createLedgerLog();
      log.observe(at(0, createMountain()));
      const entry = log.entry({
        policyId: "alpha",
        seed: 1,
        finishDay: undefined,
        end: at(DAY_MS, createMountain()),
      });
      expect(entry.buildings).toEqual({});
      expect(entry.finishDay).toBeUndefined();
    });
  });

  it("hashes the end state, so any change in where the run ended shows", () => {
    const end = at(DAY_MS, dug(10));
    expect(endHash(end)).toBe(endHash(at(DAY_MS, dug(10))));
    expect(endHash(end)).not.toBe(endHash(at(DAY_MS, dug(11))));
    expect(endHash(end)).not.toBe(endHash(at(DAY_MS + 1, dug(10))));
    expect(endHash(end)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("the ledger's columns are the buildings in play, the machines in play, Finish and End hash", () => {
    inPlay(() => {
      const entry = (policyId: string, seed: number): LedgerEntry => ({
        policyId,
        seed,
        buildings: { lightTower: 2.345 },
        machines: {},
        finishDay: seed === 1 ? 6.5 : undefined,
        endHash: "0000abcd",
      });
      const markdown = renderLedger([
        entry("beta", 1),
        entry("Zeta", 1),
        entry("alpha", 2),
        entry("alpha", 1),
      ]);
      expect(buildingsInPlay().map((building) => building.id)).toEqual([
        "lightTower",
        "warehouse",
      ]);
      expect(markdown.split("\n")).toContain(
        `| ${[
          "Policy",
          "Seed",
          buildingById("lightTower").name,
          buildingById("warehouse").name,
          ...machinesInPlay().map((id) => tierById(id).name),
          "Finish",
          "End hash",
        ].join(" | ")} |`,
      );
      expect(markdown).toContain("The day each building's roof is on");
      expect(markdown).not.toContain("band");
      const rows = markdown
        .split("\n")
        .filter((line) => /^\| (alpha|beta|Zeta) /.test(line));
      // Code-unit order, whatever the machine's locale: upper case first.
      expect(rows.map((line) => line.split(" | ").slice(0, 2))).toEqual([
        ["| Zeta", "1"],
        ["| alpha", "1"],
        ["| alpha", "2"],
        ["| beta", "1"],
      ]);
      expect(rows[1]).toContain("| 2.35 | — |");
      expect(rows[1]).toContain("| 6.50 |");
      expect(rows[2]).toContain("| — | 0000abcd |");
      expect(markdown.endsWith("\n")).toBe(true);
    });
  });

  it("names only part 1's building when part 2 is off", () => {
    const markdown = withFactors({}, () => renderLedger([]));
    expect(markdown).toContain(`| ${buildingById("lightTower").name} |`);
    expect(markdown).not.toContain(buildingById("warehouse").name);
  });

  it("names the rows a fresh run moved, old and new", () => {
    const old = "# Ledger\n\n| a | 1 |\n| b | 2 |\n";
    const fresh = "# Ledger\n\n| a | 1 |\n| b | 3 |\n";
    expect(ledgerDiff(old, old)).toEqual([]);
    expect(ledgerDiff(old, fresh)).toEqual(["- | b | 2 |", "+ | b | 3 |"]);
  });
});
