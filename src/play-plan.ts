/**
 * The pure half of `npm run play` (scripts/play.mjs): reads the command line
 * into a plan of one starting save, the screens, and a list of actions.
 * The script owns the browser, the dev server, and the files.
 */

/** Something on the page to tap or wait for. */
type PlayTarget =
  | { readonly by: "selector"; readonly selector: string }
  | { readonly by: "label"; readonly label: string };

export type PlayAction =
  | {
      readonly kind: "tap";
      readonly target: PlayTarget;
      readonly times: number;
    }
  | { readonly kind: "wait"; readonly ms: number }
  | { readonly kind: "waitFor"; readonly target: PlayTarget };

export type PlayScreen = "phone" | "desktop";

/** A viewport in CSS pixels: the phone's or the desktop's. */
type ScreenSize = { readonly width: number; readonly height: number };

/** The phone: the board's own 424x924 stage, the installed app (#370). */
const DEFAULT_PHONE: ScreenSize = { width: 424, height: 924 };
/** The desktop: a PC, where the board sits on the desk (#376). */
const DEFAULT_DESK: ScreenSize = { width: 1366, height: 768 };
/** Narrower than this is a phone, not a desk (src/board-fit.ts). */
const DESK_MIN_WIDTH = 600;
const MAX_SIDE = 4096;

type PlayPlan = {
  readonly kind: "plan";
  readonly save: string;
  readonly screens: readonly PlayScreen[];
  readonly actions: readonly PlayAction[];
  readonly out: string;
  /** A running app to drive instead of starting Vite. */
  readonly url: string | undefined;
  readonly phone: ScreenSize;
  readonly desk: ScreenSize;
  /** Appended to the page URL, e.g. ?trouble=cave-in for the dev preview. */
  readonly search: string;
  /** 2 opens the save in two tabs and plays the second: the other-tab card. */
  readonly tabs: 1 | 2;
};

type PlayError = { readonly kind: "error"; readonly message: string };

export type PlayArgs = PlayPlan | { readonly kind: "help" } | PlayError;

export const PLAY_USAGE = `Usage: npm run play -- [options] [action ...]

Options:
  --save <name>      starting save (default: fresh)
  --screen <which>   phone, desktop, or both (default: both)
  --out <dir>        where shots and the log go (default: play-shots)
  --url <url>        drive a running app instead of starting Vite
  --viewport <WxH>   the phone's size (default: 424x924, the board)
  --desk <WxH>       the desktop's size (default: 1366x768; the PCs are
                     1280x800, 1366x768 and 1440x900)
  --search <query>   added to the page URL, e.g. ?trouble=cave-in
  --tabs <1|2>       2 opens the save in two tabs and plays the second,
                     which shows the other-tab card (default: 1)
  --help             this text

Actions run in order; a shot is taken after opening and after each one:
  tap:<css>          tap the first visible match, e.g. tap:.board-window
  label:<name>       tap the first visible match whose accessible name
                     (aria-label or text) is or starts with the label,
                     e.g. label:Upgrades
  wait:<ms>          wait that many milliseconds, e.g. wait:500
  wait:<css>         wait until a match is visible, e.g. wait:.board-sheet.is-open
Add *N to a tap to repeat it, e.g. tap:.board-window*5`;

const DEFAULT_OUT = "play-shots";
const MAX_TAPS = 500;
const MAX_WAIT_MS = 60_000;

function parseTarget(kind: "tap" | "label", body: string): PlayTarget {
  return kind === "tap"
    ? { by: "selector", selector: body }
    : { by: "label", label: body };
}

const playError = (message: string): PlayError => ({ kind: "error", message });

/** One action word, or why it is not one. */
export function parseAction(word: string): PlayAction | PlayError {
  const colon = word.indexOf(":");
  const kind = colon === -1 ? word : word.slice(0, colon);
  const body = colon === -1 ? "" : word.slice(colon + 1).trim();
  if (kind !== "tap" && kind !== "label" && kind !== "wait") {
    return playError(`Unknown action "${word}". Use tap:, label:, or wait:.`);
  }
  if (body === "") {
    return playError(`"${word}" needs something after the colon.`);
  }
  return kind === "wait" ? parseWait(word, body) : parseTap(kind, word, body);
}

/** wait:<ms> or wait:<css>. */
function parseWait(word: string, body: string): PlayAction | PlayError {
  if (/^\d+$/.test(body)) {
    const ms = Number(body);
    return ms <= MAX_WAIT_MS
      ? { kind: "wait", ms }
      : playError(`"${word}" waits longer than ${String(MAX_WAIT_MS)} ms.`);
  }
  if (/^\d/.test(body)) {
    return playError(`"${word}" is not whole milliseconds or a selector.`);
  }
  return { kind: "waitFor", target: { by: "selector", selector: body } };
}

/** tap:<css> or label:<name>, with an optional *N. */
function parseTap(
  kind: "tap" | "label",
  word: string,
  body: string,
): PlayAction | PlayError {
  const repeat = /^(.*\S)\s*\*(\d+)$/.exec(body);
  const times = repeat === null ? 1 : Number(repeat[2]);
  if (times < 1 || times > MAX_TAPS) {
    return playError(
      `"${word}" repeats ${String(times)} times; use 1 to ${String(MAX_TAPS)}.`,
    );
  }
  const target = parseTarget(
    kind,
    repeat === null ? body : (repeat[1] ?? body),
  );
  return { kind: "tap", target, times };
}

function parseSize(value: string): ScreenSize | undefined {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (match === null) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const fits = (side: number) => side >= 1 && side <= MAX_SIDE;
  return fits(width) && fits(height) ? { width, height } : undefined;
}

