import {
  ENGINEER_NAMES,
  MAX_ENGINEERS,
  addTrip,
  station,
  type Engineer,
} from "./engineers";
import { LOST_TOOLS, expeditionAwayMs, type LostToolId } from "./lost-tools";
import type { Mountain } from "./mountain";
import { RELICS, nextRelic, type RelicId } from "./relics";

/**
 * Expeditions (M7 §4). One engineer, one tunnel, a return time, and a find
 * chosen when they leave. The worn map shortens the next send. See
 * docs/DESIGN.md.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Closed tunnel list. Durations and the deep dark's rank gate live here. */
export const TUNNELS = [
  {
    id: "side-seam",
    name: "A side seam",
    awayMs: 10 * MINUTE,
    minRank: 0,
  },
  {
    id: "old-shaft",
    name: "The old shaft",
    awayMs: HOUR,
    minRank: 0,
  },
  {
    id: "deep-dark",
    name: "The deep dark",
    awayMs: 4 * HOUR,
    minRank: 1,
  },
] as const;

export type TunnelId = (typeof TUNNELS)[number]["id"];

/** Longest tunnel. A saved return may be sooner; it may not be later. */
export const MAX_EXPEDITION_MS = 4 * HOUR;

/** At most one expedition per engineer. */
export const MAX_EXPEDITIONS = MAX_ENGINEERS;

type EngineerName = (typeof ENGINEER_NAMES)[number];

/** The post they walked away from. Tunnel is not a home. */
const HOME_POSTS = ["cart", "drill", "borer", "machine", "camp"] as const;

type HomePost = (typeof HOME_POSTS)[number];

export { LOST_TOOLS };

type ToolId = LostToolId;

/** Keepsakes. A small shelf, just for the heart. */
export const KEEPSAKES = [
  "drawing",
  "watch",
  "whistle",
  "pebble",
  "ribbon",
] as const;

export type KeepsakeId = (typeof KEEPSAKES)[number];

/** What the shelf remembers. Glimmers and new engineers are not ids. */
export const FIND_IDS = [...LOST_TOOLS, ...KEEPSAKES] as const;

export type FindId = (typeof FIND_IDS)[number];

/**
 * Chosen at send and stored, so a reload or a clock clamp cannot reroll it.
 * `sentAt` is the seed.
 */
type StoredFind =
  | { readonly kind: "glimmer"; readonly id: RelicId }
  | { readonly kind: "tool"; readonly id: ToolId }
  | { readonly kind: "keepsake"; readonly id: KeepsakeId }
  | { readonly kind: "engineer"; readonly id: EngineerName }
  | { readonly kind: "quiet" };

export type Expedition = {
  readonly engineer: EngineerName;
  readonly tunnel: TunnelId;
  readonly sentAt: number;
  readonly returnsAt: number;
  readonly home: HomePost;
  readonly find: StoredFind;
};

export type SettledFind =
  | { readonly kind: "glimmer"; readonly relic: RelicId; readonly text: string }
  | { readonly kind: "tool"; readonly id: ToolId }
  | { readonly kind: "keepsake"; readonly id: KeepsakeId }
  | {
      readonly kind: "engineer";
      readonly name: EngineerName;
      readonly joined: boolean;
    }
  | { readonly kind: "quiet"; readonly text: string };

const QUIET_TEXT = "The tunnel was quiet, and they came home safe.";

const GLIMMER: Readonly<Record<RelicId, string>> = {
  lantern: "Down there, a warm light is waiting.",
  shield: "Down there, something stands watch over the crew.",
  hammer: "Down there, a great hammer waits to be lifted.",
  heart: "Down there, something beat like a heart.",
  crown: "Down there, a quiet wisdom is waiting.",
  mantle: "Down there, a hero's mantle rests in the stone.",
};

/** A line about the next relic. No depths, no numbers. */
export function glimmerText(relic: RelicId): string {
  return GLIMMER[relic];
}

type FindKind = "tool" | "keepsake" | "glimmer" | "engineer";

/**
 * Moves one engineer into a tunnel. The find and the post they left are
 * stored on the expedition. Same mountain when they cannot go.
 */
