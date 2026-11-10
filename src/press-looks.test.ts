// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plateButton } from "./board-save";
import { createBoardHost, type BoardHost } from "./board-host";
import { createKeyRail } from "./board-keys";
import {
  createDigButton,
  createReadyPlate,
  type ReadyTap,
} from "./board-ready";
import { buyOnTap } from "./card-tap";
import type { KeyView } from "./key-rail";
import type { ReadyPick } from "./ready-now";

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

const board = (): BoardHost =>
  createBoardHost({ clock: () => 0, pressAge: () => 0, reduced: () => false });

describe("press looks: keys", () => {
  const rest = (aria: string): KeyView => ({
    cap: "rest",
    sub: "",
    dot: false,
    aria,
  });
  const make = (locked: boolean) => () => {
    const rail = createKeyRail({ board: board(), onKey: vi.fn() });
    document.body.append(rail.root);
    const views = {
      buys: rest("Buys"),
      workshop: rest("Workshop"),
      engineers: rest("Engineers"),
      upgrades: rest("Upgrades"),
      ledger: rest("Ledger"),
    };
    rail.render(
      locked ? { ...views, buys: { ...rest("Buys"), cap: "locked" } } : views,
    );
    const key = rail.root.querySelector<HTMLElement>(
      '[data-key="buys"]',
    ) as HTMLElement;
    const cap = key.querySelector<HTMLElement>(".board-key-cap") as HTMLElement;
    return {
      target: key,
      look: () =>
        `${key.classList.contains("is-down") ? "is-down" : "up"} ${cap.style.backgroundPositionX}`,
    };
  };

  it("shows the down cap while held", () => {
    expect(sequence(make(false), EVENTS)).toMatchInlineSnapshot(`
      [
        "down: is-down -64px",
        "move: is-down -64px",
        "up: up 0px",
        "leave: up 0px",
        "cancel: up 0px",
        "click: up 0px",
        "down+up: up 0px",
      ]
    `);
  });
  it("a disabled key shows no down look", () => {
    expect(sequence(make(true), ["down", "down+up"])).toMatchInlineSnapshot(`
      [
        "down: up -128px",
        "down+up: up -128px",
      ]
    `);
  });
  it("a non-primary press still shows the down look", () => {
    expect(sequence(make(false), ["down", "up"], 2)).toMatchInlineSnapshot(`
      [
        "down: is-down -64px",
        "up: up 0px",
      ]
    `);
  });
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

describe("press looks: the Ready plate guard", () => {
  const readyCart: ReadyPick = {
    kind: "ready",
    tier: "cart",
    price: 5868,
    gain: 12,
    free: 1,
  };
  const savingCart: ReadyPick = {
    ...readyCart,
    kind: "saving",
    etaMs: 240_000,
  };
  const bought: ReadyTap = { kind: "bought", tier: "cart", count: 7, gain: 12 };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const build = (pick: ReadyPick | undefined, enabled: boolean) => {
    const now = { value: 0 };
    const host = createBoardHost({
      clock: () => now.value,
      pressAge: () => 0,
      reduced: () => false,
    });
    const made = createReadyPlate({
      board: host,
      onTap: () => bought,
      fits: () => true,
    });
    document.body.append(made.root);
    made.render(pick, enabled);
    const guard = made.root.querySelector<HTMLElement>(
      ".board-ready-guard",
    ) as HTMLElement;
    return {
      made,
      guard,
      now,
      look: () => guard.style.backgroundPositionX,
    };
  };
  const make = (pick: ReadyPick | undefined, enabled: boolean) => () => {
    const built = build(pick, enabled);
    return { target: built.made.button, look: built.look };
  };

  it("shows the pressed frame while held, and repaints on leave and cancel", () => {
    expect(sequence(make(readyCart, true), EVENTS)).toMatchInlineSnapshot(`
      [
        "down: -160px",
        "move: -160px",
        "up: -160px",
        "leave: 0px",
        "cancel: 0px",
        "click: -240px",
        "down+up: -160px",
      ]
    `);
  });
  it("a saving or disabled plate never shows pressed", () => {
    expect([
      ...sequence(make(savingCart, true), ["down"]),
      ...sequence(make(readyCart, false), ["down"]),
      ...sequence(make(undefined, false), ["down"]),
    ]).toMatchInlineSnapshot(`
      [
        "down: -80px",
        "down: 0px",
        "down: -320px",
      ]
    `);
  });
  it("a non-primary press", () => {
    expect(sequence(make(readyCart, true), ["down", "up"], 2))
      .toMatchInlineSnapshot(`
      [
        "down: -160px",
        "up: -160px",
      ]
    `);
  });
  it("a second press after an up, with no repaint, shows pressed again", () => {
    const { made, look } = build(readyCart, true);
    const seen: string[] = [];
    send(made.button, "down", 0);
    seen.push(look());
    send(made.button, "up", 0);
    seen.push(look());
    send(made.button, "down", 0);
    seen.push(look());
    send(made.button, "leave", 0);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "-160px",
        "-160px",
        "-160px",
        "0px",
      ]
    `);
  });
  it("a second press after an up and a repaint shows pressed again", () => {
    const { made, look } = build(readyCart, true);
    const seen: string[] = [];
    send(made.button, "down+up", 0);
    seen.push(look());
    made.render(readyCart, true);
    seen.push(look());
    send(made.button, "down", 0);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "-160px",
        "0px",
        "-160px",
      ]
    `);
  });
  it("a leave or cancel with no press before it leaves the frame as it is", () => {
    const { made, look } = build(readyCart, true);
    const seen: string[] = [look()];
    send(made.button, "leave", 0);
    seen.push(look());
    send(made.button, "cancel", 0);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "0px",
        "0px",
        "0px",
      ]
    `);
  });
  it("a press while a Done hold is up shows no pressed frame", () => {
    const { made, look, now } = build(readyCart, true);
    const seen: string[] = [];
    send(made.button, "down+up", 0);
    send(made.button, "click", 0);
    seen.push(look());
    send(made.button, "down", 0);
    seen.push(look());
    send(made.button, "leave", 0);
    seen.push(look());
    now.value += 5000;
    vi.advanceTimersByTime(5000);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "-240px",
        "-240px",
        "-240px",
        "0px",
      ]
    `);
  });
});

