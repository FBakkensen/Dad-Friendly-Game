// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth, type AuthController } from "./auth";
import { DRAWER_SETTLE_MS } from "./board-drawer";
import { READY_HOLD_MS } from "./board-interaction";
import { createBoardHost } from "./board-host";
import { RELIC_DARK, RELIC_LIT } from "./board-relics";
import { type CloudSave } from "./cloud-save";
import { createLedgerPanel } from "./ledger-panel";
import { relicsRowView, stonesRowView } from "./ledger-rows";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
} from "./mountain-screen.harness";
import { createProgressStore } from "./progress-store";
import { writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The Ledger drawer on the mounted screen (#375): its parts in order, Tonight, the mine's two
 * rows, the account row, the four plates and the two pages, each press through the board's
 * model (the settle, the page's settle, the Copied hold), and its doors.
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

const CLOCK = 1_700_000_000_000;
const PAST_SETTLE = DRAWER_SETTLE_MS + 100;

type Screen = ReturnType<typeof mountScreen>;

function mount(
  mountain: Mountain,
  {
    now = () => CLOCK,
    tapClock,
    auth,
  }: {
    now?: () => number;
    tapClock?: () => number;
    auth?: AuthController;
  } = {},
): Screen {
  const storage = createMemoryStorage();
  writeSessionSave({ storage, mountain, lastSeen: now() });
  const screen = mountScreen({
    storage,
    now,
    ...(tapClock === undefined ? {} : { tapClock }),
    ...(auth === undefined ? {} : { auth }),
  });
  document.body.append(screen.root);
  return screen;
}

/** A Granite mountain with clay and iron met and two relics found. */
function granite(over: Partial<Mountain> = {}): Mountain {
  return {
    ...minedMountain(12_000_000),
    helpers: 4,
    materials: { clay: 10, iron: 4, crystal: 0, heartstone: 0 },
    ...over,
  };
}

const ledgerOf = (screen: Screen): HTMLElement => {
  const found = screen.root.querySelector<HTMLElement>(
    '.board-sheet[data-sheet="ledger"]',
  );
  if (found === null) throw new Error("no Ledger drawer");
  return found;
};
const isOpen = (screen: Screen, name = "ledger"): boolean =>
  screen.root
    .querySelector(`.board-sheet[data-sheet="${name}"]`)
    ?.classList.contains("is-open") === true;
const keyOf = (screen: Screen, id = "ledger"): HTMLButtonElement => {
  const found = screen.root.querySelector(`.board-key[data-key="${id}"]`);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${id} key`);
  return found;
};
const part = (screen: Screen, selector: string): HTMLElement => {
  const found = ledgerOf(screen).querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`);
  return found;
};
const button = (screen: Screen, selector: string): HTMLButtonElement => {
  const found = part(screen, selector);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`${selector}?`);
  return found;
};
const rowPart = (screen: Screen, row: string, name: string) =>
  part(screen, `.ledger-${row}`).querySelector<HTMLElement>(
    `.board-row-${name}`,
  )?.textContent;
const plateWords = (plate: HTMLElement) =>
  plate.querySelector(".board-platebtn-text")?.textContent;
const fingerTap = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
};
const escape = (): void => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
};
/** The page the drawer shows in its list's place, if any. */
const shownPage = (screen: Screen): HTMLElement | null =>
  ledgerOf(screen).querySelector<HTMLElement>(
    ".board-sheet-page:not([hidden]) > .ledger-page",
  );

const clipboard = (value: unknown): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(navigator, "clipboard");
      return;
    }
    Object.defineProperty(navigator, "clipboard", previous);
  };
};

