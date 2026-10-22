import { describe, expect, it } from "vitest";
import { leaseBlocks, parseWriterLease, parseWriterNote } from "./tab-lease";

describe("writer lease", () => {
  it("reads a live lease and ignores junk", () => {
    expect(parseWriterLease(null)).toBeUndefined();
    expect(parseWriterLease("")).toBeUndefined();
    expect(parseWriterLease("not-json")).toBeUndefined();
    expect(parseWriterLease("null")).toBeUndefined();
    expect(parseWriterLease("{}")).toBeUndefined();
    expect(
      parseWriterLease(JSON.stringify({ tabId: "short", until: 1 })),
    ).toBeUndefined();
    expect(
      parseWriterLease(JSON.stringify({ tabId: "tab-other", until: "soon" })),
    ).toBeUndefined();
    expect(
      parseWriterLease(JSON.stringify({ tabId: "tab-other", until: 50 })),
    ).toEqual({ tabId: "tab-other", until: 50 });
  });

  it("blocks only while another tab's lease is still fresh", () => {
    const lease = { tabId: "tab-other", until: 50 };
    expect(leaseBlocks(lease, "tab-mine1", 49)).toBe(true);
    expect(leaseBlocks(lease, "tab-mine1", 50)).toBe(false);
    expect(leaseBlocks(lease, "tab-other", 49)).toBe(false);
    expect(leaseBlocks(undefined, "tab-mine1", 49)).toBe(false);
  });

  it("reads yield and taken notes", () => {
    expect(parseWriterNote(null)).toBeUndefined();
    expect(parseWriterNote({ type: "yield" })).toBeUndefined();
    expect(
      parseWriterNote({ type: "nope", tabId: "tab-mine1" }),
    ).toBeUndefined();
    expect(parseWriterNote({ type: "yield", tabId: "short" })).toBeUndefined();
    expect(parseWriterNote({ type: "yield", tabId: "tab-mine1" })).toEqual({
      type: "yield",
      tabId: "tab-mine1",
    });
    expect(parseWriterNote({ type: "taken", tabId: "tab-mine1" })).toEqual({
      type: "taken",
      tabId: "tab-mine1",
    });
  });
});
