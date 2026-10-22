import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  initializeFirestore: vi.fn(() => ({ id: "db" })),
  getFirestore: vi.fn(() => ({ id: "existing" })),
  persistentLocalCache: vi.fn((settings: unknown) => ({
    kind: "persistent",
    settings,
  })),
  persistentMultipleTabManager: vi.fn(() => ({
    kind: "PersistentMultipleTab",
  })),
  memoryLocalCache: vi.fn(() => ({ kind: "memory" })),
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({
    collection,
    id,
  })),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({ name: "app" }),
}));

vi.mock("firebase/firestore", () => firestore);

import { createFirebaseCloudSave } from "./firebase-save";

const options = {
  apiKey: "key",
  authDomain: "auth.example",
  projectId: "proj",
  appId: "app",
};

beforeEach(() => {
  firestore.initializeFirestore.mockReset();
  firestore.initializeFirestore.mockImplementation(() => ({ id: "db" }));
  firestore.getFirestore.mockClear();
  firestore.persistentLocalCache.mockClear();
  firestore.persistentMultipleTabManager.mockClear();
  firestore.memoryLocalCache.mockClear();
  firestore.getDoc.mockReset();
  firestore.getDocFromServer.mockReset();
  firestore.onSnapshot.mockReset();
});

describe("firestore persistent cache", () => {
  it("shares an IndexedDB cache across tabs", () => {
    createFirebaseCloudSave({ options });
    expect(firestore.persistentMultipleTabManager).toHaveBeenCalledOnce();
    expect(firestore.persistentLocalCache).toHaveBeenCalledWith({
      tabManager: { kind: "PersistentMultipleTab" },
    });
    expect(firestore.initializeFirestore).toHaveBeenCalledWith(
      { name: "app" },
      {
        localCache: {
          kind: "persistent",
          settings: { tabManager: { kind: "PersistentMultipleTab" } },
        },
      },
    );
  });

  it("falls back when persistence is already open", () => {
    firestore.initializeFirestore
      .mockImplementationOnce(() => {
        throw new Error("already started");
      })
      .mockImplementationOnce(() => ({ id: "memory" }));
    firestore.getFirestore.mockImplementationOnce(() => {
      throw new Error("not started");
    });
    createFirebaseCloudSave({ options });
    expect(firestore.memoryLocalCache).toHaveBeenCalledOnce();
  });

  it("reads the server on a fresh load and keeps pending cache marks", async () => {
    firestore.getDocFromServer.mockResolvedValue({
      exists: () => true,
      data: () => ({
        version: 7,
        rev: 2,
        deviceId: "device-123",
        lastSeen: 10,
        mountain: {
          remaining: 240_000_000,
          pocket: 4,
          helpers: 0,
        },
        workshop: {
          materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
          recipes: [],
        },
      }),
      metadata: { fromCache: false, hasPendingWrites: false },
    });
    firestore.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
      metadata: { fromCache: true, hasPendingWrites: false },
    });
    const save = createFirebaseCloudSave({ options });
    await expect(save.load({ uid: "dad", fresh: true })).resolves.toMatchObject(
      { kind: "found", rev: 2 },
    );
    expect(firestore.getDocFromServer).toHaveBeenCalledOnce();
    await expect(save.load({ uid: "dad" })).resolves.toEqual({
      kind: "missing",
      cached: true,
    });

    let listener:
      | ((snap: {
          exists: () => boolean;
          data: () => unknown;
          metadata: { fromCache: boolean; hasPendingWrites: boolean };
        }) => void)
      | undefined;
    firestore.onSnapshot.mockImplementation((_ref, _options, onNext) => {
      listener = onNext as typeof listener;
      return () => undefined;
    });
    const seen: unknown[] = [];
    save.watch({
      uid: "dad",
      onChange: (remote) => {
        seen.push(remote);
      },
    });
    listener?.({
      exists: () => true,
      data: () => ({
        version: 7,
        rev: 3,
        deviceId: "device-123",
        lastSeen: 11,
        mountain: {
          remaining: 240_000_000,
          pocket: 5,
          helpers: 0,
        },
        workshop: {
          materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
          recipes: [],
        },
      }),
      metadata: { fromCache: true, hasPendingWrites: true },
    });
    expect(seen.at(-1)).toMatchObject({
      kind: "found",
      rev: 3,
      pending: true,
      cached: true,
    });
    expect(firestore.onSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    );
  });
});
