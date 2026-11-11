const DEVICE_LABEL_KEY = "dad-friendly-device-label";

/** Mirrors the length check on an archived copy. */
const DEVICE_LABEL_MAX = 40;

export function isDeviceLabel(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= DEVICE_LABEL_MAX &&
    !value.includes("?")
  );
}

/** The first name whose pattern the agent matches, in order, else `fallback`. */
function firstMatch(
  ua: string,
  names: readonly (readonly [RegExp, string])[],
  fallback: string,
): string {
  return names.find(([pattern]) => pattern.test(ua))?.[1] ?? fallback;
}

/** Edge and Opera say Chrome too, and Chrome says Safari, so they go first. */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari/, "Safari"],
];

/** An iPad or iPhone may say Mobile too, so they go first. */
const PLACES: readonly (readonly [RegExp, string])[] = [
  [/iPad/, "iPad"],
  [/iPhone/, "iPhone"],
  [/Android/, "Android"],
  [/Mobile/, "a phone"],
];

/** A short name for this browser. Not the device id. */
export function deviceLabelFromAgent(ua: string): string {
  const browser = firstMatch(ua, BROWSERS, "Browser");
  const where = firstMatch(ua, PLACES, "this computer");
  const label = `${browser} on ${where}`;
  return label.length <= DEVICE_LABEL_MAX
    ? label
    : label.slice(0, DEVICE_LABEL_MAX);
}

/**
 * The label stored beside the device id. A broken store still gets a name
 * for this open.
 */
export function readDeviceLabel(
  storage: Storage | undefined,
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string {
  const fresh = deviceLabelFromAgent(ua);
  if (storage === undefined) {
    return fresh;
  }
  try {
    const existing = storage.getItem(DEVICE_LABEL_KEY);
    if (existing !== null && isDeviceLabel(existing)) {
      return existing;
    }
    storage.setItem(DEVICE_LABEL_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
}