describe("press looks: the dig button", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const build = (enabled: boolean) => {
    const made = createDigButton({ onPress: () => undefined });
    document.body.append(made.root);
    made.set(5, enabled, "Dig");
    const sprite = made.root.querySelector<HTMLElement>(
      ".board-dig-sprite",
    ) as HTMLElement;
    return { made, look: () => sprite.style.backgroundPositionX };
  };
  const make = (enabled: boolean) => () => {
    const { made, look } = build(enabled);
    return {
      target: made.button,
      look,
      later: () => vi.advanceTimersByTime(100),
    };
  };

  it("shows the down frame while held, and the up frame on a click", () => {
    expect(sequence(make(true), EVENTS)).toMatchInlineSnapshot(`
      [
        "down: -112px",
        "down later: -112px",
        "move: -112px",
        "move later: -112px",
        "up: 0px",
        "up later: 0px",
        "leave: 0px",
        "leave later: 0px",
        "cancel: 0px",
        "cancel later: 0px",
        "click: -224px",
        "click later: 0px",
        "down+up: 0px",
        "down+up later: 0px",
      ]
    `);
  });
  it("a disabled button shows no down frame", () => {
    expect(sequence(make(false), ["down"])).toMatchInlineSnapshot(`
      [
        "down: 0px",
        "down later: 0px",
      ]
    `);
  });
  it("a non-primary press", () => {
    expect(sequence(make(true), ["down", "up"], 2)).toMatchInlineSnapshot(`
      [
        "down: -112px",
        "down later: -112px",
        "up: 0px",
        "up later: 0px",
      ]
    `);
  });
  it("a leave, cancel or up with no press before it leaves the frame as it is", () => {
    const { made, look } = build(true);
    const seen: string[] = [look()];
    for (const step of ["leave", "cancel", "up"] as const) {
      send(made.button, step, 0);
      seen.push(look());
    }
    vi.advanceTimersByTime(100);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "0px",
        "0px",
        "0px",
        "0px",
        "0px",
      ]
    `);
  });
  it("the echo runs down, up, rest; a lift during it leaves it alone", () => {
    const { made, look } = build(true);
    const seen: string[] = [];
    made.echo();
    seen.push(look());
    send(made.button, "leave", 0);
    seen.push(look());
    vi.advanceTimersByTime(80);
    seen.push(look());
    vi.advanceTimersByTime(60);
    seen.push(look());
    expect(seen).toMatchInlineSnapshot(`
      [
        "-112px",
        "-112px",
        "-224px",
        "0px",
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
