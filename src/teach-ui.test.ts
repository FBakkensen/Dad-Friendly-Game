// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createHowCard } from "./teach-ui";

describe("teach parts", () => {
  it("builds How it works, and its Back goes back", () => {
    const back = vi.fn();
    const how = createHowCard(
      "How it works",
      [
        ["clay.png", "Dig clay"],
        ["hammer.png", "Craft gear"],
      ],
      "Back to the Workshop",
      back,
    );
    expect(how.querySelectorAll("li")).toHaveLength(2);
    how.querySelector<HTMLButtonElement>(".teach-how-back")?.click();
    expect(back).toHaveBeenCalledOnce();
  });

  it("sizes a step's icon at 32 unless the step names its px (#373)", () => {
    const how = createHowCard(
      "How it works",
      [
        ["stone.png", "Small"],
        ["cart.png", "Big", 64],
      ],
      "Back",
      () => undefined,
    );
    const sizes = [...how.querySelectorAll("img")].map((img) => [
      img.getAttribute("width"),
      img.getAttribute("height"),
    ]);
    expect(sizes).toEqual([
      ["32", "32"],
      ["64", "64"],
    ]);
  });
});
