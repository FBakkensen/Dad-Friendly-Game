/**
 * Runs against the Firestore emulator (npm run test:rules): the save this
 * version writes must pass the deployed rules, and a lower version, an older
 * run, a skipped rev or an unknown envelope key must not (#558). The rules
 * check only the envelope; the client reads the game map.
 */
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getApps as adminApps,
  initializeApp as initAdmin,
} from "firebase-admin/app";
import { getFirestore as adminStore } from "firebase-admin/firestore";
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  Timestamp,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOSTS, type Boosts } from "../src/boosts";
import { ENGINEER_NAMES, MAX_ENGINEERS, type Engineer } from "../src/engineers";
import {
  APP_VERSION,
  EVENT_RING_LIMIT,
  FIELD_STONES_CAP,
  snapshot,
} from "../src/field-log";
import {
  FIND_IDS,
  MAX_EXPEDITION_MS,
  MAX_EXPEDITIONS,
  type Expedition,
} from "../src/expeditions";
import {
  MOUNTAIN_STONES,
  createMountain,
  type Mountain,
} from "../src/mountain";
import { readSave, serializeSave } from "../src/persist";
import { effectiveRates } from "../src/rates";
import { UPGRADES, type Upgrades } from "../src/upgrades";
import { MAX_CRAFT_MS, RECIPE_IDS, type Crafted } from "../src/workshop";

const [host = "127.0.0.1", port = "8080"] = (
  process.env["FIRESTORE_EMULATOR_HOST"] ?? "127.0.0.1:8080"
).split(":");

let app: FirebaseApp;
let db: Firestore;
let momApp: FirebaseApp;
let momDb: Firestore;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-dad-friendly" }, "rules-test");
  db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), {
    mockUserToken: { user_id: "dad", sub: "dad" },
  });
  momApp = initializeApp({ projectId: "demo-dad-friendly" }, "rules-mom");
  momDb = getFirestore(momApp);
  connectFirestoreEmulator(momDb, host, Number(port), {
    mockUserToken: { user_id: "mom", sub: "mom" },
  });
});

afterAll(async () => {
  await deleteApp(app);
  await deleteApp(momApp);
});

const DEVICE = "rules-device";

function admin() {
  const app = adminApps()[0] ?? initAdmin({ projectId: "demo-dad-friendly" });
  return adminStore(app);
}

/** A late crew with something in every map: engineers, a trip, a bench, every clock. */
function lateCrew(): Mountain {
  const fresh = createMountain();
  return {
    ...fresh,
    remaining: MOUNTAIN_STONES - 80_000,
    pocket: 80_000_000,
    helpers: 40,
    carts: 12,
    drills: 8,
    borers: 4,
    machines: 2,
    kids: 6,
    hoists: 9,
    trains: 3,
    legacy: 3,
    startedAt: 1_700,
    engineers: [
      { name: "Ada", rank: 1, trips: 3, post: "borer" },
      { name: "Nils", rank: 0, trips: 0, post: "drill" },
    ],
    expeditions: [
      {
        engineer: "Nils",
        tunnel: "side-seam",
        sentAt: 100,
        returnsAt: 200,
        find: { kind: "quiet" },
      },
    ],
    bench: { recipe: "iron-rails", startedAt: 10, endsAt: 20 },
    upgrades: Object.fromEntries(
      UPGRADES.map((upgrade) => [upgrade.id, upgrade.maxLevel]),
    ) as Upgrades,
    boosts: Object.fromEntries(
      BOOSTS.map((boost) => [boost.id, 1_800_000_000_000]),
    ) as Boosts,
    clocks: Object.fromEntries(
      Object.keys(fresh.clocks).map((id) => [id, 1_800_000_000_000]),
    ) as Mountain["clocks"],
    crafted: { ...fresh.crafted, "sturdy-props": 1 },
    recipes: [...fresh.recipes, "reinforce"],
    seen: ["workshop"],
    taught: ["engineers"],
  };
}

