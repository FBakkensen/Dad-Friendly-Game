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

export { failures, check, sections, only, section };
