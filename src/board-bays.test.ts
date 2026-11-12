// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandWords,
  bayLines,
  createMachineBays,
  sharedPattern,
  type MachineBays,
} from "./board-bays";
import type { TierLock } from "./crew";
import { FIX_HOLD_MS, type TroubleTier } from "./hazards";
import type { BayView } from "./machine-bays";
import { milestoneLine } from "./milestones";
import { MOUNTAIN_STONES } from "./scale";
import { formatCompact } from "./format";
import { createBoardHost, type BoardHost } from "./board-host";
import { THANKS_MS } from "./board-interaction";
import { createBoardNote, type BoardNote } from "./board-note";
import { TROUBLE_FIXED } from "./screen-words";

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

beforeEach(() => {
  vi.useFakeTimers();
  motion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const fits = (el: HTMLElement): boolean => el.textContent.length <= 20;

const mined = (stones: number): { remaining: number } => ({
  remaining: MOUNTAIN_STONES - stones,
});

const borerLock: TierLock = {
  kind: "depth",
  depth: 10_000_000,
  at: 10_000_000,
};

const cart = (
  over: Partial<Extract<BayView, { kind: "open" }>> = {},
): BayView => ({
  kind: "open",
  tier: "cart",
  count: 12,
  price: 5868,
  gain: 12,
  staff: 1,
  lamp: "off",
  ...over,
});

const drill = (
  over: Partial<Extract<BayView, { kind: "open" }>> = {},
): BayView => ({
  kind: "open",
  tier: "drill",
  count: 3,
  price: 40_000,
  gain: 60,
  staff: 2,
  lamp: "off",
  ...over,
});

const lockedBorer: BayView = {
  kind: "locked",
  tier: "borer",
  count: 0,
  lock: borerLock,
};

const borer = (
  over: Partial<Extract<BayView, { kind: "open" }>> = {},
): BayView => ({
  kind: "open",
  tier: "borer",
  count: 2,
  price: 1_200_000,
  gain: 357,
  staff: 8,
  lamp: "off",
  ...over,
});

const machine = (
  over: Partial<Extract<BayView, { kind: "open" }>> = {},
): BayView => ({
  kind: "open",
  tier: "machine",
  count: 0,
  price: 120_600_000,
  gain: 50_000,
  staff: 20,
  lamp: "off",
  ...over,
});

const troubled = (tier: TroubleTier): BayView => ({
  kind: "trouble",
  tier,
  count: 4,
  price: 9000,
  gain: 12,
  staff: 1,
  trouble: "cave-in",
});

type OnTrouble = (tier: TroubleTier, how: "press" | "hold") => boolean;

function make(): {
  bays: MachineBays;
  board: BoardHost;
  note: BoardNote;
  stage: HTMLElement;
  onOpen: ReturnType<typeof vi.fn<(from: HTMLElement) => void>>;
  onTrouble: ReturnType<typeof vi.fn<OnTrouble>>;
  /** The board's clock and the timers move on together: a thanks ends only when both have. */
  advance: (ms: number) => void;
} {
  const now = { value: 0 };
  const board = createBoardHost({
    clock: () => now.value,
    pressAge: () => 0,
    reduced: () => false,
  });
  const stage = document.createElement("div");
  document.body.append(stage);
  const note = createBoardNote(stage);
  const onOpen = vi.fn<(from: HTMLElement) => void>();
  const onTrouble = vi.fn<OnTrouble>(() => false);
  const bays = createMachineBays({ board, note, onOpen, onTrouble, fits });
  stage.append(bays.root);
  return {
    bays,
    board,
    note,
    stage,
    onOpen,
    onTrouble,
    advance: (ms) => {
      now.value += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

/** A board, a note and taps that go nowhere, for a test about drawing. */
const wiring = () => ({
  board: createBoardHost({
    clock: () => 0,
    pressAge: () => 0,
    reduced: () => false,
  }),
  note: createBoardNote(document.createElement("div")),
  onOpen: vi.fn(),
  onTrouble: vi.fn(() => false),
});

/** A finger's tap: down, up and the click, which has a pointer (detail 1). */
const fingerTap = (el: HTMLElement): void => {
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
};

const thanking = (note: BoardNote): boolean =>
  note.note.classList.contains("on") &&
  note.note.querySelector(".board-thanks")?.textContent === TROUBLE_FIXED;

const bay = (bays: MachineBays, i: number): HTMLButtonElement => {
  const el = bays.bays[i];
  if (el === undefined) throw new Error(`no bay ${String(i)}`);
  return el;
};

const q = (el: HTMLElement, selector: string): HTMLElement => {
  const found = el.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

const digits = (el: HTMLElement): string[] =>
  [...el.querySelectorAll(".board-flap-d")].map((d) => d.textContent);

const flipping = (el: HTMLElement): boolean[] =>
  [...el.querySelectorAll(".board-flap-d")].map((d) =>
    d.classList.contains("is-flipping"),
  );

const iconSrc = (el: HTMLElement): string => {
  const icon = q(el, ".board-bay-icon");
  return icon instanceof HTMLImageElement
    ? icon.src
    : icon.style.backgroundImage;
};

const pointer = (el: HTMLElement, type: string): void => {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
};

const early = (): readonly BayView[] => [cart(), drill(), lockedBorer];

describe("bandWords", () => {
  it("names the band, with its line when it has one", () => {
    expect(bandWords(mined(500_000))).toBe("The Topsoil");
    expect(bandWords(mined(25_000_000))).toBe("The Granite · Suits borers");
    expect(bandWords(mined(60_000_000))).toBe(
      "The Crystal Caves · Suits drills",
    );
    expect(bandWords(mined(130_000_000))).toBe(
      "The Deep Heart · Suits the Great Machine",
    );
  });
});

describe("bayLines", () => {
  it("offers an open bay's milestone, then gain and workers, then gain", () => {
    const lines = bayLines(cart());
    expect(lines).toEqual([
      milestoneLine("cart", 12, formatCompact),
      "+12/s · 1 worker",
      "+12/s",
    ]);
    expect(lines[0]).toContain("12 of 25");
  });

  it("counts several workers (#508)", () => {
    expect(bayLines(borer())[1]).toBe("+357/s · 8 workers");
  });

  it("keeps three options when the tier has no milestone left", () => {
    const lines = bayLines(cart({ count: 300 }));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(milestoneLine("cart", 300, formatCompact));
  });

  it("reads the lock, or the trouble to fix", () => {
    expect(bayLines(lockedBorer)).toEqual([
      "Opens at 10M stones",
      "Opens at 10M stones",
      "Opens at 10M",
    ]);
    expect(bayLines(troubled("cart"))).toEqual(["Cave-in! · Hold to fix"]);
  });
});

describe("sharedPattern", () => {
  const short = (_bay: number, text: string): boolean => text.length <= 20;

  it("picks the first pattern that fits every bay", () => {
    const locked = [
      "Opens at 10M stones",
      "Opens at 10M stones",
      "Opens at 10M",
    ];
    expect(
      sharedPattern(
        [
          ["a".repeat(24), "+12/s · 1 worker", "+12/s"],
          locked,
          ["+12.4K/s · 18 workers", "+12.4K/s · 18 workers", "+12.4K/s"],
        ],
        short,
      ),
    ).toEqual(["+12/s", "Opens at 10M", "+12.4K/s"]);
    expect(
      sharedPattern(
        [
          ["a".repeat(24), "+12/s · 1 worker", "+12/s"],
          locked,
          ["+357/s · 8 workers", "+357/s · 8 workers", "+357/s"],
        ],
        short,
      ),
    ).toEqual([
      "+12/s · 1 worker",
      "Opens at 10M stones",
      "+357/s · 8 workers",
    ]);
  });

  it("falls back to the last pattern when nothing fits", () => {
    expect(sharedPattern([["a".repeat(24), "b".repeat(24)]], short)).toEqual([
      "b".repeat(24),
    ]);
  });

  it("asks each bay with its own index", () => {
    const asked: number[] = [];
    sharedPattern([["a"], ["b"], ["c"]], (b) => {
      asked.push(b);
      return true;
    });
    expect(asked).toEqual([0, 1, 2]);
  });
});

describe("createMachineBays", () => {
  it("holds the band and three bays in their frame", () => {
    const { bays } = make();
    bays.render(early(), "The Granite · Suits borers");
    expect(bays.root.matches("section.board-bays")).toBe(true);
    const buttons = bays.root.querySelectorAll("button.board-bay");
    expect(buttons).toHaveLength(3);
    expect([...buttons].map((b) => b.getAttribute("data-tier"))).toEqual([
      "cart",
      "drill",
      "borer",
    ]);
    expect(q(bays.root, ".board-band").textContent).toBe(
      "The Granite · Suits borers",
    );
    expect(
      bays.root.querySelector(":scope > canvas.board-skin"),
    ).not.toBeNull();
    expect(
      q(bays.root, ".board-band").querySelector("canvas.board-skin"),
    ).not.toBeNull();
  });

  it("puts every part in each bay", () => {
    const { bays } = make();
    bays.render(early(), "");
    for (const el of bays.bays) {
      for (const part of [
        "i.board-lamp",
        ".board-bay-icon",
        ".board-bay-name",
        ".board-bay-sub",
        ".board-flap",
        ".board-flap-l",
        ".board-flap-m",
        ".board-flap-r",
        ".board-bay-price",
        ".board-bay-price-lg",
        ".board-bay-tag",
      ]) {
        expect(el.querySelector(part), part).not.toBeNull();
      }
    }
  });

  it("names each bay and fits the sub-lines to one shared pattern", () => {
    const { bays } = make();
    bays.render(early(), "");
    expect(q(bay(bays, 0), ".board-bay-name").textContent).toBe("Mine cart");
    expect(q(bay(bays, 1), ".board-bay-name").textContent).toBe("Steam drill");
    expect(q(bay(bays, 2), ".board-bay-name").textContent).toBe("Tunnel borer");
    // The milestone line is too long for 20, so all three read the gain and workers.
    expect(q(bay(bays, 0), ".board-bay-sub").textContent).toBe(
      "+12/s · 1 worker",
    );
    expect(q(bay(bays, 1), ".board-bay-sub").textContent).toBe(
      "+60/s · 2 workers",
    );
    expect(q(bay(bays, 2), ".board-bay-sub").textContent).toBe(
      "Opens at 10M stones",
    );
  });

  it("shortens a name that does not fit", () => {
    const bays = createMachineBays({
      ...wiring(),
      fits: (el) => el.textContent.length <= 10,
    });
    bays.render(early(), "");
    expect(q(bay(bays, 1), ".board-bay-name").textContent).toBe("Drill");
    expect(q(bay(bays, 0), ".board-bay-name").textContent).toBe("Mine cart");
  });

  describe("fitting while the page settles", () => {
    /** A font set the test loads by hand: happy-dom has none. */
    const fontSet = (): { load: () => void; ready: () => void } => {
      let settle = (): void => undefined;
      const ready = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const fonts = Object.assign(new EventTarget(), { ready });
      Object.defineProperty(document, "fonts", {
        value: fonts,
        configurable: true,
      });
      return {
        load: () => fonts.dispatchEvent(new Event("loadingdone")),
        ready: settle,
      };
    };

    afterEach(() => {
      Reflect.deleteProperty(document, "fonts");
      vi.restoreAllMocks();
    });

    const sized = (): void => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        120,
      );
    };

    const limited = (): {
      bays: MachineBays;
      fits: ReturnType<typeof vi.fn<(el: HTMLElement) => boolean>>;
      widen: () => void;
    } => {
      let limit = 10;
      const fits = vi.fn<(el: HTMLElement) => boolean>(
        (el) => el.textContent.length <= limit,
      );
      const bays = createMachineBays({
        ...wiring(),
        fits,
      });
      document.body.append(bays.root);
      return {
        bays,
        fits,
        widen: () => {
          limit = 16;
        },
      };
    };

    const drillName = (bays: MachineBays): string | null =>
      q(bay(bays, 1), ".board-bay-name").textContent;

    it("keeps no fit measured in a box with no width yet", () => {
      const { bays, widen } = limited();
      bays.render(early(), "");
      expect(drillName(bays)).toBe("Drill");
      widen();
      bays.render(early(), "");
      expect(drillName(bays)).toBe("Steam drill");
    });

    it("keeps no fit measured off the page", () => {
      sized();
      const bays = createMachineBays({
        ...wiring(),
        fits: (el) => el.isConnected,
      });
      bays.render(early(), "");
      expect(q(bay(bays, 1), ".board-bay-name").textContent).toBe("Drill");
      document.body.append(bays.root);
      bays.render(early(), "");
      expect(q(bay(bays, 1), ".board-bay-name").textContent).toBe(
        "Steam drill",
      );
    });

    it("keeps a fit measured on the page until a font loads", () => {
      sized();
      const fonts = fontSet();
      const { bays, fits, widen } = limited();
      bays.render(early(), "");
      expect(drillName(bays)).toBe("Drill");
      const calls = fits.mock.calls.length;
      widen();
      bays.render(early(), "");
      expect(fits.mock.calls.length).toBe(calls);
      expect(drillName(bays)).toBe("Drill");
      fonts.load();
      expect(drillName(bays)).toBe("Steam drill");
    });

    it("fits again once the fonts are ready", async () => {
      sized();
      const fonts = fontSet();
      const { bays, widen } = limited();
      bays.render(early(), "");
      widen();
      fonts.ready();
      await Promise.resolve();
      await Promise.resolve();
      expect(drillName(bays)).toBe("Steam drill");
    });
  });

  it("covers a locked borer with its tarp, says Locked and hides the price", () => {
    const { bays } = make();
    bays.render(early(), "");
    const b = bay(bays, 2);
    expect(iconSrc(b)).toContain("mach-borer-tarp");
    expect(q(b, ".board-bay-price-lg").textContent).toBe("Locked");
    expect(q(b, ".board-bay-tag").hidden).toBe(true);
    expect(q(b, ".board-lamp").style.backgroundPositionX).toBe("0px");
    expect(b.getAttribute("aria-label")).toBe(
      "Tunnel borer, locked. Joins your crew at 10 million stones down. Opens Buys",
    );
  });

  it("shows an owned borer, Next and its price", () => {
    const { bays } = make();
    bays.render([cart(), drill(), borer()], "");
    const b = bay(bays, 2);
    expect(iconSrc(b)).toContain("mach-borer.png");
    expect(iconSrc(b)).not.toContain("tarp");
    expect(q(b, ".board-bay-price-lg").textContent).toBe("Next");
    expect(q(b, ".board-bay-tag").hidden).toBe(false);
    expect(q(b, ".board-bay-tag").textContent).toBe("1.2M");
  });

  it("offers the first borer once it is unlocked", () => {
    const { bays } = make();
    bays.render([cart(), drill(), borer({ count: 0 })], "");
    const b = bay(bays, 2);
    expect(q(b, ".board-bay-price-lg").textContent).toBe("First");
    expect(iconSrc(b)).toContain("mach-borer-tarp");
  });

  it("gives the Great Machine its own icon in the machine era", () => {
    const { bays } = make();
    bays.render([drill(), borer(), machine()], "");
    const b = bay(bays, 2);
    expect(b.getAttribute("data-tier")).toBe("machine");
    expect(iconSrc(b)).toContain("mach-machine");
    expect(iconSrc(bay(bays, 0))).toContain("drill-run");
    expect(q(b, ".board-bay-price-lg").textContent).toBe("First");
  });

  it("shows the count of a Great Machine owned before the Hammer is found", () => {
    const { bays } = make();
    const hammerLock: TierLock = {
      kind: "depth",
      depth: 120_000_000,
      at: 120_000_000,
    };
    bays.render(
      [
        drill(),
        borer(),
        { kind: "locked", tier: "machine", count: 1, lock: hammerLock },
      ],
      "",
    );
    const b = bay(bays, 2);
    expect(digits(b)).toEqual(["", "1"]);
    expect(iconSrc(b)).toContain("mach-machine");
    expect(q(b, ".board-bay-price-lg").textContent).toBe("Locked");
    expect(q(b, ".board-bay-tag").hidden).toBe(true);
  });

  it("reads an open bay's label with its count, price, gain and hands", () => {
    const { bays } = make();
    bays.render(early(), "");
    expect(bay(bays, 0).getAttribute("aria-label")).toBe(
      "Mine cart: 12 owned. Next 5,868 stones, +12 stones a second, needs 1 worker. Opens Buys",
    );
    expect(bay(bays, 1).getAttribute("aria-label")).toBe(
      "Steam drill: 3 owned. Next 40 thousand stones, +60 stones a second, needs 2 workers. Opens Buys",
    );
  });

  it("lights each lamp's frame", () => {
    const { bays } = make();
    bays.render(
      [
        cart({ lamp: "amber" }),
        drill({ lamp: "green" }),
        borer({ lamp: "off" }),
      ],
      "",
    );
    const lamp = (i: number): string =>
      q(bay(bays, i), ".board-lamp").style.backgroundPositionX;
    expect(lamp(0)).toBe("-40px");
    expect(lamp(1)).toBe("-80px");
    expect(lamp(2)).toBe("0px");
    bays.render([troubled("cart"), drill(), borer()], "");
    expect(lamp(0)).toBe("-120px");
  });

  describe("the flaps", () => {
    it("shows two flaps under a hundred and three from it", () => {
      const { bays } = make();
      bays.render([cart({ count: 6 }), drill({ count: 120 }), borer()], "");
      const two = bay(bays, 0);
      expect(digits(two)).toEqual(["", "6"]);
      expect(two.querySelectorAll(".board-flap-m")).toHaveLength(1);
      const three = bay(bays, 1);
      expect(digits(three)).toEqual(["1", "2", "0"]);
      expect(three.querySelectorAll(".board-flap-m")).toHaveLength(2);
      expect(three.classList.contains("is-three")).toBe(true);
      expect(two.classList.contains("is-three")).toBe(false);
    });

    it("places each digit's window", () => {
      const { bays } = make();
      bays.render([cart({ count: 120 }), drill(), borer()], "");
      const ks = [
        ...bay(bays, 0).querySelectorAll<HTMLElement>(".board-flap-d"),
      ].map((d) => d.style.getPropertyValue("--k"));
      expect(ks).toEqual(["0", "1", "2"]);
    });

    it("flips only the digit that changed", () => {
      const { bays } = make();
      bays.render([cart({ count: 6 }), drill(), borer()], "");
      expect(flipping(bay(bays, 0))).toEqual([false, false]);
      bays.render([cart({ count: 7 }), drill(), borer()], "");
      expect(digits(bay(bays, 0))).toEqual(["", "7"]);
      expect(flipping(bay(bays, 0))).toEqual([false, true]);
    });

    it("flips every changed digit when a third flap arrives", () => {
      const { bays } = make();
      bays.render([cart({ count: 99 }), drill(), borer()], "");
      bays.render([cart({ count: 100 }), drill(), borer()], "");
      expect(digits(bay(bays, 0))).toEqual(["1", "0", "0"]);
      expect(flipping(bay(bays, 0))).toEqual([true, true, true]);
    });

    it("never flips on the first render, a tier swap, or under reduced motion", () => {
      const first = make();
      first.bays.render([cart({ count: 6 }), drill({ count: 7 }), borer()], "");
      expect(first.bays.root.querySelectorAll(".is-flipping")).toHaveLength(0);

      // C2: the Great Machine goes on sale, and the first bay becomes the drill.
      const before = [...first.bays.bays];
      first.bays.render([drill({ count: 8 }), borer(), machine()], "");
      expect(digits(bay(first.bays, 0))).toEqual(["", "8"]);
      expect(first.bays.root.querySelectorAll(".is-flipping")).toHaveLength(0);
      // The same buttons, so their listeners did not double.
      expect(first.bays.bays).toEqual(before);
      before.forEach((b, i) => {
        expect(b).toBe(bay(first.bays, i));
      });
      bay(first.bays, 2).click();
      expect(first.onOpen).toHaveBeenCalledTimes(1);
      first.bays.render([troubled("drill"), borer(), machine()], "");
      bay(first.bays, 0).click();
      expect(first.onTrouble).toHaveBeenCalledTimes(1);
      expect(first.onOpen).toHaveBeenCalledTimes(1);

      document.body.replaceChildren();
      motion(true);
      const calm = make();
      calm.bays.render([cart({ count: 6 }), drill(), borer()], "");
      calm.bays.render([cart({ count: 7 }), drill(), borer()], "");
      expect(calm.bays.root.querySelectorAll(".is-flipping")).toHaveLength(0);
    });

    it("lets a finished flip go", () => {
      const { bays } = make();
      bays.render([cart({ count: 6 }), drill(), borer()], "");
      bays.render([cart({ count: 7 }), drill(), borer()], "");
      const d = bay(bays, 0).querySelectorAll(".board-flap-d")[1];
      d?.dispatchEvent(new Event("animationend", { bubbles: true }));
      expect(flipping(bay(bays, 0))).toEqual([false, false]);
    });
  });

  describe("taps", () => {
    it("opens Buys from an open bay", () => {
      const { bays, onOpen, onTrouble } = make();
      bays.render(early(), "");
      bay(bays, 0).click();
      expect(onOpen).toHaveBeenCalledWith(bay(bays, 0));
      expect(onTrouble).not.toHaveBeenCalled();
    });

    it("opens Buys from a locked bay", () => {
      const { bays, onOpen } = make();
      bays.render(early(), "");
      bay(bays, 2).click();
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("presses a troubled bay instead of opening Buys", () => {
      const { bays, note, onOpen, onTrouble } = make();
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      const b = bay(bays, 0);
      expect(b.getAttribute("data-trouble")).toBe("cave-in");
      expect(b.getAttribute("aria-label")).toBe(
        "Cave-in! The mine carts need a hand. Tap a few times, or hold, to help.",
      );
      expect(q(b, ".board-bay-sub").textContent).toBe("Cave-in! · Hold to fix");
      b.click();
      expect(onTrouble).toHaveBeenCalledWith("cart", "press");
      expect(onOpen).not.toHaveBeenCalled();
      // The trouble is still there: no thanks.
      expect(thanking(note)).toBe(false);
    });

    it("fixes on a hold, and the click that ends it does nothing", () => {
      const { bays, note, onOpen, onTrouble } = make();
      onTrouble.mockReturnValue(true);
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      const b = bay(bays, 0);
      pointer(b, "pointerdown");
      vi.advanceTimersByTime(FIX_HOLD_MS);
      expect(onTrouble).toHaveBeenCalledWith("cart", "hold");
      expect(thanking(note)).toBe(true);
      pointer(b, "pointerup");
      b.click();
      expect(onTrouble).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("opens Buys once an engineer has fixed it", () => {
      const { bays, onOpen, onTrouble } = make();
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      bays.render(early(), "");
      const b = bay(bays, 0);
      expect(b.hasAttribute("data-trouble")).toBe(false);
      b.click();
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onTrouble).not.toHaveBeenCalled();
    });

    it("a fix shows the thanks on the bay and it goes after 1.6s", () => {
      const { bays, note, onTrouble, advance } = make();
      onTrouble.mockReturnValue(true);
      bays.render([drill(), troubled("borer"), machine()], "");
      bay(bays, 1).click();
      expect(thanking(note)).toBe(true);
      // The thanks lets taps through to the bays under it.
      expect(note.note.querySelector("p.board-thanks")).not.toBeNull();
      advance(THANKS_MS - 1);
      expect(thanking(note)).toBe(true);
      advance(1);
      expect(note.note.classList.contains("on")).toBe(false);
    });

    it("a note put away by a tap is not shown again on a later repaint", () => {
      const { bays, note, onTrouble, advance } = make();
      onTrouble.mockReturnValue(true);
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      bay(bays, 0).click();
      expect(thanking(note)).toBe(true);
      // A tap on the drill bay puts the note away, and its press wakes every painter.
      fingerTap(bay(bays, 1));
      expect(note.note.classList.contains("on")).toBe(false);
      advance(100);
      bay(bays, 2).click();
      expect(note.note.classList.contains("on")).toBe(false);
      advance(THANKS_MS);
      expect(note.note.classList.contains("on")).toBe(false);
    });

    it("a vein note that replaced the thanks is not hidden when the thanks ends", () => {
      const { bays, note, stage, onTrouble, advance } = make();
      onTrouble.mockReturnValue(true);
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      bay(bays, 0).click();
      expect(thanking(note)).toBe(true);
      const vein = document.createElement("p");
      vein.textContent = "A rich vein";
      note.show(stage, vein, { ms: 6000 });
      advance(THANKS_MS);
      expect(note.note.classList.contains("on")).toBe(true);
      expect(note.note.textContent).toBe("A rich vein");
    });

    it("a second fix inside the thanks shows it again", () => {
      const { bays, note, onTrouble, advance } = make();
      onTrouble.mockReturnValue(true);
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      bay(bays, 0).click();
      note.hide();
      advance(500);
      bay(bays, 0).click();
      expect(thanking(note)).toBe(true);
      // The second fix's thanks runs its own full time.
      advance(THANKS_MS - 1);
      expect(thanking(note)).toBe(true);
      advance(1);
      expect(note.note.classList.contains("on")).toBe(false);
    });

    it("an open-Buys tap right after a finger closed a drawer opens nothing", () => {
      const { bays, board, onOpen, advance } = make();
      bays.render(early(), "");
      board.send({ kind: "open", overlay: "buys", at: 0 });
      advance(500);
      // The double tap on Back: its second tap lands on the bay under it.
      board.send({ kind: "close", overlay: "buys", at: 500, by: "finger" });
      advance(150);
      fingerTap(bay(bays, 0));
      expect(onOpen).not.toHaveBeenCalled();
      advance(400);
      fingerTap(bay(bays, 0));
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("a trouble tap right after a finger closed a drawer still presses", () => {
      const { bays, board, onTrouble, advance } = make();
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      board.send({ kind: "open", overlay: "buys", at: 0 });
      advance(500);
      board.send({ kind: "close", overlay: "buys", at: 500, by: "finger" });
      advance(150);
      fingerTap(bay(bays, 0));
      expect(onTrouble).toHaveBeenCalledWith("cart", "press");
    });

    it("a 6th tap after a 5-tap fix opens Buys", () => {
      const { bays, onOpen, onTrouble } = make();
      let taps = 0;
      onTrouble.mockImplementation(() => {
        taps += 1;
        return taps === 5;
      });
      bays.render([troubled("cart"), drill(), lockedBorer], "");
      for (let tap = 0; tap < 5; tap += 1) {
        fingerTap(bay(bays, 0));
      }
      expect(onTrouble).toHaveBeenCalledTimes(5);
      expect(onOpen).not.toHaveBeenCalled();
      // The store has no trouble now, so the screen draws the bay calm.
      bays.render(early(), "");
      fingerTap(bay(bays, 0));
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("builds each bay once, so re-renders never pile up listeners", () => {
      const { bays, onTrouble } = make();
      const first = bay(bays, 0);
      for (let n = 0; n < 5; n++) {
        bays.render([troubled("cart"), drill(), lockedBorer], "");
      }
      expect(bay(bays, 0)).toBe(first);
      first.click();
      expect(onTrouble).toHaveBeenCalledTimes(1);
    });

    it("shows only frames, art and dark lamps before the save is in", () => {
      const { bays, onOpen } = make();
      bays.render(undefined, "");
      for (const el of bays.bays) {
        expect(el.disabled).toBe(true);
        expect(digits(el).join("")).toBe("");
        expect(q(el, ".board-bay-name").textContent).toBe("");
        expect(q(el, ".board-bay-sub").textContent).toBe("");
        expect(q(el, ".board-bay-price-lg").textContent).toBe("");
        expect(q(el, ".board-bay-tag").textContent).toBe("");
        expect(q(el, ".board-lamp").style.backgroundPositionX).toBe("0px");
        expect(el.querySelector(".board-bay-icon")).not.toBeNull();
      }
      expect(q(bays.root, ".board-band").textContent).toBe("");
      bay(bays, 0).click();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("shows the start bays' art again when the save goes away", () => {
      const { bays } = make();
      bays.render([drill(), borer(), machine()], "");
      bays.render(undefined, "");
      const b = bay(bays, 2);
      expect(b.getAttribute("data-tier")).toBe("borer");
      expect(iconSrc(b)).toContain("mach-borer-tarp");
      expect(bay(bays, 0).getAttribute("data-tier")).toBe("cart");
      expect(iconSrc(bay(bays, 0))).toContain("mach-cart");
      expect(bay(bays, 1).getAttribute("data-tier")).toBe("drill");
      expect(iconSrc(bay(bays, 1))).toContain("drill-run");
    });

    it("enables the bays once the save is in", () => {
      const { bays } = make();
      bays.render(undefined, "");
      bays.render(early(), "");
      expect(bays.bays.every((b) => !b.disabled)).toBe(true);
    });
  });

  describe("ticks", () => {
    const drillIcon = (bays: MachineBays): string =>
      q(bay(bays, 1), ".board-bay-icon").style.backgroundPositionX;

    it("steps the drill a frame every 0.18s while drills are owned", () => {
      const { bays } = make();
      bays.render(early(), "");
      expect(drillIcon(bays)).toBe("0px");
      bays.tick(0.1);
      expect(drillIcon(bays)).toBe("0px");
      bays.tick(0.08);
      expect(drillIcon(bays)).toBe("-64px");
      bays.tick(0.18 * 3);
      expect(drillIcon(bays)).toBe("0px");
    });

    it("holds the drill still with none owned, in trouble, or under reduced motion", () => {
      const none = make();
      none.bays.render([cart(), drill({ count: 0 }), lockedBorer], "");
      none.bays.tick(0.18);
      expect(drillIcon(none.bays)).toBe("0px");

      const flooded = make();
      flooded.bays.render([cart(), troubled("drill"), lockedBorer], "");
      flooded.bays.tick(0.18);
      expect(drillIcon(flooded.bays)).toBe("0px");

      motion(true);
      const calm = make();
      calm.bays.render(early(), "");
      calm.bays.tick(0.18);
      expect(drillIcon(calm.bays)).toBe("0px");
    });

    it("follows the drill when it moves to the first bay", () => {
      const { bays } = make();
      bays.render([drill(), borer(), machine()], "");
      bays.tick(0.18);
      expect(q(bay(bays, 0), ".board-bay-icon").style.backgroundPositionX).toBe(
        "-64px",
      );
    });
  });
});
