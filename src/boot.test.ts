import { describe, expect, it } from "vitest";
import { tapBoot } from "./boot";

describe("tapBoot", () => {
  it("moves idle to tapped", () => {
    expect(tapBoot({ kind: "idle" })).toEqual({ kind: "tapped" });
  });

  it("keeps tapped as tapped", () => {
    expect(tapBoot({ kind: "tapped" })).toEqual({ kind: "tapped" });
  });
});