/** The game document as the client writes it. */
function game(rev: number, mountain: Mountain = createMountain()) {
  return {
    ...serializeSave({ mountain, lastSeen: 1, rev, deviceId: DEVICE }),
    savedAt: serverTimestamp(),
  };
}

const denied = /permission|false for/i;

describe("firestore.rules: games/{uid} (#558)", () => {
  const ref = () => doc(db, "games", "dad");

  it("accepts a full save, and the client reads it back", async () => {
    await admin().doc("games/dad").delete();
    const mountain = lateCrew();
    expect(readSave(JSON.parse(JSON.stringify(game(1, mountain)))).kind).toBe(
      "ok",
    );
    await setDoc(ref(), game(1, mountain));
    const read = readSave((await getDoc(ref())).data());
    expect(read.kind === "ok" && read.save.mountain).toEqual(mountain);
    await expect(getDoc(doc(momDb, "games", "dad"))).rejects.toThrow(denied);
    await expect(
      setDoc(doc(momDb, "games", "dad"), game(2, mountain)),
    ).rejects.toThrow(denied);
  });

  it("creates only at rev 1, then moves one rev at a time", async () => {
    await admin().doc("games/dad").delete();
    await expect(setDoc(ref(), game(2))).rejects.toThrow(denied);
    await setDoc(ref(), game(1));
    await expect(setDoc(ref(), game(1))).rejects.toThrow(denied);
    await expect(setDoc(ref(), game(3))).rejects.toThrow(denied);
    await setDoc(ref(), game(2));
    expect((await getDoc(ref())).data()?.["rev"]).toBe(2);
    await expect(deleteDoc(ref())).rejects.toThrow(denied);
  });

  it("refuses a lower version, and takes a later one", async () => {
    await admin().doc("games/dad").delete();
    await expect(setDoc(ref(), { ...game(1), version: 7 })).rejects.toThrow(
      denied,
    );
    await setDoc(ref(), { ...game(1), version: 9 });
    await expect(setDoc(ref(), game(2))).rejects.toThrow(denied);
    await setDoc(ref(), { ...game(2), version: 9 });
  });

  it("refuses a write from an older run", async () => {
    await admin().doc("games/dad").delete();
    await setDoc(ref(), game(1, { ...createMountain(), startedAt: 100 }));
    await expect(
      setDoc(ref(), game(2, { ...createMountain(), startedAt: 50 })),
    ).rejects.toThrow(denied);
    await expect(setDoc(ref(), game(2))).rejects.toThrow(denied);
    await setDoc(ref(), game(2, { ...createMountain(), startedAt: 100 }));
  });

  it("refuses an unknown envelope key, a bad envelope, or a client clock", async () => {
    await admin().doc("games/dad").delete();
    for (const odd of [
      { village: 1 },
      { mountain: {} },
      { game: "nope" },
      { deviceId: "short" },
      { deviceLabel: "" },
      { lastSeen: -1 },
      { startedAt: 1.5 },
      { savedAt: Timestamp.fromMillis(1) },
    ]) {
      await expect(setDoc(ref(), { ...game(1), ...odd })).rejects.toThrow(
        denied,
      );
    }
    const noGame: Record<string, unknown> = { ...game(1) };
    delete noGame["game"];
    await expect(setDoc(ref(), noGame)).rejects.toThrow(denied);
  });
});

describe("firestore.rules: the saves from before version 8 (#558)", () => {
  it("are still readable, and take no create and no update", async () => {
    await admin().doc("saves/dad").set({ version: 7, rev: 4, mountain: {} });
    expect((await getDoc(doc(db, "saves", "dad"))).data()?.["rev"]).toBe(4);
    await expect(
      setDoc(doc(db, "saves", "dad"), {
        version: 7,
        rev: 5,
        mountain: {},
        savedAt: serverTimestamp(),
      }),
    ).rejects.toThrow(denied);
    await admin().doc("saves/dad").delete();
    await expect(
      setDoc(doc(db, "saves", "dad"), { version: 7, rev: 1, mountain: {} }),
    ).rejects.toThrow(denied);
    await expect(
      setDoc(doc(db, "saveArchive", "dad", "copies", "old"), { version: 7 }),
    ).rejects.toThrow(denied);
  });
});

