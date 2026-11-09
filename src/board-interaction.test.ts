import { describe, expect, it } from "vitest";
import {
  BLINK_STEP_MS,
  DRAWER_SETTLE_MS,
  PRESS_AGE_LIMIT_MS,
  READY_HOLD_MS,
  THANKS_MS,
  boardView,
  nextWake,
  controlKey,
  initialBoard,
  press,
  step,
  type BoardInput,
  type DrawerId,
  type BoardState,
  type Layer,
  type Layout,
  type Press,
} from "./board-interaction";
import { DRAWER_SETTLE_MS as DRAWER_SETTLE } from "./board-drawer";

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

  it("settles only after a drawer's own close, not the save drawer's or a note's", () => {
    const underSave = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "open", overlay: "save", at: 5000 },
      { kind: "close", overlay: "save", at: 6000, by: "finger" },
    );
    expect(decide(underSave, finger("buys", "cart", 6100))).toBe("act");
    // A tap that dismisses a board note goes on to its target, and acts there.
    const noted = after(
      { kind: "open", overlay: "note", at: 4000 },
      { kind: "close", overlay: "note", at: 5000, by: "finger" },
    );
    expect(decide(noted, finger("board", "key:buys", 5000))).toBe("act");
  });

  it("does not settle the save drawer or a note as it opens", () => {
    const opened = after(
      { kind: "open", overlay: "save", at: 1000 },
      { kind: "open", overlay: "note", at: 1000 },
    );
    expect(decide(opened, finger("save", "account", 1100))).toBe("act");
    expect(decide(opened, finger("note", "shelf", 1100))).toBe("act");
  });

  it("lets a tap that closes a drawer through to what it closed over", () => {
    // The scrim closes the drawers and hands the same tap to the relic socket under it.
    const scrim = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "close", overlay: "buys", at: 1000, by: "tap-through" },
    );
    expect(decide(scrim, finger("board", "socket:0", 1000))).toBe("act");
    const timed = after(
      { kind: "open", overlay: "buys", at: 0 },
      { kind: "close", overlay: "buys", at: 1000, by: "program" },
    );
    expect(decide(timed, finger("board", "key:buys", 1100))).toBe("act");
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
  });
});

