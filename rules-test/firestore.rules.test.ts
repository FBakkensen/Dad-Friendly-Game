/**
 * Runs against the Firestore emulator (npm run test:rules): every upgrade and
 * boost the game can save must pass the deployed rules, and odd ones must not.
 */
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOSTS } from "../src/boosts";
import { createMountain, type Mountain } from "../src/mountain";
import { parseSaveValue, serializeSave } from "../src/persist";
import { UPGRADES } from "../src/upgrades";

const [host = "127.0.0.1", port = "8080"] = (
  process.env["FIRESTORE_EMULATOR_HOST"] ?? "127.0.0.1:8080"
).split(":");

let app: FirebaseApp;
let db: Firestore;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-dad-friendly" }, "rules-test");
  db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), {
    mockUserToken: { user_id: "dad", sub: "dad" },
  });
});

afterAll(async () => {
  await deleteApp(app);
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

  it("the one-time staffing mark (#89)", async () => {
    const mountain = { ...createMountain(), helpers: 30, carts: 12 };
    expect(mountain.staffed).toBe(true);
    expect(await roundTrip(mountain)).toEqual(mountain);
    const raw = serializeSave({ mountain, lastSeen: 1 });
    await expect(
      setDoc(doc(db, "saves", "dad"), {
        ...raw,
        mountain: { ...raw.mountain, staffed: false },
      }),
    ).rejects.toThrow(/permission/i);
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
