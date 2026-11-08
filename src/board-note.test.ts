// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardNote } from "./board-note";

function setup() {
  const stage = document.createElement("div");
  const anchor = document.createElement("button");
  stage.append(anchor);
  document.body.append(stage);
  const api = createBoardNote(stage);
  return { stage, anchor, ...api };
}
const text = (s: string) => document.createTextNode(s);

describe("createBoardNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("show makes the note visible with the body", () => {
    const { note, anchor, show } = setup();
    expect(note.getAttribute("role")).toBe("status");
    show(anchor, text("Hello"));
    expect(note.classList.contains("on")).toBe(true);
    expect(note.textContent).toContain("Hello");
  });

  it("hides after 3400ms", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("Hello"));
    vi.advanceTimersByTime(3399);
    expect(note.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(note.classList.contains("on")).toBe(false);
  });

  it("a pointerdown outside hides it", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("Hello"));
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(note.classList.contains("on")).toBe(false);
  });

  it("a pointerdown inside the note or on its anchor does not", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("Hello"));
    note.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    anchor.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(note.classList.contains("on")).toBe(true);
  });

  it("a second show replaces the body and restarts the timer", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("First"));
    vi.advanceTimersByTime(3000);
    show(anchor, text("Second"));
    expect(note.textContent).toContain("Second");
    expect(note.textContent).not.toContain("First");
    vi.advanceTimersByTime(3000);
    expect(note.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(note.classList.contains("on")).toBe(false);
  });

  it("hide() hides at once", () => {
    const { note, anchor, show, hide } = setup();
    show(anchor, text("Hello"));
    hide();
    expect(note.classList.contains("on")).toBe(false);
  });
});
