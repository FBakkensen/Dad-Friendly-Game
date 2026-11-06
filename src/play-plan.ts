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

/** The phone viewport in CSS pixels. */
type PhoneSize = { readonly width: number; readonly height: number };

/** The tallest supported phone (#273). 424x830 is the shorter one. */
const DEFAULT_PHONE: PhoneSize = { width: 424, height: 924 };
const MAX_SIDE = 4096;

type PlayPlan = {
  readonly kind: "plan";
  readonly save: string;
  readonly screens: readonly PlayScreen[];
  readonly actions: readonly PlayAction[];
  readonly out: string;
  /** A running app to drive instead of starting Vite. */
  readonly url: string | undefined;
  readonly phone: PhoneSize;
};

export type PlayArgs =
  | PlayPlan
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

export const PLAY_USAGE = `Usage: npm run play -- [options] [action ...]

Options:
  --save <name>      starting save (default: fresh)
  --screen <which>   phone, desktop, or both (default: both)
  --out <dir>        where shots and the log go (default: play-shots)
  --url <url>        drive a running app instead of starting Vite
  --viewport <WxH>   the phone's size (default: 424x924); the other
                     supported phone is 424x830
  --help             this text

Actions run in order; a shot is taken after opening and after each one:
  tap:<css>          tap the first visible match, e.g. tap:.mountain
  label:<name>       tap the first visible match whose accessible name
                     (aria-label or text) is or starts with the label,
                     e.g. label:Upgrades
  wait:<ms>          wait that many milliseconds, e.g. wait:500
  wait:<css>         wait until a match is visible, e.g. wait:.buys-dialog
Add *N to a tap to repeat it, e.g. tap:.mountain*5`;

const DEFAULT_OUT = "play-shots";
const MAX_TAPS = 500;
const MAX_WAIT_MS = 60_000;

function parseTarget(kind: "tap" | "label", body: string): PlayTarget {
  return kind === "tap"
    ? { by: "selector", selector: body }
    : { by: "label", label: body };
}

/** One action word, or why it is not one. */
export function parseAction(
  word: string,
): PlayAction | { readonly kind: "error"; readonly message: string } {
  const colon = word.indexOf(":");
  const kind = colon === -1 ? word : word.slice(0, colon);
  const body = colon === -1 ? "" : word.slice(colon + 1).trim();
  if (kind !== "tap" && kind !== "label" && kind !== "wait") {
    return {
      kind: "error",
      message: `Unknown action "${word}". Use tap:, label:, or wait:.`,
    };
  }
  if (body === "") {
    return {
      kind: "error",
      message: `"${word}" needs something after the colon.`,
    };
  }
  if (kind === "wait") {
    if (/^\d+$/.test(body)) {
      const ms = Number(body);
      return ms <= MAX_WAIT_MS
        ? { kind: "wait", ms }
        : {
            kind: "error",
            message: `"${word}" waits longer than ${String(MAX_WAIT_MS)} ms.`,
          };
    }
    if (/^\d/.test(body)) {
      return {
        kind: "error",
        message: `"${word}" is not whole milliseconds or a selector.`,
      };
    }
    return { kind: "waitFor", target: { by: "selector", selector: body } };
  }
  const repeat = /^(.*\S)\s*\*(\d+)$/.exec(body);
  const times = repeat === null ? 1 : Number(repeat[2]);
  if (times < 1 || times > MAX_TAPS) {
    return {
      kind: "error",
      message: `"${word}" repeats ${String(times)} times; use 1 to ${String(MAX_TAPS)}.`,
    };
  }
  const target = parseTarget(
    kind,
    repeat === null ? body : (repeat[1] ?? body),
  );
  return { kind: "tap", target, times };
}

function parsePhone(value: string): PhoneSize | undefined {
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

/** Reads `npm run play -- ...` arguments against the known save names. */
export function parsePlayArgs(
  argv: readonly string[],
  saveNames: readonly string[],
): PlayArgs {
  let save = "fresh";
  let screens: readonly PlayScreen[] = ["phone", "desktop"];
  let out = DEFAULT_OUT;
  let url: string | undefined;
  let phone = DEFAULT_PHONE;
  const actions: PlayAction[] = [];
  const rest = [...argv];
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (word === "--help" || word === "-h") {
      return { kind: "help" };
    }
    if (word.startsWith("--")) {
      const eq = word.indexOf("=");
      const flag = eq === -1 ? word : word.slice(0, eq);
      const inline = eq === -1 ? undefined : word.slice(eq + 1);
      const value = inline ?? rest.shift();
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { kind: "error", message: `${flag} needs a value.` };
      }
      switch (flag) {
        case "--save":
          if (!saveNames.includes(value)) {
            return {
              kind: "error",
              message: `Unknown save "${value}". Saves: ${saveNames.join(", ")}.`,
            };
          }
          save = value;
          break;
        case "--screen": {
          const chosen = parseScreens(value);
          if (chosen === undefined) {
            return {
              kind: "error",
              message: `--screen is phone, desktop, or both, not "${value}".`,
            };
          }
          screens = chosen;
          break;
        }
        case "--out":
          out = value;
          break;
        case "--url":
          url = value;
          break;
        case "--viewport": {
          const size = parsePhone(value);
          if (size === undefined) {
            return {
              kind: "error",
              message: `--viewport is WIDTHxHEIGHT, e.g. 424x830, not "${value}".`,
            };
          }
          phone = size;
          break;
        }
        default:
          return { kind: "error", message: `Unknown option ${flag}.` };
      }
      continue;
    }
    const action = parseAction(word);
    if (action.kind === "error") {
      return action;
    }
    actions.push(action);
  }
  return { kind: "plan", save, screens, actions, out, url, phone };
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

/** `phone-03-tap-mountain-x5.png`: screen, step, then what happened. */
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
