import type { AuthController, AuthState } from "./auth";
import { skin } from "./board-skin";
import { pressLook } from "./card-tap";
import { formatCompact } from "./format";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";

type SaveKind = ProgressSnapshot["saveKind"];

/** Today's save words (the scripts read them from .save-status). */
const WORDS: Readonly<Record<SaveKind, string>> = {
  unsigned: "Sign in to save",
  session: "Saved on this device",
  loading: "Loading your save...",
  account: "Saved to your account",
  error: "Couldn't reach your save",
};

/** Lamp.png frames, 20 art px (40 CSS px) wide: off, amber, green, red. */
const LAMP_FRAME: Readonly<Record<SaveKind, number>> = {
  unsigned: 0,
  session: 1,
  loading: 1,
  account: 2,
  error: 3,
};
const LAMP_CSS_PX = 40;

const SAFE_FORMS = [
  " · Kept on this phone",
  " · Kept on this phone ·",
  " · On this phone ·",
  " ·",
];
const NOTHING_LOST =
  "Every stone is kept on this phone and goes up when the cloud answers. Nothing is lost.";

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A plate button: key skin, keyp while pressed. */
export function plateButton(label: string): HTMLButtonElement {
  const b = el("button", "board-platebtn");
  b.type = "button";
  b.append(el("span", "board-platebtn-text", label));
  // The look paints through `repaint`, which only exists once the skin does; the skin's own
  // first paint asks the look, so the look comes first.
  let repaint = (): void => undefined;
  const look = pressLook(b, {
    enabled: () => true,
    lifts: ["pointerup", "pointerleave", "pointercancel"],
    paint: (down) => {
      b.classList.toggle("down", down);
      repaint();
    },
  });
  repaint = skin(b, "key", { kind: "keyp", down: () => look.isDown() });
  return b;
}

interface SaveLine {
  readonly line: HTMLElement;
  readonly drawer: HTMLElement;
  render(): void;
  close(): void;
  /** The save drawer is open. */
  isOpen(): boolean;
}

/**
 * Escape closes the drawer, and so does a tap on the board above it (the spec's scrim). The
 * save line is not outside: its own click toggles the drawer.
 */
function closeFromPage({
  line,
  drawer,
  isOpen,
  close,
  signal,
}: {
  line: HTMLElement;
  drawer: HTMLElement;
  isOpen: () => boolean;
  close: () => void;
  signal: AbortSignal | undefined;
}): void {
  const listening = signal === undefined ? {} : { signal };
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && isOpen()) close();
    },
    listening,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!isOpen() || !(target instanceof Node)) return;
      if (drawer.contains(target) || line.contains(target)) return;
      close();
    },
    listening,
  );
}

/** The save line: its button, the lamp, today's words and the Details slot. */
function buildStatus(): {
  line: HTMLElement;
  status: HTMLButtonElement;
  lamp: HTMLElement;
  text: HTMLSpanElement;
  words: HTMLSpanElement;
  safe: HTMLSpanElement;
  why: HTMLSpanElement;
  sep: HTMLSpanElement;
} {
  const line = el("div", "board-saveline");
  const status = el("button", "save-status");
  status.type = "button";
  status.setAttribute("aria-controls", "board-save-drawer");
  status.setAttribute("aria-expanded", "false");
  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  const text = el("span", "board-save-text");
  const words = el("span", "board-save-words");
  // The old save words were a live region; these still are.
  words.setAttribute("aria-live", "polite");
  const safe = el("span", "board-save-safe");
  const why = el("span", "board-save-why");
  // Read aloud and by the scripts, not drawn: "... phone · Details".
  const sep = el("span", "board-save-sep");
  text.append(words, safe);
  status.append(lamp, text, sep, why);
  skin(status, "frame");
  line.append(status);
  return { line, status, lamp, text, words, safe, why, sep };
}

/** The save drawer: its lamp, title, the three facts and the two keys. */
function buildDrawer(): {
  drawer: HTMLElement;
  topLamp: HTMLElement;
  title: HTMLHeadingElement;
  lost: HTMLParagraphElement;
  account: HTMLSpanElement;
  phone: HTMLSpanElement;
  last: HTMLSpanElement;
  closeBtn: HTMLButtonElement;
  actBtn: HTMLButtonElement;
} {
  const drawer = el("section", "board-drawer board-save-drawer");
  drawer.id = "board-save-drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-labelledby", "board-save-title");
  const top = el("div", "board-save-top");
  const topLamp = el("i", "board-lamp");
  topLamp.setAttribute("aria-hidden", "true");
  top.append(topLamp, el("span", "board-lg board-save-kicker", "Your save"));
  const title = el("h3", "board-save-title");
  title.id = "board-save-title";
  const lost = el("p", "board-save-lost", NOTHING_LOST);
  const facts = el("div", "board-facts");
  const fact = (k: string): HTMLSpanElement => {
    const row = el("div", "board-fact");
    const v = el("span", "board-num board-fact-v");
    row.append(el("span", "board-fact-k", k), v);
    facts.append(row);
    return v;
  };
  const account = fact("Account");
  const phone = fact("On this phone");
  const last = fact("Last try");
  const row = el("div", "board-btnrow");
  const closeBtn = plateButton("Close");
  const actBtn = plateButton("Try again");
  row.append(closeBtn, actBtn);
  drawer.append(top, title, facts, row);
  skin(drawer, "frame");
  return {
    drawer,
    topLamp,
    title,
    lost,
    account,
    phone,
    last,
    closeBtn,
    actBtn,
  };
}

