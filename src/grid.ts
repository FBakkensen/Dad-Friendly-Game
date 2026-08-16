export type Cell = { kind: "covered" } | { kind: "dug" };

export type CellIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type PocketGrid = {
  readonly width: 3;
  readonly height: 3;
  readonly cells: readonly [
    Cell,
    Cell,
    Cell,
    Cell,
    Cell,
    Cell,
    Cell,
    Cell,
    Cell,
  ];
};

const covered: Cell = { kind: "covered" };

export function createPocketGrid(): PocketGrid {
  return {
    width: 3,
    height: 3,
    cells: [
      covered,
      covered,
      covered,
      covered,
      covered,
      covered,
      covered,
      covered,
      covered,
    ],
  };
}

export function isCellIndex(index: number): index is CellIndex {
  return (
    index === 0 ||
    index === 1 ||
    index === 2 ||
    index === 3 ||
    index === 4 ||
    index === 5 ||
    index === 6 ||
    index === 7 ||
    index === 8
  );
}

export function dig({
  grid,
  index,
}: {
  grid: PocketGrid;
  index: CellIndex;
}): PocketGrid {
  if (grid.cells[index].kind === "dug") {
    return grid;
  }

  return {
    width: grid.width,
    height: grid.height,
    cells: setCell({ cells: grid.cells, index, cell: { kind: "dug" } }),
  };
}

export function dugCount(grid: PocketGrid): number {
  return grid.cells.filter((cell) => cell.kind === "dug").length;
}

function setCell({
  cells,
  index,
  cell,
}: {
  cells: PocketGrid["cells"];
  index: CellIndex;
  cell: Cell;
}): PocketGrid["cells"] {
  return [
    index === 0 ? cell : cells[0],
    index === 1 ? cell : cells[1],
    index === 2 ? cell : cells[2],
    index === 3 ? cell : cells[3],
    index === 4 ? cell : cells[4],
    index === 5 ? cell : cells[5],
    index === 6 ? cell : cells[6],
    index === 7 ? cell : cells[7],
    index === 8 ? cell : cells[8],
  ];
}
