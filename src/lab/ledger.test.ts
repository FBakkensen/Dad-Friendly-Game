import { describe, expect, it } from "vitest";
import { LAYERS } from "../layers";
import { createMountain, type Mountain } from "../mountain";
import { MOUNTAIN_STONES } from "../scale";
import { RELICS } from "../relics";
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

function dug(mined: number, over: Partial<Mountain> = {}): Mountain {
  return { ...createMountain(), remaining: MOUNTAIN_STONES - mined, ...over };
}

describe("pacing ledger", () => {
  it("stamps the day each band, machine and relic first shows up, and the finish", () => {
    const granite = LAYERS[1];
    const lantern = RELICS[0];
    const machine = machinesInPlay()[0];
    if (lantern === undefined || machine === undefined) {
      throw new Error("the game has no lantern or machine");
    }
    const log = createLedgerLog();
    log.observe(at(0, createMountain()));
    log.observe(at(6 * HOUR_MS, dug(lantern.depth)));
    log.observe(
      at(DAY_MS, dug(granite.from, { [tierById(machine).field]: 1 })),
    );
    log.observe(at(2 * DAY_MS, dug(granite.from + 1)));
    const end = at(3 * DAY_MS, dug(MOUNTAIN_STONES));
    const entry = log.entry({
      policyId: "alpha",
      seed: 2,
      finishDay: 4,
      end,
    });

    expect(entry.policyId).toBe("alpha");
    expect(entry.seed).toBe(2);
    expect(entry.bands["topsoil"]).toBe(1);
    expect(entry.bands[granite.id]).toBe(2);
    expect(entry.relics[lantern.id]).toBe(1.25);
    expect(entry.machines[machine]).toBe(2);
    expect(entry.finishDay).toBe(4);
    expect(entry.endHash).toBe(endHash(end));
    expect(Object.keys(entry.machines)).toEqual([...machinesInPlay()]);
  });

  it("leaves a milestone the run never reached empty, and an unfinished run has no finish", () => {
    const log = createLedgerLog();
    log.observe(at(0, createMountain()));
    const entry = log.entry({
      policyId: "alpha",
      seed: 1,
      finishDay: undefined,
      end: at(DAY_MS, createMountain()),
    });
    expect(entry.bands["heart"]).toBeUndefined();
    expect(entry.finishDay).toBeUndefined();
    expect(RELICS.map((relic) => entry.relics[relic.id])).toEqual(
      RELICS.map(() => undefined),
    );
  });

  it("hashes the end state, so any change in where the run ended shows", () => {
    const end = at(DAY_MS, dug(10));
    expect(endHash(end)).toBe(endHash(at(DAY_MS, dug(10))));
    expect(endHash(end)).not.toBe(endHash(at(DAY_MS, dug(11))));
    expect(endHash(end)).not.toBe(endHash(at(DAY_MS + 1, dug(10))));
    expect(endHash(end)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("renders one row per player type and seed, sorted, in two decimals", () => {
    const entry = (policyId: string, seed: number): LedgerEntry => ({
      policyId,
      seed,
      bands: { topsoil: 1, granite: 2.345 },
      machines: {},
      relics: {},
      finishDay: seed === 1 ? 6.5 : undefined,
      endHash: "0000abcd",
    });
    const markdown = renderLedger([
      entry("beta", 1),
      entry("alpha", 2),
      entry("alpha", 1),
    ]);
    const rows = markdown
      .split("\n")
      .filter((line) => /^\| (alpha|beta) /.test(line));
    expect(rows.map((line) => line.split(" | ").slice(0, 2))).toEqual([
      ["| alpha", "1"],
      ["| alpha", "2"],
      ["| beta", "1"],
    ]);
    expect(rows[0]).toContain("| 2.35 |");
    expect(rows[0]).toContain("| 6.50 |");
    expect(rows[1]).toContain("| — | 0000abcd |");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("names the rows a fresh run moved, old and new", () => {
    const old = "# Ledger\n\n| a | 1 |\n| b | 2 |\n";
    const fresh = "# Ledger\n\n| a | 1 |\n| b | 3 |\n";
    expect(ledgerDiff(old, old)).toEqual([]);
    expect(ledgerDiff(old, fresh)).toEqual(["- | b | 2 |", "+ | b | 3 |"]);
  });
});
