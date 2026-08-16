import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryAuth } from "./auth";
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
});
