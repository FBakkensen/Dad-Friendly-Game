// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardHost, type BoardHost } from "./board-host";
import { createKeyRail, type KeyRail } from "./board-keys";
import { KEY_IDS, type KeyId, type KeyView } from "./key-rail";

const rest = (aria: string): KeyView => ({
  cap: "rest",
  sub: "",
  dot: false,
  aria,
});

const views = (
  over: Partial<Record<KeyId, KeyView>> = {},
): Readonly<Record<KeyId, KeyView>> => ({
  buys: rest("Buys"),
  workshop: rest("Workshop"),
  engineers: rest("Engineers"),
  upgrades: rest("Upgrades"),
  ledger: rest("Ledger"),
  ...over,
});

const LOCKED_ENGINEERS: KeyView = {
  cap: "locked",
  sub: "With 1st borer",
  dot: false,
  aria: "Engineers, locked until the first tunnel borer",
};

/** A board on a clock the test moves, with no press waiting in the queue. */
const host = (now: { value: number } = { value: 0 }): BoardHost =>
  createBoardHost({
    clock: () => now.value,
    pressAge: () => 0,
    reduced: () => false,
  });

const rail = (onKey = vi.fn(), board = host()): KeyRail =>
  createKeyRail({ board, onKey });

afterEach(() => {
  document.body.replaceChildren();
});

const cap = (key: HTMLElement): HTMLElement =>
  key.querySelector<HTMLElement>(".board-key-cap") as HTMLElement;
const icon = (key: HTMLElement): HTMLImageElement =>
  key.querySelector<HTMLImageElement>(".board-key-icon") as HTMLImageElement;
const dot = (key: HTMLElement): HTMLElement =>
  key.querySelector<HTMLElement>(".board-key-dot") as HTMLElement;
const sub = (key: HTMLElement): HTMLElement =>
  key.querySelector<HTMLElement>(".board-key-sub") as HTMLElement;

const press = (key: HTMLElement, type: string): void => {
  key.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
};