export function send(
  mountain: Mountain,
  engineer: number,
  tunnel: TunnelId,
  now: number,
): Mountain {
  const engineers = mountain.engineers;
  const hand = engineers?.[engineer];
  const spec = TUNNELS.find((candidate) => candidate.id === tunnel);
  if (
    engineers === undefined ||
    hand === undefined ||
    spec === undefined ||
    hand.post === "tunnel" ||
    hand.rank < spec.minRank ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(now + expeditionAwayMs(spec.awayMs, mountain)) ||
    (mountain.expeditions?.length ?? 0) >= MAX_EXPEDITIONS ||
    (mountain.expeditions ?? []).some((trip) => trip.engineer === hand.name)
  ) {
    return mountain;
  }
  const trip: Expedition = {
    engineer: hand.name,
    tunnel,
    sentAt: now,
    returnsAt: now + expeditionAwayMs(spec.awayMs, mountain),
    home: hand.post,
    find: decideFind(mountain, engineers, tunnel, now),
  };
  const stationed = station(mountain, engineer, "tunnel");
  return {
    ...stationed,
    expeditions: [...(stationed.expeditions ?? []), trip],
  };
}

/** Back at the post they left. No find, no trip, no cost. */
export function recall(mountain: Mountain, engineer: number): Mountain {
  const hand = mountain.engineers?.[engineer];
  const trips = mountain.expeditions;
  if (hand === undefined || trips === undefined) {
    return mountain;
  }
  const trip = trips.find((candidate) => candidate.engineer === hand.name);
  if (trip === undefined) {
    return mountain;
  }
  const stationed = station(mountain, engineer, trip.home);
  const remaining = trips.filter(
    (candidate) => candidate.engineer !== hand.name,
  );
  return withoutTrips(stationed, remaining);
}

/**
 * Clamps a future departure, then brings home every party whose return has
 * passed. A second call does not roll again.
 */
export function settle(
  mountain: Mountain,
  now: number,
): { readonly mountain: Mountain; readonly finds: readonly SettledFind[] } {
  return completeDue(clampExpeditions(mountain, now), now);
}

/**
 * A `sentAt` still ahead of the clock moves to now. The wait and the find
 * stay. Follows the lastSeen rule: the clock went back, so we do not wait
 * it out and we do not finish the trip early.
 */
export function clampExpeditions(mountain: Mountain, now: number): Mountain {
  const expeditions = mountain.expeditions;
  if (expeditions === undefined) {
    return mountain;
  }
  const next: Expedition[] = [];
  let changed = false;
  for (const trip of expeditions) {
    if (trip.sentAt <= now) {
      next.push(trip);
      continue;
    }
    changed = true;
    const duration = trip.returnsAt - trip.sentAt;
    next.push({ ...trip, sentAt: now, returnsAt: now + duration });
  }
  if (!changed) {
    return mountain;
  }
  return { ...mountain, expeditions: next };
}

/** Brings home every expedition with `returnsAt` at or before `now`. */
export function completeDue(
  mountain: Mountain,
  now: number,
): { readonly mountain: Mountain; readonly finds: readonly SettledFind[] } {
  const trips = mountain.expeditions;
  if (trips === undefined) {
    return { mountain, finds: [] };
  }
  const due = trips.filter((trip) => trip.returnsAt <= now);
  if (due.length === 0) {
    return { mountain, finds: [] };
  }
  const ordered = [...due].sort(
    (left, right) =>
      left.returnsAt - right.returnsAt || left.sentAt - right.sentAt,
  );
  let next = mountain;
  const finds: SettledFind[] = [];
  for (const trip of ordered) {
    const brought = bringHome(next, trip);
    next = brought.mountain;
    finds.push(brought.settled);
  }
  const left = trips.filter((trip) => !ordered.includes(trip));
  return { mountain: withoutTrips(next, left), finds };
}

/** Untrusted save data. The leader has to be in the tunnel, and the deep dark needs a Journeyman. */
export function parseExpeditions(
  value: unknown,
  engineers: readonly Engineer[] | undefined,
): readonly Expedition[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_EXPEDITIONS) {
    return undefined;
  }
  const parsed: Expedition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const trip = parseExpedition(item, engineers);
    if (trip === undefined || seen.has(trip.engineer)) {
      return undefined;
    }
    seen.add(trip.engineer);
    parsed.push(trip);
  }
  return parsed;
}

/** Untrusted shelf: closed ids, no duplicates. */
export function parseFinds(value: unknown): readonly FindId[] | undefined {
  if (!Array.isArray(value) || value.length > FIND_IDS.length) {
    return undefined;
  }
  const parsed: FindId[] = [];
  for (const item of value) {
    if (!isFindId(item) || parsed.includes(item)) {
      return undefined;
    }
    parsed.push(item);
  }
  return parsed;
}

function decideFind(
  mountain: Mountain,
  engineers: readonly Engineer[],
  tunnel: TunnelId,
  sentAt: number,
): StoredFind {
  const roll = rollOf(sentAt, tunnel);
  const first = rolledKind(tunnel, roll);
  const order: readonly FindKind[] = [
    first,
    ...(["tool", "keepsake", "glimmer", "engineer"] as const).filter(
      (kind) => kind !== first,
    ),
  ];
  for (const kind of order) {
    const find = findOfKind(mountain, engineers, tunnel, kind, roll);
    if (find !== undefined) {
      return find;
    }
  }
  return { kind: "quiet" };
}

