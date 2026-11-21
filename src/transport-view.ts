import { SITE_GOOD_CAP } from "./building-site";
import { vehicleHint, vehicleKeys, type VehicleKey } from "./city-view";
import { formatCompact } from "./format";
import { GOOD_NAMES } from "./frame-view";
import { makerBuffer, makerInputRoom } from "./makers";
import type { Mountain } from "./mountain";
import { transportCount, type Lamp } from "./next-view";
import { VEHICLE_WORDS, formatSpeed, plural } from "./screen-words";
import { slice2LiveSnapshot } from "./slice2-flow";
import { stockpileRoom, stockyardOpen } from "./stockyard";
import type { BuyAmount } from "./tiers";
import {
  VEHICLES,
  drivenFleet,
  fleetRate,
  fleetSize,
  runSnapshots,
  vehicleCarries,
  type CityRunGood,
  type RunId,
  type RunSnapshot,
} from "./transport";
import { jobRow, type JobRow } from "./workforce-view";

/**
 * Pure view model for the global Transport button and sheet under Slice 2
 * Part 1 (#768; spec, "What he sees"): top strip chip with status lamp,
 * drivers & fleet plate, vehicle buys, Part 1 even-share rule line, and
 * open single-good runs with live rate, vehicle share, source, destination
 * buffer bar, and idle/full markers. Never writes the mountain.
 */

/** Plain rule line for Part 1 even-share transport (proposed copy, pending Flemming's review on #768). */
export const TRANSPORT_RULE_PART_1 =
  "Staffed vehicles share evenly across active runs.";

/** Top controls strip chip: sibling to Workforce under Slice 2 Part 1. */
export type TransportChip = {
  readonly driven: number;
  readonly owned: number;
  /** "1/1", "1/2". */
  readonly count: string;
  /** "18/s". */
  readonly rate: string;
  /** Amber when unstaffed vehicles exist; green when a vehicle is affordable; else dark. */
  readonly lamp: Lamp;
  readonly label: string;
};

/** Status of an open transport run. */
type TransportRunStatus =
  "active" | "noDrivers" | "onHold" | "destFull" | "srcEmpty";

/** One open single-good run row in the Transport sheet. */
export type TransportRunRow = {
  readonly id: RunId;
  /** "Mine → Stockyard", "Topsoil → Kilns", "Granite → Saws", "Stockyard → City". */
  readonly route: string;
  /** "Stone", "Topsoil rock", "Granite rock", "Brick", "Cut stone". */
  readonly good: string;
  /** "Pithead 90", "Stock 12K". */
  readonly sourceText: string;
  /** "1.2K of 6M", "200 of 500", or "" before the stockyard opens. */
  readonly destText: string;
  /** 0..1 fill fraction, or undefined when uncapped (pre-stockyard Stone). */
  readonly destFill: number | undefined;
  readonly destFull: boolean;
  readonly rate: number;
  /** "18/s", "0/s". */
  readonly rateText: string;
  /** "1.0 veh", "0.5 veh", "<0.1 veh", "0 veh". */
  readonly shareText: string;
  readonly status: TransportRunStatus;
  /** "", "no driver", "on hold", "dest full", "src empty". */
  readonly statusText: string;
};

/** Complete view model for the global Transport sheet. */
export type TransportSheetView = {
  readonly drivers: string;
  readonly fleet: string;
  readonly totalRate: string;
  readonly rule: string;
  readonly steps: JobRow;
  readonly keys: readonly VehicleKey[];
  readonly hint: string | undefined;
  readonly runs: readonly TransportRunRow[];
};

const RUN_META: Readonly<
  Record<RunId, { readonly route: string; readonly good: string }>
> = {
  pitToStockyardStones: { route: "Mine → Stockyard", good: "Stone" },
  pitTopsoilToKilns: { route: "Topsoil → Kilns", good: "Topsoil rock" },
  pitGraniteToSaws: { route: "Granite → Saws", good: "Granite rock" },
  "stockToCity:stones": {
    route: "Stockyard → City",
    good: GOOD_NAMES.stones,
  },
  "stockToCity:brick": {
    route: "Stockyard → City",
    good: GOOD_NAMES.brick,
  },
  "stockToCity:cutStone": {
    route: "Stockyard → City",
    good: GOOD_NAMES.cutStone,
  },
};

const STATUS_WORDS: Readonly<Record<TransportRunStatus, string>> = {
  active: "",
  noDrivers: "no driver",
  onHold: "on hold",
  destFull: "dest full",
  srcEmpty: "src empty",
};

function drivenTotal(mountain: Mountain): number {
  const driven = drivenFleet(mountain);
  return VEHICLES.reduce((sum, vehicle) => sum + driven[vehicle.id], 0);
}

/** Global top strip Transport chip. */
export function transportChip(mountain: Mountain): TransportChip {
  const driven = drivenTotal(mountain);
  const owned = fleetSize(mountain);
  const rateNum = fleetRate(mountain);
  const rate = `${formatSpeed(rateNum)}/s`;
  const lamp: Lamp =
    driven < owned ? "amber" : transportCount(mountain) > 0 ? "green" : "dark";
  return {
    driven,
    owned,
    count: `${String(driven)}/${String(owned)}`,
    rate,
    lamp,
    label: `Transport: ${String(driven)} of ${String(owned)} ${plural(owned, ["vehicle", "vehicles"])} running, ${rate}.`,
  };
}

