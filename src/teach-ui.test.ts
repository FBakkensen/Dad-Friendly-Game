// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  clearNewCard,
  createHowCard,
  createInfoButton,
  createTeachNote,
  markNewCard,
  setPayoff,
  setTeachDot,
} from "./teach-ui";

describe("teach parts", () => {
  it("adds one dot and takes it off again", () => {
    const button = document.createElement("button");
    setTeachDot(button, true);
    setTeachDot(button, true);
    expect(button.querySelectorAll(".teach-dot")).toHaveLength(1);
    setTeachDot(button, false);
    expect(button.querySelector(".teach-dot")).toBeNull();
  });

  it("shows one note that opens its sheet, then hides", () => {
    const note = createTeachNote();
    expect(note.note.hidden).toBe(true);
    const open = vi.fn();
    note.show("hammer.png", "New · The Workshop is open", open);
    expect(note.note.textContent).toBe("New · The Workshop is open");
    note.note.click();
    expect(open).toHaveBeenCalledOnce();
    note.hide();
    expect(note.note.hidden).toBe(true);
    note.note.click();
    expect(open).toHaveBeenCalledOnce();
  });

  it("tags the New card and turns its own button into the big action", () => {
    const card = document.createElement("div");
    const button = document.createElement("button");
    card.append(button);
    markNewCard(card, button, "Craft Blasting charge");
    markNewCard(card, button, "Craft Blasting charge");
    expect(card.querySelectorAll(".teach-tag")).toHaveLength(1);
    expect(card.querySelectorAll("button")).toHaveLength(1);
    expect(button.textContent).toBe("Craft Blasting charge");
    expect(button.classList.contains("teach-action")).toBe(true);
    clearNewCard(card);
    expect(card.classList.contains("teach-new")).toBe(false);
    expect(card.querySelector(".teach-tag")).toBeNull();
    button.remove();
    setPayoff(card, "+1,762/s now");
    setPayoff(card, "+1,800/s now");
    expect(card.querySelectorAll(".teach-payoff")).toHaveLength(1);
    expect(card.textContent).toBe("+1,800/s now");
    setPayoff(card, undefined);
    expect(card.querySelector(".teach-payoff")).toBeNull();
  });

  it("opens How it works from the i and goes back", () => {
    const open = vi.fn();
    const info = createInfoButton("Workshop", open);
    info.click();
    expect(open).toHaveBeenCalledOnce();
    expect(info.getAttribute("aria-label")).toBe("How it works: Workshop");
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
