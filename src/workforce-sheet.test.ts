// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { FrameState } from "./frame-state";
import { createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { createWorkforceSheet } from "./workforce-sheet";

/** The sheet rebuilds its job groups as the Granite opens (#680). */
function stateOf(
  mountain: Mountain,
  dispatch: (move: unknown) => Promise<void>,
): FrameState {
  return {
    progress: { dispatch },
    mountain: () => mountain,
    amount: () => "one",
  } as unknown as FrameState;
}

describe("the workforce sheet's job groups", () => {
  it("builds the mine's three level groups when the Granite opens, with working − and +", () => {
    const dispatch = vi.fn(() => Promise.resolve());
    const sunk = partThree(() => levels({ topsoil: 1, granite: 1 }));
    let current: Mountain = createMountain();
    const sheet = createWorkforceSheet({
      ...stateOf(current, dispatch),
      mountain: () => current,
    });
    partThree(() => {
      sheet.paint(current);
      current = sunk;
      sheet.paint(current);
      sheet.paint(current);
    });
    const groups = [
      ...sheet.root.querySelectorAll<HTMLElement>(
        ".frame-jobs-group:not([hidden])",
      ),
    ];
    const mine = groups.filter((box) => box.dataset["site"] === "mine");
    expect(mine.map((box) => box.querySelector("h3")?.textContent)).toEqual([
      "Topsoil",
      "Granite",
      "Shaft",
    ]);
    expect(
      groups.map((box) => box.querySelector("h3")?.textContent),
    ).not.toContain("Mine");
    const all = [...sheet.root.querySelectorAll(".frame-job")];
    const jobs = all.map((row) => (row as HTMLElement).dataset["job"]);
    expect(new Set(jobs).size).toBe(jobs.length);
    sheet.root
      .querySelector<HTMLButtonElement>(
        '.frame-step[data-job="graniteDrilling"][data-way="free"]',
      )
      ?.click();
    expect(dispatch).toHaveBeenCalledWith({
      kind: "freeWorker",
      job: "graniteDrilling",
      count: 1,
    });
  });
});
