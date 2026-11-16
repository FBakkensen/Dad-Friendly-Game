// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { FrameState } from "./frame-state";
import { createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { createWorkforceSheet } from "./workforce-sheet";
import { jobSites } from "./workforce-view";

// The sheet's groups, as the view gives them unless a test says otherwise.
vi.mock("./workforce-view", async (importOriginal) => {
  const real = await importOriginal<typeof import("./workforce-view")>();
  return { ...real, jobSites: vi.fn(real.jobSites) };
});

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
    // Each key names its level: no two keys share a label (#680).
    const labels = [
      ...sheet.root.querySelectorAll<HTMLElement>(
        ".frame-jobs-group:not([hidden]) .frame-step",
      ),
    ].map((key) => key.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Put a worker on granite drilling");
    expect(labels).toContain("Take a worker off topsoil haulage");
    expect(labels).toContain("Put a worker on hoisting");
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

describe("the workforce sheet's layout (#754)", () => {
  it("builds a group again when its jobs change and its key does not", async () => {
    const real =
      await vi.importActual<typeof import("./workforce-view")>(
        "./workforce-view",
      );
    const sites = vi.mocked(jobSites);
    const current: Mountain = {
      ...createMountain(),
      operational: ["lightTower"],
    };
    const sheet = createWorkforceSheet(
      stateOf(
        current,
        vi.fn(() => Promise.resolve()),
      ),
    );
    const rows = (): (string | undefined)[] =>
      [
        ...sheet.root.querySelectorAll<HTMLElement>(
          '.frame-jobs-group[data-group="refinery"] .frame-job',
        ),
      ].map((row) => row.dataset["job"]);
    try {
      partThree(() => {
        sheet.paint(current);
        expect(rows()).toEqual(["kilns"]);
        // A maker that opens on its own: the refinery's key stays, its jobs grow.
        sites.mockImplementation((mountain) =>
          real.jobSites(mountain).map((group) =>
            group.key === "refinery"
              ? {
                  ...group,
                  jobs: [...group.jobs, { job: "saws", name: "Saws" }],
                }
              : group,
          ),
        );
        sheet.paint(current);
      });
      expect(rows()).toEqual(["kilns", "saws"]);
    } finally {
      sites.mockImplementation(real.jobSites);
    }
  });
});

describe("the workforce sheet with one level", () => {
  it("says the job alone on its keys, as today", () => {
    const mountain = createMountain();
    const sheet = createWorkforceSheet(
      stateOf(
        mountain,
        vi.fn(() => Promise.resolve()),
      ),
    );
    sheet.paint(mountain);
    expect(
      sheet.root
        .querySelector('.frame-step[data-job="drilling"][data-way="place"]')
        ?.getAttribute("aria-label"),
    ).toBe("Put a worker on drilling");
  });
});