describe("the Ledger drawer (#375)", () => {
  it("the Ledger key opens a board drawer", () => {
    const screen = mount(granite());
    keyOf(screen).click();
    expect(isOpen(screen)).toBe(true);
    expect(screen.root.querySelector(".game-menu")).toBeNull();
    const list = part(screen, ".board-sheet-list");
    const order = [...list.children]
      .filter((each) => !(each as HTMLElement).hidden)
      .filter((each) => !each.classList.contains("board-spare"))
      .map(
        (each) =>
          (each as HTMLElement).dataset["sec"] ??
          (each as HTMLElement).dataset["ledger"] ??
          each.className.split(" ")[0],
      );
    expect(order).toEqual([
      "mine",
      "stones",
      "relics",
      "account",
      "ledger-doors",
    ]);
    expect(part(screen, ".board-sheet-title").textContent).toBe("Ledger");
    expect(part(screen, ".board-sheet-kick").textContent).toBe(
      "Tonight, and the mine so far",
    );
    expect(keyOf(screen).getAttribute("aria-expanded")).toBe("true");
    // The "i": Time away, then Relics, under Back to the Ledger.
    part(screen, ".board-sheet-info").click();
    const how = part(screen, ".board-sheet-how");
    expect(how.hidden).toBe(false);
    expect(how.children).toHaveLength(2);
    expect(how.textContent).toContain("Back to the Ledger");
  });

  it("Tonight shows the newest three lines", () => {
    const screen = mount(granite({ pocket: 900_000_000, drills: 1, carts: 2 }));
    keyOf(screen).click();
    // With nothing worded, the legend and the box hide.
    expect(part(screen, '.board-sec[data-sec="tonight"]').hidden).toBe(true);
    expect(part(screen, ".ledger-log").hidden).toBe(true);
    part(screen, ".board-sheet-back").click();

    screen.progress.dispatch({ kind: "buyTier", id: "helper" });
    screen.progress.dispatch({ kind: "buyTier", id: "cart" });
    screen.progress.dispatch({ kind: "buyBoost", id: "overtime" });
    keyOf(screen).click();
    expect(part(screen, '.board-sec[data-sec="tonight"]').hidden).toBe(false);
    const lines = [
      ...part(screen, ".ledger-log").querySelectorAll<HTMLElement>(
        ".ledger-log-line:not([hidden])",
      ),
    ];
    expect(
      lines.map((line) => line.querySelector(".ledger-log-text")?.textContent),
    ).toEqual([
      "Overtime started for 30:00.",
      "Bought mine cart 3.",
      "Hired worker 5.",
    ]);
    for (const line of lines) {
      expect(line.querySelector(".ledger-log-time")?.textContent).toMatch(
        /^\d\d:\d\d$/,
      );
    }
  });

  it("the mine reads today's words", () => {
    const mountain = granite();
    const screen = mount(mountain);
    keyOf(screen).click();
    const stones = stonesRowView(mountain);
    expect(rowPart(screen, "stones", "name")).toBe(stones.name);
    expect(stones.name).toMatch(/^[\d.,]+[KMBT]? stones left$/);
    expect(part(screen, ".ledger-stones").getAttribute("title")).toBe(
      stones.title,
    );
    expect(rowPart(screen, "stones", "info")).toBe("Clay 10 · Iron 4");
    expect(
      (part(screen, ".ledger-stones .board-row-icon") as HTMLImageElement)
        .width,
    ).toBe(32);

    const relics = relicsRowView(mountain);
    expect(rowPart(screen, "relics", "name")).toBe("2 of 6 relics found");
    expect(rowPart(screen, "relics", "info")).toMatch(/^Next: /);
    expect(rowPart(screen, "relics", "why")).toBe(relics.why);
    const icon = part(
      screen,
      ".ledger-relics .board-row-icon",
    ) as HTMLImageElement;
    expect(icon.width).toBe(48);
    expect(icon.getAttribute("src")).toBe(RELIC_DARK[relics.icon]);
    const bar = part(screen, ".ledger-relics .board-row-bar");
    expect(bar.hidden).toBe(false);
    expect(bar.getAttribute("aria-valuenow")).toBe(
      String(Math.round((relics.progress ?? 0) * 100)),
    );
    expect(bar.getAttribute("aria-label")).toBe(relics.barLabel);
  });

  it("every relic found shows the lit Mantle and no bar", () => {
    const screen = mount(minedMountain(MOUNTAIN_STONES));
    keyOf(screen).click();
    expect(rowPart(screen, "relics", "name")).toBe("6 of 6 relics found");
    expect(rowPart(screen, "relics", "info")).toBe(
      "Every relic is yours. You are a legend.",
    );
    expect(
      part(screen, ".ledger-relics .board-row-icon").getAttribute("src"),
    ).toBe(RELIC_LIT.mantle);
    expect(part(screen, ".ledger-relics .board-row-bar").hidden).toBe(true);
  });

  it("a double tap on the key does nothing under the finger", () => {
    let clock = 10_000;
    const auth = createMemoryAuth();
    const signIn = vi.spyOn(auth, "signIn");
    const screen = mount(granite(), { tapClock: () => clock, auth });
    fingerTap(keyOf(screen));
    clock += 150;
    fingerTap(part(screen, ".ledger-account"));
    expect(signIn).not.toHaveBeenCalled();
    clock += 350;
    fingerTap(part(screen, ".ledger-account"));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("account signs in and out", () => {
    const auth = createMemoryAuth();
    const signOut = vi.spyOn(auth, "signOut");
    const screen = mount(granite(), { auth });
    keyOf(screen).click();
    expect(rowPart(screen, "account", "name")).toBe("Account");
    expect(rowPart(screen, "account", "info")).toBe("Not signed in");
    expect(rowPart(screen, "account", "verb")).toBe("Sign in");
    part(screen, ".ledger-account").click();
    expect(rowPart(screen, "account", "info")).toBe("Signed in as Test Dad");
    expect(rowPart(screen, "account", "verb")).toBe("Sign out");
    expect(part(screen, ".ledger-account").getAttribute("aria-label")).toBe(
      "Signed in as Test Dad. Sign out",
    );
    part(screen, ".ledger-account").click();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(rowPart(screen, "account", "info")).toBe("Not signed in");
  });

  it("a tap while signing in does nothing and does not blink", () => {
    const auth = createMemoryAuth({ state: { kind: "signing-in" } });
    const signIn = vi.spyOn(auth, "signIn");
    const signOut = vi.spyOn(auth, "signOut");
    const screen = mount(granite(), { auth });
    keyOf(screen).click();
    expect(rowPart(screen, "account", "info")).toBe("Signing in...");
    part(screen, ".ledger-account").click();
    expect(signIn).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(
      part(screen, ".ledger-account .board-lamp").style.backgroundPositionX,
    ).not.toBe("-120px");
  });

  it("start over asks on its page, and only past the settle", () => {
    let clock = 10_000;
    const screen = mount(granite(), { tapClock: () => clock });
    const before = screen.progress.getSnapshot().mountain;
    fingerTap(keyOf(screen));
    clock += PAST_SETTLE;
    fingerTap(part(screen, ".ledger-start-over"));
    expect(shownPage(screen)?.classList).toContain("ledger-start-over-page");
    expect(
      shownPage(screen)?.querySelector(".ledger-page-title")?.textContent,
    ).toBe("Start over?");
    expect(part(screen, ".board-sheet-list").hidden).toBe(true);
    // The second tap of the tap that opened the page lands on nothing.
    clock += 100;
    fingerTap(part(screen, ".ledger-yes"));
    expect(screen.progress.getSnapshot().mountain).toEqual(before);
    clock += PAST_SETTLE;
    fingerTap(part(screen, ".ledger-keep"));
    expect(shownPage(screen)).toBeNull();
    expect(part(screen, ".board-sheet-list").hidden).toBe(false);
    expect(isOpen(screen)).toBe(true);

    clock += PAST_SETTLE;
    fingerTap(part(screen, ".ledger-start-over"));
    clock += PAST_SETTLE;
    fingerTap(part(screen, ".ledger-yes"));
    const fresh = screen.progress.getSnapshot().mountain;
    expect(fresh.pocket).toBe(0);
    expect(fresh.helpers).toBe(0);
    expect(fresh.remaining).toBe(createMountain().remaining);
    expect(isOpen(screen)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen));
  });

  it("the Start over page is a group named by its title and described by its warning", () => {
    const screen = mount(granite());
    keyOf(screen).click();
    // The account row tells a sign-in or sign-out as it lands.
    expect(
      part(screen, ".ledger-account .board-row-info").getAttribute("aria-live"),
    ).toBe("polite");
    part(screen, ".ledger-start-over").click();
    const page = shownPage(screen);
    expect(page?.getAttribute("role")).toBe("group");
    const named = (attr: string) =>
      document.getElementById(page?.getAttribute(attr) ?? "")?.textContent;
    expect(named("aria-labelledby")).toBe("Start over?");
    expect(named("aria-describedby")).toBe(
      page?.querySelector(".ledger-page-line")?.textContent,
    );
    expect(named("aria-describedby")).toMatch(/undone/);
  });

  it("copy field log holds Copied", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const restore = clipboard({ writeText });
    try {
      let clock = 10_000;
      const screen = mount(granite(), { tapClock: () => clock });
      fingerTap(keyOf(screen));
      clock += PAST_SETTLE;
      const copy = button(screen, ".ledger-field-log");
      fingerTap(copy);
      await vi.advanceTimersByTimeAsync(0);
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(plateWords(copy)).toBe("Copied");
      // A second press in the hold copies nothing.
      clock += 300;
      fingerTap(copy);
      await vi.advanceTimersByTimeAsync(0);
      expect(writeText).toHaveBeenCalledTimes(1);
      clock += READY_HOLD_MS;
      await vi.advanceTimersByTimeAsync(READY_HOLD_MS);
      expect(plateWords(copy)).toBe("Copy field log");
      expect(screen.root.querySelector(".copied-float")).toBeNull();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("a missing clipboard shows the log on its page, and Back closes the drawer", async () => {
    const restore = clipboard(undefined);
    try {
      const screen = mount(granite());
      keyOf(screen).click();
      part(screen, ".ledger-field-log").click();
      await vi.waitFor(() => {
        expect(shownPage(screen)?.classList).toContain("ledger-field-log-page");
      });
      expect(
        (part(screen, ".ledger-field-log-text") as HTMLTextAreaElement).value,
      ).toMatch(/^\{/);
      part(screen, ".board-sheet-back").click();
      expect(isOpen(screen)).toBe(false);
      expect(shownPage(screen)).toBeNull();
    } finally {
      restore();
    }
  });

  it("saved copies and pass the mine open today's cards", () => {
    const screen = mount(granite());
    keyOf(screen).click();
    expect(part(screen, ".ledger-pass").hidden).toBe(true);
    part(screen, ".ledger-saved-copies").click();
    expect(isOpen(screen)).toBe(false);
    expect(
      screen.root.querySelector<HTMLElement>(".saved-copies")?.hidden,
    ).toBe(false);

    const done = mount(minedMountain(MOUNTAIN_STONES));
    keyOf(done).click();
    expect(part(done, ".ledger-pass").hidden).toBe(false);
    part(done, ".ledger-pass").click();
    expect(isOpen(done)).toBe(false);
    expect(done.root.querySelector<HTMLElement>(".legacy-dialog")?.hidden).toBe(
      false,
    );
  });

  it("one drawer at a time", () => {
    const screen = mount(granite());
    keyOf(screen).click();
    keyOf(screen, "buys").click();
    expect(isOpen(screen)).toBe(false);
    expect(isOpen(screen, "buys")).toBe(true);
    keyOf(screen).click();
    expect(isOpen(screen, "buys")).toBe(false);
    expect(isOpen(screen)).toBe(true);
    keyOf(screen, "upgrades").click();
    expect(isOpen(screen)).toBe(false);
    keyOf(screen).click();
    expect(isOpen(screen, "upgrades")).toBe(false);
  });

  /** A signed-in screen whose cloud reads wait while `held`, until `release`. */
  const reloading = () => {
    const gate = { held: false };
    const waiting: (() => void)[] = [];
    const cloudSave: CloudSave = {
      load: () =>
        gate.held
          ? new Promise((resolve) => {
              waiting.push(() => {
                resolve({ kind: "missing" });
              });
            })
          : Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      // The save is in once the watch hears the cloud.
      watch: ({ onChange }) => {
        const hear = (): void => {
          onChange({ kind: "missing" });
        };
        if (gate.held) {
          waiting.push(hear);
        } else {
          queueMicrotask(hear);
        }
        return () => undefined;
      },
    };
    const auth = createMemoryAuth({
      state: { kind: "signed-in", user: { uid: "test-dad", label: "Dad" } },
    });
    const screen = mountScreen({ auth, cloudSave, now: () => CLOCK });
    document.body.append(screen.root);
    const release = (): void => {
      gate.held = false;
      for (const each of waiting.splice(0)) {
        each();
      }
    };
    return { screen, auth, gate, release };
  };

  it("while the save loads again", async () => {
    const { screen, auth, gate } = reloading();
    await vi.waitFor(() => {
      expect(screen.progress.getSnapshot().ready).toBe(true);
    });
    keyOf(screen).click();
    part(screen, ".ledger-start-over").click();
    expect(button(screen, ".ledger-yes").disabled).toBe(false);
    // The same account comes in again: its save loads again.
    gate.held = true;
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(isOpen(screen)).toBe(true);
    // The page stays, with Yes disabled.
    expect(shownPage(screen)?.classList).toContain("ledger-start-over-page");
    expect(button(screen, ".ledger-yes").disabled).toBe(true);
    part(screen, ".ledger-keep").click();
    expect(part(screen, ".ledger-stones").classList).not.toContain("is-owned");
    expect(part(screen, ".ledger-stones").hasAttribute("title")).toBe(false);
    expect(part(screen, ".ledger-relics .board-row-bar").hidden).toBe(true);
    expect(button(screen, ".ledger-start-over").disabled).toBe(true);
    expect(button(screen, ".ledger-field-log").disabled).toBe(true);
    expect(button(screen, ".ledger-saved-copies").disabled).toBe(false);
    const account = button(screen, ".ledger-account");
    expect(account.disabled).toBe(false);
    const signOut = vi.spyOn(auth, "signOut");
    account.click();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("the Start over page gives the list back once the save is in again", async () => {
    const { screen, auth, gate, release } = reloading();
    await vi.waitFor(() => {
      expect(screen.progress.getSnapshot().ready).toBe(true);
    });
    keyOf(screen).click();
    part(screen, ".ledger-start-over").click();
    gate.held = true;
    await auth.signIn();
    await Promise.resolve();
    expect(shownPage(screen)?.classList).toContain("ledger-start-over-page");
    release();
    await vi.waitFor(() => {
      expect(screen.progress.getSnapshot().ready).toBe(true);
    });
    expect(shownPage(screen)).toBeNull();
    expect(part(screen, ".board-sheet-list").hidden).toBe(false);
    expect(isOpen(screen)).toBe(true);
  });

  it("the Start over page gives the list back when the account changes", async () => {
    const auth = createMemoryAuth();
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: granite(), lastSeen: CLOCK });
    const screen = mountScreen({ auth, cloudSave, storage, now: () => CLOCK });
    document.body.append(screen.root);
    keyOf(screen).click();
    part(screen, ".ledger-start-over").click();
    expect(shownPage(screen)?.classList).toContain("ledger-start-over-page");
    await auth.signIn();
    expect(shownPage(screen)).toBeNull();
    expect(part(screen, ".board-sheet-list").hidden).toBe(false);
    expect(isOpen(screen)).toBe(true);
  });

  it("a clipboard that answers after the drawer shut shows nothing and leaves focus", async () => {
    let refuse: (() => void) | undefined;
    const restore = clipboard({
      writeText: () =>
        new Promise<void>((_resolve, reject) => {
          refuse = () => {
            reject(new Error("refused"));
          };
        }),
    });
    try {
      const screen = mount(granite());
      keyOf(screen).click();
      part(screen, ".ledger-field-log").click();
      escape();
      expect(isOpen(screen)).toBe(false);
      expect(document.activeElement).toBe(keyOf(screen));
      refuse?.();
      await vi.waitFor(() => {
        expect(refuse).toBeDefined();
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(shownPage(screen)).toBeNull();
      expect(part(screen, ".board-sheet-list").hidden).toBe(false);
      expect(document.activeElement).toBe(keyOf(screen));
    } finally {
      restore();
    }
  });

  it("Escape and the scrim close it, on the list and on the Start over page", () => {
    const screen = mount(granite());
    keyOf(screen).click();
    escape();
    expect(isOpen(screen)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen));

    keyOf(screen).click();
    part(screen, ".ledger-start-over").click();
    escape();
    expect(isOpen(screen)).toBe(false);
    // The page goes with the drawer: the next open is on the list.
    keyOf(screen).click();
    expect(shownPage(screen)).toBeNull();

    screen.root.querySelector<HTMLElement>(".board-scrim")?.click();
    expect(isOpen(screen)).toBe(false);
    keyOf(screen).click();
    part(screen, ".ledger-start-over").click();
    screen.root.querySelector<HTMLElement>(".board-scrim")?.click();
    expect(isOpen(screen)).toBe(false);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(4);
  });
});

describe("the Ledger panel on its own", () => {
  it("stops following the account once its signal aborts", async () => {
    const stop = new AbortController();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      sessionStorage: createMemoryStorage(),
      now: () => CLOCK,
    });
    const door = document.createElement("button");
    const ledger = createLedgerPanel({
      progress,
      getView: progress.getSnapshot,
      auth,
      board: createBoardHost({ clock: () => 0, reduced: () => true }),
      overSave: () => false,
      door,
      legacy: { offered: () => false, open: () => undefined },
      savedCopies: { open: () => undefined },
      onStartOver: () => undefined,
      signal: stop.signal,
    });
    document.body.append(ledger.sheet.root);
    const accountWords = () =>
      ledger.sheet.root.querySelector(".ledger-account")?.textContent;
    const before = accountWords();
    expect(before).toContain("Sign in");
    stop.abort();
    await auth.signIn();
    expect(accountWords()).toBe(before);
    progress.dispose();
  });
});
