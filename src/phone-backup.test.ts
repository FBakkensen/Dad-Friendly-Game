import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";
import { readPhoneBackup, saveEchoKey, writePhoneBackup } from "./phone-backup";
import { serializeSave } from "./persist";
import { minedMountain } from "./test-fixtures";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("phone backup", () => {
  it("round-trips the full save and leaves an equal write in place", () => {
    const storage = memory();
    const mountain = { ...minedMountain(12), helpers: 2, legacy: 1 };
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain,
        lastSeen: 40,
      }),
    ).toBe("wrote");
    expect(readPhoneBackup({ storage, uid: "dad" })).toEqual({
      kind: "present",
      save: { mountain, lastSeen: 40 },
    });
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain,
        lastSeen: 40,
      }),
    ).toBe("kept");
    expect(saveEchoKey(mountain, 40)).toBe(
      JSON.stringify(serializeSave({ mountain, lastSeen: 40 })),
    );
  });

  it("refuses to replace a backup that has more stones mined", () => {
    const storage = memory();
    writePhoneBackup({
      storage,
      uid: "dad",
      mountain: minedMountain(150),
      lastSeen: 10,
    });
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: minedMountain(100),
        lastSeen: 99,
      }),
    ).toBe("kept");
    expect(readPhoneBackup({ storage, uid: "dad" })).toMatchObject({
      kind: "present",
      save: { mountain: minedMountain(150), lastSeen: 10 },
    });
  });

  it("lets a later run replace a deeper mountain", () => {
    const storage = memory();
    writePhoneBackup({
      storage,
      uid: "dad",
      mountain: { ...minedMountain(80), startedAt: 1 },
      lastSeen: 5,
    });
    const fresh = { ...createMountain(), startedAt: 6 };
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: fresh,
        lastSeen: 6,
      }),
    ).toBe("wrote");
    expect(readPhoneBackup({ storage, uid: "dad" })).toMatchObject({
      kind: "present",
      save: { mountain: fresh, lastSeen: 6 },
    });
  });

  it("leaves an unreadable backup byte for byte", () => {
    const storage = memory();
    const key = "dad-friendly-phone-backup:dad";
    storage.setItem(key, "{not json");
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: minedMountain(3),
        lastSeen: 1,
      }),
    ).toBe("kept");
    expect(storage.getItem(key)).toBe("{not json");
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
  });

  it("does not read a non-object, a partial wrapper, or another account's blob", () => {
    const storage = memory();
    const key = "dad-friendly-phone-backup:dad";
    storage.setItem(key, "5");
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
    storage.setItem(key, "null");
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
    storage.setItem(key, JSON.stringify({ uid: "dad" }));
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
    storage.setItem(
      key,
      JSON.stringify({
        uid: "someone-else",
        save: serializeSave({ mountain: minedMountain(4), lastSeen: 1 }),
      }),
    );
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
    storage.setItem(key, JSON.stringify({ uid: "dad", save: { version: 1 } }));
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
    expect(readPhoneBackup({ storage, uid: "other" }).kind).toBe("absent");
  });

  it("reports a value that cannot be serialized", () => {
    const storage = memory();
    const mountain = {
      ...createMountain(),
      pocket: 1n as unknown as number,
    };
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain,
        lastSeen: 1,
      }),
    ).toBe("failed");
  });

  it("keeps a higher rev and will not replace it with a lower one", () => {
    const storage = memory();
    writePhoneBackup({
      storage,
      uid: "dad",
      mountain: minedMountain(4),
      lastSeen: 2,
      rev: 5,
      deviceId: "device-dad-1234",
    });
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: minedMountain(40),
        lastSeen: 9,
        rev: 2,
        deviceId: "device-dad-1234",
      }),
    ).toBe("kept");
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("present");
    const kept = readPhoneBackup({ storage, uid: "dad" });
    expect(kept.kind === "present" && kept.save.rev).toBe(5);
    expect(kept.kind === "present" && kept.save.mountain.pocket).toBe(4);
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: minedMountain(9),
        lastSeen: 3,
        rev: 6,
        deviceId: "device-dad-1234",
      }),
    ).toBe("wrote");
    const next = readPhoneBackup({ storage, uid: "dad" });
    expect(next.kind === "present" && next.save.rev).toBe(6);
  });

  it("reports a storage failure without throwing", () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(
      writePhoneBackup({
        storage,
        uid: "dad",
        mountain: createMountain(),
        lastSeen: 1,
      }),
    ).toBe("failed");
    storage.getItem = () => {
      throw new Error("blocked");
    };
    expect(readPhoneBackup({ storage, uid: "dad" }).kind).toBe("unreadable");
  });
});
