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
  if (whole >= 1e15) {
    // Late tier prices grow without bound; keep the text short and honest.
    return "1,000+ trillion";
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

const COMPACT: readonly { readonly value: number; readonly suffix: string }[] =
  [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

/** For tight spots like tier cards: "9,999", "12.4K", "190.1M", ">999T". Rounds down. */
export function formatCompact(count: number): string {
  const whole = Math.max(0, Math.floor(count));
  if (whole < 10_000) {
    return whole.toLocaleString("en-US");
  }
  if (whole >= 1e15) {
    return ">999T";
  }
  for (const { value, suffix } of COMPACT) {
    if (whole >= value) {
      const tenths = Math.floor((whole * 10) / value) / 10;
      return `${tenths.toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`;
    }
  }
  return whole.toLocaleString("en-US");
}

/** Timer chip time. m:ss under an hour, then 1h 2m, then 1d 3h. */
export function chipTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) {
    return `${String(days)}d ${String(hours)}h`;
  }
  if (hours > 0) {
    return `${String(hours)}h ${String(minutes)}m`;
  }
  return `${String(minutes)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A short wait for the Ready now plate: "40s", "4m", "1h 5m", ">99h". Under a
 * minute it counts whole seconds, past that whole minutes, both rounded up and
 * at least 1, so a stone short never reads as now.
 */
export function etaShort(ms: number): string {
  // The last minute counts seconds, so three seconds never reads "1m" (#517).
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours >= 100) {
    return ">99h";
  }
  return `${String(hours)}h ${String(minutes % 60)}m`;
}

/** "22:13": the 24-hour clock in local time, to the minute (rounded down). */
export function formatTimeOfDay(ms: number): string {
  const at = new Date(ms);
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
