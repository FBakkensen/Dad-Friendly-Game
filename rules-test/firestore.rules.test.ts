/**
 * Runs against the Firestore emulator (npm run test:rules): every upgrade and
 * boost the game can save must pass the deployed rules, and odd ones must not.
 */
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOSTS } from "../src/boosts";
import {
  ENGINEER_NAMES,
  ENGINEER_POSTS,
  MAX_ENGINEERS,
  type Engineer,
} from "../src/engineers";
import { APP_VERSION, EVENT_RING_LIMIT, snapshot } from "../src/field-log";
import {
  FIND_IDS,
  MAX_EXPEDITION_MS,
  MAX_EXPEDITIONS,
  type Expedition,
} from "../src/expeditions";
import {
  MOUNTAIN_STONES,
  createMountain,
  minedOut,
  type Mountain,
} from "../src/mountain";
import { MAX_MATERIAL } from "../src/layers";
import { MAX_CRAFTED_LEVEL, MAX_CRAFT_MS } from "../src/workshop";
import { parseSaveValue, serializeSave } from "../src/persist";
import { effectiveRates } from "../src/rates";
import { UPGRADES } from "../src/upgrades";

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

const save = (mountain: Mountain) =>
  setDoc(doc(db, "saves", "dad"), serializeSave({ mountain, lastSeen: 1 }));

const roundTrip = async (mountain: Mountain): Promise<Mountain | undefined> => {
  await save(mountain);
  const snap = await getDoc(doc(db, "saves", "dad"));
  return parseSaveValue(snap.data())?.mountain;
};

