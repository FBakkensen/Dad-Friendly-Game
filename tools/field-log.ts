import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Reads the household's field logs: each device's `fieldLogs/{uid}/devices/{deviceId}`
 * (#485), and the account-wide `fieldLogs/{uid}` that builds before it wrote. Not part of the game bundle.
 * Production uses Application Default Credentials (`gcloud auth
 * application-default login`, or `GOOGLE_APPLICATION_CREDENTIALS`). The
 * Firestore emulator needs neither.
 */

const FIELD_LOGS = "fieldLogs";
const DEVICES = "devices";
/** How much of a device id tags its events in the Together timeline. */
const DEVICE_TAG = 8;

const HELP = `Read household players' field logs: one per device, read together.

Usage:
  npm run field-log -- [--uid <uid>] [--json] [--project <id>]
  npm run field-log -- <uid>

With no uid, lists every field log. A player's devices print one by one,
then Together: every device's events in time order, each tagged with the
device. The summary uses this machine's local time. --json prints the
stored documents, each with its uid and device (null for the account-wide
log of older builds).

Sign in once:
  gcloud auth application-default login
or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file.
The Firestore emulator (FIRESTORE_EMULATOR_HOST) needs no credentials.`;

const SNAPSHOT_FIELDS = [
  "version",
  "at",
  "mined",
  "left",
  "pocket",
  "crewSpeed",
  "tapYield",
  "legacy",
  "deviceId",
  "rev",
  "crew",
  "idle",
  "relics",
  "upgrades",
  "boosts",
  "engineers",
  "expeditions",
] as const;

const SNAPSHOT_FIELD_SET: ReadonlySet<string> = new Set(SNAPSHOT_FIELDS);

const SCALAR_LABELS: Readonly<Record<string, string>> = {
  version: "Version",
  at: "Snapshot",
  mined: "Mined",
  left: "Left",
  pocket: "Pocket",
  crewSpeed: "Crew speed",
  tapYield: "Tap yield",
  legacy: "Legacy",
  deviceId: "Device",
  rev: "Rev",
};

export type FieldLogEnv = {
  readonly GCLOUD_PROJECT?: string | undefined;
  readonly GOOGLE_CLOUD_PROJECT?: string | undefined;
  readonly FIRESTORE_EMULATOR_HOST?: string | undefined;
};

export type FieldLogRecord = {
  readonly uid: string;
  /** The device's id, or undefined for the account-wide log of builds before #485. */
  readonly device?: string;
  readonly data: unknown;
};

/** Where a record lives in Firestore. */
export function fieldLogPath(record: FieldLogRecord): string {
  return record.device === undefined
    ? `${FIELD_LOGS}/${record.uid}`
    : `${FIELD_LOGS}/${record.uid}/${DEVICES}/${record.device}`;
}

/** The account-wide log first, then the devices by id: one player's order. */
export function byPlayer(left: FieldLogRecord, right: FieldLogRecord): number {
  if (left.uid !== right.uid) {
    return left.uid.localeCompare(right.uid);
  }
  return (left.device ?? "").localeCompare(right.device ?? "");
}

export type ParsedFieldLogArgs =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "read";
      readonly uid: string | undefined;
      readonly json: boolean;
      readonly project: string | undefined;
    };

