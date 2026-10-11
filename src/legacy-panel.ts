import { formatCount } from "./format";
import { legacyBonus, passTheMine } from "./legacy";
import type { Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";

/** "×1.5", "×2": the Legacy bonus as people read it. */
export const legacyWords = (bonus: number): string =>
  `×${String(Number(bonus.toFixed(2)))}`;

const canPass = (mountain: Mountain): boolean =>
  passTheMine(mountain, 0) !== undefined;

/**
 * Pass the mine to your kid (M6): the menu entry, the confirm card, and the
 * Legacy badge for the header. Offered only once the mountain is finished.
 */
export function createLegacyPanel({
  progress,
  getView,
  onPassed,
  beforeOpen,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  /** After a new run starts (the screen resets its vein wait). */
  onPassed: () => void;
  /** Closes whatever offered it (the menu or the Legend card). */
  beforeOpen: () => void;
  requestRender: () => void;
}) {
  let open = false;
  let returnFocus: HTMLElement | undefined;

  const badge = document.createElement("span");
  badge.className = "legacy-badge";
  badge.setAttribute("role", "img");
  badge.hidden = true;

  const menuPass = document.createElement("button");
  menuPass.type = "button";
  menuPass.className = "menu-pass";
  menuPass.textContent = "Pass the mine to your kid";

  const dialog = document.createElement("div");
  dialog.className = "start-over legacy-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "legacy-title");
  dialog.setAttribute("aria-describedby", "legacy-detail");
  dialog.hidden = true;
  const card = document.createElement("div");
  card.className = "start-over-card legacy-card";
  const title = document.createElement("h2");
  title.id = "legacy-title";
  title.textContent = "Pass the mine to your kid?";
  const detail = document.createElement("p");
  detail.id = "legacy-detail";
  detail.className = "legacy-detail";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "start-over-cancel legacy-cancel";
  cancel.textContent = "Not yet";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "legacy-confirm";
  yes.textContent = "Pass it on";
  const actions = document.createElement("div");
  actions.className = "start-over-actions";
  actions.append(cancel, yes);
  card.append(title, detail, actions);
  dialog.append(card);

  const show = (from: HTMLElement | undefined): void => {
    beforeOpen();
    returnFocus = from;
    open = true;
    requestRender();
  };
  const close = (): void => {
    open = false;
    requestRender();
    returnFocus?.focus();
  };
  menuPass.addEventListener("click", () => {
    show(undefined);
  });
  cancel.addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });
  yes.addEventListener("click", () => {
    open = false;
    if (progress.passTheMine()) {
      onPassed();
    }
    requestRender();
  });

  const render = (): void => {
    const { mountain, ready } = getView();
    const bonus = legacyBonus(mountain);
    const legacy = mountain.legacy ?? 0;
    badge.hidden = legacy === 0;
    badge.textContent = legacyWords(bonus);
    badge.setAttribute(
      "aria-label",
      `Legacy ${formatCount(legacy)}: your crew and taps are ${legacyWords(bonus)}`,
    );
    const offered = ready && canPass(mountain);
    menuPass.hidden = !offered;
    const next = legacyWords(legacyBonus({ ...mountain, legacy: legacy + 1 }));
    detail.textContent = `Your kid starts a fresh mountain with your Legacy: the whole crew and every tap ${next}, for good. The relics wait to be found again; the crew, upgrades and stones start fresh. You'll always be the Legend who began it.`;
    const wasOpen = !dialog.hidden;
    dialog.hidden = !open || !offered;
    if (!dialog.hidden && !wasOpen) {
      cancel.focus();
    }
  };

  return { badge, menuPass, dialog, open: show, render };
}
