export interface OdometerFace {
  readonly drums: readonly [string, string, string, string, string];
  /** The drum the decimal point follows; -1 when there is none. */
  readonly point: -1 | 0 | 1 | 2 | 3;
  readonly words: string;
}

const CAP: OdometerFace = {
  drums: [">", "9", "9", "9", "T"],
  point: -1,
  words: ">999T",
};

const UNITS: readonly { readonly value: number; readonly unit: string }[] = [
  { value: 1e12, unit: "T" },
  { value: 1e9, unit: "B" },
  { value: 1e6, unit: "M" },
  { value: 1e3, unit: "K" },
];

/** What the five drums read for a pocket. Rounds down, so the drums never overstate. */
export function odometerFace(pocket: number): OdometerFace {
  if (pocket === Infinity) {
    return CAP;
  }
  const n = Number.isFinite(pocket) ? Math.max(0, Math.floor(pocket)) : 0;
  if (n < 100_000) {
    const [a = "0", b = "0", c = "0", d = "0", e = "0"] = String(n)
      .padStart(5, "0")
      .split("");
    return { drums: [a, b, c, d, e], point: -1, words: n.toLocaleString("en-US") };
  }
  if (n >= 1e15) {
    return CAP;
  }
  const { value, unit } = UNITS.find((u) => n >= u.value) ?? {
    value: 1e3,
    unit: "K",
  };
  const scaled = n / value;
  const intLen = String(Math.floor(scaled)).length;
  const decimals = 4 - intLen;
  const shown = (Math.floor(scaled * 10 ** decimals) / 10 ** decimals).toFixed(
    decimals,
  );
  const digits = shown.replace(".", "").slice(0, 4).split("");
  const [a = "0", b = "0", c = "0", d = "0"] = digits;
  const point = (intLen - 1) as 0 | 1 | 2;
  return {
    drums: [a, b, c, d, unit],
    point,
    words: `${shown.slice(0, intLen)}.${shown.slice(intLen + 1)}${unit}`,
  };
}
