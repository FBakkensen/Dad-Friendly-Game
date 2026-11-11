/* global console, process */
/**
 * Real-browser layout guard (jsdom can't see CSS). Run it with:
 *   npm run visual   (starts its own dev server; part of npm run check)
 * Fails if the board scrolls at the phone (424x924) or a PC size, if an
 * overlay isn't laid over the board, or if the board's own parts miss their
 * bars (targets, type, contrast, exact 2x art) (#370).
 * The sections live in scripts/visual/, one module per component of the board. Importing
 * a module registers its sections; this file runs the queue and sets the exit code.
 */
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { failures, sections, only } from "./visual/registry.mjs";
import { server, browser } from "./visual/kit.mjs";
import "./visual/main-screen.mjs";
import "./visual/cards.mjs";
import "./visual/engineers-workshop.mjs";
import "./visual/notices-saves.mjs";
import "./visual/plate-and-sheets.mjs";
import "./visual/running-and-guards.mjs";
import "./visual/board.mjs";
import "./visual/gauge-row.mjs";
import "./visual/bays-ready.mjs";
import "./visual/rail.mjs";
import "./visual/drawers.mjs";
import "./visual/keys-taps.mjs";
import "./visual/press-looks.mjs";

// Pages wait on the network as much as the CPU, so 1.5 per core beats 1
// (measured on 4 cores: 70 s at 4 jobs, 63 s at 6, 62 s at 8).
if (only !== undefined && sections.length === 0) {
  console.error(
    `VISUAL_ONLY=${String(process.env.VISUAL_ONLY)} matches no section; nothing was checked.`,
  );
  await browser.close();
  await server.close();
  process.exit(1);
}
const jobs = Math.max(
  1,
  Number(process.env.VISUAL_JOBS ?? Math.ceil(availableParallelism() * 1.5)),
);
const timings = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, sections.length) }, async () => {
    while (next < sections.length) {
      const { label, run } = sections[next];
      next += 1;
      const started = performance.now();
      try {
        await run();
      } catch (error) {
        failures.push(`${label} threw: ${String(error?.stack ?? error)}`);
      }
      timings.push([label, (performance.now() - started) / 1000]);
    }
  }),
);
if (process.env.VISUAL_TIMINGS) {
  for (const [label, seconds] of timings.sort((a, b) => b[1] - a[1])) {
    console.log(`${seconds.toFixed(1).padStart(6)}s  ${label}`);
  }
}

await browser.close();
await server.close();
if (failures.length > 0) {
  console.error(
    `\n${String(failures.length)} visual check(s) failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  only === undefined
    ? "\nAll visual checks passed."
    : `\nThe ${String(sections.length)} section(s) VISUAL_ONLY=${String(process.env.VISUAL_ONLY)} matched passed; the rest did not run.`,
);
