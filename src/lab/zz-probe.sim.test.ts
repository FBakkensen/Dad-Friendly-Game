import { expect, it } from "vitest";
import { RELICS } from "../relics";
import { simulateDadRun } from "../pacing";
import skipCrafting from "./policies/skip-crafting";
import { runPolicy } from "./run";
const mantle = RELICS.find((relic) => relic.id === "mantle")?.depth ?? 0;
it("probe", () => {
  const dad = simulateDadRun({ milestones: [mantle] });
  const run = runPolicy({ policy: skipCrafting, seed: 1 });
  const a = dad.buys.map(({ day, id, price }) => `${day.toFixed(4)} ${id} ${price}`);
  const b = run.buys.map(({ day, id, price }) => `${day.toFixed(4)} ${id} ${price}`);
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  expect({ i, dad: a.slice(Math.max(0, i - 5), i + 8), lab: b.slice(Math.max(0, i - 5), i + 8), dadP: dad.promotions.map((p) => `${p.day} ${p.name} ${p.price}`), labP: run.promotions.map((p) => `${p.day} ${p.name} ${p.price}`), dadF: dad.reached.get(mantle), labF: run.finishDay }).toEqual({});
}, 300_000);
