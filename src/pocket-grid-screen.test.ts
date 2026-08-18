import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { combine, createPocketGrid, dig, place, type PocketGrid } from "./grid";
import { mountPocketGridScreen } from "./pocket-grid-screen";

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const screen = {
  lanternUrl: tileUrl,
  cellSheetUrl: tileUrl,
  stoneUrl: tileUrl,
  chunkUrl: tileUrl,
};

describe("mountPocketGridScreen", () => {
  it("keeps the lantern and uncovers a cell on tap", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    const lantern = root.querySelector("img.lantern");
    const cells = root.querySelectorAll("button.dig-cell");
    const status = root.querySelector(".dig-status");
    const saveStatus = root.querySelector(".save-status");
    const first = cells[0];
    if (
      !(lantern instanceof HTMLImageElement) ||
      cells.length !== 9 ||
      !(first instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement) ||
      !(saveStatus instanceof HTMLElement)
    ) {
      throw new Error("pocket grid did not render");
    }

    expect(lantern.alt).toBe("Lantern");
    expect(first.dataset["kind"]).toBe("covered");
    expect(status.textContent).toBe("Holding a stone. 0 of 9 dug");
    expect(saveStatus.textContent).toBe("Sign in to save");

    first.click();

    expect(first.dataset["kind"]).toBe("dug");
    expect(status.textContent).toBe("Holding a stone. 1 of 9 dug");
    expect(cells[1]?.getAttribute("data-kind")).toBe("covered");
    expect(root.querySelector("img.held-piece")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(root.querySelector(".hand-slot")?.getAttribute("data-kind")).toBe(
      "stone",
    );
  });

  it("places the held stone on a dug cell", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    const cells = root.querySelectorAll("button.dig-cell");
    const first = cells[0];
    const second = cells[1];
    const status = root.querySelector(".dig-status");
    const held = root.querySelector("img.held-piece");
    const handSlot = root.querySelector(".hand-slot");
    if (
      !(first instanceof HTMLButtonElement) ||
      !(second instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement) ||
      !(held instanceof HTMLImageElement) ||
      !(handSlot instanceof HTMLElement)
    ) {
      throw new Error("pocket grid did not render");
    }

    first.click();
    first.click();

    expect(first.dataset["kind"]).toBe("stone");
    expect(status.textContent).toBe("Holding a stone. 1 of 9 dug");
    expect(held.hidden).toBe(false);
    expect(handSlot.dataset["kind"]).toBe("stone");
    expect(root.querySelector(".hand-slot")).toBe(handSlot);
    expect(second.dataset["kind"]).toBe("covered");

    first.click();
    expect(first.dataset["kind"]).toBe("stone");

    second.click();
    expect(second.dataset["kind"]).toBe("dug");
    expect(status.textContent).toBe("Holding a stone. 2 of 9 dug");

    second.click();
    expect(second.dataset["kind"]).toBe("stone");
    expect(first.dataset["kind"]).toBe("stone");
    expect(held.hidden).toBe(false);
    expect(handSlot.dataset["kind"]).toBe("stone");
    expect(status.textContent).toBe("Holding a stone. 2 of 9 dug");
  });

  it("combines two neighbor stones into a chunk", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({ root, ...screen });

    const cells = root.querySelectorAll("button.dig-cell");
    const first = cells[0];
    const second = cells[1];
    const status = root.querySelector(".dig-status");
    if (
      !(first instanceof HTMLButtonElement) ||
      !(second instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error("pocket grid did not render");
    }

    first.click();
    first.click();
    second.click();
    second.click();
    first.click();

    expect(first.dataset["selected"]).toBe("true");
    expect(status.textContent).toBe(
      "Tap a neighbor stone to combine. 2 of 9 dug",
    );

    second.click();

    expect(first.dataset["kind"]).toBe("dug");
    expect(second.dataset["kind"]).toBe("chunk");
    expect(first.dataset["selected"]).toBeUndefined();
    expect(status.textContent).toBe("Holding a stone. 2 of 9 dug");
  });

  it("does not keep unsigned digs after remount", () => {
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

    expect(restored.dataset["kind"]).toBe("covered");
    expect(status.textContent).toBe("Holding a stone. 0 of 9 dug");
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
      expect(root.querySelector(".dig-status")?.textContent).toBe(
        "Holding a stone. 1 of 9 dug",
      );
    });
    expect(
      root.querySelectorAll("button.dig-cell")[8]?.getAttribute("data-kind"),
    ).toBe("dug");
    expect(root.querySelector(".save-status")?.textContent).toBe(
      "Saved to your account",
    );
    expect(
      root.querySelector(".save-status")?.getAttribute("data-log"),
    ).toContain("save.remote found");
  });

  it("uploads a session dig when the cloud has no save", async () => {
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

  it("writes a placed stone to the cloud while signed in", async () => {
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
    first.click();

    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "stone" });
  });

  it("writes a combined chunk to the cloud while signed in", async () => {
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

    const cells = root.querySelectorAll("button.dig-cell");
    const first = cells[0];
    const second = cells[1];
    if (
      !(first instanceof HTMLButtonElement) ||
      !(second instanceof HTMLButtonElement)
    ) {
      throw new Error("pocket grid did not render");
    }
    first.click();
    first.click();
    second.click();
    second.click();
    first.click();
    second.click();

    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
    expect(docs.get("test-dad")?.cells[1]).toEqual({ kind: "chunk" });
  });

  it("loads a placed stone from the cloud after sign-in", async () => {
    const remote = place({
      grid: dig({ grid: createPocketGrid(), index: 8 }),
      index: 8,
    });
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
      expect(root.querySelector(".dig-status")?.textContent).toBe(
        "Holding a stone. 1 of 9 dug",
      );
    });
    expect(
      root.querySelectorAll("button.dig-cell")[8]?.getAttribute("data-kind"),
    ).toBe("stone");
    expect(root.querySelector("img.held-piece")?.hasAttribute("hidden")).toBe(
      false,
    );
  });

  it("loads a combined chunk from the cloud after sign-in", async () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 7 }),
      index: 7,
    });
    const two = place({
      grid: dig({ grid: first, index: 8 }),
      index: 8,
    });
    const remote = combine({ grid: two, from: 7, to: 8 });
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
      expect(root.querySelector(".dig-status")?.textContent).toBe(
        "Holding a stone. 2 of 9 dug",
      );
    });
    const cells = root.querySelectorAll("button.dig-cell");
    expect(cells[7]?.getAttribute("data-kind")).toBe("dug");
    expect(cells[8]?.getAttribute("data-kind")).toBe("chunk");
  });

  it("keeps the session grid when the cloud is down", async () => {
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
    expect(root.querySelector(".dig-status")?.textContent).toBe(
      "Holding a stone. 1 of 9 dug",
    );
    expect(root.querySelector(".save-status")?.textContent).toBe(
      "Couldn't reach your save",
    );
    expect(
      root.querySelector(".save-status")?.getAttribute("data-log"),
    ).toContain("save.remote unavailable");
  });

  it("does not dig until the cloud save has loaded", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const docs = new Map<string, PocketGrid>();
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: ({ uid, grid }) => {
        docs.set(uid, grid);
        return Promise.resolve({ kind: "ok" });
      },
      watch: ({ onChange }) => {
        finishLoad = onChange;
        return () => {
          return;
        };
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
    expect(root.querySelector(".dig-status")?.textContent).toBe(
      "Holding a stone. 0 of 9 dug",
    );

    finishLoad({
      kind: "found",
      grid: dig({ grid: createPocketGrid(), index: 8 }),
    });
    await Promise.resolve();

    expect(root.querySelector(".dig-status")?.textContent).toBe(
      "Holding a stone. 1 of 9 dug",
    );
    expect(
      root.querySelectorAll("button.dig-cell")[8]?.getAttribute("data-kind"),
    ).toBe("dug");
  });

  it("shows the same cloud grid on a second signed-in screen", async () => {
    const docs = new Map<string, PocketGrid>();
    const cloudSave = createMemoryCloudSave({ docs });
    const user = { uid: "test-dad", label: "Test Dad" };
    const authA = createMemoryAuth({
      state: { kind: "signed-in", user },
      user,
    });
    const authB = createMemoryAuth({
      state: { kind: "signed-in", user },
      user,
    });
    const rootA = document.createElement("div");
    const rootB = document.createElement("div");
    mountPocketGridScreen({
      root: rootA,
      ...screen,
      auth: authA,
      cloudSave,
    });
    mountPocketGridScreen({
      root: rootB,
      ...screen,
      auth: authB,
      cloudSave,
    });

    await vi.waitFor(() => {
      expect(rootA.querySelector(".save-status")?.textContent).toBe(
        "Saved to your account",
      );
      expect(rootB.querySelector(".save-status")?.textContent).toBe(
        "Saved to your account",
      );
    });

    const first = rootA.querySelector("button.dig-cell");
    if (!(first instanceof HTMLButtonElement)) {
      throw new Error("pocket grid did not render");
    }
    first.click();

    await vi.waitFor(() => {
      expect(rootB.querySelector(".dig-status")?.textContent).toBe(
        "Holding a stone. 1 of 9 dug",
      );
    });
    expect(
      rootB.querySelectorAll("button.dig-cell")[0]?.getAttribute("data-kind"),
    ).toBe("dug");
  });

  it("writes the cloud grid when the tab hides", async () => {
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
    docs.delete("test-dad");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
  });
});
