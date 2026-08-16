import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { createPocketGrid, dig, type PocketGrid } from "./grid";
import { mountPocketGridScreen } from "./pocket-grid-screen";
import { GRID_SAVE_KEY } from "./persist";

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const screen = {
  lanternUrl: tileUrl,
  cellSheetUrl: tileUrl,
  storage: sessionStorage,
};

beforeEach(() => {
  sessionStorage.removeItem(GRID_SAVE_KEY);
});

describe("mountPocketGridScreen", () => {
  it("keeps the lantern and uncovers a cell on tap", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    const lantern = root.querySelector("img.lantern");
    const cells = root.querySelectorAll("button.dig-cell");
    const status = root.querySelector(".dig-status");
    const first = cells[0];
    if (
      !(lantern instanceof HTMLImageElement) ||
      cells.length !== 9 ||
      !(first instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error("pocket grid did not render");
    }

    expect(lantern.alt).toBe("Lantern");
    expect(first.dataset["kind"]).toBe("covered");
    expect(status.textContent).toBe("0 of 9 dug");

    first.click();

    expect(first.dataset["kind"]).toBe("dug");
    expect(status.textContent).toBe("1 of 9 dug");
    expect(cells[1]?.getAttribute("data-kind")).toBe("covered");

    first.click();
    expect(first.dataset["kind"]).toBe("dug");
    expect(status.textContent).toBe("1 of 9 dug");
  });

  it("restores dug cells after remount", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    const first = root.querySelector("button.dig-cell");
    if (!(first instanceof HTMLButtonElement)) {
      throw new Error("pocket grid did not render");
    }
    first.click();

    mountPocketGridScreen({ root, ...screen });

    const restored = root.querySelector("button.dig-cell");
    const status = root.querySelector(".dig-status");
    if (
      !(restored instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error("pocket grid did not remount");
    }

    expect(restored.dataset["kind"]).toBe("dug");
    expect(status.textContent).toBe("1 of 9 dug");
  });

  it("writes the grid on pagehide and when the tab hides", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    sessionStorage.removeItem(GRID_SAVE_KEY);
    window.dispatchEvent(new Event("pagehide"));
    expect(sessionStorage.getItem(GRID_SAVE_KEY)).not.toBeNull();

    sessionStorage.removeItem(GRID_SAVE_KEY);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sessionStorage.getItem(GRID_SAVE_KEY)).not.toBeNull();
  });

  it("signs in with Google and signs out", () => {
    const root = document.createElement("div");
    const auth = createMemoryAuth();
    mountPocketGridScreen({ root, ...screen, auth });

    const button = root.querySelector("button.auth-action");
    const authStatus = root.querySelector(".auth-status");
    if (
      !(button instanceof HTMLButtonElement) ||
      !(authStatus instanceof HTMLElement)
    ) {
      throw new Error("sign-in control did not render");
    }

    expect(button.textContent).toBe("Sign in with Google");
    expect(authStatus.textContent).toBe("");

    button.click();

    expect(button.textContent).toBe("Sign out");
    expect(authStatus.textContent).toBe("Signed in as Test Dad");

    button.click();

    expect(button.textContent).toBe("Sign in with Google");
    expect(authStatus.textContent).toBe("");
  });

  it("loads the cloud grid after sign-in", async () => {
    const remote = dig({ grid: createPocketGrid(), index: 8 });
    const docs = new Map([["test-dad", remote]]);
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      ...screen,
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ docs }),
    });

    const button = root.querySelector("button.auth-action");
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("sign-in control did not render");
    }
    button.click();

    await vi.waitFor(() => {
      expect(root.querySelector(".dig-status")?.textContent).toBe("1 of 9 dug");
    });
    expect(
      root.querySelectorAll("button.dig-cell")[8]?.getAttribute("data-kind"),
    ).toBe("dug");
  });

  it("uploads a local dig when the cloud has no save", async () => {
    const docs = new Map<string, PocketGrid>();
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      ...screen,
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ docs }),
    });

    const first = root.querySelector("button.dig-cell");
    const button = root.querySelector("button.auth-action");
    if (
      !(first instanceof HTMLButtonElement) ||
      !(button instanceof HTMLButtonElement)
    ) {
      throw new Error("pocket grid did not render");
    }
    first.click();
    button.click();

    await vi.waitFor(() => {
      expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
    });
  });

  it("writes a dig to the cloud while signed in", async () => {
    const docs = new Map<string, PocketGrid>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      ...screen,
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    const first = root.querySelector("button.dig-cell");
    if (!(first instanceof HTMLButtonElement)) {
      throw new Error("pocket grid did not render");
    }
    first.click();

    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
  });

  it("keeps the local grid when the cloud is down", async () => {
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      ...screen,
      auth: createMemoryAuth(),
      cloudSave: createUnavailableCloudSave(),
    });

    const first = root.querySelector("button.dig-cell");
    const button = root.querySelector("button.auth-action");
    if (
      !(first instanceof HTMLButtonElement) ||
      !(button instanceof HTMLButtonElement)
    ) {
      throw new Error("pocket grid did not render");
    }
    first.click();
    button.click();

    await Promise.resolve();
    expect(root.querySelector(".dig-status")?.textContent).toBe("1 of 9 dug");
  });

  it("does not apply a stale cloud load after a local dig", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const docs = new Map<string, PocketGrid>();
    const cloudSave: CloudSave = {
      load: () =>
        new Promise((resolve) => {
          finishLoad = resolve;
        }),
      write: ({ uid, grid }) => {
        docs.set(uid, grid);
        return Promise.resolve();
      },
    };
    const user = { uid: "test-dad", label: "Test Dad" };
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      ...screen,
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
    });

    const first = root.querySelector("button.dig-cell");
    if (!(first instanceof HTMLButtonElement)) {
      throw new Error("pocket grid did not render");
    }
    first.click();

    finishLoad({ kind: "found", grid: createPocketGrid() });
    await Promise.resolve();

    expect(root.querySelector(".dig-status")?.textContent).toBe("1 of 9 dug");
    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
  });
});
