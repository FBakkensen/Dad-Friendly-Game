import { el, write } from "./board-dom";
import { skin } from "./board-skin";

/*
 * The crew line's chips: where the hands are, in short, for the eye. They lay out in the fewest
 * even rows that fit the line. While the drawer is open they keep their order and their rows,
 * and only their words change.
 */

/** One crew chip: the post it stands for, and its words. */
export interface ChipBit {
  readonly key: string;
  readonly text: string;
}

export interface CrewChips {
  /**
   * Lays `bits` out in the fewest even rows whose widest row fits the line, and returns how
   * many. `width` is the line's width now: a shut drawer's is 0, and its chips take one row,
   * to be laid out again as it opens.
   */
  layout(bits: readonly ChipBit[], width: number): number;
  /**
   * The open drawer's chips: the same chips in the same rows, their words new. A post the crew
   * no longer has reads zero, and a new chip joins only if it fits the rows already there.
   */
  refresh(bits: readonly ChipBit[]): void;
}

/** `bits` in exactly `lines` rows, as even as they go: the first rows take one more. */
export function evenRows(
  bits: readonly ChipBit[],
  lines: number,
): readonly (readonly ChipBit[])[] {
  const base = Math.floor(bits.length / lines);
  const extra = bits.length % lines;
  let next = 0;
  return Array.from({ length: lines }, (_, index) => {
    const size = base + (index < extra ? 1 : 0);
    const row = bits.slice(next, next + size);
    next += size;
    return row;
  });
}

/** A post chip the crew has emptied while the drawer is open: it reads zero in its place. */
function zeroChip(bit: ChipBit): ChipBit {
  return bit.key === "pool" || bit.key === "grandpa"
    ? bit
    : { key: bit.key, text: `0 on ${bit.key}` };
}

/**
 * The chips to try on the open drawer, in order; the last always stands. The chips shown keep
 * their places with their words new. New chips are tried after them first, when there are
 * enough chips to fill `rows`.
 */
export function refreshed(
  shown: readonly ChipBit[],
  latest: readonly ChipBit[],
  rows: number,
): readonly (readonly ChipBit[])[] {
  const words = new Map(latest.map((bit) => [bit.key, bit.text]));
  const kept = shown.map((bit) => {
    const text = words.get(bit.key);
    return text === undefined ? zeroChip(bit) : { key: bit.key, text };
  });
  const added = latest.filter(
    (bit) => !shown.some((each) => each.key === bit.key),
  );
  return added.length > 0 && kept.length + added.length >= rows
    ? [[...kept, ...added], kept]
    : [kept];
}

/** A row that wrapped (board.css lets a row wrap rather than clip) has chips on two lines. */
function wrapped(row: HTMLElement): boolean {
  const tops = [...row.querySelectorAll<HTMLElement>(".crew-bit")].map(
    (chip) => chip.offsetTop,
  );
  return tops.some((top) => top !== tops[0]);
}

/** True when a chip row runs past a line `width` wide, or wraps. A line with no width fits. */
function overflows(line: HTMLElement, width: number): boolean {
  if (!line.isConnected || width <= 0) {
    return false;
  }
  const rows = [...line.querySelectorAll<HTMLElement>(".crew-row")];
  if (
    rows.some((row) => row.scrollWidth > row.clientWidth + 1 || wrapped(row))
  ) {
    return true;
  }
  return rows.length === 1 && line.scrollWidth > width + 1;
}

interface Chip {
  readonly chip: HTMLElement;
  readonly words: HTMLElement;
}

/** The chips on `posts`, after its spoken words. One chip per place, reused: each keeps its skin. */
export function createCrewChips(
  posts: HTMLElement,
  postsWords: HTMLElement,
): CrewChips {
  const pool: Chip[] = [];
  let shown: readonly ChipBit[] = [];
  let rows = 0;
  const chipAt = (index: number, text: string): HTMLElement => {
    let made = pool[index];
    if (made === undefined) {
      const chip = el("span", "crew-bit");
      const words = el("span", "crew-bit-text");
      chip.append(words);
      skin(chip, "tag");
      made = { chip, words };
      pool[index] = made;
    }
    write(made.words, text);
    return made.chip;
  };
  const paint = (bits: readonly ChipBit[], lines: number): void => {
    let next = 0;
    posts.replaceChildren(
      postsWords,
      ...evenRows(bits, lines).map((chips) => {
        const line = el("span", "crew-row");
        line.setAttribute("aria-hidden", "true");
        for (const bit of chips) {
          line.append(chipAt(next, bit.text));
          next += 1;
        }
        return line;
      }),
    );
    shown = bits;
    rows = lines;
  };
  return {
    layout(bits, width) {
      if (bits.length === 0) {
        posts.replaceChildren(postsWords);
        shown = [];
        rows = 0;
        return 0;
      }
      for (let lines = 1; lines <= bits.length; lines += 1) {
        paint(bits, lines);
        if (!overflows(posts, width)) {
          break;
        }
      }
      return rows;
    },
    refresh(bits) {
      if (rows === 0) {
        return;
      }
      const tries = refreshed(shown, bits, rows);
      for (const [index, chips] of tries.entries()) {
        paint(chips, rows);
        if (
          index === tries.length - 1 ||
          !overflows(posts, posts.clientWidth)
        ) {
          return;
        }
      }
    },
  };
}
