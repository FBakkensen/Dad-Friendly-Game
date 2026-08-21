export type Cell =
  { kind: "covered" } | { kind: "dug" } | { kind: "stone" } | { kind: "chunk" };

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
  return Number.isInteger(index) && index >= 0 && index <= 8;
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

  return {
    width: grid.width,
    height: grid.height,
    cells: setCell({ cells: grid.cells, index, cell: { kind: "stone" } }),
  };
}

function areNeighbors({ a, b }: { a: CellIndex; b: CellIndex }): boolean {
  if (a === b) {
    return false;
  }
  const columnA = a % 3;
  const rowA = (a - columnA) / 3;
  const columnB = b % 3;
  const rowB = (b - columnB) / 3;
  const columnGap = columnA < columnB ? columnB - columnA : columnA - columnB;
  const rowGap = rowA < rowB ? rowB - rowA : rowA - rowB;
  return (columnGap === 1 && rowGap === 0) || (columnGap === 0 && rowGap === 1);
}

export function combine({
  grid,
  from,
  to,
}: {
  grid: PocketGrid;
  from: CellIndex;
  to: CellIndex;
}): PocketGrid {
  if (!areNeighbors({ a: from, b: to })) {
    return grid;
  }
  if (grid.cells[from].kind !== "stone" || grid.cells[to].kind !== "stone") {
    return grid;
  }
  const emptied = setCell({
    cells: grid.cells,
    index: from,
    cell: { kind: "dug" },
  });
  return {
    width: grid.width,
    height: grid.height,
    cells: setCell({ cells: emptied, index: to, cell: { kind: "chunk" } }),
  };
}

// ponytail: flat 1 stone per 5 min away, cap 3 per absence; tune the constants when the loop demands it
const SETTLE_MS_PER_STONE = 5 * 60 * 1000;
const SETTLE_CAP = 3;
const CELL_ORDER: readonly CellIndex[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function settleStones({
  grid,
  elapsedMs,
}: {
  grid: PocketGrid;
  elapsedMs: number;
}): { grid: PocketGrid; settled: number } {
  const due = Math.max(
    0,
    Math.min(SETTLE_CAP, Math.floor(elapsedMs / SETTLE_MS_PER_STONE)),
  );
  let cells = grid.cells;
  let settled = 0;
  for (const index of CELL_ORDER) {
    if (settled >= due) {
      break;
    }
    if (cells[index].kind !== "dug") {
      continue;
    }
    cells = setCell({ cells, index, cell: { kind: "stone" } });
    settled += 1;
  }
  return settled === 0
    ? { grid, settled: 0 }
    : { grid: { width: 3, height: 3, cells }, settled };
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
    case "chunk":
      return { kind: "chunk" };
    default:
      return undefined;
  }
}

function parseCells(value: unknown): PocketGrid["cells"] | undefined {
  if (!Array.isArray(value) || value.length !== 9) {
    return undefined;
  }
  const cells = value.map(parseCell);
  return cells.every((cell) => cell !== undefined)
    ? (cells as unknown as PocketGrid["cells"])
    : undefined;
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
  const next = [...cells];
  next[index] = cell;
  return next as unknown as PocketGrid["cells"];
}
