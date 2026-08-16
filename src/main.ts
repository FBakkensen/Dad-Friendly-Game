import { mountPocketGridScreen } from "./pocket-grid-screen";
import lanternUrl from "./assets/boot-tile.png";
import cellSheetUrl from "./assets/dig-cells.png";
import "./style.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

mountPocketGridScreen({ root, lanternUrl, cellSheetUrl });
