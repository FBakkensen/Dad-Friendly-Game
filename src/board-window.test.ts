// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMineWindow,
  runBoardLoop,
  type MineWindow,
} from "./board-window";
import { mineView, type WindowScene } from "./mine-window";
import { WINDOW_SCENE_PARTS } from "./ui-audit-measure";

const motion = (reduce: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
        media: query,
      }) as MediaQueryList,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const SCENE: WindowScene = {
  band: "topsoil",
  run: true,
  drill: false,
  borer: false,
  machine: false,
  kid: false,
  carts: 0,
  drills: 0,
  borers: 0,
  trouble: undefined,
  legacy: false,
};

const scene = (over: Partial<WindowScene>): WindowScene => ({
  ...SCENE,
  ...over,
});

type Made = {
  readonly win: MineWindow;
  readonly onDig: ReturnType<typeof vi.fn<() => number>>;
  readonly onVein: ReturnType<typeof vi.fn<() => void>>;
  readonly badge: HTMLElement;
};

const make = (mined = 20): Made => {
  const onDig = vi.fn<() => number>(() => mined);
  const onVein = vi.fn<() => void>();
  const badge = document.createElement("span");
  badge.className = "legacy-badge";
  badge.textContent = "Legacy ×2";
  const win = createMineWindow({
    onDig,
    onVein,
    legacyBadge: badge,
    random: () => 0.5,
  });
  document.body.append(win.root);
  return { win, onDig, onVein, badge };
};

