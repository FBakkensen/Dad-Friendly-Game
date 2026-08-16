import { mountBootScreen } from "./boot-screen";
import tileUrl from "./assets/boot-tile.png";
import "./style.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

mountBootScreen({ root, tileUrl });
