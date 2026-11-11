/* global console, process */
/** The visual check's shared registry: the failure list, the check recorder and the section queue. */

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

/**
 * Each scenario opens its own browser context, so they are independent. They
 * are registered here and run at the end, VISUAL_JOBS at a time (default: 1.5
 * per core), on one Vite server and one Chrome.
 */
const sections = [];
/**
 * VISUAL_ONLY=<regex> runs only the sections whose label matches. A filtered
 * run says so, and one that matches nothing fails rather than passing empty.
 */
const only =
  process.env.VISUAL_ONLY === undefined
    ? undefined
    : new RegExp(process.env.VISUAL_ONLY);
if (only !== undefined) {
  console.warn(
    `VISUAL_ONLY=${String(process.env.VISUAL_ONLY)}: running only the sections it matches, not the whole check.`,
  );
}
const section = (label, run) => {
  if (only === undefined || only.test(label)) {
    sections.push({ label, run });
  }
};

/**
 * A table of scenario x screen x expectation (#441), turned into section()
 * and check() calls. `open(viewport, scenario)` gives `{ close, ...page }`;
 * each row (default: one empty row) may `enter` before its expectations and
 * `leave` after; a row whose `when(scenario, viewport)` or an expectation
 * whose `when(at)` is false is skipped. Each
 * expectation's `run(at)` returns `[[ok, tail], ...]`, recorded as
 * `${prefix(at)} ${tail}`. `per: "scenario"` registers a section per screen
 * and scenario, `per: "screen"` one per screen that runs every scenario in
 * order. `after(viewport)` runs once that screen's sections are registered,
 * so a flow registered there keeps its place in the queue.
 */
const table = ({
  screens,
  scenarios,
  rows = [{}],
  per = "scenario",
  section: name,
  prefix,
  open,
  expect,
  after,
}) => {
  for (const viewport of screens) {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const runOne = async (scenario) => {
      const opened = await open(viewport, scenario);
      try {
        for (const row of rows) {
          if (!(row.when?.(scenario, viewport) ?? true)) continue;
          const at = {
            ...opened,
            viewport,
            size,
            scenario,
            row,
            label: prefix({ size, scenario, row }),
          };
          await row.enter?.(at);
          for (const e of expect) {
            if (!(e.when?.(at) ?? true)) continue;
            for (const [ok, tail] of await e.run(at)) {
              check(ok, `${at.label} ${tail}`);
            }
          }
          await row.leave?.(at);
        }
      } finally {
        await opened.close();
      }
    };
    if (per === "screen") {
      section(name(viewport), async () => {
        for (const scenario of scenarios) await runOne(scenario);
      });
    } else {
      for (const scenario of scenarios) {
        section(name(viewport, scenario), () => runOne(scenario));
      }
    }
    after?.(viewport);
  }
};

export { failures, check, sections, only, section, table };
