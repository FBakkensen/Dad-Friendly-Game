import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import {
  createPocketGrid,
  dig,
  dugCount,
  hand,
  isCellIndex,
  place,
  type Cell,
  type CellIndex,
  type PocketGrid,
} from "./grid";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { createLogger, formatLogEvent, type Logger } from "./log";

const CELL_INDEXES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly CellIndex[];

type SaveKind = "unsigned" | "loading" | "account" | "error";

let persistLifetime: AbortController | undefined;

export function mountPocketGridScreen({
  root,
  lanternUrl,
  cellSheetUrl,
  stoneUrl,
  auth = createUnconfiguredAuth(),
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
}: {
  root: HTMLElement;
  lanternUrl: string;
  cellSheetUrl: string;
  stoneUrl: string;
  auth?: AuthController;
  cloudSave?: CloudSave;
  logger?: Logger;
}): void {
  let grid: PocketGrid = createPocketGrid();
  let hydrateGeneration = 0;
  let hydrated = false;
  let inFlightWrites = 0;
  let saveKind: SaveKind = "unsigned";
  let unwatch: (() => void) | undefined;

  const persistCloud = (): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated) {
      return;
    }
    const uid = state.user.uid;
    const counts = saveCounts(grid);
    inFlightWrites += 1;
    void cloudSave.write({ uid, grid }).then((result) => {
      inFlightWrites -= 1;
      switch (result.kind) {
        case "ok":
          saveKind = "account";
          logger.record({
            level: "info",
            code: "save.write",
            detail: "ok",
            data: counts,
          });
          break;
        case "failed":
          saveKind = "error";
          logger.record({
            level: "error",
            code: "save.write",
            detail: result.message,
            data: counts,
          });
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
      render();
    });
  };

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
      const state = auth.getState();
      if (state.kind === "signed-in" && !hydrated) {
        return;
      }
      const raw = Number(button.dataset["index"]);
      if (!isCellIndex(raw)) {
        return;
      }
      const cell = grid.cells[raw];
      switch (cell.kind) {
        case "covered":
          grid = dig({ grid, index: raw });
          break;
        case "dug":
          grid = place({ grid, index: raw });
          break;
        case "stone":
          break;
        default: {
          const _exhaustive: never = cell;
          return _exhaustive;
        }
      }
      persistCloud();
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
    switch (saveKind) {
      case "unsigned":
        saveStatus.textContent = "Sign in to save";
        saveStatus.dataset["kind"] = "unsigned";
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
        const _exhaustive: never = saveKind;
        return _exhaustive;
      }
    }
    const latest = logger.latest();
    if (latest === undefined) {
      delete saveStatus.dataset["log"];
      return;
    }
    saveStatus.dataset["log"] = formatLogEvent(latest);
  };

  const render = (): void => {
    const state = auth.getState();
    const waitForCloud = state.kind === "signed-in" && !hydrated;
    for (const [index, button] of buttons.entries()) {
      if (!isCellIndex(index)) {
        continue;
      }
      const cell = grid.cells[index];
      button.dataset["kind"] = cell.kind;
      button.disabled = waitForCloud;
      button.setAttribute("aria-label", cellLabel({ cell, index }));
    }
    const heldStone = hand();
    switch (heldStone.kind) {
      case "stone":
        held.hidden = false;
        held.alt = "Held stone";
        handSlot.dataset["kind"] = "stone";
        handSlot.setAttribute("aria-label", "Hand, holding a stone");
        status.textContent = `Holding a stone. ${String(dugCount(grid))} of 9 dug`;
        break;
      case "empty":
        held.hidden = true;
        held.alt = "";
        handSlot.dataset["kind"] = "empty";
        handSlot.setAttribute("aria-label", "Hand, empty");
        status.textContent = `Stone placed. ${String(dugCount(grid))} of 9 dug`;
        break;
      default: {
        const _exhaustive: never = heldStone;
        return _exhaustive;
      }
    }
    renderSave();
  };

  const applyRemote = (remote: CloudLoadResult): void => {
    if (inFlightWrites > 0 && remote.kind === "found") {
      return;
    }
    const next = applySignedInSave({ local: grid, remote });
    grid = next.grid;
    logger.record({
      level: remote.kind === "unavailable" ? "error" : "info",
      code: "save.remote",
      detail: remote.kind,
      data: saveCounts(grid),
    });
    switch (remote.kind) {
      case "found":
      case "missing":
        hydrated = true;
        saveKind = "account";
        if (next.upload) {
          persistCloud();
        }
        break;
      case "unavailable":
      case "disabled":
        hydrated = false;
        saveKind = "error";
        break;
      default: {
        const _exhaustive: never = remote;
        return _exhaustive;
      }
    }
    render();
  };

  persistLifetime?.abort();
  persistLifetime = new AbortController();
  const { signal } = persistLifetime;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        persistCloud();
      }
    },
    { signal },
  );
  window.addEventListener("pagehide", persistCloud, { signal });
  const unsubscribeAuth = auth.subscribe((state) => {
    renderAuth(state);
    unwatch?.();
    unwatch = undefined;
    if (state.kind !== "signed-in") {
      hydrateGeneration += 1;
      hydrated = false;
      saveKind = "unsigned";
      render();
      return;
    }
    const generation = (hydrateGeneration += 1);
    hydrated = false;
    saveKind = "loading";
    logger.record({
      level: "info",
      code: "save.watch",
      detail: "start",
      data: saveCounts(grid),
    });
    render();
    unwatch = cloudSave.watch({
      uid: state.user.uid,
      onChange: (remote) => {
        if (generation !== hydrateGeneration) {
          return;
        }
        applyRemote(remote);
      },
    });
  });
  signal.addEventListener("abort", () => {
    hydrateGeneration += 1;
    unwatch?.();
    unsubscribeAuth();
  });

  root.replaceChildren(
    lantern,
    handSlot,
    board,
    status,
    saveStatus,
    authStatus,
    authButton,
  );
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
    case "stone":
      return `Stone, row ${String(row)}, column ${String(column)}`;
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}

function saveCounts(grid: PocketGrid): { dug: number; held: number } {
  return {
    dug: dugCount(grid),
    held: hand().kind === "stone" ? 1 : 0,
  };
}
