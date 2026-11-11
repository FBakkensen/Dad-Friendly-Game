// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createHowCard, setPayoff } from "./teach-ui";

describe("teach parts", () => {
  it("writes the payoff line once, and takes it off again", () => {
    const card = document.createElement("div");
    setPayoff(card, "+1,762/s now");
    setPayoff(card, "+1,800/s now");
    expect(card.querySelectorAll(".teach-payoff")).toHaveLength(1);
    expect(card.textContent).toBe("+1,800/s now");
    setPayoff(card, undefined);
    expect(card.querySelector(".teach-payoff")).toBeNull();
  });

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
