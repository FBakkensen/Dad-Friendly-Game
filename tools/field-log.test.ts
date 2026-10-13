import { describe, expect, it } from "vitest";
import {
  formatFieldLogJson,
  formatFieldLogSummary,
  parseFieldLogArgs,
  parseFirebaseDefaultProject,
  resolveProjectId,
  usesApplicationDefaultCredentials,
  type FieldLogRecord,
} from "./field-log.ts";

const AT = "2026-01-02T03:04:05.000Z";
const ZONE = "America/New_York";

const dad: FieldLogRecord = {
  uid: "dad",
  data: {
    updatedAt: Date.parse(AT),
    snapshot: {
      version: "0.0.0",
      at: AT,
      mined: 12,
      left: 88,
      pocket: 3,
      crewSpeed: 1.5,
      tapYield: 2,
      legacy: 0,
      crew: { helper: 2, cart: 1 },
      idle: { cart: 1 },
      relics: ["lantern"],
      upgrades: { tap: 1 },
      boosts: [{ id: "sharper", endsAt: "2026-01-02T04:00:00.000Z" }],
      engineers: [{ name: "Ada" }],
    },
    events: [
      {
        at: "2026-01-02T03:00:00.000Z",
        code: "tier.buy",
        data: { id: "helper", count: 1, note: "not sure" },
      },
      { at: "yesterday", code: "save.write", data: {} },
    ],
  },
};

describe("parseFieldLogArgs", () => {
  it("reads a positional uid, --uid, and --json", () => {
    expect(parseFieldLogArgs(["dad"])).toEqual({
      kind: "read",
      uid: "dad",
      json: false,
      project: undefined,
    });
    expect(parseFieldLogArgs(["--uid", "dad", "--json"])).toEqual({
      kind: "read",
      uid: "dad",
      json: true,
      project: undefined,
    });
    expect(parseFieldLogArgs(["--uid=mom", "--project=demo"])).toEqual({
      kind: "read",
      uid: "mom",
      json: false,
      project: "demo",
    });
    expect(parseFieldLogArgs(["--uid", "dad", "dad"])).toEqual({
      kind: "read",
      uid: "dad",
      json: false,
      project: undefined,
    });
    expect(parseFieldLogArgs([])).toEqual({
      kind: "read",
      uid: undefined,
      json: false,
      project: undefined,
    });
  });

  it("rejects a missing value, an unknown flag, and two different uids", () => {
    expect(parseFieldLogArgs(["--uid"])).toEqual({
      kind: "error",
      message: "--uid needs a value.",
    });
    expect(parseFieldLogArgs(["--uid="])).toEqual({
      kind: "error",
      message: "--uid needs a value.",
    });
    expect(parseFieldLogArgs(["--nope"])).toEqual({
      kind: "error",
      message: "Unknown argument --nope.",
    });
    expect(parseFieldLogArgs(["dad", "mom"])).toEqual({
      kind: "error",
      message: "Pass one uid, or none to list every field log.",
    });
    expect(parseFieldLogArgs(["--uid", "dad", "mom"])).toEqual({
      kind: "error",
      message: "Pass the uid once, either as --uid or on its own.",
    });
    expect(parseFieldLogArgs(["--help", "--json"]).kind).toBe("help");
    expect(parseFieldLogArgs(["-h"]).kind).toBe("help");
  });
});

describe("project id and credentials", () => {
  it("reads the default project from .firebaserc", () => {
    expect(
      parseFirebaseDefaultProject(
        '{"projects":{"default":"dad-friendly-game"}}',
      ),
    ).toBe("dad-friendly-game");
    expect(parseFirebaseDefaultProject("not json")).toBeUndefined();
    expect(
      parseFirebaseDefaultProject('{"projects":{"default":"  "}}'),
    ).toBeUndefined();
    expect(parseFirebaseDefaultProject("{}")).toBeUndefined();
  });

  it("prefers the flag, then GCLOUD_PROJECT, then GOOGLE_CLOUD_PROJECT", () => {
    const env = {
      GCLOUD_PROJECT: "from-gcloud",
      GOOGLE_CLOUD_PROJECT: "from-google",
    };
    expect(resolveProjectId(env, "from-flag", "fallback")).toBe("from-flag");
    expect(resolveProjectId(env, "  ", "fallback")).toBe("from-gcloud");
    expect(
      resolveProjectId(
        { GOOGLE_CLOUD_PROJECT: "from-google" },
        undefined,
        "fallback",
      ),
    ).toBe("from-google");
    expect(resolveProjectId({}, undefined, "dad-friendly-game")).toBe(
      "dad-friendly-game",
    );
  });

  it("uses Application Default Credentials only when no emulator host is set", () => {
    expect(usesApplicationDefaultCredentials({})).toBe(true);
    expect(
      usesApplicationDefaultCredentials({ FIRESTORE_EMULATOR_HOST: "  " }),
    ).toBe(true);
    expect(
      usesApplicationDefaultCredentials({
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      }),
    ).toBe(false);
  });
});