describe("firestore.rules: gameArchive (#480, #558)", () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const copy = (id: string) => doc(db, "gameArchive", "dad", "copies", id);
  const archive = (patch: Record<string, unknown> = {}) => ({
    ...serializeSave({
      mountain: lateCrew(),
      lastSeen: 4,
      rev: 2,
      deviceId: DEVICE,
    }),
    deviceLabel: "Chrome on Android",
    archivedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + WEEK),
    reason: "conflict",
    ...patch,
  });

  it("lets the owner create and read, and refuses everyone else", async () => {
    await setDoc(copy("one"), archive());
    expect((await getDoc(copy("one"))).data()?.["reason"]).toBe("conflict");
    await expect(
      getDoc(doc(momDb, "gameArchive", "dad", "copies", "one")),
    ).rejects.toThrow(denied);
    await expect(
      setDoc(doc(momDb, "gameArchive", "dad", "copies", "two"), archive()),
    ).rejects.toThrow(denied);
    await expect(setDoc(copy("one"), archive())).rejects.toThrow(denied);
    await expect(deleteDoc(copy("one"))).rejects.toThrow(denied);
  });

  it("takes a copy left by a restore, a Start over or a pass, and no other reason", async () => {
    for (const reason of ["restore", "start-over", "pass"]) {
      await setDoc(copy(reason), archive({ reason }));
      expect((await getDoc(copy(reason))).data()?.["reason"]).toBe(reason);
    }
    await expect(
      setDoc(copy("odd"), archive({ reason: "nope" })),
    ).rejects.toThrow(denied);
    await expect(setDoc(copy("old"), archive({ version: 7 }))).rejects.toThrow(
      denied,
    );
  });

  it("keeps an older copy as it was stored, with reason reset", async () => {
    const raw = { version: 7, rev: 3, mountain: { pocket: 4 }, savedAt: 1 };
    const reset = {
      version: 7,
      rev: 3,
      raw,
      archivedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + WEEK),
      reason: "reset",
    };
    await setDoc(copy("reset"), reset);
    expect((await getDoc(copy("reset"))).data()?.["raw"]).toEqual(raw);
    await expect(
      setDoc(copy("reset-odd"), { ...reset, mountain: {} }),
    ).rejects.toThrow(denied);
    await expect(
      setDoc(copy("reset-bad"), { ...reset, raw: "nope" }),
    ).rejects.toThrow(denied);
  });

  it("requires archivedAt to be the server time, and a week's expiry", async () => {
    await expect(
      setDoc(copy("time"), archive({ archivedAt: Date.now() })),
    ).rejects.toThrow(denied);
    await expect(
      setDoc(copy("time"), archive({ expiresAt: serverTimestamp() })),
    ).rejects.toThrow(denied);
    await expect(
      setDoc(
        copy("time"),
        archive({
          expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        }),
      ),
    ).rejects.toThrow(denied);
    await setDoc(copy("time"), archive());
    expect((await getDoc(copy("time"))).exists()).toBe(true);
  });
});

