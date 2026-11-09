import { describe, expect, it } from "vitest";
import {
  BLINK_STEP_MS,
  DRAWER_SETTLE_MS,
  PRESS_AGE_LIMIT_MS,
  READY_HOLD_MS,
  THANKS_MS,
  boardView,
  controlKey,
  initialBoard,
  press,
  step,
  type BoardInput,
  type BoardState,
  type Layer,
  type Press,
} from "./board-interaction";
import { DRAWER_SETTLE_MS as DRAWER_SETTLE } from "./board-drawer";
import { ROW_HOLD_MS } from "./board-row";

/** A finger's act press on `layer`/`id`, handled at `at`. */
function finger(
  layer: Layer,
  id: string,
  pressedAt: number,
  at = pressedAt,
): Press {
  return {
    control: { layer, id },
    pressedAt,
    at,
    by: "finger",
    intent: "act",
  };
}

/** The board after these inputs, from the start. */
function after(...inputs: readonly BoardInput[]): BoardState {
  return inputs.reduce(step, initialBoard());
}

const decide = (state: BoardState, input: Press) =>
  press(state, input).decision;

describe("the settle", () => {
  const opened = after({ kind: "open", overlay: "buys", at: 1000 });

  it("settles a drawer for 400ms after it opens, judged by when the finger came down", () => {
    expect(decide(opened, finger("buys", "cart", 1399))).toBe("ignore-early");
    expect(decide(opened, finger("buys", "cart", 1400))).toBe("act");
    expect(decide(opened, finger("buys", "cart", 1399, 2500))).toBe(
      "ignore-early",
    );
  });

  it("never settles a keyboard press", () => {
    expect(
      decide(opened, { ...finger("buys", "cart", 1100), by: "keyboard" }),
    ).toBe("act");
  });

  it("lets a trouble press through the settle", () => {
    expect(
      decide(opened, { ...finger("buys", "cart", 1100), intent: "trouble" }),
    ).toBe("act");
  });

  it("starts the settle again when the i cards come in or go", () => {
    const paged = step(opened, { kind: "page", overlay: "buys", at: 1500 });
    expect(decide(paged, finger("buys", "back", 1899))).toBe("ignore-early");
    expect(decide(paged, finger("buys", "back", 1900))).toBe("act");
  });

  it("does not restart the settle on a second open", () => {
    const again = step(opened, { kind: "open", overlay: "buys", at: 1300 });
    expect(decide(again, finger("buys", "cart", 1400))).toBe("act");
  });

  it("settles what a finger's close reveals (named fix 1)", () => {
    const closed = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "close", overlay: "buys", at: 1000, by: "finger" },
    );
    const key = (pressedAt: number, at = pressedAt) =>
      decide(closed, finger("board", "key:upgrades", pressedAt, at));
    expect(key(1399)).toBe("ignore-early");
    // The double tap's second finger came down before the close was handled.
    expect(key(990, 1200)).toBe("ignore-early");
    expect(key(1400)).toBe("act");
  });

  it("does not settle after a keyboard close", () => {
    const closed = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "close", overlay: "buys", at: 1000, by: "keyboard" },
    );
    expect(decide(closed, finger("board", "key:upgrades", 1100))).toBe("act");
  });

  it("settles the drawer under the save drawer when the save drawer closes", () => {
    const closed = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "open", overlay: "save", at: 5000 },
      { kind: "close", overlay: "save", at: 6000, by: "finger" },
    );
    expect(decide(closed, finger("buys", "cart", 6100))).toBe("ignore-early");
  });

  it("clears the revealed settle when anything opens", () => {
    const reopened = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "close", overlay: "buys", at: 1000, by: "finger" },
      { kind: "open", overlay: "note", at: 1100 },
      { kind: "close", overlay: "note", at: 1150, by: "keyboard" },
    );
    expect(decide(reopened, finger("board", "key:buys", 1200))).toBe("act");
  });

  it("judges a future or a too-old stamp at the handler's time", () => {
    // From the future: judged at 1100, inside the settle.
    expect(decide(opened, finger("buys", "cart", 5000, 1100))).toBe(
      "ignore-early",
    );
    // Older than the press-age limit: judged at 20,500, past the settle.
    const late = after({ kind: "open", overlay: "buys", at: 20_000 });
    expect(decide(late, finger("buys", "cart", 1, 20_500))).toBe("act");
  });

  it("acts on a board press with nothing settling", () => {
    expect(decide(initialBoard(), finger("board", "plate", 0))).toBe("act");
  });
});

describe("the overlay stack", () => {
  const stack = (state: BoardState) => boardView(state, 0).stack;

  it("stacks the save drawer and notes on a drawer, and a drawer replaces them all", () => {
    let state = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "open", overlay: "save", at: 0 },
    );
    expect(stack(state)).toEqual(["buys", "save"]);
    state = step(state, { kind: "open", overlay: "note", at: 0 });
    expect(stack(state)).toEqual(["buys", "save", "note"]);
    state = step(state, { kind: "open", overlay: "note", at: 0 });
    expect(stack(state)).toEqual(["buys", "save", "note"]);
    state = step(state, { kind: "open", overlay: "upgrades", at: 0 });
    expect(stack(state)).toEqual(["upgrades"]);
    state = step(state, {
      kind: "close",
      overlay: "upgrades",
      at: 0,
      by: "keyboard",
    });
    expect(stack(state)).toEqual([]);
    expect(
      step(state, { kind: "close", overlay: "buys", at: 0, by: "finger" }),
    ).toBe(state);
    const under = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "open", overlay: "save", at: 0 },
      { kind: "close", overlay: "buys", at: 0, by: "keyboard" },
    );
    expect(stack(under)).toEqual([]);
  });

  it("opens a note on the board alone", () => {
    expect(stack(after({ kind: "open", overlay: "note", at: 0 }))).toEqual([
      "note",
    ]);
  });

  it("names a control by its layer and id", () => {
    expect(controlKey({ layer: "board", id: "bay:1" })).toBe("board/bay:1");
  });
});

describe("the timing values", () => {
  it("moves today's timing values here", () => {
    expect(DRAWER_SETTLE_MS).toBe(400);
    expect(READY_HOLD_MS).toBe(1900);
    expect(BLINK_STEP_MS).toBe(140);
    expect(THANKS_MS).toBe(1600);
    expect(PRESS_AGE_LIMIT_MS).toBe(10_000);
    expect(DRAWER_SETTLE).toBe(DRAWER_SETTLE_MS);
    expect(ROW_HOLD_MS).toBe(READY_HOLD_MS);
  });
});
