import { chipTime } from "./format";

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

export function multiplierMark(value: number): string {
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
  icon.width = 24;
  icon.height = 24;
  icon.draggable = false;
  const name = document.createElement("span");
  name.className = "effect-name";
  const mult = document.createElement("span");
  mult.className = "effect-mult";
  const time = document.createElement("span");
  time.className = "effect-time";
  chip.append(icon, name, mult, time);
  let hideName: ReturnType<typeof setTimeout> | undefined;
  const reveal = (): void => {
    if (chip.hidden) {
      return;
    }
    chip.classList.add("is-named");
    if (hideName !== undefined) {
      clearTimeout(hideName);
    }
    hideName = setTimeout(() => {
      chip.classList.remove("is-named");
      hideName = undefined;
    }, 1_600);
  };
  chip.addEventListener("pointerup", reveal);
  chip.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      reveal();
    }
  });
  return chip;
}

function spoken(label: EffectLabel): string {
  const clock = chipTime(label.leftMs);
  if (label.multiplier === undefined) {
    return clock;
  }
  return `${multiplierMark(label.multiplier)} ${clock}`;
}

// Which chips were last written active. The Running list asks this instead of
// reading the page back for chips that are not hidden.
const activeChips = new WeakSet<HTMLElement>();

/** Whether any element child of `host` was last written active. */
export function anyChipActive(host: ParentNode): boolean {
  return Array.from(host.children).some(
    (child) => child instanceof HTMLElement && activeChips.has(child),
  );
}

export function writeChip(chip: HTMLElement, label: EffectLabel): void {
  if (label.active) {
    activeChips.add(chip);
  } else {
    activeChips.delete(chip);
  }
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
    time.textContent = label.active ? chipTime(label.leftMs) : "";
  }
  chip.hidden = !label.active;
  chip.tabIndex = label.active ? 0 : -1;
  if (label.active) {
    chip.setAttribute("aria-label", `${label.full}, ${spoken(label)}`);
  } else {
    chip.removeAttribute("aria-label");
    chip.classList.remove("is-named");
  }
}
