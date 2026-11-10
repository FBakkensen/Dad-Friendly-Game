import { describe, expect, it } from "vitest";
import { coverFor, wantedSign } from "./screen-cover";
import { engineersNote, WORKSHOP_NOTE } from "./screen-words";
import { noteFor } from "./teach";
import { minedMountain } from "./test-fixtures";
import type { Mountain } from "./mountain";
import type { ProgressSnapshot } from "./progress-store";

const snap = (mountain: Mountain, ready = true): ProgressSnapshot =>
  ({ mountain, ready }) as unknown as ProgressSnapshot;

describe("coverFor", () => {
  it.each([
    [false, false, false, false, false, false],
    [false, false, true, false, false, true],
    [false, true, false, false, true, true],
    [false, true, true, false, true, true],
    [true, false, false, true, true, true],
    [true, false, true, true, true, true],
    [true, true, false, true, true, true],
    [true, true, true, true, true, true],
  ])(
    "card %s, drawer %s, note %s gives close %s, put away %s, hold %s",
    (cardUp, drawerOpen, noteOn, closeDrawers, putAway, holdSign) => {
      expect(coverFor({ cardUp, drawerOpen, noteOn })).toEqual({
        closeDrawers,
        putAway,
        holdSign,
      });
    },
  );
});

describe("wantedSign", () => {
  const workshop = minedMountain(12_000_000);
  const engineer: Mountain = {
    ...workshop,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    seen: ["workshop"],
    taught: ["workshop"],
  };

  it("asks for nothing before the save is ready", () => {
    expect(wantedSign(snap(workshop, false))).toBeUndefined();
  });

  it("asks for the Workshop's sign", () => {
    expect(noteFor(workshop)).toBe("workshop");
    expect(wantedSign(snap(workshop))).toEqual({
      id: "workshop",
      key: "workshop",
      words: WORKSHOP_NOTE,
    });
  });

  it("asks for the first engineer's sign", () => {
    expect(wantedSign(snap(engineer))).toEqual({
      id: "engineers",
      key: "engineers",
      words: engineersNote("Ada"),
    });
  });

  it("asks for nothing when the engineers' note has no engineer to name", () => {
    const none: Mountain = { ...engineer, engineers: [] };
    expect(wantedSign(snap(none))).toBeUndefined();
  });

  it("asks for nothing when no note is due", () => {
    expect(
      wantedSign(snap({ ...engineer, seen: ["workshop", "engineers"] })),
    ).toBeUndefined();
  });
});
