import { BOOSTS } from "./boosts";
import { MAX_EXPEDITIONS } from "./expeditions";
import { RECIPES } from "./workshop";

/** Craft clocks that keep their own end time, apart from the one bench. */
const HOT_CRAFTS = RECIPES.filter((recipe) => {
  const kind = recipe.effect.kind;
  return (
    kind === "charge" || kind === "axle" || kind === "flare" || kind === "ember"
  );
}).length;

/**
 * Every countdown that can be hot together: both boosts, every craft clock,
 * the bench (when it is not already one of those clocks), and one expedition
 * per engineer.
 */
export const MAX_EFFECTS = BOOSTS.length + HOT_CRAFTS + 1 + MAX_EXPEDITIONS;

/** Columns for a grid of at most two rows. */
export const EFFECT_COLUMNS = Math.ceil(MAX_EFFECTS / 2);

const SHORT_NAME: Readonly<Record<string, string>> = {
  "Sharper picks": "Picks",
  Overtime: "Overtime",
  "Iron rails": "Rails",
  "Sturdy props": "Props",
  "Blasting charge": "Charge",
  Reinforce: "Reinforce",
  "Axle grease": "Grease",
  "Diamond bits": "Bits",
  "Crystal flare": "Flare",
  "Miner's crystal lamp": "Lamp",
  "Engineer's kit": "Kit",
  "Heartstone core": "Core",
  "Heartstone ember": "Ember",
};

/** A name that still fits a chip. Falls back to the first word of the full name. */
export function shortEffectName(full: string): string {
  return SHORT_NAME[full] ?? full.split(" ")[0] ?? full;
}

/** m:ss under an hour, otherwise HhMM, so a chip never needs 1:02:03. */
function formatChipClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  if (hours > 0) {
    return `${String(hours)}h${String(minutes).padStart(2, "0")}`;
  }
  return `${String(minutes)}:${seconds}`;
}

function multiplierMark(value: number): string {
  const shown = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `×${shown}`;
}

export type EffectLabel = {
  readonly short: string;
  readonly full: string;
  readonly multiplier?: number;
  readonly leftMs: number;
  readonly active: boolean;
};

/** Icon, short name, and the ×N / clock line. Inactive chips stay in the DOM, hidden. */
export function createEffectChip(
  className: string,
  iconUrl: string,
): HTMLParagraphElement {
  const chip = document.createElement("p");
  chip.className = `effect-chip ${className}`;
  chip.hidden = true;
  const icon = document.createElement("img");
  icon.src = iconUrl;
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  icon.draggable = false;
  const name = document.createElement("span");
  name.className = "effect-name";
  const mult = document.createElement("span");
  mult.className = "effect-mult";
  const time = document.createElement("span");
  time.className = "effect-time";
  chip.append(icon, name, mult, time);
  return chip;
}

function spoken(label: EffectLabel): string {
  const clock = formatChipClock(label.leftMs);
  if (label.multiplier === undefined) {
    return clock;
  }
  return `${multiplierMark(label.multiplier)} ${clock}`;
}

export function writeChip(chip: HTMLElement, label: EffectLabel): void {
  const name = chip.querySelector(".effect-name");
  const mult = chip.querySelector(".effect-mult");
  const time = chip.querySelector(".effect-time");
  if (name instanceof HTMLElement) {
    name.textContent = label.active ? label.short : "";
  }
  if (mult instanceof HTMLElement) {
    const mark =
      label.active && label.multiplier !== undefined
        ? `${multiplierMark(label.multiplier)} `
        : "";
    mult.textContent = mark;
    mult.hidden = mark === "";
  }
  if (time instanceof HTMLElement) {
    time.textContent = label.active ? formatChipClock(label.leftMs) : "";
  }
  chip.hidden = !label.active;
  if (label.active) {
    chip.setAttribute("aria-label", `${label.full}, ${spoken(label)}`);
  } else {
    chip.removeAttribute("aria-label");
  }
}
