import { describe, expect, it } from "vitest";
import {
  DRAWER_SETTLE_MS,
  PRESS_AGE_LIMIT_MS,
  READY_HOLD_MS,
  boardView,
  controlKey,
  initialBoard,
  press,
  step,
  type BoardInput,
  type BoardState,
  type DrawerId,
  type Layer,
  type Layout,
  type OverlayId,
  type Press,
} from "./board-interaction";

/*
 * Random sequences of presses and drawer moves (#410). The shadow below keeps its own record
 * of the rules (when each overlay last settled, what a finger's close revealed, each
 * control's Done hold, each open drawer's first frozen layout) and never asks the model. For
 * every seed, no press acts inside a settle or a hold, so a double tap buys at most once, and
 * no open drawer's layout changes until it closes.
 */

/** A seeded 32-bit generator returning [0, 1): mulberry32. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SEEDS = 300;
const STEPS = 80;
const DRAWERS: readonly DrawerId[] = ["buys", "upgrades"];
const OVERLAYS: readonly OverlayId[] = [...DRAWERS, "save"];
const CONTROLS = ["c0", "c1", "c2"];
const PARTS = [...CONTROLS, "section"];

interface Hold {
  readonly from: number;
  readonly until: number;
}

/** The rules, kept by the test. */
interface Shadow {
  stack: { overlay: OverlayId; settleFrom: number }[];
  revealed: { layer: Layer; until: number } | undefined;
  acted: Map<string, number>;
  holds: Map<string, Hold>;
  wanted: Map<DrawerId, Layout>;
  frozen: Map<DrawerId, Layout>;
}

function judged(input: Press): number {
  const age = input.at - input.pressedAt;
  return age > 0 && age < PRESS_AGE_LIMIT_MS ? input.pressedAt : input.at;
}

const isDrawer = (overlay: Layer): overlay is DrawerId =>
  (DRAWERS as readonly Layer[]).includes(overlay);

function shadowOpen(shadow: Shadow, overlay: OverlayId, at: number): void {
  if (shadow.stack.some((each) => each.overlay === overlay)) {
    return;
  }
  if (isDrawer(overlay)) {
    shadow.stack = [{ overlay, settleFrom: at }];
    shadow.frozen = new Map();
    const layout = shadow.wanted.get(overlay);
    if (layout !== undefined) {
      shadow.frozen.set(overlay, layout);
    }
  } else {
    shadow.stack.push({ overlay, settleFrom: at });
  }
  shadow.revealed = undefined;
}

function shadowClose(
  shadow: Shadow,
  input: Extract<BoardInput, { kind: "close" }>,
): void {
  const index = shadow.stack.findIndex(
    (each) => each.overlay === input.overlay,
  );
  if (index === -1) {
    return;
  }
  for (const gone of shadow.stack.slice(index)) {
    if (isDrawer(gone.overlay)) {
      shadow.frozen.delete(gone.overlay);
    }
  }
  shadow.stack = shadow.stack.slice(0, index);
  shadow.revealed =
    input.by === "finger"
      ? {
          layer: shadow.stack.at(-1)?.overlay ?? "board",
          until: input.at + DRAWER_SETTLE_MS,
        }
      : undefined;
}

/** Where the press would fall inside a settle, by the rules. */
function inSettle(shadow: Shadow, input: Press): boolean {
  const at = judged(input);
  const layer = input.control.layer;
  const own = shadow.stack.find((each) => each.overlay === layer);
  return (
    (own !== undefined && at < own.settleFrom + DRAWER_SETTLE_MS) ||
    (shadow.revealed?.layer === layer && at < shadow.revealed.until)
  );
}

function inHold(shadow: Shadow, input: Press): boolean {
  const hold = shadow.holds.get(controlKey(input.control));
  const at = judged(input);
  return hold !== undefined && at >= hold.from && at < hold.until;
}

function randomLayout(random: () => number): Layout {
  return {
    parts: PARTS.filter(() => random() < 0.7),
    chipRows: Math.floor(random() * 3),
  };
}

