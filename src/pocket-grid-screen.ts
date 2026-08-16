import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import {
  dig,
  dugCount,
  isCellIndex,
  type Cell,
  type CellIndex,
  type PocketGrid,
} from "./grid";
import { readGridSave, writeGridSave } from "./persist";

const CELL_INDEXES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly CellIndex[];

let persistLifetime: AbortController | undefined;

export function mountPocketGridScreen({
  root,
  lanternUrl,
  cellSheetUrl,
  storage = window.localStorage,
  auth = createUnconfiguredAuth(),
}: {
  root: HTMLElement;
  lanternUrl: string;
  cellSheetUrl: string;
  storage?: Storage;
  auth?: AuthController;
}): void {
  let grid: PocketGrid = readGridSave({ storage });
  const persist = (): void => {
    writeGridSave({ storage, grid });
  };

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
      persist();
      render();
    });
    return button;
  });

  board.append(...buttons);

  const status = document.createElement("p");
  status.className = "dig-status";
  status.setAttribute("aria-live", "polite");

  const authStatus = document.createElement("p");
  authStatus.className = "auth-status";
  authStatus.setAttribute("aria-live", "polite");

  const authButton = document.createElement("button");
  authButton.type = "button";
  authButton.className = "auth-action";
  authButton.addEventListener("click", () => {
    const state = auth.getState();
    switch (state.kind) {
      case "signed-out":
        void auth.signIn();
        return;
      case "signing-in":
        return;
      case "signed-in":
        void auth.signOut();
        return;
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  });

  const renderAuth = (state: AuthState): void => {
    switch (state.kind) {
      case "signed-out":
        authButton.textContent = "Sign in with Google";
        authButton.disabled = false;
        authStatus.textContent = "";
        return;
      case "signing-in":
        authButton.textContent = "Signing in...";
        authButton.disabled = true;
        authStatus.textContent = "";
        return;
      case "signed-in":
        authButton.textContent = "Sign out";
        authButton.disabled = false;
        authStatus.textContent = `Signed in as ${state.user.label}`;
        return;
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  };

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

  persistLifetime?.abort();
  persistLifetime = new AbortController();
  const { signal } = persistLifetime;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        persist();
      }
    },
    { signal },
  );
  window.addEventListener("pagehide", persist, { signal });
  const unsubscribeAuth = auth.subscribe(renderAuth);
  signal.addEventListener("abort", unsubscribeAuth);

  root.replaceChildren(lantern, board, status, authStatus, authButton);
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