function findOfKind(
  mountain: Mountain,
  engineers: readonly Engineer[],
  tunnel: TunnelId,
  kind: FindKind,
  roll: number,
): StoredFind | undefined {
  if (kind === "tool") {
    const id = pickFree(LOST_TOOLS, taken(mountain, "tool"), roll);
    return id === undefined ? undefined : { kind: "tool", id };
  }
  if (kind === "keepsake") {
    const id = pickFree(KEEPSAKES, taken(mountain, "keepsake"), roll);
    return id === undefined ? undefined : { kind: "keepsake", id };
  }
  if (kind === "glimmer") {
    const relic = nextRelic(mountain);
    return relic === undefined ? undefined : { kind: "glimmer", id: relic.id };
  }
  if (tunnel !== "deep-dark") {
    return undefined;
  }
  const name = nextEngineerName(engineers, mountain.expeditions ?? []);
  return name === undefined ? undefined : { kind: "engineer", id: name };
}

function rolledKind(tunnel: TunnelId, roll: number): FindKind {
  if (tunnel === "side-seam") {
    if (roll < 60) {
      return "keepsake";
    }
    return roll < 90 ? "glimmer" : "tool";
  }
  if (tunnel === "old-shaft") {
    if (roll < 45) {
      return "tool";
    }
    return roll < 75 ? "keepsake" : "glimmer";
  }
  if (roll < 35) {
    return "tool";
  }
  if (roll < 60) {
    return "keepsake";
  }
  return roll < 80 ? "glimmer" : "engineer";
}

function rollOf(sentAt: number, tunnel: TunnelId): number {
  const salt = TUNNELS.findIndex((candidate) => candidate.id === tunnel) + 1;
  let hash = 2_166_136_261;
  for (const part of [salt, sentAt]) {
    let value = part;
    for (let byte = 0; byte < 8; byte += 1) {
      hash ^= value & 0xff;
      hash = Math.imul(hash, 16_777_619) >>> 0;
      value = Math.floor(value / 256);
    }
  }
  return hash % 100;
}

function taken(
  mountain: Mountain,
  kind: "tool" | "keepsake",
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const id of mountain.finds ?? []) {
    if (
      (kind === "tool" && isToolId(id)) ||
      (kind === "keepsake" && isKeepsakeId(id))
    ) {
      ids.add(id);
    }
  }
  for (const trip of mountain.expeditions ?? []) {
    if (trip.find.kind === kind) {
      ids.add(trip.find.id);
    }
  }
  return ids;
}

function pickFree<T extends string>(
  ids: readonly T[],
  used: ReadonlySet<string>,
  roll: number,
): T | undefined {
  const left = ids.filter((id) => !used.has(id));
  return left.length === 0 ? undefined : left[roll % left.length];
}

function nextEngineerName(
  engineers: readonly Engineer[],
  trips: readonly Expedition[],
): EngineerName | undefined {
  const used = new Set(engineers.map((engineer) => engineer.name));
  let incoming = 0;
  for (const trip of trips) {
    if (trip.find.kind === "engineer") {
      used.add(trip.find.id);
      incoming += 1;
    }
  }
  if (engineers.length + incoming >= MAX_ENGINEERS) {
    return undefined;
  }
  return ENGINEER_NAMES.find((name) => !used.has(name));
}

function bringHome(
  mountain: Mountain,
  trip: Expedition,
): { readonly mountain: Mountain; readonly settled: SettledFind } {
  const engineers = mountain.engineers;
  if (engineers === undefined) {
    return { mountain, settled: { kind: "quiet", text: QUIET_TEXT } };
  }
  const index = engineers.findIndex(
    (engineer) => engineer.name === trip.engineer,
  );
  if (index < 0) {
    return { mountain, settled: { kind: "quiet", text: QUIET_TEXT } };
  }
  const stationed = station(addTrip(mountain, index), index, trip.home);
  return applyFind(stationed, keptCrew(stationed, engineers), trip.find);
}

/** addTrip and station copy the crew. The fallback only satisfies the type. */
function keptCrew(
  mountain: Mountain,
  fallback: readonly Engineer[],
): readonly Engineer[] {
  /* v8 ignore next 3 -- the crew was copied through addTrip and station */
  if (mountain.engineers === undefined) {
    return fallback;
  }
  return mountain.engineers;
}

