// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  createCrewChips,
  evenRows,
  refreshed,
  type ChipBit,
} from "./crew-chips";

const bit = (key: string, text = `1 on ${key}`): ChipBit => ({ key, text });
const keys = (rows: readonly (readonly ChipBit[])[]) =>
  rows.map((row) => row.map((each) => each.key));

describe("evenRows", () => {
  it("puts every chip in one row", () => {
    expect(keys(evenRows([bit("a"), bit("b"), bit("c")], 1))).toEqual([
      ["a", "b", "c"],
    ]);
  });

  it("splits as evenly as it goes, the first rows taking one more", () => {
    const bits = ["a", "b", "c", "d", "e"].map((key) => bit(key));
    expect(keys(evenRows(bits, 2))).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
    expect(keys(evenRows(bits, 3))).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(keys(evenRows(bits, 5))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
      ["e"],
    ]);
  });
});

describe("refreshed", () => {
  it("keeps the chips shown in their places, with their words new", () => {
    const shown = [bit("pool", "18 workers"), bit("carts", "6 on carts")];
    const latest = [bit("pool", "19 workers"), bit("carts", "7 on carts")];
    expect(refreshed(shown, latest, 1)).toEqual([latest]);
  });

  it("a post the crew no longer has reads zero; the pool and grandpa keep their words", () => {
    const shown = [
      bit("pool", "9 workers"),
      bit("carts", "1 on carts"),
      bit("grandpa", "Grandpa on the borer"),
    ];
    expect(refreshed(shown, [], 1)).toEqual([
      [
        bit("pool", "9 workers"),
        bit("carts", "0 on carts"),
        bit("grandpa", "Grandpa on the borer"),
      ],
    ]);
  });

  it("tries a new chip after the others first, then the chips shown alone", () => {
    const shown = [bit("pool", "9 workers"), bit("carts", "1 on carts")];
    const latest = [
      bit("pool", "9 workers"),
      bit("borers", "8 on borers"),
      bit("carts", "1 on carts"),
    ];
    expect(refreshed(shown, latest, 2)).toEqual([
      [shown[0], shown[1], bit("borers", "8 on borers")],
      shown,
    ]);
  });

  it("a new chip never joins when there are too few chips to fill the rows", () => {
    const shown = [bit("pool", "9 workers")];
    const latest = [bit("pool", "9 workers"), bit("carts", "1 on carts")];
    expect(refreshed(shown, latest, 3)).toEqual([shown]);
  });
});

describe("createCrewChips", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  /** A crew line on the page, `wide` px of chips per row against a 400px line. */
  const line = (wide: () => number) => {
    const posts = document.createElement("p");
    const words = document.createElement("span");
    posts.append(words);
    document.body.append(posts);
    Object.defineProperty(posts, "clientWidth", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(posts, "scrollWidth", {
      configurable: true,
      get: wide,
    });
    return { posts, words, chips: createCrewChips(posts, words) };
  };
  const rowTexts = (posts: HTMLElement) =>
    [...posts.querySelectorAll(".crew-row")].map((row) =>
      [...row.querySelectorAll(".crew-bit-text")].map(
        (chip) => chip.textContent,
      ),
    );

  it("lays chips out in one row when it fits, after the spoken words", () => {
    const { posts, words, chips } = line(() => 300);
    const bits = [bit("pool", "18 workers"), bit("carts", "6 on carts")];
    expect(chips.layout(bits, 400)).toBe(1);
    expect(posts.firstChild).toBe(words);
    expect(rowTexts(posts)).toEqual([["18 workers", "6 on carts"]]);
    for (const row of posts.querySelectorAll(".crew-row")) {
      expect(row.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("takes more even rows while one row runs past the line", () => {
    const { posts, chips } = line(() => 500);
    expect(chips.layout([bit("a"), bit("b"), bit("c")], 400)).toBe(2);
    expect(rowTexts(posts)).toEqual([["1 on a", "1 on b"], ["1 on c"]]);
  });

  it("a line with no width takes one row, and no chips clear it", () => {
    const { posts, words, chips } = line(() => 500);
    expect(chips.layout([bit("a"), bit("b"), bit("c")], 0)).toBe(1);
    expect(rowTexts(posts)).toEqual([["1 on a", "1 on b", "1 on c"]]);
    expect(chips.layout([], 400)).toBe(0);
    expect([...posts.childNodes]).toEqual([words]);
  });

  it("refreshes in the rows it laid out: a gone post reads zero, a new chip joins only if it fits", () => {
    let wide = 300;
    const { posts, chips } = line(() => wide);
    const pool = bit("pool", "9 workers");
    expect(chips.layout([pool, bit("carts")], 400)).toBe(1);
    chips.refresh([pool, bit("borers")]);
    expect(rowTexts(posts)).toEqual([
      ["9 workers", "0 on carts", "1 on borers"],
    ]);
    // The next new chip would run past the line: the chips shown stay alone.
    wide = 500;
    chips.refresh([pool, bit("drills")]);
    expect(rowTexts(posts)).toEqual([
      ["9 workers", "0 on carts", "0 on borers"],
    ]);
  });

  it("an empty line refreshes to nothing", () => {
    const { posts, words, chips } = line(() => 300);
    chips.layout([], 400);
    chips.refresh([bit("pool", "1 worker")]);
    expect([...posts.childNodes]).toEqual([words]);
  });
});
