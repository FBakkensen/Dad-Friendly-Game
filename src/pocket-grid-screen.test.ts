import { describe, expect, it } from "vitest";
import { mountPocketGridScreen } from "./pocket-grid-screen";

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("mountPocketGridScreen", () => {
  it("keeps the lantern and uncovers a cell on tap", () => {
    const root = document.createElement("div");
    mountPocketGridScreen({
      root,
      lanternUrl: tileUrl,
      cellSheetUrl: tileUrl,
    });

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
});
