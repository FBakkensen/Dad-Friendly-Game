import { HOW_IT_WORKS } from "./how-it-works";
import { STAFFING_INTRO } from "./screen-words";
import { createHowCard, createInfoButton } from "./teach-ui";
import type { TierId } from "./tiers";

/**
 * The Buys sheet's head (#246), the same as the Workshop, Upgrades and
 * Engineers: title left, "i" right, then one intro line while an idle
 * machine is the New card. The "i" opens machines and staffing: one screen.
 */
export function createBuysHead({
  tierArt,
  stoneUrl,
  body,
}: {
  tierArt: Readonly<Record<TierId, string>>;
  stoneUrl: string;
  /** The cards. Hidden while How it works is open. */
  body: readonly HTMLElement[];
}): {
  head: HTMLElement;
  intro: HTMLParagraphElement;
  howHost: HTMLDivElement;
  render: (teaching: boolean) => void;
  close: () => void;
} {
  const head = document.createElement("header");
  head.className = "workshop-head buys-head";
  const title = document.createElement("h2");
  title.id = "buys-title";
  title.className = "label";
  title.textContent = "Buys";
  let howOpen = false;
  let teachingNow = false;
  const info = createInfoButton("Buys", () => {
    howOpen = true;
    render(teachingNow);
  });
  const tools = document.createElement("div");
  tools.className = "workshop-head-tools";
  tools.append(info);
  head.append(title, tools);

  const art: Readonly<Record<string, string>> = {
    "helper-miner": tierArt.helper,
    "mine-cart": tierArt.cart,
    "steam-drill": tierArt.drill,
    "tunnel-borer": tierArt.borer,
    "great-machine": tierArt.machine,
  };
  const cards = (["machines", "staffing"] as const).map((system) => {
    const copy = HOW_IT_WORKS[system];
    const made = createHowCard(
      `How it works · ${copy.title}`,
      copy.steps.map(([id, text]) => [art[id] ?? stoneUrl, text] as const),
      "Back to Buys",
      () => {
        howOpen = false;
        render(teachingNow);
        info.focus();
      },
    );
    made.dataset["how"] = system;
    return made;
  });
  // One way back, under the last card.
  for (const made of cards.slice(0, -1)) {
    const back = made.querySelector("button");
    if (back !== null) {
      back.hidden = true;
    }
  }
  const howHost = document.createElement("div");
  howHost.className = "buys-how";
  howHost.hidden = true;
  howHost.append(...cards);

  const intro = document.createElement("p");
  intro.className = "teach-intro buys-intro";
  intro.textContent = STAFFING_INTRO;
  intro.hidden = true;

  const render = (teaching: boolean): void => {
    teachingNow = teaching;
    howHost.hidden = !howOpen;
    intro.hidden = howOpen || !teaching;
    for (const part of body) {
      part.hidden = howOpen;
    }
  };
  const close = (): void => {
    howOpen = false;
    render(teachingNow);
  };
  return { head, intro, howHost, render, close };
}
