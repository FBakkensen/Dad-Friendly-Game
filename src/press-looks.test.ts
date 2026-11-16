// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { plateButton } from "./board-save";
import { buyOnTap } from "./card-tap";

/**
 * Today's pressed look of every board control (#432): what each shows after each pointer event.
 * The controls move onto one shared helper; these pins keep what anyone sees the same.
 */

const EVENTS = [
  "down",
  "move",
  "up",
  "leave",
  "cancel",
  "click",
  "down+up",
] as const;
type Step = (typeof EVENTS)[number];

const fire = (
  target: HTMLElement,
  type: string,
  button: number,
  clientX = 50,
): void => {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button, clientX }),
  );
};

/** Sends one step to `target`; `move` goes 30px past where `down` landed. */
const send = (target: HTMLElement, step: Step, button: number): void => {
  switch (step) {
    case "down":
      fire(target, "pointerdown", button);
      return;
    case "move":
      fire(target, "pointermove", button, 80);
      return;
    case "up":
      fire(target, "pointerup", button);
      return;
    case "leave":
      fire(target, "pointerleave", button);
      return;
    case "cancel":
      fire(target, "pointercancel", button);
      return;
    case "click":
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
      return;
    case "down+up":
      fire(target, "pointerdown", button);
      fire(target, "pointerup", button);
  }
};

/** The look after a fresh press (down) and then after each later step, one control per run. */
const sequence = (
  make: () => {
    target: HTMLElement;
    look: () => string;
    /** Lets timed looks run out; the look after it is recorded too. */
    later?: () => void;
  },
  steps: readonly Step[],
  button = 0,
): string[] => {
  const out: string[] = [];
  for (const step of steps) {
    const { target, look, later } = make();
    // Every step is tried from the pressed state, except a press itself.
    if (step !== "down" && step !== "down+up") {
      send(target, "down", button);
    }
    send(target, step, button);
    out.push(`${step}: ${look()}`);
    if (later !== undefined) {
      later();
      out.push(`${step} later: ${look()}`);
    }
  }
  return out;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("press looks: plate buttons", () => {
  const make =
    (disabled = false) =>
    () => {
      const b = plateButton("Try again");
      b.disabled = disabled;
      document.body.append(b);
      return {
        target: b,
        look: () => (b.classList.contains("down") ? "down" : "up"),
      };
    };

  it("shows down while held", () => {
    expect(sequence(make(), EVENTS)).toMatchInlineSnapshot(`
      [
        "down: down",
        "move: down",
        "up: up",
        "leave: up",
        "cancel: up",
        "click: down",
        "down+up: up",
      ]
    `);
  });
  it("a disabled button is pinned as it is today", () => {
    expect(sequence(make(true), ["down", "down+up"])).toMatchInlineSnapshot(`
      [
        "down: down",
        "down+up: up",
      ]
    `);
  });
  it("a non-primary press", () => {
    expect(sequence(make(), ["down", "up"], 2)).toMatchInlineSnapshot(`
      [
        "down: down",
        "up: up",
      ]
    `);
  });
});

describe("press looks: rows", () => {
  const make =
    (disabled = false) =>
    () => {
      const card = document.createElement("div");
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = disabled;
      card.append(button);
      document.body.append(card);
      buyOnTap(card, button, vi.fn(), { clock: () => 500 });
      return {
        target: card,
        look: () =>
          card.classList.contains("is-pressed") ? "is-pressed" : "rest",
      };
    };

  it("is-pressed while held, off on up, leave, cancel and a move past the slop", () => {
    expect(sequence(make(), EVENTS)).toMatchInlineSnapshot(`
      [
        "down: is-pressed",
        "move: rest",
        "up: rest",
        "leave: rest",
        "cancel: rest",
        "click: is-pressed",
        "down+up: rest",
      ]
    `);
  });
  it("a disabled row shows no pressed look", () => {
    expect(sequence(make(true), ["down"])).toMatchInlineSnapshot(`
      [
        "down: rest",
      ]
    `);
  });
  it("a non-primary press is ignored", () => {
    expect(sequence(make(), ["down", "up"], 2)).toMatchInlineSnapshot(`
      [
        "down: rest",
        "up: rest",
      ]
    `);
  });
});
