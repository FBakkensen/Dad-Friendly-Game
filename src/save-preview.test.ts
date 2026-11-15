import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { readSave, serializeSave } from "./persist";
import { previewConflictView } from "./save-preview";

/** The conflict sheet's dev preview (`?saves=two`) on the slice preview: two saves this build can read. */
describe("the conflict preview", () => {
  const readable = () => {
    const view = previewConflictView(30 * 86_400_000, "this-phone");
    return [view.local, view.remote].map(
      (side) =>
        readSave(
          JSON.parse(
            JSON.stringify(
              serializeSave({
                mountain: side.mountain,
                lastSeen: side.lastSeen ?? 0,
              }),
            ),
          ),
        ).kind,
    );
  };

  it("holds two fresh mines on the slice preview (#707)", () => {
    expect(withFactors({ [FRESH_OFF]: 0 }, readable)).toEqual(["ok", "ok"]);
  });
});
