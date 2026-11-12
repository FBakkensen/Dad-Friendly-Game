import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
if (host.trim() === "") {
  throw new Error(
    "Refusing to run the field-log emulator test without FIRESTORE_EMULATOR_HOST.",
  );
}
process.env.METADATA_SERVER_DETECTION = "none";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-dad-friendly";
const at = "2026-01-02T03:04:05.000Z";

const dad = {
  snapshot: {
    version: "0.0.0",
    at,
    mined: 12,
    left: 88,
    pocket: 3,
    crew: { helper: 2, cart: 1 },
    crewSpeed: 1.5,
    tapYield: 2,
    idle: { cart: 1 },
    relics: ["lantern"],
    upgrades: { tap: 1 },
    boosts: [{ id: "sharper", endsAt: "2026-01-02T04:00:00.000Z" }],
    legacy: 0,
  },
  events: [
    {
      at: "2026-01-02T03:00:00.000Z",
      code: "tier.buy",
      data: { id: "helper", count: 1 },
    },
  ],
  updatedAt: Date.parse(at),
};

const phoneEvent = {
  at: "2026-01-02T03:02:00.000Z",
  code: "vein.tap",
  data: { stones: 60 },
};

const mom = {
  snapshot: {
    version: "0.0.0",
    at,
    mined: 1,
    left: 1,
    pocket: 1,
    crew: { helper: 0 },
    crewSpeed: 0,
    tapYield: 1,
    idle: {},
    relics: [],
    upgrades: {},
    boosts: [],
    legacy: 0,
  },
  events: [],
  updatedAt: Date.parse(at),
};

describe("field-log reader on the Firestore emulator", () => {
  const app = initializeApp({ projectId }, "field-log-seed");
  const db = getFirestore(app);

  beforeAll(async () => {
    const existing = await db.collection("fieldLogs").get();
    await Promise.all(existing.docs.map((doc) => doc.ref.delete()));
    const devices = await db.collectionGroup("devices").get();
    await Promise.all(devices.docs.map((doc) => doc.ref.delete()));
    await db.collection("fieldLogs").doc("dad").set(dad);
    await db.collection("fieldLogs").doc("mom").set(mom);
    // Since #485 each device writes its own; kid has no account-wide log at all.
    await db
      .doc("fieldLogs/dad/devices/phone-device-01")
      .set({ ...dad, events: [phoneEvent], updatedAt: Date.parse(at) + 1 });
    await db
      .doc("fieldLogs/kid/devices/tablet-device-1")
      .set({ ...mom, events: [] });
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it("prints a local-time summary for --uid and a positional uid", () => {
    const flagged = run(["--uid", "dad"]);
    expect(flagged.status).toBe(0);
    expect(flagged.stdout).toContain("fieldLogs/dad");
    expect(flagged.stdout).toContain("Updated 2026-01-02 03:04:05");
    expect(flagged.stdout).toContain("Crew speed 1.5");
    expect(flagged.stdout).toContain("sharper until 2026-01-02 04:00:00");
    expect(flagged.stdout).toContain(
      "2026-01-02 03:00:00  tier.buy  count=1 id=helper",
    );
    expect(flagged.stdout).not.toContain(".000Z");
    expect(flagged.stderr).not.toContain("MetadataLookupWarning");

    const positional = run(["dad"]);
    expect(positional.status).toBe(0);
    expect(positional.stdout).toBe(flagged.stdout);
  });

  it("reads every device's log of a player together (#485)", () => {
    const result = run(["dad"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fieldLogs/dad\nUpdated");
    expect(result.stdout).toContain(
      "fieldLogs/dad/devices/phone-device-01\nUpdated",
    );
    expect(result.stdout).toContain(
      [
        "fieldLogs/dad: together",
        "Events",
        "  2026-01-02 03:00:00  tier.buy  count=1 id=helper  [account]",
        "  2026-01-02 03:02:00  vein.tap  stones=60  [phone-de]",
      ].join("\n"),
    );
  });

  it("lists every field log in uid order, devices too", () => {
    const result = run([]);
    expect(result.status).toBe(0);
    const dadAt = result.stdout.indexOf("fieldLogs/dad");
    const phoneAt = result.stdout.indexOf(
      "fieldLogs/dad/devices/phone-device-01",
    );
    const kidAt = result.stdout.indexOf(
      "fieldLogs/kid/devices/tablet-device-1",
    );
    const momAt = result.stdout.indexOf("fieldLogs/mom");
    expect(dadAt).toBeGreaterThanOrEqual(0);
    expect(phoneAt).toBeGreaterThan(dadAt);
    expect(kidAt).toBeGreaterThan(phoneAt);
    expect(momAt).toBeGreaterThan(kidAt);
  });

  it("prints the stored document as JSON", () => {
    const one = run(["--uid", "mom", "--json"]);
    expect(one.status).toBe(0);
    const [parsed] = JSON.parse(one.stdout) as {
      uid: string;
      updatedAt: number;
      snapshot: { at: string };
      events: { at: string; code: string }[];
    }[];
    // Always a list, even for a player with one log.
    expect(parsed?.uid).toBe("mom");
    expect(parsed?.updatedAt).toBe(Date.parse(at));
    expect(parsed?.snapshot.at).toBe(at);
    expect(parsed?.events).toEqual([]);

    const several = JSON.parse(run(["dad", "--json"]).stdout) as {
      device: string | null;
      events: { at: string; code: string }[];
    }[];
    expect(several.map((row) => row.device)).toEqual([null, "phone-device-01"]);
    expect(several[0]?.events[0]?.code).toBe("tier.buy");
    expect(several[0]?.events[0]?.at).toBe("2026-01-02T03:00:00.000Z");

    const list = run(["--json"]);
    expect(list.status).toBe(0);
    const rows = JSON.parse(list.stdout) as { uid: string }[];
    expect(rows.map((row) => row.uid)).toEqual(["dad", "dad", "kid", "mom"]);
  });

  it("exits when that player has no field log", () => {
    const result = run(["--uid", "nobody"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No field log for nobody.");
  });
});

function run(args: readonly string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, TZ: "UTC" };
  // A bad credential file must not matter: the emulator path skips ADC.
  env.GOOGLE_APPLICATION_CREDENTIALS = "/no/such/field-log-credentials.json";
  return spawnSync(process.execPath, ["tools/field-log.ts", ...args], {
    encoding: "utf8",
    env,
    timeout: 20_000,
  });
}