/** A finger's tap: down, up and the click, which has a pointer (detail 1). */
const fingerTap = (key: HTMLElement): void => {
  press(key, "pointerdown");
  press(key, "pointerup");
  key.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

describe("the key rail (#373)", () => {
  it("builds five keys in KEY_IDS order with the views' labels", () => {
    const made = rail();
    expect(made.root.tagName).toBe("NAV");
    expect(made.root.classList.contains("board-rail")).toBe(true);
    expect(made.root.getAttribute("aria-label")).toBe("Actions");
    made.render(
      views({
        upgrades: { ...rest("Upgrades, one is affordable"), cap: "lit" },
      }),
    );
    const keys = [
      ...made.root.querySelectorAll<HTMLButtonElement>("button.board-key"),
    ];
    expect(keys.map((key) => key.dataset["key"])).toEqual([...KEY_IDS]);
    expect(keys.map((key) => key.getAttribute("aria-label"))).toEqual([
      "Buys",
      "Workshop",
      "Engineers",
      "Upgrades, one is affordable",
      "Ledger",
    ]);
    expect(
      keys.map((key) => key.querySelector(".board-key-name")?.textContent),
    ).toEqual(["Buys", "Workshop", "Engineers", "Upgrades", "Ledger"]);
    for (const id of KEY_IDS) {
      expect(made.keys[id]).toBe(keys[KEY_IDS.indexOf(id)]);
      expect(made.keys[id].type).toBe("button");
      expect(
        made.keys[id]
          .querySelector(".board-key-name")
          ?.classList.contains("board-lg"),
      ).toBe(true);
    }
  });

  it("locks a key: disabled, the dim icon, the off cap and its unlock line", () => {
    const made = rail();
    made.render(views({ engineers: LOCKED_ENGINEERS }));
    const key = made.keys.engineers;
    expect(key.disabled).toBe(true);
    expect(key.classList.contains("is-locked")).toBe(true);
    expect(icon(key).getAttribute("src")).toContain("icon-engineers-dim");
    expect(cap(key).style.backgroundPositionX).toBe("-128px");
    expect(sub(key).hidden).toBe(false);
    expect(sub(key).textContent).toBe("With 1st borer");
    expect(key.classList.contains("has-sub")).toBe(true);
    // Unlocked again: bright, enabled, the rest cap.
    made.render(views());
    expect(key.disabled).toBe(false);
    expect(key.classList.contains("is-locked")).toBe(false);
    expect(icon(key).getAttribute("src")).not.toContain("-dim");
    expect(cap(key).style.backgroundPositionX).toBe("0px");
    expect(sub(key).hidden).toBe(true);
    expect(key.classList.contains("has-sub")).toBe(false);
  });

  it("lights a cap on frame 3", () => {
    const made = rail();
    made.render(views({ upgrades: { ...rest("Upgrades"), cap: "lit" } }));
    expect(cap(made.keys.upgrades).style.backgroundPositionX).toBe("-192px");
    expect(made.keys.upgrades.classList.contains("is-lit")).toBe(true);
    expect(made.keys.buys.classList.contains("is-lit")).toBe(false);
  });

  it("presses the cap down, and back to the view's frame on release", () => {
    const made = rail();
    made.render(views({ upgrades: { ...rest("Upgrades"), cap: "lit" } }));
    const key = made.keys.upgrades;
    press(key, "pointerdown");
    expect(cap(key).style.backgroundPositionX).toBe("-64px");
    expect(key.classList.contains("is-down")).toBe(true);
    // A render while held keeps the press frame.
    made.render(views({ upgrades: { ...rest("Upgrades"), cap: "lit" } }));
    expect(cap(key).style.backgroundPositionX).toBe("-64px");
    press(key, "pointerup");
    expect(cap(key).style.backgroundPositionX).toBe("-192px");
    expect(key.classList.contains("is-down")).toBe(false);
    for (const out of ["pointerleave", "pointercancel"]) {
      press(made.keys.buys, "pointerdown");
      expect(cap(made.keys.buys).style.backgroundPositionX).toBe("-64px");
      press(made.keys.buys, out);
      expect(cap(made.keys.buys).style.backgroundPositionX).toBe("0px");
    }
  });

  it("shows the red dot lamp only while a view asks", () => {
    const made = rail();
    made.render(views({ buys: { ...rest("Buys"), dot: true } }));
    expect(dot(made.keys.buys).hidden).toBe(false);
    expect(dot(made.keys.buys).getAttribute("src")).toContain("key-dot");
    expect(dot(made.keys.workshop).hidden).toBe(true);
    made.render(views());
    expect(dot(made.keys.buys).hidden).toBe(true);
  });

  it("marks a clock sub-line as figures", () => {
    const made = rail();
    made.render(
      views({
        workshop: { ...rest("Workshop, bench 4:12 left"), sub: "4:12" },
      }),
    );
    expect(sub(made.keys.workshop).textContent).toBe("4:12");
    expect(sub(made.keys.workshop).classList.contains("board-num")).toBe(true);
    made.render(views({ engineers: LOCKED_ENGINEERS }));
    expect(sub(made.keys.engineers).classList.contains("board-num")).toBe(
      false,
    );
    expect(sub(made.keys.workshop).hidden).toBe(true);
  });

  it("before the save is in: rest caps, bright icons, no dot or sub, Workshop and Engineers held", () => {
    const made = rail();
    made.render(
      views({
        buys: { ...rest("Buys"), dot: true },
        engineers: LOCKED_ENGINEERS,
        upgrades: { ...rest("Upgrades"), cap: "lit" },
      }),
    );
    made.render(undefined);
    for (const id of KEY_IDS) {
      const key = made.keys[id];
      expect(dot(key).hidden).toBe(true);
      expect(sub(key).hidden).toBe(true);
      expect(sub(key).textContent).toBe("");
      expect(cap(key).style.backgroundPositionX).toBe("0px");
      expect(icon(key).getAttribute("src")).not.toContain("-dim");
      expect(key.classList.contains("is-lit")).toBe(false);
      expect(key.classList.contains("is-locked")).toBe(false);
      expect(key.disabled).toBe(id === "workshop" || id === "engineers");
    }
    // A fresh rail starts the same way.
    const fresh = rail();
    fresh.render(undefined);
    expect(fresh.keys.workshop.disabled).toBe(true);
    expect(fresh.keys.engineers.disabled).toBe(true);
    expect(fresh.keys.buys.disabled).toBe(false);
    expect(fresh.keys.ledger.getAttribute("aria-label")).toBe("Ledger");
  });

  it("calls onKey with the key on a click", () => {
    const onKey = vi.fn();
    const made = rail(onKey);
    made.render(views());
    press(made.keys.buys, "pointerdown");
    made.keys.buys.click();
    expect(onKey).toHaveBeenCalledWith("buys", made.keys.buys);
    expect(cap(made.keys.buys).style.backgroundPositionX).toBe("0px");
  });

  it("writes nothing on a repeat render", () => {
    const made = rail();
    const shown = views({
      workshop: {
        ...rest("Workshop, bench 4:12 left"),
        sub: "4:12",
        dot: true,
      },
      engineers: LOCKED_ENGINEERS,
      upgrades: { ...rest("Upgrades"), cap: "lit" },
    });
    made.render(shown);
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((records) => {
      seen.push(...records);
    });
    watch.observe(made.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    made.render(views({ ...shown }));
    made.render(shown);
    seen.push(...watch.takeRecords());
    watch.disconnect();
    expect(seen).toEqual([]);
  });

  describe("presses through the board", () => {
    /** A rail on the page whose board a finger closed Buys on at 1,000: settling up to 1,400. */
    const settled = () => {
      const now = { value: 1_000 };
      const board = host(now);
      board.send({ kind: "open", overlay: "buys", at: 0 });
      board.send({ kind: "close", overlay: "buys", at: 1_000, by: "finger" });
      const onKey = vi.fn();
      const made = rail(onKey, board);
      made.render(views());
      document.body.append(made.root);
      // A panel's own door listener, added after the rail's, as Engineers and the Ledger do.
      const door = vi.fn();
      made.keys.engineers.addEventListener("click", door);
      return { now, made, onKey, door };
    };

    it("a finger press on a key right after a finger closed a drawer reaches no listener", () => {
      const { now, made, onKey, door } = settled();
      now.value = 1_150;
      fingerTap(made.keys.engineers);
      fingerTap(made.keys.upgrades);
      expect(onKey).not.toHaveBeenCalled();
      expect(door).not.toHaveBeenCalled();
      // The press frame still lets go.
      expect(made.keys.engineers.classList.contains("is-down")).toBe(false);
      expect(cap(made.keys.engineers).style.backgroundPositionX).toBe("0px");
    });

    it("a keyboard press acts at once", () => {
      const { now, made, onKey, door } = settled();
      now.value = 1_150;
      made.keys.engineers.click();
      expect(onKey).toHaveBeenCalledWith("engineers", made.keys.engineers);
      expect(door).toHaveBeenCalledTimes(1);
    });

    it("past the settle, the key acts", () => {
      const { now, made, onKey, door } = settled();
      now.value = 1_400;
      fingerTap(made.keys.engineers);
      expect(onKey).toHaveBeenCalledWith("engineers", made.keys.engineers);
      expect(door).toHaveBeenCalledTimes(1);
    });

    it("judges a finger press by when its finger came down", () => {
      const { now, made, onKey } = settled();
      now.value = 1_150;
      press(made.keys.upgrades, "pointerdown");
      now.value = 1_600;
      made.keys.upgrades.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
      expect(onKey).not.toHaveBeenCalled();
    });
  });
});
