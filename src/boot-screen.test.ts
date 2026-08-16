import { describe, expect, it } from "vitest";
import { mountBootScreen } from "./boot-screen";

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("mountBootScreen", () => {
  it("lights the lantern on tap", () => {
    const root = document.createElement("div");
    mountBootScreen({ root, tileUrl });

    const button = root.querySelector("button");
    const status = root.querySelector(".boot-status");
    if (
      !(button instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error("boot screen did not render");
    }

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toBe("");

    button.click();

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toBe("You're in.");
  });
});
