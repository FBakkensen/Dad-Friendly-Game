import { shownStones, stonesLeft } from "./scale";
import { formatCount } from "./format";
import { MOUNTAIN_STONES } from "./mountain";
import { relicGoal } from "./relics";
import { nextLayer } from "./layers";
import { legacyWords } from "./legacy-panel";
import { legacyBonus } from "./legacy";
import { nextLayerHint } from "./screen-words";
import { metMaterialChips } from "./workshop-sheet";
import type { ScreenCtx } from "./screen-context";

/**
 * The Ledger the menu carries: the lantern, the stones left, the materials met and the guide to
 * the next relic.
 */
export function createLedger(ctx: ScreenCtx): {
  root: HTMLElement;
  paintStones(): void;
  paintGuide(): void;
} {
  const { lanternUrl, stoneUrl } = ctx.art;
  const lantern = document.createElement("img");
  lantern.className = "lantern";
  lantern.src = lanternUrl;
  lantern.alt = "Lantern";
  lantern.width = 32;
  lantern.height = 32;
  lantern.draggable = false;

  const remaining = document.createElement("p");
  remaining.className = "stones-left";
  remaining.setAttribute("role", "status");

  const goal = document.createElement("p");
  goal.className = "goal";
  const guide = document.createElement("div");
  guide.className = "guide";
  const guideBar = document.createElement("div");
  guideBar.className = "guide-bar";
  guideBar.setAttribute("role", "progressbar");
  guideBar.setAttribute("aria-valuemin", "0");
  guideBar.setAttribute("aria-valuemax", "100");
  const guideFill = document.createElement("span");
  guideBar.append(guideFill);
  const layerHint = document.createElement("p");
  layerHint.className = "layer-hint";
  layerHint.hidden = true;
  guide.append(goal, layerHint, guideBar);
  const materialLine = document.createElement("p");
  materialLine.className = "material-line";
  const ledger = document.createElement("div");
  ledger.className = "ledger";
  ledger.append(lantern, remaining, materialLine, guide);

  const paintStones = (): void => {
    const view = ctx.view();
    const left = Math.ceil(stonesLeft(view.mountain));
    const total = shownStones(view.mountain, MOUNTAIN_STONES);
    remaining.textContent = `${formatCount(left)} stones left`;
    remaining.title = `${left.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  };

  /** The materials last drawn: each paint rebuilds the line only when they change. */
  let materialsKey: string | undefined;
  const renderMaterials = (): void => {
    const view = ctx.view();
    const chips = metMaterialChips(view.mountain);
    const key = chips.map((chip) => `${chip.id}:${chip.text}`).join("|");
    if (key === materialsKey) {
      return;
    }
    materialsKey = key;
    materialLine.replaceChildren();
    chips.forEach((chip, index) => {
      if (index > 0) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.textContent = "·";
        materialLine.append(dot);
      }
      const bit = document.createElement("span");
      bit.className = "material-bit";
      const icon = document.createElement("img");
      icon.className = `mat mat-${chip.id}`;
      icon.src = stoneUrl;
      icon.alt = "";
      icon.width = 16;
      icon.height = 16;
      icon.draggable = false;
      bit.append(icon, document.createTextNode(chip.text));
      materialLine.append(bit);
    });
  };

  const renderGuide = (): void => {
    const view = ctx.view();
    const hint = nextLayerHint(nextLayer(view.mountain)?.id);
    layerHint.hidden = hint === undefined;
    layerHint.textContent = hint ?? "";
    const goalNow = relicGoal(view.mountain);
    guideBar.hidden = goalNow.kind !== "next";
    if (goalNow.kind === "unguided") {
      goal.textContent =
        (view.mountain.legacy ?? 0) > 0
          ? `Your kid's mine: six relics wait inside. Legacy ${legacyWords(legacyBonus(view.mountain))}.`
          : "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.";
      return;
    }
    if (goalNow.kind === "done") {
      goal.textContent = "Every relic is yours. You are a legend.";
      return;
    }
    const { name, percent } = goalNow;
    const words = `Next: ${name} · ${goalNow.hint}`;
    const label =
      hint === undefined
        ? `Progress to the ${name}`
        : `Progress to the ${name}. ${hint}`;
    goal.textContent = words;
    guideFill.style.width = `${String(percent)}%`;
    guideBar.setAttribute("aria-valuenow", String(percent));
    guideBar.setAttribute("aria-label", label);
  };

  return {
    root: ledger,
    paintStones,
    paintGuide: () => {
      renderGuide();
      renderMaterials();
    },
  };
}
