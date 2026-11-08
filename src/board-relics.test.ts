// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardNote } from "./board-note";
import { createRelicPlate } from "./board-relics";
import { createMountain } from "./mountain";
import { MOUNTAIN_STONES } from "./scale";
import type { ProgressSnapshot } from "./progress-store";
import { RELICS } from "./relics";

const view = (mined: number): ProgressSnapshot =>
  ({
    mountain: { ...createMountain(), remaining: MOUNTAIN_STONES - mined },
  }) as unknown as ProgressSnapshot;

function setup(mined = 12_000_000) {
  const stage = document.createElement("div");
  document.body.append(stage);
  const board = createBoardNote(stage);
  const onShelf = vi.fn();
  const plate = createRelicPlate({
    getView: () => view(mined),
    note: board,
    onShelf,
  });
  stage.append(plate.root);
  plate.render();
  const sockets = [
    ...plate.root.querySelectorAll<HTMLButtonElement>("button.board-socket"),
  ];
  return { ...plate, board, onShelf, sockets };
}

describe("createRelicPlate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("is a framed section with six sockets in RELICS order", () => {
    const { root, sockets } = setup();
    expect(root.tagName).toBe("SECTION");
    expect(root.classList.contains("board-relics")).toBe(true);
    expect(root.querySelector("canvas.board-skin")).not.toBeNull();
    expect(sockets).toHaveLength(6);
    // Art px: 7.5 + 33i is 15 + 66i CSS px.
    expect(sockets.map((s) => s.style.getPropertyValue("--at"))).toEqual(
      RELICS.map((_, i) => String(7.5 + 33 * i)),
    );
  });

  it("lights found relics, darkens the next, leaves the rest empty", () => {
    const { sockets } = setup();
    const art = sockets.map((s) =>
      s.querySelector<HTMLImageElement>("img.board-relic")?.src,
    );
    expect(art[0]).toMatch(/relic-lantern/);
    expect(art[0]).not.toMatch(/dark/);
    expect(art[1]).toMatch(/relic-shield/);
    expect(art[1]).not.toMatch(/dark/);
    expect(art[2]).toMatch(/relic-hammer-dark/);
    expect(art[3]).toBeUndefined();
    expect(art[4]).toBeUndefined();
    expect(art[5]).toBeUndefined();
  });

  it("has a tag that counts the relics and opens the shelf", () => {
    const { root, onShelf } = setup();
    const tag = root.querySelector<HTMLButtonElement>("button.board-tag");
    expect(tag?.textContent).toBe("Relics of Fatherhood · 2 of 6");
    tag?.click();
    expect(onShelf).toHaveBeenCalledTimes(1);
  });

  it("explains a found relic, the next relic and a hidden relic", () => {
    const { sockets, board } = setup();
    sockets[1]?.click();
    expect(board.note.classList.contains("on")).toBe(true);
    expect(board.note.querySelector(".board-note-h")?.textContent).toBe(
      "Shield of Protection",
    );
    expect(board.note.textContent).toContain("The virtue of Protection.");
    expect(board.note.querySelector(".board-note-q")).toBeNull();

    sockets[2]?.click();
    expect(board.note.textContent).toContain(RELICS[2]?.tease);
    expect(board.note.querySelector(".board-note-q")?.textContent).toMatch(
      /^Next · /,
    );

    sockets[4]?.click();
    expect(board.note.querySelector(".board-note-h")?.textContent).toBe(
      RELICS[4]?.name,
    );
    expect(board.note.textContent).toContain(RELICS[4]?.tease);
    expect(board.note.querySelector(".board-note-q")).toBeNull();
  });

  it("labels each socket with the relic name and the count", () => {
    const { sockets } = setup();
    sockets.forEach((s, i) => {
      const label = s.getAttribute("aria-label") ?? "";
      expect(label.startsWith(RELICS[i]?.name ?? "?")).toBe(true);
      expect(label.endsWith("2 of 6 found")).toBe(true);
    });
  });

  it("re-renders when the mountain moves on", () => {
    let mined = 12_000_000;
    const stage = document.createElement("div");
    document.body.append(stage);
    const plate = createRelicPlate({
      getView: () => view(mined),
      note: createBoardNote(stage),
      onShelf: () => undefined,
    });
    plate.render();
    mined = 30_000_000;
    plate.render();
    expect(plate.root.querySelector("button.board-tag")?.textContent).toBe(
      "Relics of Fatherhood · 3 of 6",
    );
    expect(plate.root.querySelectorAll("img.board-relic")).toHaveLength(4);
  });
});
