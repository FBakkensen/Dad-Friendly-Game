import type { AuthController, AuthState } from "./auth";
import { formatFieldLog } from "./field-log";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  fieldLogClose,
  fieldLogCopied,
  fieldLogCopy,
  fieldLogFallback,
  fieldLogTitle,
} from "./screen-words";

/** The tucked-away menu (account, sign in/out, Start over) and the Start over confirm. */
export function createMenuPanel({
  progress,
  getView,
  auth,
  onStartOver,
  extras = [],
  requestRender,
}: {
  /** More menu entries, shown above Start over (e.g. passing the mine). */
  extras?: readonly HTMLElement[];
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  auth: AuthController;
  onStartOver: () => void;
  requestRender: () => void;
}) {
  const startOverLink = document.createElement("button");
  startOverLink.type = "button";
  startOverLink.className = "start-over-link";
  startOverLink.textContent = "Start over";
  let confirmingStartOver = false;
  startOverLink.addEventListener("click", () => {
    menuOpen = false;
    confirmingStartOver = true;
    requestRender();
  });

  // Account and Start over live in a tucked-away menu so the main screen fits a phone.
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "menu-button";
  menuButton.setAttribute("aria-label", "Menu");
  menuButton.setAttribute("aria-haspopup", "dialog");
  menuButton.textContent = "☰";
  let menuOpen = false;
  menuButton.addEventListener("click", () => {
    menuOpen = true;
    requestRender();
  });
  const menu = document.createElement("div");
  menu.className = "game-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-modal", "true");
  menu.setAttribute("aria-labelledby", "game-menu-title");
  menu.hidden = true;
  const menuCard = document.createElement("div");
  menuCard.className = "menu-card";
  const menuTitle = document.createElement("h2");
  menuTitle.id = "game-menu-title";
  menuTitle.textContent = "Menu";
  const menuClose = document.createElement("button");
  menuClose.type = "button";
  menuClose.className = "menu-close";
  menuClose.textContent = "Back to the mountain";
  const closeMenu = (): void => {
    menuOpen = false;
    menuCard.querySelector(".copied-float")?.remove();
    requestRender();
    menuButton.focus();
  };
  menuClose.addEventListener("click", closeMenu);
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  menu.append(menuCard);

  const confirm = document.createElement("div");
  confirm.className = "start-over";
  confirm.setAttribute("role", "alertdialog");
  confirm.setAttribute("aria-modal", "true");
  confirm.setAttribute("aria-labelledby", "start-over-title");
  confirm.setAttribute("aria-describedby", "start-over-detail");
  confirm.hidden = true;
  const confirmCard = document.createElement("div");
  confirmCard.className = "start-over-card";
  const confirmTitle = document.createElement("h2");
  confirmTitle.id = "start-over-title";
  confirmTitle.textContent = "Start over?";
  const confirmDetail = document.createElement("p");
  confirmDetail.id = "start-over-detail";
  confirmDetail.textContent =
    "You will lose all your progress: every stone mined, your whole crew, and every relic you found. The mountain fills back up. This can't be undone.";
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "start-over-cancel";
  confirmCancel.textContent = "Keep my mountain";
  const confirmYes = document.createElement("button");
  confirmYes.type = "button";
  confirmYes.className = "start-over-confirm";
  confirmYes.textContent = "Yes, start over";
  const closeConfirm = (): void => {
    confirmingStartOver = false;
    requestRender();
    menuButton.focus();
  };
  confirmCancel.addEventListener("click", closeConfirm);
  confirmYes.addEventListener("click", () => {
    confirmingStartOver = false;
    progress.startOver();
    onStartOver();
    requestRender();
  });
  confirm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeConfirm();
    }
  });
  const confirmActions = document.createElement("div");
  confirmActions.className = "start-over-actions";
  confirmActions.append(confirmCancel, confirmYes);
  confirmCard.append(confirmTitle, confirmDetail, confirmActions);
  confirm.append(confirmCard);

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
      /* v8 ignore next 4 -- exhaustiveness guard, unreachable */
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
      /* v8 ignore next 4 -- exhaustiveness guard, unreachable */
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  };

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "field-log-copy";
  copyButton.textContent = fieldLogCopy;

  const fieldLogSheet = document.createElement("div");
  fieldLogSheet.className = "field-log-sheet";
  fieldLogSheet.setAttribute("role", "dialog");
  fieldLogSheet.setAttribute("aria-modal", "true");
  fieldLogSheet.setAttribute("aria-labelledby", "field-log-title");
  fieldLogSheet.hidden = true;
  const fieldLogCard = document.createElement("div");
  fieldLogCard.className = "menu-card field-log-card";
  const fieldLogHeading = document.createElement("h2");
  fieldLogHeading.id = "field-log-title";
  fieldLogHeading.textContent = fieldLogTitle;
  const fieldLogHint = document.createElement("p");
  fieldLogHint.className = "field-log-hint";
  fieldLogHint.textContent = fieldLogFallback;
  const fieldLogBox = document.createElement("textarea");
  fieldLogBox.className = "field-log-text";
  fieldLogBox.readOnly = true;
  fieldLogBox.spellcheck = false;
  fieldLogBox.setAttribute("aria-label", fieldLogTitle);
  const fieldLogDone = document.createElement("button");
  fieldLogDone.type = "button";
  fieldLogDone.className = "menu-close field-log-close";
  fieldLogDone.textContent = fieldLogClose;
  let fieldLogOpen = false;
  const closeFieldLog = (): void => {
    fieldLogOpen = false;
    requestRender();
    menuButton.focus();
  };
  fieldLogDone.addEventListener("click", closeFieldLog);
  fieldLogSheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFieldLog();
    }
  });
  fieldLogCard.append(fieldLogHeading, fieldLogHint, fieldLogBox, fieldLogDone);
  fieldLogSheet.append(fieldLogCard);

  const showCopied = (): void => {
    menuCard.querySelector(".copied-float")?.remove();
    const copied = document.createElement("span");
    copied.className = "copied-float";
    copied.setAttribute("role", "status");
    copied.textContent = fieldLogCopied;
    copied.addEventListener("animationend", () => {
      copied.remove();
    });
    menuCard.append(copied);
  };

  const writeClipboard = async (text: string): Promise<boolean> => {
    const clipboard = Reflect.get(navigator, "clipboard") as
      { readonly writeText?: (value: string) => Promise<void> } | undefined;
    if (clipboard === undefined || typeof clipboard.writeText !== "function") {
      return false;
    }
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  copyButton.addEventListener("click", () => {
    const text = formatFieldLog(progress.fieldLog());
    void writeClipboard(text).then((copied) => {
      if (copied) {
        showCopied();
        return;
      }
      fieldLogBox.value = text;
      menuOpen = false;
      fieldLogOpen = true;
      requestRender();
    });
  });

  const renderMenu = (): void => {
    const wasOpen = !menu.hidden;
    menu.hidden = !menuOpen;
    if (menuOpen && !wasOpen) {
      menuClose.focus();
    }
  };

  const renderConfirm = (): void => {
    startOverLink.disabled = !getView().ready;
    const wasOpen = !confirm.hidden;
    confirm.hidden = !confirmingStartOver;
    if (confirmingStartOver && !wasOpen) {
      confirmCancel.focus();
    }
  };

  menuCard.append(
    menuTitle,
    authStatus,
    authButton,
    ...extras,
    copyButton,
    startOverLink,
    menuClose,
  );

  auth.subscribe(renderAuth);

  const renderFieldLog = (): void => {
    copyButton.disabled = !getView().ready;
    const wasOpen = !fieldLogSheet.hidden;
    fieldLogSheet.hidden = !fieldLogOpen;
    if (fieldLogOpen && !wasOpen) {
      fieldLogBox.focus();
    }
  };

  const render = (): void => {
    renderConfirm();
    renderMenu();
    renderFieldLog();
  };

  /** Closes the menu without moving focus (another dialog takes over). */
  const close = (): void => {
    menuOpen = false;
  };

  return { menuButton, menu, confirm, fieldLogSheet, close, render };
}
