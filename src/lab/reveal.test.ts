import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "../mountain";
import revealNeverUsed from "./measures/revealNeverUsed";
import revealSlowest, { slowestReveals } from "./measures/revealSlowest";
import revealToUse from "./measures/revealToUse";
import revealToUseP90 from "./measures/revealToUseP90";
import type { DecisionSample } from "./measure";
import {
  createRevealLog,
  neverUsed,
  revealGaps,
  type RevealEvent,
} from "./reveal";

const HOUR = 3600;

function ids(events: readonly RevealEvent[], kind: RevealEvent["kind"]) {
  return events.filter((event) => event.kind === kind).map((event) => event.id);
}

function sample(reveals: readonly RevealEvent[]): DecisionSample {
  return { reveals } as unknown as DecisionSample;
}

describe("createRevealLog", () => {
  it("logs what shows at the start once, and a first use once", () => {
    const log = createRevealLog();
    const start = createMountain();
    const first = log(start, 0);
    expect(ids(first, "appeared")).toContain("tier:helper");
    // Boosts wait until nearly affordable (#245).
    expect(ids(first, "appeared")).not.toContain("boost:sharper");
    expect(ids(first, "appeared")).not.toContain("tier:drill");
    expect(ids(first, "appeared")).not.toContain("system:workshop");
    expect(log(start, 1)).toEqual([]);

    const hired: Mountain = { ...start, helpers: 1 };
    const next = log(hired, 2);
    expect(next).toContainEqual({
      kind: "firstUse",
      id: "tier:helper",
      liveSec: 2,
    });
    expect(next).toContainEqual({
      kind: "appeared",
      id: "tier:cart",
      liveSec: 2,
    });
    expect(log(hired, 3)).toEqual([]);
  });

  it("logs an appearance with a use that had none before it", () => {
    const log = createRevealLog();
    log(createMountain(), 0);
    const events = log({ ...createMountain(), boosts: { sharper: 10 } }, 5);
    expect(events).toContainEqual({
      kind: "firstUse",
      id: "boost:sharper",
      liveSec: 5,
    });
    const promote = log(
      {
        ...createMountain(),
        engineers: [
          { name: "Ada", rank: 0, trips: 0, post: "camp" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
        ],
      },
      6,
    );
    expect(promote).toEqual(
      expect.arrayContaining([
        { kind: "appeared", id: "system:promote", liveSec: 6 },
        { kind: "firstUse", id: "system:promote", liveSec: 6 },
      ]),
    );
  });
});

describe("revealGaps and neverUsed", () => {
  const events: RevealEvent[] = [
    { kind: "appeared", id: "a", liveSec: 0 },
    { kind: "appeared", id: "b", liveSec: 0 },
    { kind: "firstUse", id: "a", liveSec: 2 * HOUR },
    // A second run: its own appearance starts a new wait.
    { kind: "appeared", id: "a", liveSec: 0 },
    { kind: "firstUse", id: "a", liveSec: HOUR },
    { kind: "firstUse", id: "c", liveSec: HOUR },
  ];

  it("pairs each use with the appearance before it, in live hours", () => {
    expect(revealGaps(events)).toEqual([
      { id: "a", hours: 2 },
      { id: "a", hours: 1 },
    ]);
  });

  it("names what appeared and was never used", () => {
    expect(neverUsed(events)).toEqual(["b"]);
  });

  it("lists the longest wait per id, longest first, from one hour", () => {
    expect(
      slowestReveals([
        { id: "a", hours: 2 },
        { id: "a", hours: 3.25 },
        { id: "b", hours: 5 },
        { id: "quick", hours: 0.5 },
      ]),
    ).toEqual(["b 5.0h", "a 3.3h"]);
  });
});

describe("reveal measures", () => {
  const samples = [
    sample([
      { kind: "appeared", id: "a", liveSec: 0 },
      { kind: "appeared", id: "b", liveSec: 0 },
      { kind: "appeared", id: "never", liveSec: 0 },
    ]),
    sample([{ kind: "firstUse", id: "a", liveSec: HOUR }]),
    {} as DecisionSample,
    sample([{ kind: "firstUse", id: "b", liveSec: 3 * HOUR }]),
  ];

  it("reports the longest wait and the 90th percentile", () => {
    expect(revealToUse.aggregate(samples)).toBe(3);
    expect(revealToUseP90.aggregate(samples)).toBeCloseTo(2.8);
    expect(revealToUse.aggregate([])).toBe(0);
  });

  it("names the slow ones and the unused ones", () => {
    expect(revealSlowest.aggregate(samples)).toEqual(["b 3.0h", "a 1.0h"]);
    expect(revealNeverUsed.aggregate(samples)).toEqual(["never"]);
  });
});