export function parseFieldLogArgs(argv: readonly string[]): ParsedFieldLogArgs {
  let json = false;
  let uid: string | undefined;
  let project: string | undefined;
  const positionals: string[] = [];

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === undefined) {
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }
    if (arg === "--json") {
      json = true;
      index += 1;
      continue;
    }
    const flag = namedFlag(arg);
    if (flag !== undefined) {
      const taken = takeFlag(arg, argv, index);
      if ("error" in taken) {
        return { kind: "error", message: taken.error };
      }
      if (taken.value.trim() === "") {
        return { kind: "error", message: `${flag} needs a value.` };
      }
      if (flag === "--uid") {
        uid = taken.value;
      } else {
        project = taken.value;
      }
      index = taken.next + 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown argument ${arg}.` };
    }
    positionals.push(arg);
    index += 1;
  }

  if (positionals.length > 1) {
    return {
      kind: "error",
      message: "Pass one uid, or none to list every field log.",
    };
  }
  const positional = positionals[0];
  if (uid !== undefined && positional !== undefined && uid !== positional) {
    return {
      kind: "error",
      message: "Pass the uid once, either as --uid or on its own.",
    };
  }
  return { kind: "read", uid: uid ?? positional, json, project };
}

/** `.firebaserc` default project, when the file has one. */
export function parseFirebaseDefaultProject(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.projects)) {
    return undefined;
  }
  const id = parsed.projects.default;
  if (typeof id !== "string" || id.trim() === "") {
    return undefined;
  }
  return id.trim();
}

/** Flag, then `GCLOUD_PROJECT`, then `GOOGLE_CLOUD_PROJECT`, then fallback. */
export function resolveProjectId(
  env: FieldLogEnv,
  flag: string | undefined,
  fallback: string,
): string {
  const candidates = [
    flag,
    env.GCLOUD_PROJECT,
    env.GOOGLE_CLOUD_PROJECT,
    fallback,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim() ?? "";
    if (trimmed !== "") {
      return trimmed;
    }
  }
  return fallback;
}

/**
 * Emulator reads skip credentials. Otherwise the Admin SDK's
 * `applicationDefault()` reads `GOOGLE_APPLICATION_CREDENTIALS` and, if that
 * is unset, the file from `gcloud auth application-default login`.
 */
export function usesApplicationDefaultCredentials(env: FieldLogEnv): boolean {
  return (env.FIRESTORE_EMULATOR_HOST ?? "").trim() === "";
}

/**
 * One player's logs, or every log, as a person would read it. Times are local.
 * A player with more than one log also gets Together: every event in time order.
 */
export function formatFieldLogSummary(
  records: readonly FieldLogRecord[],
  timeZone: string,
): string {
  if (records.length === 0) {
    return "No field logs.";
  }
  // The loader gives one player's logs side by side (byPlayer).
  const sorted = records;
  const blocks: string[] = [];
  for (const [index, record] of sorted.entries()) {
    blocks.push(formatOne(record, timeZone));
    const next = sorted[index + 1];
    if (next?.uid !== record.uid) {
      const mine = sorted.filter((item) => item.uid === record.uid);
      if (mine.length > 1) {
        blocks.push(togetherLines(record.uid, mine, timeZone).join("\n"));
      }
    }
  }
  return blocks.join("\n\n");
}

/** Stored documents, plus the uid and device (document ids, not fields). One log alone prints bare. */
export function formatFieldLogJson(
  records: readonly FieldLogRecord[],
  shape: "one" | "list",
): string {
  const rows = records.map(withUid);
  if (shape === "list" || rows.length > 1) {
    return JSON.stringify(rows, null, 2);
  }
  return JSON.stringify(rows[0] ?? {}, null, 2);
}

/** Every event of one player's logs in time order, each tagged with its device. */
function togetherLines(
  uid: string,
  records: readonly FieldLogRecord[],
  timeZone: string,
): string[] {
  const tagged: { readonly at: number; readonly line: string }[] = [];
  for (const record of records) {
    const tag =
      record.device === undefined
        ? "account"
        : record.device.slice(0, DEVICE_TAG);
    const events = isRecord(record.data) ? record.data.events : undefined;
    if (!Array.isArray(events)) {
      continue;
    }
    for (const item of events) {
      if (!isRecord(item)) {
        continue;
      }
      tagged.push({
        at: coerceDate(item.at)?.getTime() ?? 0,
        line: `  ${eventText(item, timeZone)}  [${tag}]`,
      });
    }
  }
  tagged.sort((left, right) => left.at - right.at);
  return [
    `${FIELD_LOGS}/${uid}: together`,
    "Events",
    ...(tagged.length === 0 ? ["  none"] : tagged.map((item) => item.line)),
  ];
}

function namedFlag(arg: string): "--uid" | "--project" | undefined {
  if (arg === "--uid" || arg.startsWith("--uid=")) {
    return "--uid";
  }
  if (arg === "--project" || arg.startsWith("--project=")) {
    return "--project";
  }
  return undefined;
}

function takeFlag(
  arg: string,
  argv: readonly string[],
  index: number,
):
  | { readonly value: string; readonly next: number }
  | { readonly error: string } {
  const eq = arg.indexOf("=");
  if (eq !== -1) {
    return { value: arg.slice(eq + 1), next: index };
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return { error: `${arg} needs a value.` };
  }
  return { value, next: index + 1 };
}

function withUid(record: FieldLogRecord): Record<string, unknown> {
  const ids = { uid: record.uid, device: record.device ?? null };
  if (!isRecord(record.data)) {
    return { ...ids, data: record.data };
  }
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.data)) {
    if (key !== "uid" && key !== "device") {
      rest[key] = value;
    }
  }
  return { ...ids, ...rest };
}

function formatOne(record: FieldLogRecord, timeZone: string): string {
  if (!isRecord(record.data)) {
    return [
      fieldLogPath(record),
      "Updated unknown",
      "",
      "Not a field log.",
    ].join("\n");
  }
  const lines = [
    fieldLogPath(record),
    `Updated ${showTime(record.data.updatedAt, timeZone)}`,
    "",
  ];
  if (isRecord(record.data.snapshot)) {
    lines.push(...snapshotBody(record.data.snapshot, timeZone));
  } else {
    lines.push("No snapshot.");
  }
  lines.push(...eventLines(record.data.events, timeZone));
  return lines.join("\n");
}

function snapshotBody(
  snapshot: Readonly<Record<string, unknown>>,
  timeZone: string,
): string[] {
  const lines: string[] = [];
  for (const key of [
    "version",
    "at",
    "mined",
    "left",
    "pocket",
    "crewSpeed",
    "tapYield",
    "legacy",
  ] as const) {
    if (!Object.hasOwn(snapshot, key)) {
      continue;
    }
    const label = SCALAR_LABELS[key] ?? key;
    const shown =
      key === "at"
        ? showTime(snapshot[key], timeZone)
        : showScalar(snapshot[key]);
    lines.push(`${label} ${shown}`);
  }
  if (Object.hasOwn(snapshot, "crew")) {
    lines.push(...countBlock("Crew", snapshot.crew));
  }
  if (Object.hasOwn(snapshot, "idle")) {
    lines.push(...countBlock("Idle", snapshot.idle));
  }
  if (Object.hasOwn(snapshot, "relics")) {
    lines.push(...nameBlock("Relics", snapshot.relics));
  }
  if (Object.hasOwn(snapshot, "upgrades")) {
    lines.push(...countBlock("Upgrades", snapshot.upgrades));
  }
  if (Object.hasOwn(snapshot, "boosts")) {
    lines.push(...boostBlock(snapshot.boosts, timeZone));
  }
  if (Object.hasOwn(snapshot, "engineers")) {
    lines.push(...engineerBlock(snapshot.engineers));
  }
  if (Object.hasOwn(snapshot, "expeditions")) {
    lines.push(...expeditionBlock(snapshot.expeditions, timeZone));
  }
  const extra = Object.keys(snapshot)
    .filter((key) => !SNAPSHOT_FIELD_SET.has(key))
    .sort();
  for (const key of extra) {
    lines.push(`${key} ${showScalar(snapshot[key])}`);
  }
  return lines;
}

function countBlock(title: string, value: unknown): string[] {
  if (!isRecord(value)) {
    return [title, `  ${showScalar(value)}`];
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) {
    return [title, "  none"];
  }
  return [title, ...keys.map((key) => `  ${key} ${showScalar(value[key])}`)];
}

function nameBlock(title: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [title, "  none"];
  }
  return [title, ...value.map((item) => `  ${showScalar(item)}`)];
}

function boostBlock(value: unknown, timeZone: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Boosts", "  none"];
  }
  return [
    "Boosts",
    ...value.map((item) => {
      if (isRecord(item) && typeof item.id === "string") {
        return `  ${item.id} until ${showTime(item.endsAt, timeZone)}`;
      }
      return `  ${showScalar(item)}`;
    }),
  ];
}

function engineerBlock(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Engineers", "  none"];
  }
  return [
    "Engineers",
    ...value.map((item) => {
      if (!isRecord(item)) {
        return `  ${showScalar(item)}`;
      }
      const name = typeof item.name === "string" ? item.name : "engineer";
      const bits = [name];
      if (typeof item.rank === "number") {
        bits.push(`rank ${String(item.rank)}`);
      }
      if (typeof item.post === "string") {
        bits.push(item.post);
      }
      return `  ${bits.join(" ")}`;
    }),
  ];
}

function expeditionBlock(value: unknown, timeZone: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Expeditions", "  none"];
  }
  return [
    "Expeditions",
    ...value.map((item) => {
      if (!isRecord(item)) {
        return `  ${showScalar(item)}`;
      }
      const who = typeof item.engineer === "string" ? item.engineer : "party";
      const tunnel = typeof item.tunnel === "string" ? item.tunnel : "tunnel";
      return `  ${who} ${tunnel} returns ${showTime(item.returnsAt, timeZone)}`;
    }),
  ];
}

function eventLines(value: unknown, timeZone: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Events", "  none"];
  }
  return [
    "Events",
    ...value.map((item) => {
      if (!isRecord(item)) {
        return `  ${showScalar(item)}`;
      }
      return `  ${eventText(item, timeZone)}`;
    }),
  ];
}

/** One event: its local time, its code, and its data. */
function eventText(
  item: Readonly<Record<string, unknown>>,
  timeZone: string,
): string {
  const when = showTime(item.at, timeZone);
  const code = typeof item.code === "string" ? item.code : "event";
  const data = formatData(item.data);
  return data === "" ? `${when}  ${code}` : `${when}  ${code}  ${data}`;
}

function formatData(data: unknown): string {
  if (!isRecord(data)) {
    return "";
  }
  const keys = Object.keys(data).sort();
  if (keys.length === 0) {
    return "";
  }
  return keys.map((key) => `${key}=${formatDataValue(data[key])}`).join(" ");
}

function formatDataValue(value: unknown): string {
  if (typeof value === "string" && /^[\w.-]+$/.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return jsonText(value);
}

function showTime(value: unknown, timeZone: string): string {
  const local = formatLocalTimestamp(value, timeZone);
  if (local !== undefined) {
    return local;
  }
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "unknown";
}

function formatLocalTimestamp(
  value: unknown,
  timeZone: string,
): string | undefined {
  const date = coerceDate(value);
  if (date === undefined) {
    return undefined;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
}

function coerceDate(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string" && value !== "") {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return new Date(parsed);
  }
  return undefined;
}

function showScalar(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return jsonText(value);
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "unreadable";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadFieldLogs(
  db: Firestore,
  uid: string | undefined,
): Promise<
  | { readonly kind: "missing"; readonly uid: string }
  | { readonly kind: "ok"; readonly records: FieldLogRecord[] }
> {
  const collection = db.collection(FIELD_LOGS);
  if (uid !== undefined) {
    const [account, devices] = await Promise.all([
      collection.doc(uid).get(),
      collection.doc(uid).collection(DEVICES).get(),
    ]);
    const records: FieldLogRecord[] = devices.docs.map((doc) => ({
      uid,
      device: doc.id,
      data: doc.data(),
    }));
    if (account.exists) {
      records.push({ uid, data: account.data() });
    }
    if (records.length === 0) {
      return { kind: "missing", uid };
    }
    return { kind: "ok", records: records.sort(byPlayer) };
  }
  // A device's log needs no account document above it, so devices are read as a group.
  const [accounts, devices] = await Promise.all([
    collection.get(),
    db.collectionGroup(DEVICES).get(),
  ]);
  const records: FieldLogRecord[] = accounts.docs.map((doc) => ({
    uid: doc.id,
    data: doc.data(),
  }));
  for (const doc of devices.docs) {
    const owner = doc.ref.parent.parent;
    if (owner?.parent.id === FIELD_LOGS) {
      records.push({ uid: owner.id, device: doc.id, data: doc.data() });
    }
  }
  return { kind: "ok", records: records.sort(byPlayer) };
}

function projectFallback(): string {
  try {
    const text = readFileSync(
      new URL("../.firebaserc", import.meta.url),
      "utf8",
    );
    return parseFirebaseDefaultProject(text) ?? "dad-friendly-game";
  } catch {
    return "dad-friendly-game";
  }
}

function credentialError(error: unknown): string {
  const detail =
    error instanceof Error ? error.message : "unknown credential error";
  return [
    "Could not use Application Default Credentials.",
    "Sign in once with: gcloud auth application-default login",
    "Or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file.",
    detail,
  ].join("\n");
}

async function main(): Promise<number> {
  const parsed = parseFieldLogArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(HELP);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(HELP);
    return 1;
  }
  const projectId = resolveProjectId(
    process.env,
    parsed.project,
    projectFallback(),
  );
  const emulator = !usesApplicationDefaultCredentials(process.env);
  if (emulator) {
    // The emulator accepts any project id. Skip the metadata-server probe,
    // which otherwise times out off GCP and delays every read.
    process.env.METADATA_SERVER_DETECTION = "none";
  }
  const { applicationDefault, initializeApp } =
    await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (emulator) {
    initializeApp({ projectId });
  } else {
    try {
      const credential = applicationDefault();
      await credential.getAccessToken();
      initializeApp({ credential, projectId });
    } catch (error: unknown) {
      console.error(credentialError(error));
      return 1;
    }
  }
  try {
    const loaded = await loadFieldLogs(getFirestore(), parsed.uid);
    if (loaded.kind === "missing") {
      console.error(`No field log for ${loaded.uid}.`);
      return 1;
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const text = parsed.json
      ? formatFieldLogJson(
          loaded.records,
          parsed.uid === undefined ? "list" : "one",
        )
      : formatFieldLogSummary(loaded.records, timeZone);
    console.log(text);
    return 0;
  } catch (error: unknown) {
    console.error(
      error instanceof Error ? error.message : "field log read failed",
    );
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  const href = import.meta.url;
  try {
    return pathToFileURL(realpathSync(entry)).href === href;
  } catch {
    return pathToFileURL(entry).href === href;
  }
}

if (isDirectRun()) {
  void main().then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "field log failed",
      );
      process.exit(1);
    },
  );
}
