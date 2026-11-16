import { formatCompact } from "./format";
import { orderStrip } from "./frame-view";
import { type Mountain } from "./mountain";
import { MACHINE_WORDS, VEHICLE_WORDS } from "./screen-words";
import { STAGES } from "./line";
import { machinesInPlay, tierById } from "./tiers";
import { VEHICLE_IDS } from "./transport";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type SaveCardLines = {
  readonly depth: string;
  readonly pocket: string;
  readonly machines: string;
  readonly crew: string;
  readonly played: string;
};

/** The five lines on a save card. Real numbers, in the game's short form. */
export function saveCardLines(
  mountain: Mountain,
  lastSeen: number | undefined,
  now: number,
): SaveCardLines {
  const played =
    lastSeen === undefined ? "Not played yet" : lastPlayedWords(lastSeen, now);
  return { ...freshMineLines(mountain), played };
}

/**
 * A fresh mine's card (#707): no depth, no pocket and no engineers. The
 * project and its step in the order strip's words (its state does not fit
 * half a card), the stone in the stockpile, the machines in the mine's
 * order (drilling, haulage, hoisting), and the workers with the horse
 * wagons they drive. The Ledger reads them too (#708).
 */
export function freshMineLines(
  mountain: Mountain,
): Omit<SaveCardLines, "played"> {
  const strip = orderStrip(mountain);
  const counted = (owned: number, [one, many]: readonly [string, string]) =>
    count(owned, one, many);
  const machines = STAGES.flatMap((stage) =>
    machinesInPlay().filter((id) => tierById(id).stage === stage),
  )
    .filter((id) => mountain.owned[id] > 0)
    .map((id) => counted(mountain.owned[id], MACHINE_WORDS[id]));
  const vehicles = VEHICLE_IDS.filter((id) => mountain.fleet[id] > 0).map(
    (id) => counted(mountain.fleet[id], VEHICLE_WORDS[id]),
  );
  return {
    depth:
      strip.kind === "project"
        ? `${strip.name} · ${strip.stepName}`
        : `${strip.name} is operational`,
    pocket: `${formatCompact(mountain.stock.stones)} stone in the stockpile`,
    machines: machines.length === 0 ? "No machines yet" : machines.join(" · "),
    crew: [
      counted(mountain.owned.helper, ["worker", "workers"]),
      ...vehicles,
    ].join(" · "),
  };
}

/** Local time. Today, yesterday, or a short date. */
export function lastPlayedWords(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  const time = clock(date);
  if (sameDay(date, today)) {
    return `Today ${time}`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, yesterday)) {
    return `Yesterday ${time}`;
  }
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ""} ${time}`;
}

/** Shown on a saved copy. The archive itself is not deleted. */
export function keptUntilWords(expiresAt: number): string {
  const date = new Date(expiresAt);
  return `Until ${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ""}`;
}

function count(amount: number, one: string, many: string): string {
  return `${String(amount)} ${amount === 1 ? one : many}`;
}

function clock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