const el = (win: MineWindow, selector: string): HTMLElement => {
  const found = win.root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no ${selector}`);
  return found;
};

const shown = (win: MineWindow, selector: string): boolean =>
  !el(win, selector).hidden;

const keyboardClick = (target: HTMLElement): void => {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
};

describe("createMineWindow", () => {
  it("builds the window, its frame, the tag, the vein beside it and the plate", () => {
    motion(false);
    const { win, badge } = make();
    expect(win.root.matches("div.board-mine")).toBe(true);
    expect(win.dig.matches("button.board-window")).toBe(true);
    expect(
      win.root.querySelector(
        ".board-mine > button.board-window .board-window-view img.board-window-art",
      ),
    ).not.toBeNull();
    expect(win.dig.querySelector(".board-window-frame")).not.toBeNull();
    expect(el(win, ".board-window-tag").textContent).toBe("No. 2 Shaft");
    expect(win.vein.matches("button.golden-vein")).toBe(true);
    expect(win.vein.getAttribute("aria-label")).toBe(
      "Golden vein, tap for a burst of stones",
    );
    expect(win.dig.contains(win.vein)).toBe(false);
    expect(win.root.contains(win.vein)).toBe(true);
    expect(el(win, ".board-legacy").contains(badge)).toBe(true);
  });

  it("before the first render it is only the frame and the glass: no view, machine, kid or run", () => {
    motion(false);
    const { win } = make();
    /** Shown only if neither it nor anything between it and the window is hidden. */
    const visible = (selector: string): boolean => {
      for (
        let node: HTMLElement | null = el(win, selector);
        node !== null && node !== win.root;
        node = node.parentElement
      ) {
        if (node.hidden) return false;
      }
      return true;
    };
    // the browser checks' list, and the two puffs that are never up before a dig
    const SCENE_PARTS = [
      ...WINDOW_SCENE_PARTS,
      ".board-window-fill",
      ".board-dig-dust",
    ];
    for (const part of SCENE_PARTS) {
      expect({ part, visible: visible(part) }).toEqual({
        part,
        visible: false,
      });
    }
    expect(visible(".board-window-frame")).toBe(true);
    expect(visible(".board-window-glass")).toBe(true);
    expect(visible(".board-window-tag")).toBe(true);
    // a tick before the save loads draws nothing either
    win.tick(0.1);
    expect(visible(".board-window-run")).toBe(false);
    expect(visible(".board-window-drill")).toBe(false);

    // the first render puts the shaft, the run and today's tarp on the view
    win.render(SCENE);
    for (const part of [
      ".board-window-art",
      ".board-window-sheave",
      ".board-window-steam",
      ".board-window-tarp",
      ".board-window-run",
      ".board-window-tub",
      ".board-window-miner",
      ".board-window-cage",
    ]) {
      expect({ part, visible: visible(part) }).toEqual({
        part,
        visible: true,
      });
    }
    for (const part of [
      ".board-window-machine",
      ".board-window-drill",
      ".board-window-borer",
      ".board-window-kid",
    ]) {
      expect({ part, visible: visible(part) }).toEqual({
        part,
        visible: false,
      });
    }
  });

  it("shows the band's view and swaps it when the band changes", () => {
    motion(false);
    const { win } = make();
    win.render(scene({ band: "crystal" }));
    expect(win.root.dataset.band).toBe("crystal");
    const art = el(win, "img.board-window-art") as HTMLImageElement;
    expect(art.getAttribute("src")).toBe(mineView("crystal"));
    win.render(scene({ band: "granite" }));
    expect(win.root.dataset.band).toBe("granite");
    expect(art.getAttribute("src")).toBe(mineView("granite"));
  });

  it("shows each machine only once it is owned, the cave-in only under a cart trouble and the plate only with Legacy", () => {
    motion(true);
    const { win } = make();
    win.render(SCENE);
    expect(shown(win, ".board-window-drill")).toBe(false);
    expect(shown(win, ".board-window-borer")).toBe(false);
    expect(shown(win, ".board-window-tarp")).toBe(true);
    expect(shown(win, ".board-window-machine")).toBe(false);
    expect(shown(win, ".board-window-kid")).toBe(false);
    expect(shown(win, ".board-window-cave-in")).toBe(false);
    expect(shown(win, ".board-legacy")).toBe(false);

    win.render(
      scene({
        drill: true,
        drills: 1,
        borer: true,
        borers: 1,
        machine: true,
        kid: true,
        trouble: "cart",
        legacy: true,
      }),
    );
    expect(shown(win, ".board-window-drill")).toBe(true);
    expect(shown(win, ".board-window-borer")).toBe(true);
    expect(shown(win, ".board-window-tarp")).toBe(false);
    expect(shown(win, ".board-window-machine")).toBe(true);
    expect(shown(win, ".board-window-kid")).toBe(true);
    expect(shown(win, ".board-window-cave-in")).toBe(true);
    expect(shown(win, ".board-legacy")).toBe(true);

    win.render(scene({ drill: true, drills: 1, trouble: "drill" }));
    expect(shown(win, ".board-window-cave-in")).toBe(false);
  });

  it("a dig shows +N over the default spot, rising a pixel each 70ms, then goes", () => {
    motion(false);
    const { win, onDig } = make(20);
    win.render(SCENE);
    keyboardClick(win.dig);
    expect(onDig).toHaveBeenCalledTimes(1);
    const plus = el(win, ".board-dig-plus");
    expect(plus.hidden).toBe(false);
    expect(plus.textContent).toBe("+20");
    expect(plus.style.left).toBe("150px");
    expect(plus.style.top).toBe("56px");
    expect(shown(win, ".board-dig-dust")).toBe(true);
    // the puff sits at the upper face, puffSpot(undefined) = (67, 30)
    expect(el(win, ".board-dig-dust").style.left).toBe("134px");
    expect(el(win, ".board-dig-dust").style.top).toBe("60px");
    win.tick(0.07);
    expect(plus.style.top).toBe("54px");
    for (let i = 0; i < 11; i += 1) win.tick(0.07);
    expect(plus.hidden).toBe(false);
    expect(plus.style.top).toBe("32px");
    win.tick(0.07);
    expect(plus.hidden).toBe(true);
  });

  it("a dig that mines nothing shows nothing", () => {
    motion(false);
    const { win, onDig } = make(0);
    win.render(SCENE);
    keyboardClick(win.dig);
    expect(onDig).toHaveBeenCalledTimes(1);
    expect(shown(win, ".board-dig-plus")).toBe(false);
    expect(shown(win, ".board-dig-dust")).toBe(false);
  });

  it("the puff comes up under the finger", () => {
    motion(false);
    const { win } = make(5);
    win.render(SCENE);
    const view = el(win, ".board-window-view");
    view.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 184, height: 152 }) as DOMRect;
    win.dig.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 100 + 60,
        clientY: 200 + 40,
      }),
    );
    win.dig.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    // (60, 40) CSS px is (30, 20) art px; the puff's corner is 8 up and left of it
    expect(el(win, ".board-dig-dust").style.left).toBe("44px");
    expect(el(win, ".board-dig-dust").style.top).toBe("24px");
    // a keyboard click puffs at the default spot, even after a press that never clicked
    win.dig.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 100 + 60,
        clientY: 200 + 40,
      }),
    );
    keyboardClick(win.dig);
    expect(el(win, ".board-dig-dust").style.left).toBe("134px");
  });

  it("under reduced motion +N holds still and goes after 0.7s, and the window holds still", () => {
    motion(true);
    const { win } = make(20);
    win.render(scene({ drill: true, drills: 1 }));
    const sheave = el(win, ".board-window-sheave").style.backgroundPositionX;
    const miner = el(win, ".board-window-miner").style.backgroundPositionX;
    const minerLeft = el(win, ".board-window-miner").style.left;
    keyboardClick(win.dig);
    const plus = el(win, ".board-dig-plus");
    expect(plus.hidden).toBe(false);
    expect(plus.textContent).toBe("+20");
    win.tick(0.5);
    expect(plus.hidden).toBe(false);
    expect(plus.style.top).toBe("56px");
    win.tick(0.3);
    expect(plus.hidden).toBe(true);
    for (let i = 0; i < 50; i += 1) win.tick(0.1);
    expect(el(win, ".board-window-sheave").style.backgroundPositionX).toBe(
      sheave,
    );
    expect(el(win, ".board-window-miner").style.backgroundPositionX).toBe(
      miner,
    );
    expect(el(win, ".board-window-miner").style.left).toBe(minerLeft);
  });

  it("under reduced motion the dig puff holds one frame for 240ms", () => {
    motion(true);
    const { win } = make(20);
    win.render(SCENE);
    keyboardClick(win.dig);
    const dust = el(win, ".board-dig-dust");
    expect(dust.style.backgroundPositionX).toBe("-32px");
    win.tick(0.1);
    expect(dust.hidden).toBe(false);
    expect(dust.style.backgroundPositionX).toBe("-32px");
    win.tick(0.15);
    expect(dust.hidden).toBe(true);
  });

  it("under reduced motion a cave-in is simply down", () => {
    motion(true);
    const { win } = make();
    win.render(scene({ trouble: "cart" }));
    expect(el(win, ".board-window-cave-in").style.backgroundPositionX).toBe(
      "-276px",
    );
  });

  it("under reduced motion the first borer is simply uncovered", () => {
    motion(true);
    const { win } = make();
    win.render(SCENE);
    expect(shown(win, ".board-window-tarp")).toBe(true);
    win.render(scene({ borer: true, borers: 1 }));
    expect(shown(win, ".board-window-borer")).toBe(true);
    expect(shown(win, ".board-window-tarp")).toBe(false);
  });

  it("with motion the tarp is dragged off the first borer", () => {
    motion(false);
    const { win } = make();
    win.render(SCENE);
    win.render(scene({ borer: true, borers: 1 }));
    expect(shown(win, ".board-window-borer")).toBe(true);
    expect(shown(win, ".board-window-tarp")).toBe(true);
    for (let i = 0; i < 40; i += 1) win.tick(0.1);
    expect(shown(win, ".board-window-tarp")).toBe(false);
  });

  it("puts the vein on the view, hides it, and pays it without digging", () => {
    motion(false);
    const { win, onDig, onVein } = make();
    win.render(SCENE);
    win.showVein({ left: 64, top: 48 });
    expect(win.vein.hidden).toBe(false);
    expect(win.vein.style.left).toBe("142px");
    expect(win.vein.style.top).toBe("110px");
    win.vein.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onVein).toHaveBeenCalledTimes(1);
    expect(onDig).not.toHaveBeenCalled();
    expect(shown(win, ".board-dig-plus")).toBe(false);
    win.showVein(undefined);
    expect(win.vein.hidden).toBe(true);
  });

  it("a press on the vein is never a dig, and a keyboard dig after it puffs once at the default spot", () => {
    motion(false);
    const { win, onDig, onVein } = make(20);
    win.render(SCENE);
    win.showVein({ left: 64, top: 48 });
    win.vein.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 150,
        clientY: 120,
      }),
    );
    win.vein.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(onVein).toHaveBeenCalledTimes(1);
    expect(onDig).not.toHaveBeenCalled();
    expect(shown(win, ".board-dig-plus")).toBe(false);
    expect(shown(win, ".board-dig-dust")).toBe(false);
    keyboardClick(win.dig);
    expect(onDig).toHaveBeenCalledTimes(1);
    expect(onVein).toHaveBeenCalledTimes(1);
    expect(el(win, ".board-dig-dust").style.left).toBe("134px");
    expect(el(win, ".board-dig-dust").style.top).toBe("60px");
  });

  it("a still window writes no styles on a tick", async () => {
    motion(true);
    const { win } = make();
    win.render(scene({ drill: true, drills: 1, borer: true, borers: 1 }));
    win.tick(0.1);
    const writes: MutationRecord[] = [];
    const watch = new MutationObserver((records) => {
      writes.push(...records);
    });
    watch.observe(win.root, { attributes: true, subtree: true });
    for (let i = 0; i < 10; i += 1) win.tick(0.1);
    await Promise.resolve();
    writes.push(...watch.takeRecords());
    watch.disconnect();
    expect(writes).toEqual([]);
  });

  it("a new cart winds the sheave fast", () => {
    motion(false);
    const { win } = make();
    win.render(scene({ carts: 5 }));
    const sheave = el(win, ".board-window-sheave");
    expect(sheave.style.backgroundPositionX).toBe("0px");
    win.render(scene({ carts: 6 }));
    // 0.2s, in the loop's capped 0.1s steps, at three times the pace
    win.tick(0.1);
    win.tick(0.1);
    expect(sheave.style.backgroundPositionX).toBe("-114px");
  });

  it("a new drill puffs dust at its bit, which plays out and goes", () => {
    motion(false);
    const { win } = make();
    win.render(SCENE);
    win.render(scene({ drill: true, drills: 1 }));
    const fill = el(win, ".board-window-fill");
    expect(fill.hidden).toBe(true);
    win.tick(0.01);
    expect(fill.hidden).toBe(false);
    expect(fill.style.left).toBe("138px");
    expect(fill.style.top).toBe("106px");
    for (let i = 0; i < 5; i += 1) win.tick(0.09);
    expect(fill.hidden).toBe(true);
  });

  it("under reduced motion a new drill puffs nothing", () => {
    motion(true);
    const { win } = make();
    win.render(SCENE);
    win.render(scene({ drill: true, drills: 1 }));
    win.tick(0.01);
    expect(shown(win, ".board-window-fill")).toBe(false);
  });

  it("with no beat the sheave turns at its own pace", () => {
    motion(false);
    const { win } = make();
    win.render(scene({ carts: 5 }));
    win.render(scene({ carts: 5 }));
    win.tick(0.1);
    win.tick(0.1);
    expect(el(win, ".board-window-sheave").style.backgroundPositionX).toBe(
      "-38px",
    );
  });

  it("draws the run: the tub, the miner and the cage, and hides the tub and miner with no one on the run", () => {
    motion(false);
    const { win } = make();
    win.render(SCENE);
    const tub = el(win, ".board-window-tub") as HTMLImageElement;
    // the empty tub at the cage, on the rail: x 14, top 47 - 12 + 1 - 28 = 8 run-box px
    expect(tub.style.left).toBe("28px");
    expect(tub.style.top).toBe("16px");
    expect(el(win, ".board-window-cage").style.left).toBe("22px");
    expect(el(win, ".board-window-cage").style.top).toBe("-6px");
    expect(shown(win, ".board-window-miner")).toBe(true);
    win.render(scene({ run: false }));
    expect(shown(win, ".board-window-tub")).toBe(false);
    expect(shown(win, ".board-window-miner")).toBe(false);
    expect(shown(win, ".board-window-cage")).toBe(true);
  });
});

describe("the window's stacking", () => {
  const zIndex = (win: MineWindow, selector: string): string =>
    getComputedStyle(el(win, selector)).zIndex;

  it("keeps the run's tub and miner inside the run, under the puffs, the glass and the frame", () => {
    motion(false);
    const style = document.createElement("style");
    style.textContent = readFileSync(
      resolve(process.cwd(), "src/board.css"),
      "utf8",
    );
    document.head.append(style);
    const { win } = make();
    win.render(scene({ trouble: "cart" }));

    // the run is its own stacking context, so its tub (1) and miner (2) stay in it
    expect(zIndex(win, ".board-window-run")).toBe("0");
    expect(zIndex(win, ".board-window-tub")).toBe("1");
    expect(zIndex(win, ".board-window-miner")).toBe("2");

    // after it, in the spec's order and none raised above it: cave-in, fill, puff, +N, glass
    const view = el(win, ".board-window-view");
    const layers = [...view.children].map((c) => c.className.split(" ")[0]);
    expect(layers.slice(layers.indexOf("board-window-run"))).toEqual([
      "board-window-run",
      "board-window-cave-in",
      "board-window-fill",
      "board-dig-dust",
      "board-dig-plus",
      "board-window-glass",
    ]);
    for (const later of [
      ".board-window-cave-in",
      ".board-window-fill",
      ".board-dig-dust",
      ".board-dig-plus",
      ".board-window-glass",
    ]) {
      expect(["auto", "0", ""]).toContain(zIndex(win, later));
    }

    // then the frame and tag over the view, and the vein and the plate over the window
    expect([...win.dig.children].map((c) => c.className.split(" ")[0])).toEqual(
      ["board-window-view", "board-window-frame", "board-window-tag"],
    );
    expect(
      [...win.root.children].map((c) => c.className.split(" ")[0]),
    ).toEqual(["board-window", "golden-vein", "board-legacy"]);
    expect(zIndex(win, ".golden-vein")).toBe("2");
    expect(zIndex(win, ".board-legacy")).toBe("3");
    // and the window isolates them, so the vein's 2 and the plate's 3 never reach the board's
    // sheets, notes or save line
    expect(getComputedStyle(win.root).isolation).toBe("isolate");
  });
});

describe("runBoardLoop", () => {
  /** A fake frame clock: frames asked for, run in turn, and cancellable. */
  const fakeFrames = () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      id += 1;
      frames.set(id, cb);
      return id;
    });
    const cancel = vi.fn((handle: number) => {
      frames.delete(handle);
    });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const next = (at: number): void => {
      const first = frames.entries().next();
      if (first.done) throw new Error("no frame asked for");
      const [handle, cb] = first.value;
      frames.delete(handle);
      cb(at);
    };
    return { frames, cancel, next };
  };

  it("steps in seconds, caps a long gap at 0.1s and stops on abort", () => {
    const { frames, cancel, next } = fakeFrames();
    const step = vi.fn<(dt: number) => void>();
    const stop = new AbortController();
    runBoardLoop(step, stop.signal);
    next(1000);
    next(1016);
    expect(step).toHaveBeenLastCalledWith(expect.closeTo(0.016, 6));
    next(6016);
    expect(step).toHaveBeenLastCalledWith(0.1);
    const calls = step.mock.calls.length;
    expect(frames.size).toBe(1);
    stop.abort();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(step).toHaveBeenCalledTimes(calls);
  });

  it("keeps going after a step throws", () => {
    const { frames, next } = fakeFrames();
    const step = vi.fn<(dt: number) => void>(() => {
      throw new Error("a bad frame");
    });
    runBoardLoop(step);
    next(1000);
    expect(() => {
      next(1016);
    }).toThrow("a bad frame");
    expect(frames.size).toBe(1);
    step.mockImplementation(() => undefined);
    next(1032);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it("asks for no frame when the signal has already aborted", () => {
    const { frames } = fakeFrames();
    const stop = new AbortController();
    stop.abort();
    runBoardLoop(vi.fn(), stop.signal);
    expect(frames.size).toBe(0);
  });

  it("does nothing without requestAnimationFrame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const step = vi.fn<(dt: number) => void>();
    expect(() => {
      runBoardLoop(step);
    }).not.toThrow();
    expect(step).not.toHaveBeenCalled();
  });
});
