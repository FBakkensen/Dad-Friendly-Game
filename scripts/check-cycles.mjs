// Fails on runtime import cycles between src modules (#118). Type-only
// imports are erased at build time, so they can't cause init-order bugs.
// Walks subfolders (`economy/`, `lab/`) and resolves `../` imports.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import console from "node:console";
import process from "node:process";

const root = "src";

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return found;
}

const files = walk(root);
const graph = new Map();
for (const file of files) {
  const text = readFileSync(path.join(root, file), "utf8");
  const deps = [];
  for (const [, clause, spec] of text.matchAll(
    /^(?:import|export)\s+([^;]*?)\s+from\s+"(\.[^"]+)";/gms,
  )) {
    if (
      /^type\s/.test(clause) ||
      /^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(clause)
    ) {
      continue;
    }
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), spec),
    );
    deps.push(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
  }
  graph.set(file, deps);
}

const cycles = [];
const state = new Map();
const visit = (file, trail) => {
  state.set(file, "open");
  for (const dep of graph.get(file) ?? []) {
    if (state.get(dep) === "open") {
      cycles.push([...trail.slice(trail.indexOf(dep)), dep].join(" → "));
    } else if (!state.has(dep) && graph.has(dep)) {
      visit(dep, [...trail, dep]);
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
