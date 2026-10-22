import { describe, expect, it } from "vitest";
import {
  DEVICE_ID_MAX,
  createDeviceId,
  isDeviceId,
  readDeviceId,
} from "./device-id";

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

describe("device id", () => {
  it("accepts a uuid and rejects a short or huge string", () => {
    expect(isDeviceId("12345678")).toBe(true);
    expect(isDeviceId("1234567")).toBe(false);
    expect(isDeviceId("x".repeat(DEVICE_ID_MAX + 1))).toBe(false);
  });

  it("uses randomUUID when the browser has one", () => {
    const cryptoObj = {
      randomUUID: () => "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    } as unknown as Crypto;
    expect(createDeviceId(cryptoObj)).toBe(
      "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    );
  });

  it("builds an id when randomUUID is missing", () => {
    const id = createDeviceId({} as Crypto);
    expect(isDeviceId(id)).toBe(true);
    expect(id.startsWith("device-")).toBe(true);
  });

  it("keeps the stored id and replaces a short one", () => {
    const storage = memory();
    const first = readDeviceId(storage);
    expect(readDeviceId(storage)).toBe(first);
    storage.setItem("dad-friendly-device-id", "short");
    const replaced = readDeviceId(storage);
    expect(replaced).not.toBe("short");
    expect(isDeviceId(replaced)).toBe(true);
  });

  it("still returns an id when storage throws or is missing", () => {
    const broken: Storage = {
      get length() {
        return 0;
      },
      clear: () => undefined,
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    };
    expect(isDeviceId(readDeviceId(broken))).toBe(true);
    expect(isDeviceId(readDeviceId(undefined))).toBe(true);
  });
});