/**
 * The save line at the foot of the board and the drawer it opens (#370).
 * The line keeps today's `.save-status` words, data-kind and data-log.
 */
export function createSaveLine({
  progress,
  auth,
  getView,
  now,
  signal,
}: {
  progress: ProgressStore;
  auth: AuthController;
  getView: () => ProgressSnapshot;
  now: () => number;
  /** Takes the save line's page listeners and auth watch off; the app never unmounts. */
  signal?: AbortSignal | undefined;
}): SaveLine {
  const { line, status, lamp, text, words, safe, why, sep } = buildStatus();
  const {
    drawer,
    topLamp,
    title,
    lost,
    account,
    phone,
    last,
    closeBtn,
    actBtn,
  } = buildDrawer();

  let isOpen = false;
  let lastLog: string | undefined;
  let lastTry: number | undefined;

  const setOpen = (open: boolean): void => {
    isOpen = open;
    drawer.classList.toggle("is-open", open);
    status.setAttribute("aria-expanded", String(open));
  };
  const close = (): void => {
    setOpen(false);
  };

  const fitSafe = (): void => {
    for (const form of SAFE_FORMS) {
      safe.textContent = form;
      if (text.scrollWidth <= text.clientWidth) break;
    }
    sep.textContent = safe.textContent.endsWith("·") ? " " : " · ";
  };

  const authState = (): AuthState => auth.getState();

  const renderDrawer = (view: ProgressSnapshot): void => {
    title.textContent = WORDS[view.saveKind];
    if (view.saveKind === "error") title.after(lost);
    else lost.remove();
    const state = authState();
    account.textContent =
      state.kind === "signed-in" ? state.user.label : "Not signed in";
    phone.textContent = formatCompact(view.mountain.pocket);
    last.textContent = lastTry === undefined ? "—" : hhmm(lastTry);
    const label = state.kind === "signed-in" ? "Try again" : "Sign in";
    const span = actBtn.querySelector(".board-platebtn-text");
    if (span) span.textContent = label;
    actBtn.disabled = state.kind === "signing-in";
  };

  const render = (): void => {
    const view = getView();
    if (view.log !== lastLog) {
      lastLog = view.log;
      if (view.log !== undefined) lastTry = now();
    }
    words.textContent = WORDS[view.saveKind];
    status.dataset["kind"] = view.saveKind;
    if (view.log === undefined) delete status.dataset["log"];
    else status.dataset["log"] = view.log;
    const failed = view.saveKind === "error";
    safe.textContent = failed ? (SAFE_FORMS[0] ?? "") : "";
    why.textContent = failed ? "Details" : "";
    sep.textContent = "";
    const x = `${String(-LAMP_FRAME[view.saveKind] * LAMP_CSS_PX)}px`;
    // 0 reads "0px" so the frame is always a length.
    lamp.style.backgroundPositionX = x === "-0px" ? "0px" : x;
    topLamp.style.backgroundPositionX = lamp.style.backgroundPositionX;
    line.classList.toggle("is-trying", view.saveKind === "loading");
    drawer.classList.toggle("is-trying", view.saveKind === "loading");
    if (failed) fitSafe();
    renderDrawer(view);
  };

  status.addEventListener("click", () => {
    setOpen(!isOpen);
  });
  closeBtn.addEventListener("click", close);
  // A settled try is a try, even when the log reads the same as before.
  const settle = (): void => {
    progress.tick();
    lastTry = now();
    renderDrawer(getView());
  };
  actBtn.addEventListener("click", () => {
    if (authState().kind === "signed-in") {
      progress.flush();
      // Settle once the cloud has been read, as a return to the tab does.
      const resume = progress.resume();
      if (resume.kind === "reading") {
        void resume.done.then(settle);
        return;
      }
      settle();
      return;
    }
    void auth.signIn();
  });
  closeFromPage({ line, drawer, isOpen: () => isOpen, close, signal });
  const unwatchAuth = auth.subscribe(() => {
    renderDrawer(getView());
  });
  signal?.addEventListener("abort", unwatchAuth);

  render();
  return { line, drawer, render, close, isOpen: () => isOpen };
}