function applyFind(
  mountain: Mountain,
  crew: readonly Engineer[],
  find: StoredFind,
): { readonly mountain: Mountain; readonly settled: SettledFind } {
  switch (find.kind) {
    case "glimmer":
      return {
        mountain,
        settled: {
          kind: "glimmer",
          relic: find.id,
          text: glimmerText(find.id),
        },
      };
    case "tool":
    case "keepsake":
      return {
        mountain: addShelf(mountain, find.id),
        settled: find,
      };
    case "engineer": {
      const welcomed = welcomeEngineer(mountain, crew, find.id);
      return {
        mountain: welcomed,
        settled: {
          kind: "engineer",
          name: find.id,
          joined: welcomed !== mountain,
        },
      };
    }
    case "quiet":
      return { mountain, settled: { kind: "quiet", text: QUIET_TEXT } };
  }
}

function addShelf(mountain: Mountain, id: FindId): Mountain {
  const finds = mountain.finds ?? [];
  if (finds.includes(id)) {
    return mountain;
  }
  return { ...mountain, finds: [...finds, id] };
}

function welcomeEngineer(
  mountain: Mountain,
  engineers: readonly Engineer[],
  name: EngineerName,
): Mountain {
  if (
    engineers.length >= MAX_ENGINEERS ||
    engineers.some((engineer) => engineer.name === name)
  ) {
    return mountain;
  }
  return {
    ...mountain,
    engineers: [...engineers, { name, rank: 0, trips: 0, post: "camp" }],
  };
}

function withoutTrips(
  mountain: Mountain,
  expeditions: readonly Expedition[],
): Mountain {
  if (expeditions.length === 0) {
    const rest = { ...mountain };
    delete rest.expeditions;
    return rest;
  }
  return { ...mountain, expeditions };
}

function parseExpedition(
  value: unknown,
  engineers: readonly Engineer[] | undefined,
): Expedition | undefined {
  if (engineers === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 6 ||
    !keys.every((key) =>
      ["engineer", "tunnel", "sentAt", "returnsAt", "home", "find"].includes(
        key,
      ),
    )
  ) {
    return undefined;
  }
  const engineer = record["engineer"];
  const tunnel = record["tunnel"];
  const sentAt = record["sentAt"];
  const returnsAt = record["returnsAt"];
  const home = record["home"];
  const find = parseFind(record["find"]);
  const hand = engineers.find((candidate) => candidate.name === engineer);
  const spec = TUNNELS.find((candidate) => candidate.id === tunnel);
  if (
    !isEngineerName(engineer) ||
    spec === undefined ||
    !isSafeInt(sentAt) ||
    !isSafeInt(returnsAt) ||
    returnsAt <= sentAt ||
    returnsAt - sentAt > MAX_EXPEDITION_MS ||
    !isHomePost(home) ||
    find === undefined ||
    hand === undefined ||
    hand.post !== "tunnel" ||
    hand.rank < spec.minRank ||
    (find.kind === "engineer" &&
      engineers.some((candidate) => candidate.name === find.id))
  ) {
    return undefined;
  }
  return { engineer, tunnel: spec.id, sentAt, returnsAt, home, find };
}

function parseFind(value: unknown): StoredFind | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const kind = record["kind"];
  if (kind === "quiet") {
    return keys.length === 1 ? { kind: "quiet" } : undefined;
  }
  if (keys.length !== 2 || record["id"] === undefined) {
    return undefined;
  }
  const id = record["id"];
  if (typeof id !== "string") {
    return undefined;
  }
  if (kind === "glimmer" && isRelicId(id)) {
    return { kind, id };
  }
  if (kind === "tool" && isToolId(id)) {
    return { kind, id };
  }
  if (kind === "keepsake" && isKeepsakeId(id)) {
    return { kind, id };
  }
  if (kind === "engineer" && isEngineerName(id)) {
    return { kind, id };
  }
  return undefined;
}

function isFindId(value: unknown): value is FindId {
  return (
    typeof value === "string" && (FIND_IDS as readonly string[]).includes(value)
  );
}

function isToolId(value: string): value is ToolId {
  return (LOST_TOOLS as readonly string[]).includes(value);
}

function isKeepsakeId(value: string): value is KeepsakeId {
  return (KEEPSAKES as readonly string[]).includes(value);
}

function isRelicId(value: string): value is RelicId {
  return RELICS.some((relic) => relic.id === value);
}

function isEngineerName(value: unknown): value is EngineerName {
  return (
    typeof value === "string" &&
    (ENGINEER_NAMES as readonly string[]).includes(value)
  );
}

function isHomePost(value: unknown): value is HomePost {
  return (
    typeof value === "string" &&
    (HOME_POSTS as readonly string[]).includes(value)
  );
}

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