function fleetSummary(mountain: Mountain): string {
  const driven = drivenFleet(mountain);
  const parts = VEHICLES.filter(
    (vehicle) => mountain.fleet[vehicle.id] > 0,
  ).map((vehicle) => {
    const owned = mountain.fleet[vehicle.id];
    const on = driven[vehicle.id];
    const kind = plural(owned, VEHICLE_WORDS[vehicle.id]);
    const carries = formatSpeed(on * vehicleCarries(vehicle));
    return `${String(on)} of ${String(owned)} ${kind} (${carries}/s)`;
  });
  return parts.join(" · ");
}

function destInfo(
  mountain: Mountain,
  id: RunId,
): {
  readonly text: string;
  readonly fill: number | undefined;
} {
  if (id === "pitToStockyardStones") {
    if (!stockyardOpen(mountain)) {
      return { text: "", fill: undefined };
    }
    const held = mountain.stock.stones;
    const room = stockpileRoom(mountain, "stones");
    return {
      text: `${formatCompact(held)} of ${formatCompact(room)}`,
      fill: room > 0 ? Math.min(1, held / room) : 1,
    };
  }
  if (id === "pitTopsoilToKilns") {
    const held = makerBuffer(mountain, "kiln", "topsoilRock");
    const room = makerInputRoom(mountain, "kiln");
    return {
      text: `${formatCompact(held)} of ${formatCompact(room)}`,
      fill: room > 0 ? Math.min(1, held / room) : 1,
    };
  }
  if (id === "pitGraniteToSaws") {
    const held = makerBuffer(mountain, "saw", "graniteRock");
    const room = makerInputRoom(mountain, "saw");
    return {
      text: `${formatCompact(held)} of ${formatCompact(room)}`,
      fill: room > 0 ? Math.min(1, held / room) : 1,
    };
  }
  const good = id.slice("stockToCity:".length) as CityRunGood;
  const site =
    mountain.project.kind === "unordered" ? undefined : mountain.project.site;
  const held = site === undefined ? 0 : site.onSite[good];
  return {
    text: `${formatCompact(held)} of ${formatCompact(SITE_GOOD_CAP)}`,
    fill: Math.min(1, held / SITE_GOOD_CAP),
  };
}

function sourceLabel(snap: RunSnapshot): string {
  const prefix = snap.id.startsWith("stockToCity:") ? "Stock" : "Pithead";
  return `${prefix} ${formatCompact(snap.source)}`;
}

function formatVehShare(share: number): string {
  if (share <= 0) {
    return "0 veh";
  }
  if (share < 0.05) {
    return "<0.1 veh";
  }
  const rounded = Math.round(share * 10) / 10;
  return `${rounded.toFixed(1)} veh`;
}

function runStatus(
  mountain: Mountain,
  snap: RunSnapshot,
  driven: number,
  destCap: number,
  rate: number,
  hasSourceFlow: boolean,
): TransportRunStatus {
  if (driven <= 0) {
    return "noDrivers";
  }
  if (
    snap.id.startsWith("stockToCity:") &&
    mountain.project.kind === "onHold"
  ) {
    return "onHold";
  }
  if (destCap <= 0) {
    return "destFull";
  }
  if (snap.source <= 0 && !hasSourceFlow) {
    return "srcEmpty";
  }
  return rate > 0 ? "active" : "srcEmpty";
}

function hasFlowFor(
  id: RunId,
  pitheadCap: Readonly<Record<"topsoil" | "granite", number>>,
  stockCap: Readonly<Record<CityRunGood, number>>,
): boolean {
  if (id === "pitToStockyardStones") {
    return pitheadCap.topsoil + pitheadCap.granite > 0;
  }
  if (id === "pitTopsoilToKilns") {
    return pitheadCap.topsoil > 0;
  }
  if (id === "pitGraniteToSaws") {
    return pitheadCap.granite > 0;
  }
  const good = id.slice("stockToCity:".length) as CityRunGood;
  return stockCap[good] > 0;
}

/** Complete view model for the global Transport sheet. */
export function transportSheetView(
  mountain: Mountain,
  amount: BuyAmount,
): TransportSheetView {
  const driven = drivenTotal(mountain);
  const fleet = fleetRate(mountain);
  const driving = mountain.jobs.driving;
  const snaps = runSnapshots(mountain);
  const { runRates, destCaps, pitheadCap, stockCap } =
    slice2LiveSnapshot(mountain);
  const runs: TransportRunRow[] = snaps
    .filter((snap) => snap.open)
    .map((snap) => {
      const meta = RUN_META[snap.id];
      const rate = runRates[snap.id];
      const status = runStatus(
        mountain,
        snap,
        driven,
        destCaps[snap.id],
        rate,
        hasFlowFor(snap.id, pitheadCap, stockCap),
      );
      const dest = destInfo(mountain, snap.id);
      const vehShare = fleet > 0 && rate > 0 ? (rate / fleet) * driven : 0;
      return {
        id: snap.id,
        route: meta.route,
        good: meta.good,
        sourceText: sourceLabel(snap),
        destText: dest.text,
        destFill: dest.fill,
        destFull: status === "destFull",
        rate,
        rateText: `${formatSpeed(rate)}/s`,
        shareText: formatVehShare(vehShare),
        status,
        statusText: STATUS_WORDS[status],
      };
    });
  return {
    drivers: `${String(driving)} ${plural(driving, ["driver", "drivers"])}`,
    fleet: fleetSummary(mountain),
    totalRate: `${formatSpeed(fleet)}/s`,
    rule: TRANSPORT_RULE_PART_1,
    steps: jobRow(mountain, "driving"),
    keys: vehicleKeys(mountain, amount),
    hint: vehicleHint(mountain),
    runs,
  };
}