describe("the Done hold", () => {
  const plate = { layer: "board", id: "plate" } as const;
  const bought = (pressedAt = 1000, at = 1000): BoardState =>
    step(press(initialBoard(), finger("board", "plate", pressedAt, at)).state, {
      kind: "result",
      control: plate,
      at,
      outcome: "applied",
    });
  const held = (state: BoardState, at: number) =>
    boardView(state, at).held.has("board/plate");

  it("holds Done for 1.9s after a buy, so a double tap buys one", () => {
    const state = bought();
    expect(decide(state, finger("board", "plate", 1200))).toBe("ignore-held");
    expect(held(state, 2899)).toBe(true);
    expect(held(state, 2900)).toBe(false);
    expect(decide(state, finger("board", "plate", 2900))).toBe("act");
  });

  it("judges the hold by when the finger came down (named fix 2)", () => {
    const state = bought();
    expect(decide(state, finger("board", "plate", 2800, 3500))).toBe(
      "ignore-held",
    );
  });

  it("holds a press that came down just before the buy but was handled after it", () => {
    // Two fingers 10ms apart: the second is handled after the first one's buy landed.
    expect(decide(bought(), finger("board", "plate", 990, 1100))).toBe(
      "ignore-held",
    );
  });

  it("keeps a buy's hold through a fix that starts the hold again", () => {
    const row = { layer: "buys", id: "drill" } as const;
    const buy = step(
      press(initialBoard(), finger("buys", "drill", 1000)).state,
      { kind: "result", control: row, at: 1000, outcome: "applied" },
    );
    const fixed = step(
      press(buy, { ...finger("buys", "drill", 1500), intent: "trouble" }).state,
      { kind: "result", control: row, at: 1500, outcome: "fixed" },
    );
    expect(decide(fixed, finger("buys", "drill", 1200, 1600))).toBe(
      "ignore-held",
    );
    expect(boardView(fixed, 3399).held.has("buys/drill")).toBe(true);
    expect(boardView(fixed, 3400).held.has("buys/drill")).toBe(false);
  });

  it("holds against the key's repeat", () => {
    expect(
      decide(bought(), { ...finger("board", "plate", 1500), by: "keyboard" }),
    ).toBe("ignore-held");
  });

  it("does not stretch a hold with a second applied", () => {
    const again = step(bought(), {
      kind: "result",
      control: plate,
      at: 2000,
      outcome: "applied",
    });
    expect(held(again, 2899)).toBe(true);
    expect(held(again, 2900)).toBe(false);
  });

  it("holds from the result even when no act was recorded", () => {
    const state = step(initialBoard(), {
      kind: "result",
      control: plate,
      at: 1000,
      outcome: "applied",
    });
    expect(decide(state, finger("board", "plate", 999, 1001))).toBe(
      "ignore-held",
    );
    expect(decide(state, finger("board", "plate", 2900))).toBe("act");
  });

  it("holds no control that did not act", () => {
    const refused = step(initialBoard(), {
      kind: "result",
      control: plate,
      at: 1000,
      outcome: "refused",
    });
    expect(decide(refused, finger("board", "plate", 1200))).toBe("act");
    expect(decide(bought(), finger("board", "bay:0", 1200))).toBe("act");
  });

  it("lets a trouble press through a hold", () => {
    expect(
      decide(bought(), {
        ...finger("board", "plate", 1200),
        intent: "trouble",
      }),
    ).toBe("act");
  });

  it("lets go of holds and blinks when the save loads again", () => {
    const blinking = step(bought(), {
      kind: "result",
      control: { layer: "board", id: "bay:0" },
      at: 1000,
      outcome: "refused",
    });
    const unloaded = step(blinking, { kind: "unloaded" });
    expect(boardView(unloaded, 1100).held.size).toBe(0);
    expect(boardView(unloaded, 1100).blinking.size).toBe(0);
    expect(decide(unloaded, finger("board", "plate", 1200))).toBe("act");
  });

  it("keeps a hold long enough to judge a late press", () => {
    const state = bought();
    expect(decide(state, finger("board", "plate", 2800, 12_000))).toBe(
      "ignore-held",
    );
    // An input 10s past the hold's end drops it: no stamp can reach back that far.
    const later = step(state, { kind: "open", overlay: "note", at: 12_900 });
    expect(decide(later, finger("board", "plate", 2800, 12_000))).toBe(
      "ignore-held",
    );
    const gone = step(state, { kind: "open", overlay: "note", at: 13_000 });
    expect(decide(gone, finger("board", "plate", 2800, 12_000))).toBe("act");
  });
});

describe("the blink", () => {
  const bay = { layer: "board", id: "bay:0" } as const;
  const refused = (at: number) =>
    ({ kind: "result", control: bay, at, outcome: "refused" }) as const;
  const frame = (state: BoardState, at: number) =>
    boardView(state, at).blinking.get("board/bay:0");

  it("blinks red, off, red, off on a refused buy", () => {
    const state = after(refused(0));
    expect([0, 140, 280, 420].map((at) => frame(state, at))).toEqual([
      "red",
      "off",
      "red",
      "off",
    ]);
    expect(frame(state, 560)).toBeUndefined();
    const twice = step(state, refused(200));
    expect(frame(twice, 560)).toBeUndefined();
  });

  it("does not blink under reduced motion, and lets a running blink play out", () => {
    expect(
      frame(after({ kind: "motion", reduced: true }, refused(0)), 0),
    ).toBeUndefined();
    expect(
      frame(after(refused(0), { kind: "motion", reduced: true }), 300),
    ).toBe("red");
    expect(
      frame(
        after(
          { kind: "motion", reduced: true },
          { kind: "motion", reduced: false },
          refused(0),
        ),
        0,
      ),
    ).toBe("red");
  });

  it("ends a blink when a buy lands", () => {
    const state = after(refused(0), {
      kind: "result",
      control: bay,
      at: 100,
      outcome: "applied",
    });
    expect(frame(state, 150)).toBeUndefined();
  });

  it("a fix on a drawer row ends its blink", () => {
    const row = { layer: "buys", id: "drill" } as const;
    const state = after(
      { kind: "result", control: row, at: 0, outcome: "refused" },
      { kind: "result", control: row, at: 100, outcome: "fixed" },
    );
    expect(boardView(state, 150).blinking.has("buys/drill")).toBe(false);
  });

  it("a buy that lands inside a running hold leaves the blink alone", () => {
    const row = { layer: "buys", id: "drill" } as const;
    const state = after(
      { kind: "result", control: row, at: 0, outcome: "applied" },
      { kind: "result", control: row, at: 100, outcome: "refused" },
      { kind: "result", control: row, at: 200, outcome: "applied" },
    );
    expect(boardView(state, 250).blinking.get("buys/drill")).toBe("off");
  });

  it("shows no frame when read before the blink began", () => {
    expect(frame(after(refused(500)), 400)).toBeUndefined();
  });

  it("blinks again once a blink has ended", () => {
    expect(frame(after(refused(0), refused(600)), 600)).toBe("red");
  });
});

