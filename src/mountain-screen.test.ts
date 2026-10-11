import { describe, expect, it, vi } from "vitest";
import {
  createMemoryAuth,
  createUnconfiguredAuth,
  type AuthController,
} from "./auth";
import {
  createMemoryCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY } from "./session-save";
import { minedMountain } from "./test-fixtures";

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function createMemoryStorage(): Storage {
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

const signedIn = (): AuthController => {
  const user = { uid: "test-dad", label: "Test Dad" };
  return createMemoryAuth({ state: { kind: "signed-in", user }, user });
};

function mountScreen({
  auth = createUnconfiguredAuth(),
  cloudSave,
  storage = createMemoryStorage(),
}: {
  auth?: AuthController;
  cloudSave?: CloudSave;
  storage?: Storage;
} = {}) {
  const root = document.createElement("div");
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    ...(cloudSave === undefined ? {} : { cloudSave }),
  });
  mountMountainScreen({
    root,
    lanternUrl: tileUrl,
    rockUrl: tileUrl,
    stoneUrl: tileUrl,
    auth,
    progress,
  });
  const find = <T extends Element>(selector: string, type: new () => T): T => {
    const el = root.querySelector(selector);
    if (!(el instanceof type)) {
      throw new Error(`${selector} did not render`);
    }
    return el;
  };
  return {
    root,
    progress,
    mountain: find(".mountain", HTMLButtonElement),
    authButton: find(".auth-action", HTMLButtonElement),
    text: (selector: string) => root.querySelector(selector)?.textContent,
  };
}

describe("mountMountainScreen", () => {
  it("shows a million stones and mines one per tap", () => {
    const screen = mountScreen();

    expect(screen.text(".stones-left")).toBe("1 million stones left");
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".goal")).toContain("Legendary Relics of Fatherhood");
    expect(screen.text(".save-status")).toBe("Sign in to save");

    screen.mountain.click();
    expect(screen.text(".stones-left")).toBe("999.9 thousand stones left");
    expect(screen.text(".pocket")).toBe("1 stone");
    expect(screen.text(".save-status")).toBe("Saved on this device");

    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("2 stones");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("999,998 of 1,000,000");
  });

  it("keeps guest progress after the page is opened again", () => {
    const storage = createMemoryStorage();
    const first = mountScreen({ storage });
    first.mountain.click();
    first.mountain.click();
    first.mountain.click();
    first.progress.dispose();

    const again = mountScreen({ storage });
    expect(again.text(".pocket")).toBe("3 stones");
    expect(again.text(".save-status")).toBe("Saved on this device");
  });

  it("turns an old grid save into a head start", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 2,
        lastSeen: 1,
        grid: {
          width: 3,
          height: 3,
          cells: [
            { kind: "chunk" },
            { kind: "stone" },
            { kind: "dug" },
            ...Array.from({ length: 6 }, () => ({ kind: "covered" })),
          ],
        },
      }),
    );

    const screen = mountScreen({ storage });
    expect(screen.text(".pocket")).toBe("3 stones");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("999,997 of 1,000,000");
  });

  it("disables the mountain once it is mined out", () => {
    const storage = createMemoryStorage();
    const done: Mountain = {
      remaining: 0,
      pocket: MOUNTAIN_STONES,
      helpers: 0,
    };
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 3, mountain: done, lastSeen: 1 }),
    );

    const screen = mountScreen({ storage });
    expect(screen.text(".stones-left")).toBe("0 stones left");
    expect(screen.mountain.disabled).toBe(true);
    expect(screen.mountain.getAttribute("aria-label")).toBe(
      "The mountain is mined out",
    );
  });

  it("does not mine until the cloud save has loaded", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        finishLoad = onChange;
        return () => undefined;
      },
    };
    const screen = mountScreen({ auth: signedIn(), cloudSave });

    expect(screen.mountain.disabled).toBe(true);
    expect(screen.text(".save-status")).toBe("Loading your save...");
    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("0 stones");

    finishLoad({ kind: "found", mountain: minedMountain(40) });
    await Promise.resolve();

    expect(screen.mountain.disabled).toBe(false);
    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("41 stones");
  });

  it("signs in, loads the cloud mountain, and signs out", async () => {
    const docs = new Map([["test-dad", minedMountain(12_345)]]);
    const screen = mountScreen({
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    expect(screen.authButton.textContent).toBe("Sign in with Google");

    screen.authButton.click();

    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe("Saved to your account");
    });
    expect(screen.text(".pocket")).toBe("12.3 thousand stones");
    expect(screen.text(".auth-status")).toBe("Signed in as Test Dad");
    expect(
      screen.root.querySelector(".save-status")?.getAttribute("data-log"),
    ).toContain("save.remote found");

    screen.authButton.click();
    expect(screen.authButton.textContent).toBe("Sign in with Google");
  });

  it("writes every tap to the cloud while signed in", async () => {
    const docs = new Map<string, Mountain>();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    screen.mountain.click();

    expect(docs.get("test-dad")).toEqual(minedMountain(1));
  });

  it("writes the cloud save when the tab hides", async () => {
    const docs = new Map<string, Mountain>();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });
    screen.mountain.click();
    docs.delete("test-dad");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    expect(docs.get("test-dad")).toEqual(minedMountain(1));
  });
});
