import { describe, expect, it } from "vitest";
import {
  byPlayer,
  fieldLogPath,
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
      engineers: [{ name: "Ada", rank: 0, post: "borer" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          returnsAt: "2026-01-02T04:04:05.000Z",
        },
      ],
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
        "Engineers",
        "  Ada rank 0 borer",
        "Expeditions",
        "  Ada side-seam returns 2026-01-01 23:04:05",
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
        // Players print in uid order.
        "fieldLogs/kid",
        "Updated unknown",
        "",
        "Not a field log.",
        "",
        "fieldLogs/mom",
        "Updated 2026-06-01 00:00:00",
        "",
        "No snapshot.",
        "Events",
        "  none",
      ].join("\n"),
    );
  });

  it("says when there are no logs, relics, or boosts", () => {
    expect(formatFieldLogSummary([], "UTC")).toBe("No field logs.");
    const empty: FieldLogRecord = {
      uid: "dad",
      data: {
        updatedAt: Date.parse(AT),
        snapshot: {
          relics: [],
          boosts: [],
          crew: {},
          idle: {},
          engineers: [],
          expeditions: [],
        },
        events: [],
      },
    };
    const text = formatFieldLogSummary([empty], "UTC");
    expect(text).toContain("Crew\n  none");
    expect(text).toContain("Relics\n  none");
    expect(text).toContain("Boosts\n  none");
    expect(text).toContain("Engineers\n  none");
    expect(text).toContain("Expeditions\n  none");
    expect(text).toContain("Events\n  none");
  });
});

describe("formatFieldLogJson", () => {
  it("keeps stored timestamps and wraps a list", () => {
    const [one] = JSON.parse(formatFieldLogJson([dad])) as {
      uid: string;
      updatedAt: number;
      snapshot: { at: string; engineers: { name: string }[] };
      events: { at: string; data: { note: string } }[];
    }[];
    if (one === undefined) {
      throw new Error("no row");
    }
    expect(one.uid).toBe("dad");
    expect(one.updatedAt).toBe(Date.parse(AT));
    expect(one.snapshot.at).toBe(AT);
    expect(one.snapshot.engineers).toEqual([
      { name: "Ada", rank: 0, post: "borer" },
    ]);
    expect(one.events[0]?.at).toBe("2026-01-02T03:00:00.000Z");
    expect(one.events[0]?.data.note).toBe("not sure");

    const list = JSON.parse(
      formatFieldLogJson([{ uid: "mom", data: { updatedAt: 1 } }, dad]),
    ) as { uid: string }[];
    expect(list.map((row) => row.uid)).toEqual(["dad", "mom"]);
    expect(formatFieldLogJson([])).toBe("[]");
  });
});

describe("each device's log, read together (#485)", () => {
  const phone: FieldLogRecord = {
    uid: "dad",
    device: "phone-1234-abcd",
    data: {
      updatedAt: 1,
      events: [
        { at: "2026-01-02T03:00:00.000Z", code: "tier.buy", data: {} },
        { at: "2026-01-02T03:20:00.000Z", code: "run.start-over", data: {} },
      ],
    },
  };
  const pc: FieldLogRecord = {
    uid: "dad",
    device: "pc-98765432-x",
    data: {
      updatedAt: 2,
      events: [
        { at: "2026-01-02T03:10:00.000Z", code: "vein.tap", data: {} },
        "not an event",
      ],
    },
  };
  const older: FieldLogRecord = {
    uid: "dad",
    data: { updatedAt: 0, events: [] },
  };

  it("prints each device, then every event in time order with its device", () => {
    const text = formatFieldLogSummary(
      [older, phone, pc, { uid: "mom", data: { updatedAt: 1 } }],
      "UTC",
    );
    expect(text).toContain("fieldLogs/dad\nUpdated");
    expect(text).toContain("fieldLogs/dad/devices/phone-1234-abcd\nUpdated");
    expect(text).toContain("fieldLogs/dad/devices/pc-98765432-x\nUpdated");
    const together = text.slice(text.indexOf("fieldLogs/dad: together"));
    expect(together.split("\n").slice(0, 5)).toEqual([
      "fieldLogs/dad: together",
      "Events",
      "  2026-01-02 03:00:00  tier.buy  [phone-12]",
      "  2026-01-02 03:10:00  vein.tap  [pc-98765]",
      "  2026-01-02 03:20:00  run.start-over  [phone-12]",
    ]);
    // One log alone has no Together.
    expect(text).not.toContain("fieldLogs/mom: together");
    expect(
      formatFieldLogSummary([older, { uid: "dad", data: null }], "UTC"),
    ).toContain("fieldLogs/dad: together\nEvents\n  none");
    // Out of order in, side by side out: one Together per player.
    const shuffled = formatFieldLogSummary(
      [phone, { uid: "abe", data: null }, pc],
      "UTC",
    );
    expect(shuffled.split("fieldLogs/dad: together")).toHaveLength(2);
  });

  it("shows an event both logs hold once, and an unreadable time last", () => {
    const shared = {
      at: "2026-01-02T03:00:00.000Z",
      code: "tier.buy",
      data: {},
    };
    const text = formatFieldLogSummary(
      [
        { uid: "dad", data: { updatedAt: 0, events: [shared] } },
        {
          uid: "dad",
          device: "phone-1234-abcd",
          data: {
            updatedAt: 1,
            events: [{ at: "whenever", code: "save.write", data: {} }, shared],
          },
        },
      ],
      "UTC",
    );
    const together = text.slice(text.indexOf("fieldLogs/dad: together"));
    expect(together.split("\n")).toEqual([
      "fieldLogs/dad: together",
      "Events",
      "  2026-01-02 03:00:00  tier.buy  [account]",
      "  whenever  save.write  [phone-12]",
    ]);
  });

  it("keeps the uid and device in JSON, and lists a player's several logs", () => {
    const rows = JSON.parse(formatFieldLogJson([phone, older])) as {
      uid: string;
      device: string | null;
    }[];
    expect(rows.map((row) => [row.uid, row.device])).toEqual([
      ["dad", null],
      ["dad", "phone-1234-abcd"],
    ]);
    // One device alone is still a list, so a script reads it the same way.
    const alone = JSON.parse(formatFieldLogJson([phone])) as {
      device: string;
    }[];
    expect(alone.map((row) => row.device)).toEqual(["phone-1234-abcd"]);
  });

  it("names where each log lives, and orders a player's logs", () => {
    expect(fieldLogPath(older)).toBe("fieldLogs/dad");
    expect(fieldLogPath(pc)).toBe("fieldLogs/dad/devices/pc-98765432-x");
    expect(
      [pc, { uid: "abe", data: null }, phone, older]
        .sort(byPlayer)
        .map(fieldLogPath),
    ).toEqual([
      "fieldLogs/abe",
      "fieldLogs/dad",
      "fieldLogs/dad/devices/pc-98765432-x",
      "fieldLogs/dad/devices/phone-1234-abcd",
    ]);
  });
});
