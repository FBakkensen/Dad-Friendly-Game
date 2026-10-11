const SCALES: readonly { readonly value: number; readonly word: string }[] = [
  { value: 1e12, word: "trillion" },
  { value: 1e9, word: "billion" },
  { value: 1e6, word: "million" },
  { value: 1e3, word: "thousand" },
];

/** "9,999", then "12.3 thousand", "1.2 million". Rounds down so a counter never overstates. */
export function formatCount(count: number): string {
  const whole = Math.max(0, Math.floor(count));
  if (whole < 10_000) {
    return whole.toLocaleString("en-US");
  }
  for (const { value, word } of SCALES) {
    if (whole >= value) {
      const tenths = Math.floor((whole * 10) / value) / 10;
      return `${tenths.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${word}`;
    }
  }
  return whole.toLocaleString("en-US");
}

const plural = (count: number, unit: string): string =>
  `${String(count)} ${unit}${count === 1 ? "" : "s"}`;

/** "45 seconds", "12 minutes", "2 hours 5 minutes", "3 days 4 hours". Rounds down. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return plural(seconds, "second");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return plural(minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0
      ? plural(hours, "hour")
      : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0
    ? plural(days, "day")
    : `${plural(days, "day")} ${plural(rest, "hour")}`;
}
