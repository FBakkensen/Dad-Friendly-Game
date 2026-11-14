import { LAYERS, layerOf, type LayerId } from "../layers";
import { RELICS, hasRelic, type RelicId } from "../relics";
import { machinesInPlay, owned, tierById, type MachineId } from "../tiers";
import { dayNumber } from "./casual";
import {
  LEDGER_DAY_DIGITS as DAY_DIGITS,
  LEDGER_HASH_DIGITS as HASH_DIGITS,
  LEDGER_HASH_RADIX as HEX,
} from "./targets";
import type { World } from "./world";

/**
 * The pacing ledger (#554): when each band, machine and relic first came to
 * one player type on one seed, when the run ended, and a hash of where it
 * ended. A record to read, not a bound: the gate shows a move as its diff.
 */
export type LedgerEntry = {
  readonly policyId: string;
  readonly seed: number;
  /** Day each band is first reached. The Topsoil is day 1. */
  readonly bands: Readonly<Partial<Record<LayerId, number>>>;
  /** Day each machine in play is first owned. */
  readonly machines: Readonly<Partial<Record<MachineId, number>>>;
  /** Day each relic is first found. */
  readonly relics: Readonly<Partial<Record<RelicId, number>>>;
  readonly finishDay: number | undefined;
  readonly endHash: string;
};

export type LedgerLog = {
  readonly observe: (world: World) => void;
  readonly entry: (end: {
    readonly policyId: string;
    readonly seed: number;
    readonly finishDay: number | undefined;
    readonly end: World;
  }) => LedgerEntry;
};

/** Watches one run. Only a new mountain is read, so a still second costs nothing. */
export function createLedgerLog(): LedgerLog {
  const machineIds = machinesInPlay();
  const bands: Partial<Record<LayerId, number>> = {};
  const machines: Partial<Record<MachineId, number>> = Object.fromEntries(
    machineIds.map((id) => [id, undefined]),
  );
  const relics: Partial<Record<RelicId, number>> = Object.fromEntries(
    RELICS.map((relic) => [relic.id, undefined]),
  );
  let last: World["mountain"] | undefined;
  return {
    observe(world) {
      const mountain = world.mountain;
      if (mountain === last) {
        return;
      }
      last = mountain;
      const day = dayNumber(world.clock);
      const reached = layerOf(mountain).from;
      for (const layer of LAYERS) {
        if (layer.from <= reached && bands[layer.id] === undefined) {
          bands[layer.id] = day;
        }
      }
      for (const id of machineIds) {
        if (machines[id] === undefined && owned(mountain, tierById(id)) > 0) {
          machines[id] = day;
        }
      }
      for (const relic of RELICS) {
        if (relics[relic.id] === undefined && hasRelic(mountain, relic.id)) {
          relics[relic.id] = day;
        }
      }
    },
    entry({ policyId, seed, finishDay, end }) {
      return {
        policyId,
        seed,
        bands: { ...bands },
        machines: { ...machines },
        relics: { ...relics },
        finishDay,
        endHash: endHash(end),
      };
    },
  };
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a over the end world: the mountain, the hazards and the clock. */
export function endHash(world: World): string {
  const text = JSON.stringify(world);
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX).padStart(HASH_DIGITS, "0");
}

const NONE = "—";

function dayText(day: number | undefined): string {
  return day === undefined ? NONE : day.toFixed(DAY_DIGITS);
}

/** The committed ledger: one row per player type and seed, sorted. */
export function renderLedger(entries: readonly LedgerEntry[]): string {
  const machineIds = machinesInPlay();
  const headers = [
    "Policy",
    "Seed",
    ...LAYERS.map((layer) => layer.name),
    ...machineIds.map((id) => tierById(id).name),
    ...RELICS.map((relic) => relic.name),
    "Finish",
    "End hash",
  ];
  const sorted = [...entries].sort(
    (left, right) =>
      left.policyId.localeCompare(right.policyId) || left.seed - right.seed,
  );
  const rows = sorted.map((entry) =>
    [
      entry.policyId,
      String(entry.seed),
      ...LAYERS.map((layer) => dayText(entry.bands[layer.id])),
      ...machineIds.map((id) => dayText(entry.machines[id])),
      ...RELICS.map((relic) => dayText(entry.relics[relic.id])),
      dayText(entry.finishDay),
      entry.endHash,
    ].join(" | "),
  );
  return [
    "# Pacing ledger",
    "",
    "Written by `npm run lab:ledger` (#554). The day each band is reached, each machine first bought and each relic found, for every player type on the gate's seeds; the day the run ends; and a hash of where it ended. A record to read, not a bound. The gate's `lab` step fails when a fresh run differs, so a change that moves the pace shows here as a diff.",
    "",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

/** The lines a fresh ledger dropped (`- `) and added (`+ `). Empty when they match. */
export function ledgerDiff(
  committed: string,
  fresh: string,
): readonly string[] {
  const before = committed.split("\n");
  const after = fresh.split("\n");
  const kept = new Set(after);
  const had = new Set(before);
  return [
    ...before.filter((line) => !kept.has(line)).map((line) => `- ${line}`),
    ...after.filter((line) => !had.has(line)).map((line) => `+ ${line}`),
  ];
}
