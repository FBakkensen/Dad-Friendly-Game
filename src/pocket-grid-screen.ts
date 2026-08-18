import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import {
  combine,
  dig,
  dugCount,
  hand,
  isCellIndex,
  place,
  type Cell,
  type CellIndex,
} from "./grid";
import {
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
} from "./progress-store";

const CELL_INDEXES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly CellIndex[];

let persistLifetime: AbortController | undefined;

export function mountPocketGridScreen({
  root,
  lanternUrl,
  cellSheetUrl,
  stoneUrl,
  chunkUrl,
  auth = createUnconfiguredAuth(),
  progress: progressArg,
}: {
  root: HTMLElement;
  lanternUrl: string;
  cellSheetUrl: string;
  stoneUrl: string;
  chunkUrl: string;
  auth?: AuthController;
  progress?: ProgressStore;
}): void {
  const ownedProgress = progressArg === undefined;
  const progress = progressArg ?? createProgressStore({ auth });
  let selected: CellIndex | undefined;
  let view: ProgressSnapshot = progress.getSnapshot();

  const lantern = document.createElement("img");
  lantern.className = "lantern";
  lantern.src = lanternUrl;
  lantern.alt = "Lantern";
  lantern.width = 32;
  lantern.height = 32;
  lantern.draggable = false;

  const handSlot = document.createElement("div");
  handSlot.className = "hand-slot";
  handSlot.setAttribute("role", "status");

  const held = document.createElement("img");
  held.className = "held-piece";
  held.src = stoneUrl;
  held.alt = "Held stone";
  held.width = 32;
  held.height = 32;
  held.draggable = false;
  handSlot.append(held);

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

    const piece = document.createElement("img");
    piece.className = "piece-art";
    piece.src = stoneUrl;
    piece.alt = "";
    piece.width = 32;
    piece.height = 32;
    piece.draggable = false;

    button.append(art, piece);
    button.addEventListener("click", () => {
      if (!view.ready) {
        return;
      }
      const raw = Number(button.dataset["index"]);
      if (!isCellIndex(raw)) {
        return;
      }
      const grid = view.grid;
      const cell = grid.cells[raw];
      switch (cell.kind) {
        case "covered":
          selected = undefined;
          progress.applyMutation(dig({ grid, index: raw }));
          break;
        case "dug":
          selected = undefined;
          progress.applyMutation(place({ grid, index: raw }));
          break;
        case "stone":
          if (selected !== undefined) {
            const fused = combine({ grid, from: selected, to: raw });
            if (fused !== grid) {
              selected = undefined;
              progress.applyMutation(fused);
              break;
            }
          }
          selected = selected === raw ? undefined : raw;
          break;
        case "chunk":
          selected = undefined;
          break;
        default: {
          const _exhaustive: never = cell;
          return _exhaustive;
        }
      }
      render();
    });
    return button;
  });

  board.append(...buttons);

  const status = document.createElement("p");
  status.className = "dig-status";
  status.setAttribute("aria-live", "polite");

  const saveStatus = document.createElement("p");
  saveStatus.className = "save-status";
  saveStatus.setAttribute("aria-live", "polite");

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

  const renderSave = (): void => {
    switch (view.saveKind) {
      case "unsigned":
        saveStatus.textContent = "Sign in to save";
        saveStatus.dataset["kind"] = "unsigned";
        break;
      case "session":
        saveStatus.textContent = "Saved in this tab";
        saveStatus.dataset["kind"] = "session";
        break;
      case "loading":
        saveStatus.textContent = "Loading your save...";
        saveStatus.dataset["kind"] = "loading";
        break;
      case "account":
        saveStatus.textContent = "Saved to your account";
        saveStatus.dataset["kind"] = "account";
        break;
      case "error":
        saveStatus.textContent = "Couldn't reach your save";
        saveStatus.dataset["kind"] = "error";
        break;
      default: {
        const _exhaustive: never = view.saveKind;
        return _exhaustive;
      }
    }
    if (view.log === undefined) {
      delete saveStatus.dataset["log"];
      return;
    }
    saveStatus.dataset["log"] = view.log;
  };

  const render = (): void => {
    for (const [index, button] of buttons.entries()) {
      if (!isCellIndex(index)) {
        continue;
      }
      const cell = view.grid.cells[index];
      button.dataset["kind"] = cell.kind;
      if (selected === index) {
        button.dataset["selected"] = "true";
      } else {
        delete button.dataset["selected"];
      }
      button.disabled = !view.ready;
      button.setAttribute(
        "aria-label",
        cellLabel({ cell, index, selected: selected === index }),
      );
      const piece = button.querySelector("img.piece-art");
      if (!(piece instanceof HTMLImageElement)) {
        continue;
      }
      switch (cell.kind) {
        case "stone":
          piece.src = stoneUrl;
          break;
        case "chunk":
          piece.src = chunkUrl;
          break;
        case "covered":
        case "dug":
          break;
        default: {
          const _exhaustive: never = cell;
          return _exhaustive;
        }
      }
    }
    const heldStone = hand();
    switch (heldStone.kind) {
      case "stone":
        held.hidden = false;
        held.alt = "Held stone";
        handSlot.dataset["kind"] = "stone";
        handSlot.setAttribute("aria-label", "Hand, holding a stone");
        status.textContent = `Holding a stone. ${String(dugCount(view.grid))} of 9 dug`;
        break;
      case "empty":
        held.hidden = true;
        held.alt = "";
        handSlot.dataset["kind"] = "empty";
        handSlot.setAttribute("aria-label", "Hand, empty");
        status.textContent = `Stone placed. ${String(dugCount(view.grid))} of 9 dug`;
        break;
      default: {
        const _exhaustive: never = heldStone;
        return _exhaustive;
      }
    }
    if (selected !== undefined) {
      status.textContent = `Tap a neighbor stone to combine. ${String(dugCount(view.grid))} of 9 dug`;
    }
    renderSave();
  };

  persistLifetime?.abort();
  persistLifetime = new AbortController();
  const { signal } = persistLifetime;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        progress.flush();
      }
    },
    { signal },
  );
  window.addEventListener(
    "pagehide",
    () => {
      progress.flush();
    },
    { signal },
  );

  root.replaceChildren(
    lantern,
    handSlot,
    board,
    status,
    saveStatus,
    authStatus,
    authButton,
  );

  const unsubscribeProgress = progress.subscribe((next) => {
    if (next.grid !== view.grid) {
      selected = undefined;
    }
    view = next;
    render();
  });
  const unsubscribeAuth = auth.subscribe(renderAuth);
  signal.addEventListener("abort", () => {
    unsubscribeProgress();
    unsubscribeAuth();
    if (ownedProgress) {
      progress.dispose();
    }
  });
}

function cellLabel({
  cell,
  index,
  selected,
}: {
  cell: Cell;
  index: CellIndex;
  selected: boolean;
}): string {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  const spot = `row ${String(row)}, column ${String(column)}`;
  switch (cell.kind) {
    case "covered":
      return `Covered earth, ${spot}`;
    case "dug":
      return `Dug earth, ${spot}`;
    case "stone":
      return selected ? `Selected stone, ${spot}` : `Stone, ${spot}`;
    case "chunk":
      return `Chunk, ${spot}`;
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}
