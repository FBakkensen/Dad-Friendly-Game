import { reducedMotion } from "./float-text";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  RECIPE_ON_BENCH,
  WORKSHOP_BENCH_BUSY,
  WORKSHOP_CANCEL_CONFIRM,
  WORKSHOP_EARLIER,
  WORKSHOP_LOCKED,
  WORKSHOP_MORE,
  WORKSHOP_QUIET,
  WORKSHOP_SOUND,
  WORKSHOP_TITLE,
  fieldLogClose,
  workshopMenuWords,
} from "./screen-words";
import type { MaterialId } from "./layers";
import {
  benchLeftMs,
  benchView,
  metMaterialChips,
  timerLines,
  workshopCards,
  workshopPages,
  type CostChip,
  type RecipeCard,
  type WorkshopCard,
} from "./workshop-sheet";
import {
  cancelCraft,
  startCraft,
  workshopUnlocked,
  type RecipeId,
} from "./workshop";

/**
 * The Workshop sheet (M9-8). One bench, real numbers, a dark sketch for
 * what is still unfound. The hammer is quiet until the dad taps Sound.
 */

const HAMMER_MS = 960;
const FLOAT_MS = 700;
const SHAKE_MS = 960;

function playHammer(soundOn: boolean): void {
  if (!soundOn) {
    return;
  }
  const Context = (window as Window & { AudioContext?: typeof AudioContext })
    .AudioContext;
  if (Context === undefined) {
    return;
  }
  const audio = new Context();
  const seconds = 0.09;
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const fade = 1 - index / length;
    data[index] = (Math.random() * 2 - 1) * fade * fade;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const gain = audio.createGain();
  gain.gain.value = 0.12;
  source.connect(gain);
  gain.connect(audio.destination);
  source.onended = () => {
    void audio.close();
  };
  source.start();
}

function materialIcon(id: MaterialId, stoneUrl: string): HTMLImageElement {
  const icon = document.createElement("img");
  icon.className = `mat mat-${id}`;
  icon.src = stoneUrl;
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  icon.draggable = false;
  return icon;
}