describe("firestore.rules: every save the game writes is accepted", () => {
  it.each(UPGRADES.map((upgrade) => [upgrade.id, upgrade.maxLevel] as const))(
    "upgrade %s at every level up to %i",
    async (id, maxLevel) => {
      for (let level = 0; level <= maxLevel; level += 1) {
        const mountain = { ...createMountain(), upgrades: { [id]: level } };
        expect(await roundTrip(mountain)).toEqual(mountain);
      }
    },
  );

  it("all upgrades at once, maxed", async () => {
    const mountain = {
      ...createMountain(),
      upgrades: Object.fromEntries(
        UPGRADES.map((upgrade) => [upgrade.id, upgrade.maxLevel]),
      ),
    };
    expect(await roundTrip(mountain)).toEqual(mountain);
  });

  it.each(BOOSTS.map((boost) => boost.id))("boost %s", async (id) => {
    const mountain = {
      ...createMountain(),
      boosts: { [id]: 1_800_000_000_000 },
    };
    expect(await roundTrip(mountain)).toEqual(mountain);
  });

  it("the staffing marks (#89 true, and #140's 1 and 2)", async () => {
    const mountain = { ...createMountain(), helpers: 30, carts: 12 };
    expect(mountain.staffed).toBe(2);
    expect(await roundTrip(mountain)).toEqual(mountain);
    const raw = serializeSave({ mountain, lastSeen: 1 });
    for (const staffed of [true, 1, 2]) {
      await setDoc(doc(db, "saves", "dad"), {
        ...raw,
        mountain: { ...raw.mountain, staffed },
      });
      const snap = await getDoc(doc(db, "saves", "dad"));
      expect(parseSaveValue(snap.data())?.mountain.staffed).toBe(staffed);
    }
    for (const staffed of [false, 0, 3, "2"]) {
      await expect(
        setDoc(doc(db, "saves", "dad"), {
          ...raw,
          mountain: { ...raw.mountain, staffed },
        }),
      ).rejects.toThrow(/permission/i);
    }
  });

  it("the Legacy count (#130)", async () => {
    const mountain = { ...createMountain(), legacy: 2 };
    expect(await roundTrip(mountain)).toEqual(mountain);
    const raw = serializeSave({ mountain, lastSeen: 1 });
    for (const legacy of [-1, 1.5, "2", 1001]) {
      await expect(
        setDoc(doc(db, "saves", "dad"), {
          ...raw,
          mountain: { ...raw.mountain, legacy },
        }),
      ).rejects.toThrow(/permission/i);
    }
  });

  it("Crown of Wisdom kid helpers (#102)", async () => {
    const mountain = { ...createMountain(), helpers: 40, kids: 12 };
    expect(await roundTrip(mountain)).toEqual(mountain);
    const raw = serializeSave({ mountain, lastSeen: 1 });
    for (const kids of [-1, 1.5, "7"]) {
      await expect(
        setDoc(doc(db, "saves", "dad"), {
          ...raw,
          mountain: { ...raw.mountain, kids },
        }),
      ).rejects.toThrow(/permission/i);
    }
  });

  it("round-trips a crew of engineers and rejects a bad one (#144)", async () => {
    const engineers: Engineer[] = ENGINEER_NAMES.map((name, index) => ({
      name,
      rank: index < 2 ? 0 : index < 4 ? 1 : 2,
      trips: index < 2 ? 0 : index < 4 ? 3 : 9,
      post: ENGINEER_POSTS[index] ?? "camp",
    }));
    const mountain = { ...createMountain(), borers: 1, engineers };
    expect(engineers).toHaveLength(MAX_ENGINEERS);
    expect(await roundTrip(mountain)).toEqual(mountain);

    const raw = serializeSave({ mountain, lastSeen: 1 });
    const write = (next: unknown) =>
      setDoc(doc(db, "saves", "dad"), {
        ...raw,
        mountain: { ...raw.mountain, engineers: next },
      });
    await expect(write([])).resolves.toBeUndefined();
    const tooMany = [...engineers, { ...engineers[0], name: "Ada" }];
    await expect(write(tooMany)).rejects.toThrow(/permission/i);
    await expect(write([{ ...engineers[0], name: "Bob" }])).rejects.toThrow(
      /permission/i,
    );
    await expect(write([{ ...engineers[0], post: "helper" }])).rejects.toThrow(
      /permission/i,
    );
    await expect(write([{ ...engineers[0], rank: 2 }])).rejects.toThrow(
      /permission/i,
    );
    await expect(write([{ ...engineers[0], trips: -1 }])).rejects.toThrow(
      /permission/i,
    );
    await expect(
      write([{ ...engineers[0], trips: 1_000_001, rank: 2 }]),
    ).rejects.toThrow(/permission/i);
    await expect(write([engineers[0], engineers[0]])).rejects.toThrow(
      /permission/i,
    );
    await expect(write([{ ...engineers[0], nickname: "Ace" }])).rejects.toThrow(
      /permission/i,
    );
  });

  it("round-trips expeditions and a shelf, and rejects a bad shape (#146)", async () => {
    const engineers: Engineer[] = ENGINEER_NAMES.map((name, index) => ({
      name,
      rank: index === 0 ? 0 : 1,
      trips: index === 0 ? 0 : 3,
      post: "tunnel",
    }));
    const expeditions: Expedition[] = engineers.map((engineer, index) => ({
      engineer: engineer.name,
      tunnel:
        index === 2 ? "deep-dark" : index % 2 === 0 ? "side-seam" : "old-shaft",
      sentAt: 1_000 + index,
      returnsAt: 1_000 + index + (index === 2 ? 4 * 60 * 60_000 : 60_000),
      home: "camp",
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
    const mountain = {
      ...createMountain(),
      borers: 1,
      engineers,
      expeditions,
      finds: FIND_IDS.filter((id) => id !== "drawing" && id !== "pick"),
    };
    expect(expeditions).toHaveLength(MAX_EXPEDITIONS);
    expect(mountain.finds).toHaveLength(FIND_IDS.length - 2);
    expect(await roundTrip(mountain)).toEqual(mountain);
    const withANewHand = {
      ...createMountain(),
      engineers: [
        {
          name: "Ada" as const,
          rank: 1 as const,
          trips: 3,
          post: "tunnel" as const,
        },
      ],
      expeditions: [
        {
          engineer: "Ada" as const,
          tunnel: "deep-dark" as const,
          sentAt: 2,
          returnsAt: 2 + 4 * 60 * 60_000,
          home: "borer" as const,
          find: { kind: "engineer" as const, id: "Nils" as const },
        },
      ],
    };
    expect(await roundTrip(withANewHand)).toEqual(withANewHand);

    const raw = serializeSave({ mountain, lastSeen: 1 });
    const writeExpeditions = (next: unknown) =>
      setDoc(doc(db, "saves", "dad"), {
        ...raw,
        mountain: { ...raw.mountain, expeditions: next },
      });
    const writeFinds = (next: unknown) =>
      setDoc(doc(db, "saves", "dad"), {
        ...raw,
        mountain: { ...raw.mountain, finds: next },
      });
    const tooLong = {
      ...expeditions[0],
      returnsAt: (expeditions[0]?.sentAt ?? 0) + MAX_EXPEDITION_MS + 1,
    };
    await expect(
      writeExpeditions([...expeditions, expeditions[0]]),
    ).rejects.toThrow(/permission/i);
    await expect(
      writeExpeditions([{ ...expeditions[0], tunnel: "moon" }]),
    ).rejects.toThrow(/permission/i);
    await expect(
      writeExpeditions([
        { ...expeditions[0], returnsAt: expeditions[0]?.sentAt },
      ]),
    ).rejects.toThrow(/permission/i);
    await expect(writeExpeditions([tooLong])).rejects.toThrow(/permission/i);
    // A bad home, an extra key, a nonsense find, or two trips for one name are
    // rejected by the parser. The rules expression budget cannot check them
    // on top of a full crew. An unknown or repeated shelf id is dropped.
    await expect(
      writeFinds(["turbo", "pick", "pick"]),
    ).resolves.toBeUndefined();
    const unknownShelf = await getDoc(doc(db, "saves", "dad"));
    const loadedShelf = parseSaveValue(unknownShelf.data());
    expect(loadedShelf?.mountain.finds).toEqual(["pick"]);
    expect(loadedShelf?.mountain.remaining).toBe(mountain.remaining);
    expect(loadedShelf?.mountain.pocket).toBe(mountain.pocket);
    await expect(
      writeFinds(new Array(FIND_IDS.length + 1).fill("lamp")),
    ).rejects.toThrow(/permission/i);
  });

  it("accepts a v6 workshop and rejects a bad shape (#195)", async () => {
    const mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 60_000_000,
      pocket: 60_000_000,
      materials: { clay: 250, iron: 437, crystal: 93, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "diamond-bits",
      ] as const,
      bench: {
        recipe: "diamond-bits" as const,
        startedAt: 1_000,
        endsAt: 1_000 + MAX_CRAFT_MS,
      },
      crafted: { "iron-rails": 3, "crystal-lamp": 1 },
      chargeUntil: 50_000,
    };
    expect(await roundTrip(mountain)).toEqual(mountain);

    const raw = serializeSave({ mountain, lastSeen: 1 });
    const writeWorkshop = (workshop: unknown) =>
      setDoc(doc(db, "saves", "dad"), { ...raw, workshop });
    await expect(
      writeWorkshop({ ...raw.workshop, bench: null }),
    ).resolves.toBeUndefined();
    await expect(writeWorkshop("pocket")).rejects.toThrow(/permission/i);
    const { workshop, ...noWorkshop } = raw;
    await expect(setDoc(doc(db, "saves", "dad"), noWorkshop)).rejects.toThrow(
      /permission/i,
    );
    expect(workshop.materials.clay).toBe(250);
    // Closed recipe ids, bench times, and crafted levels sit past the
    // expression budget once a crew is saved. The parser rejects them.
    for (const patch of [
      { materials: { ...mountain.materials, gold: 1 } },
      { materials: { ...mountain.materials, clay: -1 } },
      { materials: { ...mountain.materials, clay: 1.5 } },
      { materials: { ...mountain.materials, clay: MAX_MATERIAL.clay + 1 } },
      { bench: { recipe: "iron-rails", startedAt: 5, endsAt: 5 } },
      {
        bench: {
          recipe: "iron-rails",
          startedAt: 1,
          endsAt: 1 + MAX_CRAFT_MS + 1,
        },
      },
      { crafted: { "iron-rails": MAX_CRAFTED_LEVEL + 1 } },
      { chargeUntil: -1 },
      { chargeUntil: 1.5 },
    ]) {
      await expect(
        writeWorkshop({ ...raw.workshop, ...patch }),
      ).resolves.toBeUndefined();
      const snap = await getDoc(doc(db, "saves", "dad"));
      expect(parseSaveValue(snap.data())).toBeUndefined();
    }
    await expect(
      writeWorkshop({
        ...raw.workshop,
        recipes: ["future-bit", "iron-rails", "iron-rails"],
        bench: { recipe: "future-bit", startedAt: 1, endsAt: 2 },
        crafted: { "future-bit": 3, "iron-rails": 1 },
      }),
    ).resolves.toBeUndefined();
    const newer = await getDoc(doc(db, "saves", "dad"));
    const loadedNewer = parseSaveValue(newer.data());
    expect(loadedNewer?.mountain.recipes).toEqual(["iron-rails"]);
    expect(loadedNewer?.mountain.bench).toBeUndefined();
    expect(loadedNewer?.mountain.crafted).toEqual({ "iron-rails": 1 });
    expect(loadedNewer?.mountain.remaining).toBe(mountain.remaining);
    await expect(
      setDoc(doc(db, "saves", "dad"), { ...raw, version: 7 }),
    ).rejects.toThrow(/permission/i);
  });

  it("reads a v5 cloud document and grants the dug materials (#195)", async () => {
    const stones = 12_000_000;
    await setDoc(doc(db, "saves", "dad"), {
      version: 5,
      mountain: {
        remaining: MOUNTAIN_STONES - stones,
        pocket: stones,
        helpers: 0,
      },
      lastSeen: 4,
    });
    const snap = await getDoc(doc(db, "saves", "dad"));
    const parsed = parseSaveValue(snap.data());
    expect(minedOut(parsed?.mountain ?? createMountain())).toBe(stones);
    expect(parsed?.mountain.materials).toEqual({
      clay: 10,
      iron: 8,
      crystal: 0,
      heartstone: 0,
    });
    expect(parsed?.mountain.recipes).toEqual([
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "iron-temper",
    ]);
  });

  it("rejects unknown upgrades and levels past the top", async () => {
    await expect(
      save({
        ...createMountain(),
        upgrades: { turbo: 1 },
      } as unknown as Mountain),
    ).rejects.toThrow(/permission/i);
    for (const upgrade of UPGRADES) {
      await expect(
        save({
          ...createMountain(),
          upgrades: { [upgrade.id]: upgrade.maxLevel + 1 },
        }),
      ).rejects.toThrow(/permission/i);
    }
  });
});

const ISO = "2026-01-02T03:04:05.000Z";

const gameSnapshot = () => {
  const mountain = createMountain();
  return snapshot(mountain, effectiveRates(mountain, 1), 1, APP_VERSION);
};

const fieldLog = (
  events: readonly {
    at: string;
    code: string;
    data: { id?: string; count?: number; endsAt?: string; source?: string };
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

describe("firestore.rules: fieldLogs/{uid}", () => {
  it("still accepts a snapshot from an older app with no engineers or expeditions", async () => {
    const older: Record<string, unknown> = { ...gameSnapshot() };
    delete older["engineers"];
    delete older["expeditions"];
    const written = { ...fieldLog([event]), snapshot: older };
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
