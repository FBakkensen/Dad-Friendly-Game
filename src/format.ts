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