describe("the thanks", () => {
  const fixed = (layer: Layer, id: string, at: number) =>
    ({ kind: "result", control: { layer, id }, at, outcome: "fixed" }) as const;

  it("thanks for 1.6s after a fix, on the drawer or on the bay", () => {
    const state = after(fixed("buys", "drill", 0));
    expect(boardView(state, 1599).thanks.has("buys")).toBe(true);
    expect(boardView(state, 1600).thanks.has("buys")).toBe(false);
    const again = step(state, fixed("buys", "drill", 1000));
    expect(boardView(again, 2599).thanks.has("buys")).toBe(true);
    const bay = after(fixed("board", "bay:1", 0));
    expect(boardView(bay, 0).thanks.has("board/bay:1")).toBe(true);
  });

  it("holds a drawer row after its fix, and no bay", () => {
    const pressed = press(initialBoard(), {
      ...finger("buys", "drill", 0),
      intent: "trouble",
    });
    expect(pressed.decision).toBe("act");
    const state = step(pressed.state, fixed("buys", "drill", 0));
    expect(decide(state, finger("buys", "drill", 500))).toBe("ignore-held");
    const refixed = step(state, fixed("buys", "drill", 1500));
    expect(boardView(refixed, 3399).held.has("buys/drill")).toBe(true);
    expect(boardView(refixed, 3400).held.has("buys/drill")).toBe(false);
    const bay = after(fixed("board", "bay:1", 0));
    expect(decide(bay, finger("board", "bay:1", 500))).toBe("act");
  });
});

describe("the wake time", () => {
  const plate = { layer: "board", id: "plate" } as const;

  it("wakes at the next change", () => {
    expect(nextWake(initialBoard(), 0)).toBeUndefined();
    const hold = after({
      kind: "result",
      control: plate,
      at: 1000,
      outcome: "applied",
    });
    expect(nextWake(hold, 1000)).toBe(2900);
    expect(nextWake(hold, 2900)).toBeUndefined();
    const blink = after({
      kind: "result",
      control: plate,
      at: 0,
      outcome: "refused",
    });
    expect([0, 140, 280, 420, 560].map((at) => nextWake(blink, at))).toEqual([
      140,
      280,
      420,
      560,
      undefined,
    ]);
    const all = after(
      { kind: "result", control: plate, at: 0, outcome: "applied" },
      {
        kind: "result",
        control: { layer: "buys", id: "drill" },
        at: 0,
        outcome: "fixed",
      },
      {
        kind: "result",
        control: { layer: "board", id: "bay:0" },
        at: 1000,
        outcome: "refused",
      },
    );
    expect(nextWake(all, 1000)).toBe(1140);
    expect(nextWake(all, 1560)).toBe(1600);
    expect(nextWake(all, 1600)).toBe(1900);
  });
});

