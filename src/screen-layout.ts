import { createSheetScrim, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";

type Part = { readonly root: HTMLElement };

/**
 * The board's layout: the top, the rows, the two clips, the save line, the note, the Running now
 * park and the cards, in that order. The scrim made here follows the board's model, so the root
 * lays the board out where it always has: after the keys, before the tick.
 */
export function layOutBoard(
  root: HTMLElement,
  parts: {
    readonly board: BoardHost;
    readonly top: {
      readonly relicPlate: Part;
      readonly stock: { readonly odometer: Part; readonly dial: Part };
    };
    readonly gaugeRow: Part;
    readonly bays: Part;
    readonly readyRow: Part;
    readonly rail: Part;
    readonly sign: Part;
    readonly crewSheet: BoardSheet;
    readonly upgradesSheet: BoardSheet;
    readonly saveLine: {
      readonly line: HTMLElement;
      readonly drawer: HTMLElement;
    };
    readonly note: HTMLElement;
    readonly park: HTMLElement;
    readonly cards: readonly HTMLElement[];
  },
): void {
  const { board, top, crewSheet, upgradesSheet, saveLine } = parts;
  const { relicPlate } = top;
  // The board's top: the relic plate and the stock row (#370).
  const stockRow = document.createElement("div");
  stockRow.className = "board-stock";
  stockRow.append(top.stock.odometer.root, top.stock.dial.root);
  const boardTop = document.createElement("div");
  boardTop.className = "board-top";
  boardTop.append(relicPlate.root, stockRow);
  // The closed drawer waits below the save line. This box clips it there, so
  // the board never gains scroll height from it.
  const drawerClip = document.createElement("div");
  drawerClip.className = "board-drawer-clip";
  drawerClip.append(saveLine.drawer);
  // The drawers slide up inside the board above the save line; the scrim over
  // the board's top closes them, and hands a tap on a relic to its socket (#373).
  const sheetClip = document.createElement("div");
  sheetClip.className = "board-sheet-clip";
  sheetClip.append(
    crewSheet.root,
    upgradesSheet.root,
    createSheetScrim({
      board,
      sheets: [crewSheet, upgradesSheet],
      sockets: () => [
        ...relicPlate.root.querySelectorAll<HTMLElement>(".board-socket"),
      ],
    }),
  );

  root.replaceChildren(
    boardTop,
    parts.gaugeRow.root,
    parts.bays.root,
    parts.readyRow.root,
    parts.rail.root,
    parts.sign.root,
    sheetClip,
    drawerClip,
    saveLine.line,
    parts.note,
    parts.park,
    ...parts.cards,
  );
}
