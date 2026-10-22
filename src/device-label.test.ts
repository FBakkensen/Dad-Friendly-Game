import { describe, expect, it } from "vitest";
import {
  deviceLabelFromAgent,
  isDeviceLabel,
  readDeviceLabel,
} from "./device-label";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("deviceLabelFromAgent", () => {
  it("names the browser and the kind of device", () => {
    expect(
      deviceLabelFromAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120.0.0.0 Mobile",
      ),
    ).toBe("Chrome on Android");
    expect(
      deviceLabelFromAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1",
      ),
    ).toBe("Safari on iPhone");
    expect(
      deviceLabelFromAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64) Firefox/120.0",
      ),
    ).toBe("Firefox on this computer");
    expect(deviceLabelFromAgent("Mozilla/5.0 Edg/120.0")).toBe(
      "Edge on this computer",
    );
    expect(deviceLabelFromAgent("")).toBe("Browser on this computer");
    expect(deviceLabelFromAgent("Mozilla/5.0 (iPad) Safari")).toBe(
      "Safari on iPad",
    );
    expect(deviceLabelFromAgent("SomeMobile")).toBe("Browser on a phone");
  });

  it("rejects a question mark and a blank label", () => {
    expect(isDeviceLabel("Chrome on Android")).toBe(true);
    expect(isDeviceLabel("")).toBe(false);
    expect(isDeviceLabel("What?")).toBe(false);
    expect(isDeviceLabel("x".repeat(41))).toBe(false);
  });
});

describe("readDeviceLabel", () => {
  it("stores the label beside the device and keeps it", () => {
    const storage = memory();
    const first = readDeviceLabel(storage, "Mozilla/5.0 Chrome/120.0");
    expect(first).toBe("Chrome on this computer");
    expect(readDeviceLabel(storage, "Mozilla/5.0 Firefox/120.0")).toBe(first);
  });

  it("replaces a stored label this build will not show", () => {
    const storage = memory();
    storage.setItem("dad-friendly-device-label", "What?");
    expect(readDeviceLabel(storage, "Mozilla/5.0 Safari")).toBe(
      "Safari on this computer",
    );
  });

  it("still names the device when storage throws", () => {
    const broken = memory();
    broken.getItem = () => {
      throw new Error("blocked");
    };
    expect(readDeviceLabel(broken, "Mozilla/5.0 Chrome/1")).toBe(
      "Chrome on this computer",
    );
    expect(readDeviceLabel(undefined, "Mozilla/5.0 Firefox/1")).toBe(
      "Firefox on this computer",
    );
  });
});
