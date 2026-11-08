import { describe, expect, it } from "vitest";
import {
  type FullRun,
  type SignoffState,
  decideSignoff,
  markerAfterFull,
  markerText,
  parseMarker,
  signoffState,
} from "./signoff";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const SUMMARY = "gate full: 14 passed in 210.4s";

const green: FullRun = {
  green: true,
  headBefore: SHA,
  headAfter: SHA,
  cleanBefore: true,
  cleanAfter: true,
  summary: SUMMARY,
};

describe("markerAfterFull", () => {
  it("writes a marker for a green run on a clean, unmoved HEAD", () => {
    expect(markerAfterFull(green)).toEqual({
      kind: "write",
      marker: { sha: SHA, summary: SUMMARY },
    });
  });

  it("writes nothing for a red run", () => {
    const move = markerAfterFull({ ...green, green: false });
    expect(move.kind).toBe("none");
    if (move.kind === "none") expect(move.reason).toContain("red");
  });

  it("writes nothing when the tree was dirty before or after", () => {
    for (const run of [
      { ...green, cleanBefore: false },
      { ...green, cleanAfter: false },
    ]) {
      const move = markerAfterFull(run);
      expect(move.kind).toBe("none");
      if (move.kind === "none") expect(move.reason).toContain("uncommitted");
    }
  });

  it("writes nothing when HEAD moved during the run", () => {
    const move = markerAfterFull({ ...green, headAfter: OTHER });
    expect(move.kind).toBe("none");
    if (move.kind === "none") expect(move.reason).toContain("HEAD moved");
  });
});

describe("parseMarker", () => {
  it("reads back what markerText wrote", () => {
    const marker = { sha: SHA, summary: SUMMARY };
    expect(parseMarker(markerText(marker))).toEqual(marker);
  });

  it("is undefined for a missing, empty, or garbled file", () => {
    expect(parseMarker(undefined)).toBeUndefined();
    expect(parseMarker("")).toBeUndefined();
    expect(parseMarker("nope\nx")).toBeUndefined();
    expect(parseMarker(`${SHA}\n`)).toBeUndefined();
  });
});

describe("decideSignoff", () => {
  const ready: SignoffState = {
    head: SHA,
    marker: { sha: SHA, summary: SUMMARY },
    dirty: false,
    pushed: true,
  };
  const refusal = (state: SignoffState): string => {
    const decision = decideSignoff(state);
    expect(decision.kind).toBe("refuse");
    return decision.kind === "refuse" ? decision.message : "";
  };

  it("posts on HEAD with the marker's summary", () => {
    expect(decideSignoff(ready)).toEqual({
      kind: "post",
      sha: SHA,
      description: SUMMARY,
    });
  });

  it("cuts the description to GitHub's 140 characters", () => {
    const long = "x".repeat(200);
    const decision = decideSignoff({
      ...ready,
      marker: { sha: SHA, summary: long },
    });
    expect(decision.kind === "post" && decision.description.length).toBe(140);
  });

  it("refuses a dirty tree first, then an unpushed HEAD, then a missing pass", () => {
    expect(
      refusal({ ...ready, dirty: true, pushed: false, marker: undefined }),
    ).toContain("commit");
    expect(refusal({ ...ready, pushed: false, marker: undefined })).toContain(
      "push",
    );
    expect(refusal({ ...ready, marker: undefined })).toContain(
      "npm run gate -- full",
    );
    expect(
      refusal({ ...ready, marker: { sha: OTHER, summary: SUMMARY } }),
    ).toContain("npm run gate -- full");
  });
});

describe("signoffState", () => {
  it("is missing without a signoff entry", () => {
    expect(signoffState([{ context: "probe", state: "success" }])).toBe(
      "missing",
    );
  });

  it("reads the signoff entry beside other contexts", () => {
    expect(
      signoffState([
        { context: "probe", state: "failure" },
        { context: "signoff", state: "success" },
      ]),
    ).toBe("success");
    expect(signoffState([{ context: "signoff", state: "pending" }])).toBe(
      "pending",
    );
    expect(signoffState([{ context: "signoff", state: "error" }])).toBe(
      "failure",
    );
  });
});
