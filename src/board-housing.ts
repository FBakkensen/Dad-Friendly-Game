import { skin } from "./board-skin";

/**
 * The PC's steel housing (#376): the frame skin, outside #app so it takes no tap and no
 * measure. board.css shows it on a desk only (body.desk, set by board-fit.ts). Mounted once,
 * however often it is called.
 */
export function mountHousing(doc: Document = document): void {
  if (doc.querySelector(".board-housing") !== null) return;
  const housing = doc.createElement("div");
  housing.className = "board-housing";
  housing.setAttribute("aria-hidden", "true");
  const app = doc.getElementById("app");
  if (app === null) doc.body.prepend(housing);
  else app.before(housing);
  skin(housing, "frame");
}
