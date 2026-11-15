/* global console */
// Builds the throwaway slice 1 prototype into one self-contained page (index.html).
// It inlines the game's own sprites and fonts, so the page can be hosted anywhere.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "../../src/assets");
const sprites = [
  "miner-18f",
  "cage",
  "tub-full",
  "tub-empty",
  "steam-4f",
  "drill-work-4f",
  "dust-burst-4f",
  "mach-drill",
  "mach-train",
  "mach-hoist",
  "mach-cart",
  "res-stone",
  "res-clay",
  "res-iron",
  "res-pick",
  "icon-workshop",
];
const uri = (file, mime) =>
  `data:${mime};base64,${readFileSync(file).toString("base64")}`;
const img = Object.fromEntries(
  sprites.map((name) => [
    name,
    uri(join(assets, "board", `${name}.png`), "image/png"),
  ]),
);
const font = (name) =>
  uri(join(assets, "fonts", `${name}.woff2`), "font/woff2");
const page = readFileSync(join(here, "proto.src.html"), "utf8")
  .replace("__IMG__", JSON.stringify(img))
  .replace("__BARLOW600__", font("barlow-condensed-latin-600-normal"))
  .replace("__BARLOW700__", font("barlow-condensed-latin-700-normal"))
  .replace("__MONO__", font("share-tech-mono-latin-400-normal"));
// page.html is the bare page (a host that adds its own document shell takes this one).
writeFileSync(join(here, "page.html"), page);
const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"></head><body>\n${page}</body></html>\n`;
writeFileSync(join(here, "index.html"), shell);
console.log(`index.html ${(page.length / 1024).toFixed(0)} KB`);