/** One random input for the board as the shadow sees it. */
function randomInput(
  random: () => number,
  shadow: Shadow,
  at: number,
): BoardInput | Press {
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;
  const roll = random();
  if (roll < 0.12) return { kind: "open", overlay: pick(OVERLAYS), at };
  if (roll < 0.22) {
    const by = random() < 0.7 ? "finger" : "keyboard";
    return { kind: "close", overlay: pick(OVERLAYS), at, by };
  }
  if (roll < 0.26) return { kind: "page", overlay: pick(DRAWERS), at };
  if (roll < 0.34) {
    return {
      kind: "layout",
      overlay: pick(DRAWERS),
      layout: randomLayout(random),
    };
  }
  if (roll < 0.36) return { kind: "unloaded" };
  const layers: readonly Layer[] = [
    "board",
    ...shadow.stack.map((each) => each.overlay),
  ];
  return {
    control: { layer: pick(layers), id: pick(CONTROLS) },
    pressedAt: at - Math.floor(random() * 300),
    at,
    by: random() < 0.8 ? "finger" : "keyboard",
    intent: random() < 0.1 ? "trouble" : "act",
  };
}

/** What the shadow does with a press the model let act, and the result fed back. */
function shadowAct(
  shadow: Shadow,
  input: Press,
  outcome: "applied" | "refused" | "fixed" | undefined,
): void {
  const key = controlKey(input.control);
  shadow.acted.set(key, judged(input));
  const running = shadow.holds.get(key);
  const hold = {
    from: shadow.acted.get(key) ?? input.at,
    until: input.at + READY_HOLD_MS,
  };
  if (
    outcome === "applied" &&
    (running === undefined || input.at >= running.until)
  ) {
    shadow.holds.set(key, hold);
  }
  if (outcome === "fixed" && input.control.layer !== "board") {
    shadow.holds.set(key, hold);
  }
}

function outcomeFor(
  random: () => number,
  input: Press,
): "applied" | "refused" | "fixed" | undefined {
  if (input.intent === "trouble") {
    return random() < 0.5 ? "fixed" : undefined;
  }
  return random() < 0.9 ? "applied" : "refused";
}

/** Plays one seed; returns the first broken rule, or undefined. */
function play(seed: number): string | undefined {
  const random = mulberry32(seed);
  let state: BoardState = initialBoard();
  const shadow: Shadow = {
    stack: [],
    revealed: undefined,
    acted: new Map(),
    holds: new Map(),
    wanted: new Map(),
    frozen: new Map(),
  };
  let at = 0;
  for (let index = 0; index < STEPS; index += 1) {
    at += Math.floor(random() * 700);
    const input = randomInput(random, shadow, at);
    const where = `seed ${String(seed)}, step ${String(index)}`;
    if (!("kind" in input)) {
      const settling = inSettle(shadow, input);
      const holding = inHold(shadow, input);
      const result = press(state, input);
      state = result.state;
      if (result.decision === "act") {
        if (input.intent === "act" && input.by === "finger" && settling) {
          return `${where}: a press acted inside a settle`;
        }
        if (input.intent === "act" && holding) {
          return `${where}: a second tap bought inside a Done hold`;
        }
        const outcome = outcomeFor(random, input);
        if (outcome !== undefined) {
          state = step(state, {
            kind: "result",
            control: input.control,
            at: input.at,
            outcome,
          });
        }
        shadowAct(shadow, input, outcome);
      }
    } else {
      state = step(state, input);
      if (input.kind === "open") shadowOpen(shadow, input.overlay, input.at);
      if (input.kind === "close") shadowClose(shadow, input);
      if (input.kind === "page") {
        const open = shadow.stack.find(
          (each) => each.overlay === input.overlay,
        );
        if (open !== undefined) open.settleFrom = input.at;
      }
      if (input.kind === "layout") {
        shadow.wanted.set(input.overlay, input.layout);
        const open = shadow.stack.some(
          (each) => each.overlay === input.overlay,
        );
        if (open && !shadow.frozen.has(input.overlay)) {
          shadow.frozen.set(input.overlay, input.layout);
        }
      }
      if (input.kind === "unloaded") {
        shadow.acted.clear();
        shadow.holds.clear();
      }
    }
    const layouts = boardView(state, at).layouts;
    for (const [drawer, frozen] of shadow.frozen) {
      if (layouts.get(drawer) !== frozen) {
        return `${where}: the open ${drawer} drawer's rows moved`;
      }
    }
  }
  return undefined;
}

describe("the board model under random sequences", () => {
  it("never acts inside a settle or a hold, and never moves an open drawer's rows", () => {
    const broken = Array.from({ length: SEEDS }, (_, seed) => play(seed + 1))
      .filter((each) => each !== undefined)
      .slice(0, 3);
    expect(broken).toEqual([]);
  });

  it("gives the same sequence for the same seed", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(first()).toBeGreaterThanOrEqual(0);
    expect(first()).toBeLessThan(1);
  });
});