/** A late mountain with every list the field-log snapshot walks. */
function maximalMountain(): Mountain {
  const engineers: Engineer[] = ENGINEER_NAMES.map((name, index) => ({
    name,
    rank: index === 0 ? 0 : 1,
    trips: index === 0 ? 0 : 3,
    post: "camp",
  }));
  const expeditions: Expedition[] = engineers.map((engineer, index) => ({
    engineer: engineer.name,
    tunnel:
      index === 2 ? "deep-dark" : index % 2 === 0 ? "side-seam" : "old-shaft",
    sentAt: 1_000 + index,
    returnsAt: 1_000 + index + (index === 2 ? MAX_EXPEDITION_MS : 60_000),
    find:
      index === 0
        ? { kind: "keepsake", id: "drawing" }
        : index === 1
          ? { kind: "tool", id: "pick" }
          : index === 2
            ? { kind: "glimmer", id: "heart" }
            : index === 3
              ? { kind: "quiet" }
              : { kind: "glimmer", id: "lantern" },
  }));
  return {
    ...createMountain(),
    remaining: 0,
    pocket: 80_000_000,
    helpers: 40,
    carts: 12,
    drills: 8,
    borers: 4,
    machines: 2,
    kids: 6,
    hoists: 9,
    trains: 3,
    upgrades: Object.fromEntries(
      UPGRADES.map((upgrade) => [upgrade.id, upgrade.maxLevel]),
    ) as Upgrades,
    boosts: Object.fromEntries(
      BOOSTS.map((boost) => [boost.id, 1_800_000_000_000]),
    ) as Boosts,
    startedAt: 0,
    legacy: 1,
    engineers,
    expeditions,
    finds: [...FIND_IDS],
    materials: {
      clay: 1_000_000_000,
      iron: 1_000_000_000,
      crystal: 1_000_000_000,
      heartstone: 1_000_000_000,
    },
    recipes: [...RECIPE_IDS],
    bench: {
      recipe: "iron-rails",
      startedAt: 1_000,
      endsAt: 1_000 + MAX_CRAFT_MS,
    },
    crafted: Object.fromEntries(RECIPE_IDS.map((id) => [id, 1])) as Crafted,
    clocks: {
      "blasting-charge": 50_000,
      "crystal-flare": 60_000,
      "heartstone-ember": 70_000,
      "axle-grease": 80_000,
    },
  };
}

const ISO = "2026-01-02T03:04:05.000Z";

const gameSnapshot = () => {
  const mountain = createMountain();
  return snapshot(mountain, effectiveRates(mountain, 1), 1, APP_VERSION);
};

const fieldLog = (
  events: readonly {
    at: string;
    code: string;
    data: {
      id?: string;
      count?: number;
      endsAt?: string;
      source?: string;
      stones?: number;
    };
  }[] = [],
) => ({
  snapshot: gameSnapshot(),
  events,
  updatedAt: 1,
});

const event = {
  at: ISO,
  code: "tier.buy",
  data: { id: "helper", count: 1 },
};

describe("firestore.rules: fieldLogs/{uid}/devices/{deviceId} (#485)", () => {
  const PHONE = "phone-device-0001";
  const PC = "pc-device-000002";
  const deviceLog = (uid: string, device: string, on = db) =>
    doc(on, "fieldLogs", uid, "devices", device);

  it("keeps the phone's and the PC's logs side by side", async () => {
    const phone = fieldLog([event]);
    const pc = { ...fieldLog(), updatedAt: 2 };
    await setDoc(deviceLog("dad", PHONE), phone);
    await setDoc(deviceLog("dad", PC), pc);
    expect((await getDoc(deviceLog("dad", PHONE))).data()).toEqual(phone);
    expect((await getDoc(deviceLog("dad", PC))).data()).toEqual(pc);
    await setDoc(deviceLog("dad", PHONE), fieldLog());
    expect((await getDoc(deviceLog("dad", PHONE))).data()?.events).toEqual([]);
    expect((await getDoc(deviceLog("dad", PC))).data()?.updatedAt).toBe(2);
  });

  it("refuses another user, a bad id, a bad log, and a delete", async () => {
    await setDoc(deviceLog("dad", PHONE), fieldLog([event]));
    await expect(getDoc(deviceLog("dad", PHONE, momDb))).rejects.toThrow(
      /permission|false for/i,
    );
    await expect(
      setDoc(deviceLog("dad", PC, momDb), fieldLog([event])),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(deviceLog("dad", "short"), fieldLog([event])),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(deviceLog("dad", "x".repeat(65)), fieldLog([event])),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(deviceLog("dad", PC), { ...fieldLog(), uid: "dad" }),
    ).rejects.toThrow(/permission/i);
    await expect(deleteDoc(deviceLog("dad", PHONE))).rejects.toThrow(
      /permission/i,
    );
  });
});

