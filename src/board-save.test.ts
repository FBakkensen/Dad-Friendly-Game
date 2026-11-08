// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthController, AuthState } from "./auth";
import { createSaveLine } from "./board-save";
import { formatCompact } from "./format";
import { createMountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";

type Kind = ProgressSnapshot["saveKind"];

function setup(
  initial: {
    kind?: Kind;
    log?: string | undefined;
    auth?: AuthState;
    pocket?: number;
    at?: Date;
  } = {},
) {
  let view = {
    saveKind: initial.kind ?? "account",
    log: initial.log,
    mountain: { ...createMountain(), pocket: initial.pocket ?? 412_400 },
  } as unknown as ProgressSnapshot;
  let authState: AuthState = initial.auth ?? {
    kind: "signed-in",
    user: { uid: "u", label: "dad@example.com" },
  };
  const listeners = new Set<(s: AuthState) => void>();
  const order: string[] = [];
  let resumeResult: unknown = { kind: "idle" };
  const progress = {
    flush: vi.fn(() => order.push("flush")),
    resume: vi.fn(() => {
      order.push("resume");
      return resumeResult;
    }),
    tick: vi.fn(() => order.push("tick")),
  } as unknown as ProgressStore;
  const auth = {
    getState: () => authState,
    subscribe: (l: (s: AuthState) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    signIn: vi.fn(() => Promise.resolve()),
  } as unknown as AuthController;
  let clock = (initial.at ?? new Date(2026, 10, 8, 22, 13)).getTime();
  const s = createSaveLine({
    progress,
    auth,
    getView: () => view,
    now: () => clock,
  });
  document.body.append(s.line, s.drawer);
  s.render();
  return {
    ...s,
    progress,
    auth,
    order,
    status: must(s.line.querySelector<HTMLButtonElement>("button.save-status")),
    setView(next: { kind?: Kind; log?: string | undefined }) {
      view = {
        ...view,
        saveKind: next.kind ?? view.saveKind,
        log: next.log,
      };
    },
    setAuth(next: AuthState) {
      authState = next;
      listeners.forEach((l) => {
        l(next);
      });
    },
    setClock(d: Date) {
      clock = d.getTime();
    },
    setResume(next: unknown) {
      resumeResult = next;
    },
    buttons: () =>
      [...s.drawer.querySelectorAll<HTMLButtonElement>("button")].map((b) => b),
  };
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing");
  return value;
}

const lampX = (line: HTMLElement): string =>
  must(line.querySelector<HTMLElement>(".board-lamp")).style
    .backgroundPositionX;

describe("createSaveLine", () => {
  beforeEach(() => undefined);
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads today's words and data-kind for the five kinds", () => {
    const words: Readonly<Record<Kind, string>> = {
      unsigned: "Sign in to save",
      session: "Saved on this device",
      loading: "Loading your save...",
      account: "Saved to your account",
      error: "Couldn't reach your save",
    };
    for (const kind of Object.keys(words) as Kind[]) {
      const t = setup({ kind });
      expect(t.status.dataset["kind"]).toBe(kind);
      expect(t.status.querySelector(".board-save-words")?.textContent).toBe(
        words[kind],
      );
      if (kind !== "error") expect(t.status.textContent).toBe(words[kind]);
      document.body.innerHTML = "";
    }
  });

  it("mirrors view.log in data-log and removes it when undefined", () => {
    const t = setup({ kind: "error", log: "save.read · unreachable" });
    expect(t.status.dataset["log"]).toBe("save.read · unreachable");
    t.setView({ kind: "account", log: undefined });
    t.render();
    expect(t.status.hasAttribute("data-log")).toBe(false);
  });

  it("only error adds the kept-on-phone words and Details", () => {
    const err = setup({ kind: "error" });
    expect(err.status.textContent).toBe(
      "Couldn't reach your save · Kept on this phone · Details",
    );
    document.body.innerHTML = "";
    const ok = setup({ kind: "account" });
    expect(ok.status.textContent).not.toContain("Kept on this phone");
    expect(ok.status.textContent).not.toContain("Details");
  });

  it("lights the lamp: 40 CSS px per frame, off amber green red", () => {
    const frame: Readonly<Record<Kind, string>> = {
      unsigned: "0px",
      session: "-40px",
      loading: "-40px",
      account: "-80px",
      error: "-120px",
    };
    for (const kind of Object.keys(frame) as Kind[]) {
      const t = setup({ kind });
      expect(lampX(t.line)).toBe(frame[kind]);
      expect(t.line.classList.contains("is-trying")).toBe(kind === "loading");
      document.body.innerHTML = "";
    }
  });

  it("opens on a click, closes on a second click and on Escape", () => {
    const t = setup();
    expect(t.drawer.classList.contains("is-open")).toBe(false);
    t.status.click();
    expect(t.drawer.classList.contains("is-open")).toBe(true);
    expect(t.status.getAttribute("aria-expanded")).toBe("true");
    t.status.click();
    expect(t.drawer.classList.contains("is-open")).toBe(false);
    t.status.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(t.drawer.classList.contains("is-open")).toBe(false);
    t.status.click();
    t.close();
    expect(t.drawer.classList.contains("is-open")).toBe(false);
  });

  it("is a labelled dialog section", () => {
    const t = setup();
    expect(t.drawer.tagName).toBe("SECTION");
    expect(t.drawer.className).toContain("board-drawer");
    expect(t.drawer.className).toContain("board-save-drawer");
    expect(t.drawer.getAttribute("role")).toBe("dialog");
    const id = must(t.drawer.getAttribute("aria-labelledby"));
    expect(t.drawer.querySelector(`#${id}`)?.textContent).toBe(
      "Saved to your account",
    );
  });

  it("signed in: account label, phone count, Close and Try again", () => {
    const t = setup({ pocket: 412_400 });
    const facts = [...t.drawer.querySelectorAll(".board-fact")].map(
      (f) => f.textContent,
    );
    expect(facts[0]).toBe("Accountdad@example.com");
    expect(facts[1]).toBe(`On this phone${formatCompact(412_400)}`);
    expect(t.buttons().map((b) => b.textContent)).toEqual([
      "Close",
      "Try again",
    ]);
    must(t.buttons()[1]).click();
    expect(t.order).toEqual(["flush", "resume", "tick"]);
  });

  it("Try again settles after the cloud has been read, like a return", async () => {
    const t = setup();
    let read: () => void = () => undefined;
    t.setResume({
      kind: "reading",
      done: new Promise<void>((resolve) => {
        read = resolve;
      }),
    });
    must(t.buttons()[1]).click();
    expect(t.order).toEqual(["flush", "resume"]);
    read();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.order).toEqual(["flush", "resume", "tick"]);
  });

  it("signed out: Not signed in, and Sign in calls auth.signIn", () => {
    const t = setup({ kind: "unsigned", auth: { kind: "signed-out" } });
    expect(t.drawer.querySelector(".board-fact")?.textContent).toBe(
      "AccountNot signed in",
    );
    expect(t.buttons().map((b) => b.textContent)).toEqual(["Close", "Sign in"]);
    must(t.buttons()[1]).click();
    expect(t.auth.signIn).toHaveBeenCalledTimes(1);
    expect(t.progress.flush).not.toHaveBeenCalled();
  });

  it("disables Sign in while signing in and follows auth changes", () => {
    const t = setup({ kind: "unsigned", auth: { kind: "signed-out" } });
    t.setAuth({ kind: "signing-in" });
    expect(must(t.buttons()[1]).disabled).toBe(true);
    t.setAuth({
      kind: "signed-in",
      user: { uid: "u", label: "new@example.com" },
    });
    expect(t.drawer.querySelector(".board-fact")?.textContent).toBe(
      "Accountnew@example.com",
    );
    expect(must(t.buttons()[1]).textContent).toBe("Try again");
    expect(must(t.buttons()[1]).disabled).toBe(false);
  });

  it("Last try is the HH:MM of the last render where the log changed", () => {
    const t = setup({ log: undefined, at: new Date(2026, 10, 8, 9, 5) });
    const last = (): string | null | undefined =>
      t.drawer.querySelectorAll(".board-fact")[2]?.textContent;
    expect(last()).toBe("Last try—");
    t.setClock(new Date(2026, 10, 8, 22, 13));
    t.setView({ kind: "error", log: "save.read · unreachable" });
    t.render();
    expect(last()).toBe("Last try22:13");
    t.setClock(new Date(2026, 10, 8, 23, 40));
    t.render();
    expect(last()).toBe("Last try22:13");
    t.setView({ kind: "error", log: "save.read · unreachable · tries 2" });
    t.render();
    expect(last()).toBe("Last try23:40");
  });

  it("error adds the nothing-is-lost line", () => {
    const t = setup({ kind: "error" });
    expect(t.drawer.textContent).toContain(
      "Every stone is kept on this phone and goes up when the cloud answers. Nothing is lost.",
    );
    document.body.innerHTML = "";
    const ok = setup({ kind: "account" });
    expect(ok.drawer.textContent).not.toContain("Nothing is lost");
  });

  it("Last try moves on when Try again settles, though the log is the same", async () => {
    const t = setup({
      kind: "error",
      log: "save.read · unreachable",
      at: new Date(2026, 10, 8, 22, 13),
    });
    const last = (): string | null | undefined =>
      t.drawer.querySelectorAll(".board-fact")[2]?.textContent;
    expect(last()).toBe("Last try22:13");
    t.setClock(new Date(2026, 10, 8, 23, 40));
    must(t.buttons()[1]).click();
    expect(last()).toBe("Last try23:40");

    let read: () => void = () => undefined;
    t.setResume({
      kind: "reading",
      done: new Promise<void>((resolve) => {
        read = resolve;
      }),
    });
    t.setClock(new Date(2026, 10, 8, 23, 52));
    must(t.buttons()[1]).click();
    expect(last()).toBe("Last try23:40");
    read();
    await Promise.resolve();
    await Promise.resolve();
    expect(last()).toBe("Last try23:52");
  });

  it("speaks a change of the save words politely", () => {
    const t = setup();
    expect(
      t.status.querySelector(".board-save-words")?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("closes on a pointerdown on the board above it, not on the line or itself", () => {
    const t = setup();
    const board = document.createElement("div");
    document.body.append(board);
    const down = (target: EventTarget): void => {
      target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    };
    t.status.click();
    down(t.drawer);
    expect(t.drawer.classList.contains("is-open")).toBe(true);
    down(t.status);
    expect(t.drawer.classList.contains("is-open")).toBe(true);
    // The line's own click toggles it shut.
    t.status.click();
    expect(t.drawer.classList.contains("is-open")).toBe(false);
    t.status.click();
    down(board);
    expect(t.drawer.classList.contains("is-open")).toBe(false);
    expect(t.status.getAttribute("aria-expanded")).toBe("false");
  });
});
