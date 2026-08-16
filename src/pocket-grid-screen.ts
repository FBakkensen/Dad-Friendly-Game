import {
  createPocketGrid,
  dig,
  dugCount,
  isCellIndex,
  type Cell,
  type CellIndex,
  type PocketGrid,
} from "./grid";

const CELL_INDEXES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly CellIndex[];

export function mountPocketGridScreen({
  root,
  lanternUrl,
  cellSheetUrl,
}: {
  root: HTMLElement;
  lanternUrl: string;
  cellSheetUrl: string;
}): void {
  let grid: PocketGrid = createPocketGrid();

  const lantern = document.createElement("img");
  lantern.className = "lantern";
  lantern.src = lanternUrl;
  lantern.alt = "Lantern";
  lantern.width = 32;
  lantern.height = 32;
  lantern.draggable = false;

  const board = document.createElement("div");
  board.className = "pocket-grid";
  board.setAttribute("role", "group");
  board.setAttribute("aria-label", "Pocket grid");

  const buttons = CELL_INDEXES.map((index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dig-cell";
    button.dataset["index"] = String(index);

    const art = document.createElement("span");
    art.className = "cell-art";
    art.style.backgroundImage = `url("${cellSheetUrl}")`;

    button.append(art);
    button.addEventListener("click", () => {
      const raw = Number(button.dataset["index"]);
      if (!isCellIndex(raw)) {
        return;
      }
      grid = dig({ grid, index: raw });
      render();
    });
    return button;
  });

  board.append(...buttons);

  const status = document.createElement("p");
  status.className = "dig-status";
  status.setAttribute("aria-live", "polite");

  const render = (): void => {
    for (const [index, button] of buttons.entries()) {
      if (!isCellIndex(index)) {
        continue;
      }
      const cell = grid.cells[index];
      button.dataset["kind"] = cell.kind;
      button.setAttribute("aria-label", cellLabel({ cell, index }));
    }
    status.textContent = `${String(dugCount(grid))} of 9 dug`;
  };

  root.replaceChildren(lantern, board, status);
  render();
}

function cellLabel({ cell, index }: { cell: Cell; index: CellIndex }): string {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  switch (cell.kind) {
    case "covered":
      return `Covered earth, row ${String(row)}, column ${String(column)}`;
    case "dug":
      return `Dug earth, row ${String(row)}, column ${String(column)}`;
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}