describe("firestore.rules: fieldLogs/{uid}", () => {
  it("still accepts a snapshot from an older app with no engineers or expeditions", async () => {
    const older: Record<string, unknown> = { ...gameSnapshot() };
    delete older["engineers"];
    delete older["expeditions"];
    const written = { ...fieldLog([event]), snapshot: older };
    await setDoc(doc(db, "fieldLogs", "dad"), written);
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).data()).toEqual(written);
  });

  it("accepts a maximal late-game snapshot and a full ring (#219)", async () => {
    const mountain = maximalMountain();
    const now = 1;
    const written = {
      snapshot: snapshot(
        mountain,
        effectiveRates(mountain, now),
        now,
        APP_VERSION,
      ),
      events: Array.from({ length: EVENT_RING_LIMIT }, () => event),
      updatedAt: now,
    };
    expect(written.snapshot.engineers).toHaveLength(MAX_ENGINEERS);
    expect(written.snapshot.expeditions).toHaveLength(MAX_EXPEDITIONS);
    expect(written.snapshot.boosts).toHaveLength(BOOSTS.length);
    expect(written.snapshot.relics).toHaveLength(6);
    expect(Object.keys(written.snapshot.upgrades)).toHaveLength(
      UPGRADES.length,
    );
    await setDoc(doc(db, "fieldLogs", "dad"), written);
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).data()).toEqual(written);
  });

  it("accepts five engineers and five expeditions on the snapshot (#150)", async () => {
    const posts = ["cart", "drill", "borer", "machine", "camp"] as const;
    const tunnels = [
      "side-seam",
      "old-shaft",
      "deep-dark",
      "side-seam",
      "old-shaft",
    ] as const;
    const engineers = ENGINEER_NAMES.map((name, index) => ({
      name,
      rank: index >= 4 ? 2 : index >= 3 ? 1 : 0,
      post: posts[index] ?? "camp",
    }));
    const expeditions = ENGINEER_NAMES.map((name, index) => ({
      engineer: name,
      tunnel: tunnels[index] ?? "side-seam",
      returnsAt: ISO,
    }));
    const written = {
      ...fieldLog(Array.from({ length: EVENT_RING_LIMIT }, () => event)),
      snapshot: { ...gameSnapshot(), engineers, expeditions },
    };
    await setDoc(doc(db, "fieldLogs", "dad"), written);
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).data()).toEqual(written);
  });

  it("lets the owner write and read a log, including a float rate and 200 events", async () => {
    const events = Array.from({ length: EVENT_RING_LIMIT }, () => event);
    const written = {
      ...fieldLog(events),
      snapshot: { ...gameSnapshot(), crewSpeed: 1.5, tapYield: 0.25 },
    };
    await setDoc(doc(db, "fieldLogs", "dad"), written);
    const snap = await getDoc(doc(db, "fieldLogs", "dad"));
    expect(snap.data()).toEqual(written);

    await setDoc(doc(db, "fieldLogs", "dad"), fieldLog());
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).data()?.events).toEqual(
      [],
    );
  });

  it("refuses another user, and still lets that user write their own", async () => {
    await setDoc(doc(db, "fieldLogs", "dad"), fieldLog([event]));
    await expect(getDoc(doc(momDb, "fieldLogs", "dad"))).rejects.toThrow(
      /permission|false for/i,
    );
    await expect(
      setDoc(doc(momDb, "fieldLogs", "dad"), fieldLog([event])),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(doc(momDb, "fieldLogs", "mom"), fieldLog([event])),
    ).resolves.toBeUndefined();
  });

  it("refuses a signed-out visitor both read and write", async () => {
    await setDoc(doc(db, "fieldLogs", "dad"), fieldLog([event]));
    const guestApp = initializeApp(
      { projectId: "demo-dad-friendly" },
      "rules-guest",
    );
    const guestDb = getFirestore(guestApp);
    connectFirestoreEmulator(guestDb, host, Number(port));
    try {
      await expect(getDoc(doc(guestDb, "fieldLogs", "dad"))).rejects.toThrow(
        /permission|false for/i,
      );
      await expect(
        setDoc(doc(guestDb, "fieldLogs", "dad"), fieldLog([event])),
      ).rejects.toThrow(/permission/i);
    } finally {
      await deleteApp(guestApp);
    }
  });

  it("accepts a deep-band haul past 240M and refuses one over the cap (#356)", async () => {
    const haul = (stones: number, pocket: number) => ({
      ...fieldLog([{ at: ISO, code: "away.report", data: { stones } }]),
      snapshot: { ...gameSnapshot(), pocket },
    });
    const written = haul(1_600_000_000, 1_600_000_000);
    await setDoc(doc(db, "fieldLogs", "dad"), written);
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).data()).toEqual(written);
    const over = FIELD_STONES_CAP + 1;
    await expect(
      setDoc(doc(db, "fieldLogs", "dad"), haul(over, 1)),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(doc(db, "fieldLogs", "dad"), haul(1, over)),
    ).rejects.toThrow(/permission/i);
  });

  it("rejects an oversize event list and an oversize string", async () => {
    await expect(
      setDoc(
        doc(db, "fieldLogs", "dad"),
        fieldLog(Array.from({ length: EVENT_RING_LIMIT + 1 }, () => event)),
      ),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(
        doc(db, "fieldLogs", "dad"),
        fieldLog([{ ...event, code: "x".repeat(25) }]),
      ),
    ).rejects.toThrow(/permission/i);
    await expect(
      setDoc(
        doc(db, "fieldLogs", "dad"),
        fieldLog([
          {
            ...event,
            data: { id: "helper", count: 1, source: "write" },
          },
        ]),
      ),
    ).rejects.toThrow(/permission/i);
  });

  it("rejects the wrong shape and a delete", async () => {
    const good = fieldLog([event]);
    await setDoc(doc(db, "fieldLogs", "dad"), good);
    for (const bad of [
      { ...good, email: "dad@example.com" },
      { ...good, events: "tier.buy" },
      { ...good, updatedAt: "now" },
      { ...good, updatedAt: -1 },
      { events: good.events, updatedAt: good.updatedAt },
      {
        ...good,
        events: [{ at: "short", code: "tier.buy", data: {} }],
      },
      {
        ...good,
        snapshot: { ...good.snapshot, nickname: "dad" },
      },
      {
        ...good,
        snapshot: {
          ...good.snapshot,
          engineers: [{ name: "Ada", rank: 0, post: "camp", nickname: "Ace" }],
        },
      },
      {
        ...good,
        snapshot: {
          ...good.snapshot,
          expeditions: [
            {
              engineer: "Ada",
              tunnel: "side-seam",
              returnsAt: ISO,
              home: "camp",
            },
          ],
        },
      },
      {
        ...good,
        snapshot: {
          ...good.snapshot,
          engineers: Array.from({ length: MAX_ENGINEERS + 1 }, () => ({
            name: "Ada",
            rank: 0,
            post: "camp",
          })),
        },
      },
    ]) {
      await expect(setDoc(doc(db, "fieldLogs", "dad"), bad)).rejects.toThrow(
        /permission/i,
      );
    }
    await expect(deleteDoc(doc(db, "fieldLogs", "dad"))).rejects.toThrow(
      /permission/i,
    );
    expect((await getDoc(doc(db, "fieldLogs", "dad"))).exists()).toBe(true);
  });
});
