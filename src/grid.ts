export type Cell = { kind: "covered" } | { kind: "dug" } | { kind: "stone" };

export type CellIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Hand = { kind: "stone" } | { kind: "empty" };

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

export function hand(grid: PocketGrid): Hand {
  for (const cell of grid.cells) {
    if (cell.kind === "stone") {
      return { kind: "empty" };
    }
  }
  return { kind: "stone" };
}

export function dig({
  grid,
  index,
}: {
  grid: PocketGrid;
  index: CellIndex;
}): PocketGrid {
  if (grid.cells[index].kind !== "covered") {
    return grid;
  }

  return {
    width: grid.width,
    height: grid.height,
    cells: setCell({ cells: grid.cells, index, cell: { kind: "dug" } }),
  };
}

export function place({
  grid,
  index,
}: {
  grid: PocketGrid;
  index: CellIndex;
}): PocketGrid {
  if (grid.cells[index].kind !== "dug") {
    return grid;
  }
  if (hand(grid).kind !== "stone") {
    return grid;
  }

  return {
    width: grid.width,
    height: grid.height,
    cells: setCell({ cells: grid.cells, index, cell: { kind: "stone" } }),
  };
}

export function dugCount(grid: PocketGrid): number {
  return grid.cells.filter((cell) => cell.kind !== "covered").length;
}

export function parsePocketGrid(value: unknown): PocketGrid | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!("width" in value) || !("height" in value) || !("cells" in value)) {
    return undefined;
  }
  if (value.width !== 3 || value.height !== 3) {
    return undefined;
  }
  const cells = parseCells(value.cells);
  if (cells === undefined) {
    return undefined;
  }
  return { width: 3, height: 3, cells };
}

function parseCell(value: unknown): Cell | undefined {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return undefined;
  }
  switch (value.kind) {
    case "covered":
      return { kind: "covered" };
    case "dug":
      return { kind: "dug" };
    case "stone":
      return { kind: "stone" };
    default:
      return undefined;
  }
}

function parseCells(value: unknown): PocketGrid["cells"] | undefined {
  if (!Array.isArray(value) || value.length !== 9) {
    return undefined;
  }
  const c0 = parseCell(value[0]);
  const c1 = parseCell(value[1]);
  const c2 = parseCell(value[2]);
  const c3 = parseCell(value[3]);
  const c4 = parseCell(value[4]);
  const c5 = parseCell(value[5]);
  const c6 = parseCell(value[6]);
  const c7 = parseCell(value[7]);
  const c8 = parseCell(value[8]);
  if (
    c0 === undefined ||
    c1 === undefined ||
    c2 === undefined ||
    c3 === undefined ||
    c4 === undefined ||
    c5 === undefined ||
    c6 === undefined ||
    c7 === undefined ||
    c8 === undefined
  ) {
    return undefined;
  }
  return [c0, c1, c2, c3, c4, c5, c6, c7, c8];
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
