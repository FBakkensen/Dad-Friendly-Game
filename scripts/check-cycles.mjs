// Fails on runtime import cycles between src modules (#118). Type-only
// imports are erased at build time, so they can't cause init-order bugs.
import { readdirSync, readFileSync } from "node:fs";
import console from "node:console";
import process from "node:process";

const files = readdirSync("src").filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);
const graph = new Map();
for (const file of files) {
  const text = readFileSync(`src/${file}`, "utf8");
  const deps = [];
  for (const [, clause, spec] of text.matchAll(
    /^(?:import|export)\s+([^;]*?)\s+from\s+"\.\/([^"]+)";/gms,
  )) {
    if (
      /^type\s/.test(clause) ||
      /^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(clause)
    ) {
      continue;
    }
    deps.push(spec.endsWith(".ts") ? spec : `${spec}.ts`);
  }
  graph.set(file, deps);
}

const cycles = [];
const state = new Map();
const visit = (file, path) => {
  state.set(file, "open");
  for (const dep of graph.get(file) ?? []) {
    if (state.get(dep) === "open") {
      cycles.push([...path.slice(path.indexOf(dep)), dep].join(" → "));
    } else if (!state.has(dep) && graph.has(dep)) {
      visit(dep, [...path, dep]);
    }
  }
  state.set(file, "done");
};
for (const file of graph.keys()) {
  if (!state.has(file)) visit(file, [file]);
}

if (cycles.length > 0) {
  console.error(`Import cycles in src:\n${cycles.join("\n")}`);
  process.exit(1);
}
console.log(`No import cycles (${String(graph.size)} modules).`);
