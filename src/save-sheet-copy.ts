import { formatCompact } from "./format";
import { layerOf } from "./layers";
import { minedOut, type Mountain } from "./mountain";

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
  const band = layerOf(mountain).name.replace(/^The /, "");
  return {
    depth: `${band}, ${formatCompact(minedOut(mountain))} deep`,
    pocket: `${formatCompact(mountain.pocket)} stones in the pocket`,
    machines: machineLine(mountain),
    crew: crewLine(mountain),
    played:
      lastSeen === undefined
        ? "Not played yet"
        : lastPlayedWords(lastSeen, now),
  };
}

export function machineLine(mountain: Mountain): string {
  const parts: string[] = [];
  if (mountain.carts > 0) {
    parts.push(count(mountain.carts, "cart", "carts"));
  }
  if (mountain.drills > 0) {
    parts.push(count(mountain.drills, "drill", "drills"));
  }
  if (mountain.borers > 0) {
    parts.push(count(mountain.borers, "borer", "borers"));
  }
  if (mountain.machines === 1) {
    parts.push("the Great Machine");
  } else if (mountain.machines > 1) {
    parts.push(`${String(mountain.machines)} Great Machines`);
  }
  return parts.length === 0 ? "No machines yet" : parts.join(" · ");
}

export function crewLine(mountain: Mountain): string {
  const engineers = mountain.engineers?.length ?? 0;
  return `${count(mountain.helpers, "worker", "workers")} · ${count(engineers, "engineer", "engineers")}`;
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
