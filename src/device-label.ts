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

/** A short name for this browser. Not the device id. */
export function deviceLabelFromAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua) || /Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "Browser";
  const where = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Mobile/.test(ua)
          ? "a phone"
          : "this computer";
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
