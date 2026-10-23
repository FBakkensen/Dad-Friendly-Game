/** One reserved row of countdown chips. Empty still takes its height. */

export function writeChip(
  chip: HTMLElement,
  text: string,
  leftMs: number,
  active: boolean,
): void {
  const label = chip.querySelector(".effect-label");
  if (label instanceof HTMLElement) {
    label.textContent = text;
  } else {
    chip.textContent = text;
  }
  chip.hidden = !active;
  chip.dataset["left"] = String(Math.max(0, Math.round(leftMs)));
  if (!active) {
    chip.classList.remove("is-overflow");
  }
}

export function packEffects(row: HTMLElement): void {
  const more = row.querySelector<HTMLElement>(".effect-more");
  const chips = [...row.querySelectorAll<HTMLElement>(".effect-chip")].filter(
    (chip) => !chip.hidden,
  );
  for (const chip of row.querySelectorAll(".effect-chip")) {
    chip.classList.remove("is-overflow");
  }
  if (more !== null) {
    more.hidden = true;
    more.textContent = "";
  }
  if (!row.isConnected || chips.length === 0 || more === null) {
    return;
  }
  const urgent = [...chips].sort(
    (left, right) =>
      Number(left.dataset["left"] ?? "0") -
      Number(right.dataset["left"] ?? "0"),
  );
  const overflow = (): boolean => row.scrollWidth > row.clientWidth + 1;
  if (!overflow()) {
    return;
  }
  let hidden = 0;
  for (let index = urgent.length - 1; index >= 1; index -= 1) {
    const chip = urgent[index];
    if (chip === undefined) {
      break;
    }
    chip.classList.add("is-overflow");
    hidden += 1;
    more.hidden = false;
    more.textContent = `+${String(hidden)}`;
    if (!overflow()) {
      return;
    }
  }
}