describe("the freeze", () => {
  const L1: Layout = { parts: ["crew", "helper", "cart"], chipRows: 1 };
  const L2: Layout = { parts: ["crew", "helper", "drill"], chipRows: 2 };
  const laid = (layout: Layout, overlay: DrawerId = "buys") =>
    ({ kind: "layout", overlay, layout }) as const;
  const open = (overlay: DrawerId = "buys", at = 0) =>
    ({ kind: "open", overlay, at }) as const;
  const close = (overlay: DrawerId = "buys") =>
    ({ kind: "close", overlay, at: 0, by: "keyboard" }) as const;
  const shown = (state: BoardState, overlay: DrawerId = "buys") =>
    boardView(state, 0).layouts.get(overlay);

  it("shows the latest layout while shut, and freezes it as the drawer opens", () => {
    expect(shown(after(laid(L1)))).toBe(L1);
    const frozen = after(laid(L1), open(), laid(L2));
    expect(shown(frozen)).toBe(L1);
    expect(shown(step(frozen, close()))).toBe(L2);
  });

  it("lays out once as the save lands, for a drawer opened before it", () => {
    expect(shown(after(open(), laid(L1), laid(L2)))).toBe(L1);
  });

  it("opens on the newest layout", () => {
    expect(shown(after(laid(L1), laid(L2), open()))).toBe(L2);
  });

  it("blinks a press on a part the open drawer holds but no longer shows", () => {
    const state = after(laid(L1), open(), laid(L2));
    const gone = press(state, finger("buys", "cart", 1000));
    expect(gone.decision).toBe("blink");
    expect(boardView(gone.state, 1000).blinking.get("buys/cart")).toBe("red");
    expect(decide(state, finger("buys", "drill", 1000))).toBe("act");
  });

  it("acts on a part an open drawer shows, and on a drawer still unfrozen", () => {
    expect(decide(after(laid(L1), open()), finger("buys", "cart", 1000))).toBe(
      "act",
    );
    expect(decide(after(open()), finger("buys", "cart", 1000))).toBe("act");
  });

  it("keeps the freeze when the save loads again", () => {
    expect(shown(after(laid(L1), open(), { kind: "unloaded" }, laid(L2)))).toBe(
      L1,
    );
  });

  it("freezes the new save's layout for a drawer opened while the save loads again", () => {
    const state = after(laid(L1), { kind: "unloaded" }, open(), laid(L2));
    expect(shown(state)).toBe(L2);
    expect(decide(state, finger("buys", "drill", 1000))).toBe("act");
  });

  it("keeps the order a drawer gives as it opens while the save loads again", () => {
    // Upgrades keeps its order through a reload: it gives that order as it opens.
    const kept: Layout = {
      parts: ["boost:sharper", "upgrade:tap"],
      chipRows: 0,
    };
    const landed: Layout = {
      parts: ["upgrade:tap", "boost:sharper"],
      chipRows: 0,
    };
    const state = after(
      laid(kept, "upgrades"),
      { kind: "unloaded" },
      open("upgrades"),
      laid(kept, "upgrades"),
      laid(landed, "upgrades"),
    );
    expect(shown(state, "upgrades")).toBe(kept);
    // Before any layout, a drawer has no entry: the painter leaves it as it is.
    expect(
      shown(after({ kind: "unloaded" }, open("upgrades")), "upgrades"),
    ).toBe(undefined);
  });

  it("holds the places of parts listed but hidden, so only a part the drawer drops blinks", () => {
    // Upgrades lists every row it can show, hidden ones too: their places hold, and
    // showing or hiding one in place is the painter's.
    const all: Layout = {
      parts: ["boost:sharper", "upgrade:tap"],
      chipRows: 0,
    };
    const reordered: Layout = {
      parts: ["upgrade:tap", "boost:sharper"],
      chipRows: 0,
    };
    const state = after(
      laid(all, "upgrades"),
      open("upgrades"),
      laid(reordered, "upgrades"),
    );
    expect(shown(state, "upgrades")).toBe(all);
    expect(decide(state, finger("upgrades", "upgrade:tap", 1000))).toBe("act");
  });

  it("freezes each drawer on its own", () => {
    const U1: Layout = { parts: ["boost:sharper"], chipRows: 0 };
    const U2: Layout = { parts: ["boost:sharper", "upgrade:tap"], chipRows: 0 };
    const state = after(
      laid(L1),
      open(),
      laid(L2),
      laid(U1, "upgrades"),
      open("upgrades"),
      laid(U2, "upgrades"),
    );
    expect(shown(state)).toBe(L2);
    expect(shown(state, "upgrades")).toBe(U1);
  });
});