function parseScreens(value: string): readonly PlayScreen[] | undefined {
  switch (value) {
    case "phone":
      return ["phone"];
    case "desktop":
      return ["desktop"];
    case "both":
      return ["phone", "desktop"];
    default:
      return undefined;
  }
}

/** The plan as the flags fill it in. */
type Draft = {
  -readonly [K in keyof Omit<PlayPlan, "kind" | "actions">]: PlayPlan[K];
};

/** Sets one flag's value on the draft, or says why it cannot. */
type FlagSetter = (
  draft: Draft,
  value: string,
  saveNames: readonly string[],
) => PlayError | undefined;

const FLAGS: Readonly<Record<string, FlagSetter>> = {
  "--save": (draft, value, saveNames) => {
    if (!saveNames.includes(value)) {
      return playError(
        `Unknown save "${value}". Saves: ${saveNames.join(", ")}.`,
      );
    }
    draft.save = value;
    return undefined;
  },
  "--screen": (draft, value) => {
    const chosen = parseScreens(value);
    if (chosen === undefined) {
      return playError(`--screen is phone, desktop, or both, not "${value}".`);
    }
    draft.screens = chosen;
    return undefined;
  },
  "--out": (draft, value) => {
    draft.out = value;
    return undefined;
  },
  "--url": (draft, value) => {
    draft.url = value;
    return undefined;
  },
  "--search": (draft, value) => {
    draft.search = value;
    return undefined;
  },
  "--tabs": (draft, value) => {
    if (value !== "1" && value !== "2") {
      return playError(`--tabs is 1 or 2, not "${value}".`);
    }
    draft.tabs = value === "2" ? 2 : 1;
    return undefined;
  },
  "--viewport": (draft, value) => {
    const size = parseSize(value);
    if (size === undefined) {
      return playError(
        `--viewport is WIDTHxHEIGHT, e.g. 424x924, not "${value}".`,
      );
    }
    draft.phone = size;
    return undefined;
  },
  "--desk": (draft, value) => {
    const size = parseSize(value);
    if (size === undefined || size.width < DESK_MIN_WIDTH) {
      return playError(
        `--desk is a PC size, ${String(DESK_MIN_WIDTH)} wide or more, e.g. 1280x800, not "${value}".`,
      );
    }
    draft.desk = size;
    return undefined;
  },
};

/** Reads one --flag (and its value, inline or the next word) onto the draft. */
function applyFlag(
  word: string,
  rest: string[],
  draft: Draft,
  saveNames: readonly string[],
): PlayError | undefined {
  const eq = word.indexOf("=");
  const flag = eq === -1 ? word : word.slice(0, eq);
  const inline = eq === -1 ? undefined : word.slice(eq + 1);
  const value = inline ?? rest.shift();
  if (value === undefined || value === "" || value.startsWith("--")) {
    return playError(`${flag} needs a value.`);
  }
  const setter = Object.hasOwn(FLAGS, flag) ? FLAGS[flag] : undefined;
  return setter === undefined
    ? playError(`Unknown option ${flag}.`)
    : setter(draft, value, saveNames);
}

/** Reads `npm run play -- ...` arguments against the known save names. */
export function parsePlayArgs(
  argv: readonly string[],
  saveNames: readonly string[],
): PlayArgs {
  const draft: Draft = {
    save: "fresh",
    screens: ["phone", "desktop"],
    out: DEFAULT_OUT,
    url: undefined,
    phone: DEFAULT_PHONE,
    desk: DEFAULT_DESK,
    search: "",
    tabs: 1,
  };
  const actions: PlayAction[] = [];
  const rest = [...argv];
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (word === "--help" || word === "-h") {
      return { kind: "help" };
    }
    const read = word.startsWith("--")
      ? applyFlag(word, rest, draft, saveNames)
      : parseAction(word);
    if (read?.kind === "error") {
      return read;
    }
    if (read !== undefined) {
      actions.push(read);
    }
  }
  return { kind: "plan", ...draft, actions };
}

/** What puppeteer queries for a selector target. */
export function targetQuery(target: {
  readonly by: "selector";
  readonly selector: string;
}): string {
  return target.selector;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Which of the visible names a label: action taps, or -1. An exact name wins;
 * else the first name that starts with the label, so "Upgrades" finds
 * "Upgrades, one is affordable".
 */
export function labelMatch(names: readonly string[], label: string): number {
  const want = squash(label);
  const squashed = names.map(squash);
  const exact = squashed.indexOf(want);
  return exact !== -1
    ? exact
    : squashed.findIndex((name) => name.startsWith(want));
}

/** A short, file-safe name for an action, for the shot after it. */
export function actionSlug(action: PlayAction): string {
  const raw =
    action.kind === "wait"
      ? `wait-${String(action.ms)}ms`
      : action.kind === "waitFor"
        ? `wait-${targetText(action.target)}`
        : `${action.target.by === "label" ? "label" : "tap"}-${targetText(action.target)}${action.times > 1 ? `-x${String(action.times)}` : ""}`;
  // Starts with wait-, tap- or label-, so it is never empty.
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

function targetText(target: PlayTarget): string {
  return target.by === "selector" ? target.selector : target.label;
}

/** `phone-03-tap-board-window-x5.png`: screen, step, then what happened. */
export function shotName(
  screen: PlayScreen,
  step: number,
  action: PlayAction | undefined,
): string {
  const label = action === undefined ? "open" : actionSlug(action);
  return `${screen}-${String(step).padStart(2, "0")}-${label}.png`;
}

/** A file an earlier run wrote: a step shot or the log. */
export function isPlayOutput(file: string): boolean {
  return (
    file === "log.txt" ||
    /^(?:phone|desktop)-\d{2,}-[a-z0-9-]+\.png$/.test(file)
  );
}
