import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import {
  createPocketGrid,
  dig,
  dugCount,
  isCellIndex,
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
  auth = createUnconfiguredAuth(),
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
}: {
  root: HTMLElement;
  lanternUrl: string;
  cellSheetUrl: string;
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
    const dug = dugCount(grid);
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
            data: { dug },
          });
          break;
        case "failed":
          saveKind = "error";
          logger.record({
            level: "error",
            code: "save.write",
            detail: result.message,
            data: { dug },
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
      const state = auth.getState();
      if (state.kind === "signed-in" && !hydrated) {
        return;
      }
      const raw = Number(button.dataset["index"]);
      if (!isCellIndex(raw)) {
        return;
      }
      grid = dig({ grid, index: raw });
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
    status.textContent = `${String(dugCount(grid))} of 9 dug`;
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
      data: { dug: dugCount(grid) },
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
      data: { dug: dugCount(grid) },
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
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}