describe("formatFieldLogSummary", () => {
  it("prints the snapshot and events in local time", () => {
    expect(formatFieldLogSummary([dad], ZONE)).toBe(
      [
        "fieldLogs/dad",
        "Updated 2026-01-01 22:04:05",
        "",
        "Version 0.0.0",
        "Snapshot 2026-01-01 22:04:05",
        "Mined 12",
        "Left 88",
        "Pocket 3",
        "Crew speed 1.5",
        "Tap yield 2",
        "Legacy 0",
        "Crew",
        "  cart 1",
        "  helper 2",
        "Idle",
        "  cart 1",
        "Relics",
        "  lantern",
        "Upgrades",
        "  tap 1",
        "Boosts",
        "  sharper until 2026-01-01 23:00:00",
        'engineers [{"name":"Ada"}]',
        "Events",
        '  2026-01-01 22:00:00  tier.buy  count=1 id=helper note="not sure"',
        "  yesterday  save.write",
      ].join("\n"),
    );
  });

  it("keeps UTC midnight as 00:00:00 and separates players", () => {
    const midnight: FieldLogRecord = {
      uid: "mom",
      data: { updatedAt: Date.parse("2026-06-01T00:00:00.000Z"), events: [] },
    };
    const text = formatFieldLogSummary(
      [midnight, { uid: "kid", data: null }],
      "UTC",
    );
    expect(text).toBe(
      [
        "fieldLogs/mom",
        "Updated 2026-06-01 00:00:00",
        "",
        "No snapshot.",
        "Events",
        "  none",
        "",
        "fieldLogs/kid",
        "Updated unknown",
        "",
        "Not a field log.",
      ].join("\n"),
    );
  });

  it("says when there are no logs, relics, or boosts", () => {
    expect(formatFieldLogSummary([], "UTC")).toBe("No field logs.");
    const empty: FieldLogRecord = {
      uid: "dad",
      data: {
        updatedAt: Date.parse(AT),
        snapshot: { relics: [], boosts: [], crew: {}, idle: {} },
        events: [],
      },
    };
    const text = formatFieldLogSummary([empty], "UTC");
    expect(text).toContain("Crew\n  none");
    expect(text).toContain("Relics\n  none");
    expect(text).toContain("Boosts\n  none");
    expect(text).toContain("Events\n  none");
  });
});

describe("formatFieldLogJson", () => {
  it("keeps stored timestamps and wraps a list", () => {
    const one = JSON.parse(formatFieldLogJson([dad], "one")) as {
      uid: string;
      updatedAt: number;
      snapshot: { at: string; engineers: { name: string }[] };
      events: { at: string; data: { note: string } }[];
    };
    expect(one.uid).toBe("dad");
    expect(one.updatedAt).toBe(Date.parse(AT));
    expect(one.snapshot.at).toBe(AT);
    expect(one.snapshot.engineers).toEqual([{ name: "Ada" }]);
    expect(one.events[0]?.at).toBe("2026-01-02T03:00:00.000Z");
    expect(one.events[0]?.data.note).toBe("not sure");

    const list = JSON.parse(
      formatFieldLogJson([dad, { uid: "mom", data: { updatedAt: 1 } }], "list"),
    ) as { uid: string }[];
    expect(list.map((row) => row.uid)).toEqual(["dad", "mom"]);
    expect(formatFieldLogJson([], "list")).toBe("[]");
  });
});
