/**
 * The shared teach parts (M11, #241), the hybrid pattern from #240.
 * Every system uses these, so How it works looks the same everywhere.
 * Copy comes from the caller; this file has none of its own.
 */

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
