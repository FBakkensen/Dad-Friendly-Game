/**
 * The shared teach parts (M11, #241), the hybrid pattern from #240.
 * Every system uses these, so the note, the New card, the payoff
 * line and How it works look the same everywhere. Copy comes from the
 * caller; this file has none of its own beyond the New tag.
 */

/** One line above the bar, styled like the bar. Tapping it opens the sheet. */
export function createTeachNote(): {
  readonly note: HTMLButtonElement;
  readonly show: (art: string, text: string, open: () => void) => void;
  readonly hide: () => void;
} {
  const note = document.createElement("button");
  note.type = "button";
  note.className = "teach-note";
  note.hidden = true;
  const art = document.createElement("img");
  art.alt = "";
  art.width = 24;
  art.height = 24;
  art.draggable = false;
  const text = document.createElement("span");
  note.append(art, text);
  let onOpen: (() => void) | undefined;
  note.addEventListener("click", () => {
    onOpen?.();
  });
  return {
    note,
    show: (src, words, open) => {
      if (art.getAttribute("src") !== src) {
        art.src = src;
      }
      text.textContent = words;
      onOpen = open;
      note.hidden = false;
    },
    hide: () => {
      note.hidden = true;
      onOpen = undefined;
    },
  };
}

/**
 * Marks a shared sheet card as the new one: lit, tagged New, and its own
 * action button turned into the one big first-action button. The caller
 * keeps the button's click, so the whole card still taps the same way.
 * `clearNewCard` takes the tag and the light off again.
 */
export function markNewCard(
  card: HTMLElement,
  button: HTMLElement,
  action: string,
): void {
  clearNewCard(card);
  card.classList.add("teach-new");
  const tag = document.createElement("span");
  tag.className = "teach-tag";
  tag.textContent = "New";
  card.prepend(tag);
  button.classList.add("teach-action");
  button.textContent = action;
}

export function clearNewCard(card: HTMLElement): void {
  card.classList.remove("teach-new");
  card.querySelector(":scope .teach-tag")?.remove();
  card.querySelector(":scope .teach-action")?.classList.remove("teach-action");
}

/** After the first use, the same card says what it earned. */
export function setPayoff(card: HTMLElement, text: string | undefined): void {
  let line = card.querySelector<HTMLElement>(":scope .teach-payoff");
  if (text === undefined) {
    line?.remove();
    return;
  }
  if (line === null) {
    line = document.createElement("span");
    line.className = "teach-payoff";
    card.append(line);
  }
  line.textContent = text;
}

/** The "i" in the sheet's corner. */
export function createInfoButton(
  label: string,
  open: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "teach-info";
  button.textContent = "i";
  button.setAttribute("aria-label", `How it works: ${label}`);
  button.addEventListener("click", open);
  return button;
}

/**
 * One how card step: the icon's src, its words, and the icon's CSS px
 * (32 when left out; the board's machines show at 64, #373).
 */
export type HowCardStep = readonly [src: string, words: string, px?: number];

/** Rewrites a how card's step words in place (M13: a new run's prices). */
export function setHowSteps(
  card: HTMLElement,
  steps: readonly (readonly [unknown, string, ...unknown[]])[],
): void {
  const texts = card.querySelectorAll(".teach-how-steps li span");
  steps.forEach(([, words], index) => {
    const text = texts[index];
    if (text !== undefined) {
      text.textContent = words;
    }
  });
}

/** One screen, 3–4 lines with an icon each, and one way back. */
export function createHowCard(
  title: string,
  steps: readonly HowCardStep[],
  back: string,
  onBack: () => void,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "teach-how";
  card.setAttribute("aria-label", title);
  const heading = document.createElement("h2");
  heading.className = "teach-how-title";
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "teach-how-steps";
  for (const [src, words, px = 32] of steps) {
    const item = document.createElement("li");
    const art = document.createElement("img");
    art.src = src;
    art.alt = "";
    art.width = px;
    art.height = px;
    art.draggable = false;
    const text = document.createElement("span");
    text.textContent = words;
    item.append(art, text);
    list.append(item);
  }
  const done = document.createElement("button");
  done.type = "button";
  done.className = "teach-how-back";
  done.textContent = back;
  done.addEventListener("click", onBack);
  card.append(heading, list, done);
  return card;
}