export function createWorkshopPanel({
  progress,
  getView,
  now,
  stoneUrl,
  hammerUrl,
  onOpen,
  onClose,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  now: () => number;
  stoneUrl: string;
  hammerUrl: string;
  /** The menu closes as the sheet opens. */
  onOpen: () => void;
  /** Focus returns to the menu button. */
  onClose: () => void;
  requestRender: () => void;
}): { menuEntry: HTMLElement; sheet: HTMLDivElement; render: () => void } {
  let open = false;
  let page = 0;
  let soundOn = false;
  let shaking: RecipeId | undefined;
  let cancelArmed = false;
  let cancelTimer: number | undefined;
  let hammerUntil = 0;
  let floatUntil = 0;
  let floatBits: readonly CostChip[] = [];
  let painted = "";

  const menuEntry = document.createElement("div");
  menuEntry.className = "workshop-menu";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "workshop-open";
  openButton.textContent = WORKSHOP_TITLE;
  openButton.addEventListener("click", () => {
    const view = getView();
    if (!view.ready || !workshopUnlocked(view.mountain)) {
      return;
    }
    open = true;
    page = 0;
    onOpen();
    requestRender();
  });

  const locked = document.createElement("p");
  locked.className = "workshop-locked";
  const lockedArt = document.createElement("img");
  lockedArt.src = stoneUrl;
  lockedArt.alt = "";
  lockedArt.width = 36;
  lockedArt.height = 36;
  lockedArt.draggable = false;
  const lockedText = document.createElement("span");
  lockedText.textContent = WORKSHOP_LOCKED;
  locked.append(lockedArt, lockedText);
  menuEntry.append(openButton, locked);

  const sheet = document.createElement("div");
  sheet.className = "workshop-dialog";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "workshop-title");
  sheet.hidden = true;

  const card = document.createElement("section");
  card.className = "workshop-sheet";

  const head = document.createElement("div");
  head.className = "workshop-head";
  const title = document.createElement("h2");
  title.id = "workshop-title";
  title.className = "label";
  title.textContent = WORKSHOP_TITLE;
  const soundButton = document.createElement("button");
  soundButton.type = "button";
  soundButton.className = "workshop-sound";
  soundButton.textContent = WORKSHOP_QUIET;
  soundButton.setAttribute("aria-pressed", "false");
  soundButton.setAttribute("aria-label", "Sound is off");
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    if (soundOn) {
      playHammer(true);
    }
    requestRender();
  });
  head.append(title, soundButton);

  const materials = document.createElement("p");
  materials.className = "workshop-materials label";

  const bench = document.createElement("div");
  bench.className = "workshop-bench";
  const benchLine = document.createElement("p");
  benchLine.className = "label";
  const benchAside = document.createElement("p");
  benchAside.className = "label aside";
  const bar = document.createElement("div");
  bar.className = "workshop-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  const barFill = document.createElement("span");
  bar.append(barFill);
  const timers = document.createElement("p");
  timers.className = "workshop-timers label";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "workshop-cancel";
  const disarmCancel = (): void => {
    cancelArmed = false;
    if (cancelTimer !== undefined) {
      clearTimeout(cancelTimer);
      cancelTimer = undefined;
    }
  };
  cancel.addEventListener("click", () => {
    if (!getView().ready) {
      return;
    }
    if (!cancelArmed) {
      cancelArmed = true;
      cancelTimer = window.setTimeout(() => {
        cancelArmed = false;
        cancelTimer = undefined;
        requestRender();
      }, 4_000);
      requestRender();
      return;
    }
    disarmCancel();
    progress.applyMutation((current) => cancelCraft(current, now()));
  });
  const hammer = document.createElement("img");
  hammer.className = "workshop-hammer";
  hammer.src = hammerUrl;
  hammer.alt = "";
  hammer.width = 48;
  hammer.height = 48;
  hammer.draggable = false;
  bench.append(benchLine, benchAside, bar, cancel, hammer);

  const recipes = document.createElement("div");
  recipes.className = "workshop-recipes";

  const pager = document.createElement("div");
  pager.className = "workshop-pager";
  const earlier = document.createElement("button");
  earlier.type = "button";
  earlier.className = "workshop-earlier";
  earlier.textContent = WORKSHOP_EARLIER;
  earlier.addEventListener("click", () => {
    page -= 1;
    requestRender();
  });
  const more = document.createElement("button");
  more.type = "button";
  more.className = "workshop-more";
  more.textContent = WORKSHOP_MORE;
  more.addEventListener("click", () => {
    page += 1;
    requestRender();
  });
  pager.append(earlier, more);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "workshop-close";
  close.textContent = fieldLogClose;
  const shut = (): void => {
    open = false;
    requestRender();
    onClose();
  };
  close.addEventListener("click", shut);
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      shut();
    }
  });

  const floats = document.createElement("div");
  floats.className = "workshop-floats";

  card.append(head, materials, bench, timers, recipes, pager, close, floats);
  sheet.append(card);

  const celebrate = (costs: readonly CostChip[]): void => {
    const at = now();
    hammerUntil = at + HAMMER_MS;
    floatUntil = reducedMotion() ? at : at + FLOAT_MS;
    floatBits = costs;
    playHammer(soundOn);
  };

  const shake = (id: RecipeId): void => {
    shaking = id;
    window.setTimeout(() => {
      if (shaking === id) {
        shaking = undefined;
        requestRender();
      }
    }, SHAKE_MS);
    requestRender();
  };

  const onCraft = (recipe: RecipeCard): void => {
    const view = getView();
    if (!view.ready) {
      return;
    }
    if (recipe.action.kind === "short") {
      shake(recipe.id);
      return;
    }
    if (recipe.action.kind !== "craft") {
      return;
    }
    celebrate(recipe.costs);
    progress.applyMutation((current) => startCraft(current, recipe.id, now()));
  };

  const paintCard = (item: WorkshopCard): HTMLElement => {
    const article = document.createElement("article");
    article.className = "workshop-card";
    if (item.kind === "hidden") {
      article.classList.add("is-hidden");
      const shade = document.createElement("img");
      shade.className = "shade";
      shade.src = stoneUrl;
      shade.alt = "";
      shade.width = 64;
      shade.height = 64;
      shade.draggable = false;
      const hint = document.createElement("p");
      hint.className = "label hint";
      hint.textContent = item.hint;
      article.append(shade, hint);
      return article;
    }
    article.dataset["recipe"] = item.id;
    const name = document.createElement("h3");
    name.className = "label";
    name.textContent = item.name;
    const level = document.createElement("p");
    level.className = "label level";
    level.hidden = item.level === undefined;
    level.textContent = item.level ?? "";
    const effect = document.createElement("p");
    effect.className = "label effect";
    effect.textContent = item.effect;
    const cost = document.createElement("p");
    cost.className = "workshop-cost";
    if (item.stones !== undefined) {
      const stones = document.createElement("span");
      stones.className = "cost-bit";
      const icon = document.createElement("img");
      icon.className = "mat";
      icon.src = stoneUrl;
      icon.alt = "";
      icon.width = 16;
      icon.height = 16;
      icon.draggable = false;
      stones.append(icon, document.createTextNode(item.stones));
      cost.append(stones);
    }
    for (const chip of item.costs) {
      const bit = document.createElement("span");
      bit.className = "cost-bit";
      bit.append(
        materialIcon(chip.id, stoneUrl),
        document.createTextNode(chip.text),
      );
      cost.append(bit);
    }
    const time = document.createElement("span");
    time.className = "label cost-time";
    time.textContent = item.time;
    cost.append(time);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workshop-craft";
    const action = item.action;
    if (action.kind === "craft") {
      button.textContent = action.label;
    } else if (action.kind === "short") {
      button.textContent = action.label;
      button.classList.add("is-short");
      button.setAttribute("aria-disabled", "true");
      button.dataset["short"] = action.label;
    } else if (action.kind === "waiting") {
      button.textContent = WORKSHOP_BENCH_BUSY;
      button.classList.add("is-waiting");
      button.setAttribute("aria-disabled", "true");
    } else {
      button.textContent = RECIPE_ON_BENCH;
      button.classList.add("is-on-bench");
      button.setAttribute("aria-disabled", "true");
    }
    if (shaking === item.id) {
      button.classList.add("is-shaking");
    }
    button.addEventListener("click", () => {
      onCraft(item);
    });
    article.append(name, level, effect, cost, button);
    return article;
  };

  const render = (): void => {
    const view = getView();
    const mountain = view.mountain;
    const unlocked = workshopUnlocked(mountain);
    openButton.hidden = !unlocked;
    locked.hidden = unlocked;
    openButton.textContent = workshopMenuWords(benchLeftMs(mountain, now()));
    soundButton.textContent = soundOn ? WORKSHOP_SOUND : WORKSHOP_QUIET;
    soundButton.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundButton.setAttribute(
      "aria-label",
      soundOn ? "Sound is on" : "Sound is off",
    );
    if (!unlocked) {
      open = false;
    }
    const wasOpen = !sheet.hidden;
    sheet.hidden = !open;
    if (!open) {
      return;
    }
    const at = now();
    materials.replaceChildren();
    const chips = metMaterialChips(mountain);
    chips.forEach((chip, index) => {
      if (index > 0) {
        const dot = document.createElement("span");
        dot.className = "label dot";
        dot.textContent = "·";
        materials.append(dot);
      }
      const bit = document.createElement("span");
      bit.className = "material-bit";
      bit.append(
        materialIcon(chip.id, stoneUrl),
        document.createTextNode(chip.text),
      );
      materials.append(bit);
    });
    const benchState = benchView(mountain, at);
    benchLine.textContent = benchState.title;
    benchAside.textContent = benchState.aside;
    const lines = timerLines(mountain, at);
    timers.textContent = lines.join(" · ");
    timers.hidden = lines.length === 0;
    if (benchState.kind === "busy") {
      bar.hidden = false;
      const percent = Math.round(benchState.progress * 100);
      barFill.style.width = `${String(percent)}%`;
      bar.setAttribute("aria-valuenow", String(percent));
      bar.setAttribute("aria-label", benchState.title);
      cancel.hidden = benchState.cancel === "";
      cancel.classList.toggle("is-confirm", cancelArmed);
      cancel.textContent = cancelArmed
        ? WORKSHOP_CANCEL_CONFIRM
        : benchState.cancel;
    } else {
      bar.hidden = true;
      cancel.hidden = true;
      if (cancelArmed) {
        disarmCancel();
      }
    }
    bench.classList.toggle("is-hammer", at < hammerUntil);
    const cards = workshopCards(mountain, at);
    const pages = workshopPages(cards);
    if (page > pages.length - 1) {
      page = Math.max(0, pages.length - 1);
    }
    const shown = pages[page] ?? [];
    const signature = JSON.stringify({
      page,
      shaking,
      cards: shown.map((item) =>
        item.kind === "hidden"
          ? item.hint
          : {
              id: item.id,
              name: item.name,
              level: item.level,
              effect: item.effect,
              stones: item.stones,
              action: item.action,
              time: item.time,
            },
      ),
    });
    if (signature !== painted) {
      recipes.replaceChildren(...shown.map(paintCard));
      painted = signature;
    }
    const several = pages.length > 1;
    pager.hidden = !several;
    earlier.hidden = !several || page === 0;
    more.hidden = !several || page >= pages.length - 1;
    if (at >= floatUntil) {
      if (floats.childElementCount > 0) {
        floats.replaceChildren();
      }
    } else if (floats.childElementCount === 0) {
      for (const bit of floatBits) {
        const chip = document.createElement("span");
        chip.className = "float-chip";
        chip.append(
          materialIcon(bit.id, stoneUrl),
          document.createTextNode(bit.text),
        );
        floats.append(chip);
      }
    }
    if (!wasOpen) {
      close.focus();
    }
  };

  return { menuEntry, sheet, render };
}
