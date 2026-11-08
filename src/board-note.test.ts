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

  describe("a note that holds a key", () => {
    const keyed = () => {
      const t = setup();
      const key = document.createElement("button");
      key.textContent = "Relic shelf";
      const body = document.createDocumentFragment();
      body.append(text("Hello"), key);
      return { ...t, key, body };
    };

    it("stays up past 3.4s", () => {
      const { note, anchor, show, key, body } = keyed();
      show(anchor, body, { key });
      vi.advanceTimersByTime(60_000);
      expect(note.classList.contains("on")).toBe(true);
    });

    it("Escape closes it and gives focus back to the anchor", () => {
      const { note, anchor, show, key, body } = keyed();
      show(anchor, body, { key, focus: true });
      expect(document.activeElement).toBe(key);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(note.classList.contains("on")).toBe(false);
      expect(document.activeElement).toBe(anchor);
    });

    it("an outside pointerdown closes it", () => {
      const { note, anchor, show, key, body } = keyed();
      show(anchor, body, { key });
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(note.classList.contains("on")).toBe(false);
    });

    it("using the key closes it", () => {
      const { note, anchor, show, key, body } = keyed();
      show(anchor, body, { key });
      key.click();
      expect(note.classList.contains("on")).toBe(false);
    });

    it("moves focus to the key only when asked", () => {
      const { anchor, show, key, body } = keyed();
      anchor.focus();
      show(anchor, body, { key });
      expect(document.activeElement).toBe(anchor);
      // The fragment emptied into the note; show the key again.
      show(anchor, key, { key, focus: true });
      expect(document.activeElement).toBe(key);
    });

    it("a plain note after it auto-hides again", () => {
      const { note, anchor, show, key, body } = keyed();
      show(anchor, body, { key });
      show(anchor, text("Plain"));
      vi.advanceTimersByTime(3400);
      expect(note.classList.contains("on")).toBe(false);
    });
  });

  it("takes a custom time for a plain note", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("Hello"), { ms: 6000 });
    vi.advanceTimersByTime(5999);
    expect(note.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(note.classList.contains("on")).toBe(false);
  });

  it("Escape closes a plain note too", () => {
    const { note, anchor, show } = setup();
    show(anchor, text("Hello"));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(note.classList.contains("on")).toBe(false);
  });
});
