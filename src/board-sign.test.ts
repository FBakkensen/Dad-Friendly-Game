// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createBoardSign } from "./board-sign";

describe("the New sign over a key (#373)", () => {
  it("is a hidden slot, not a button, and quiet for readers", () => {
    const sign = createBoardSign();
    expect(sign.root.classList.contains("board-sign-slot")).toBe(true);
    expect(sign.root.hidden).toBe(true);
    expect(sign.root.getAttribute("aria-hidden")).toBe("true");
    expect(sign.root.querySelector("button")).toBeNull();
    expect(sign.root.querySelector(".board-sign")).not.toBeNull();
    expect(sign.shown()).toBeUndefined();
  });

  it("stands over its key with the words, then goes", () => {
    const sign = createBoardSign();
    sign.show("engineers", "New · Ada is your first engineer");
    expect(sign.root.hidden).toBe(false);
    expect(sign.root.dataset["key"]).toBe("engineers");
    expect(sign.root.querySelector(".board-sign-text")?.textContent).toBe(
      "New · Ada is your first engineer",
    );
    expect(sign.shown()).toEqual({
      key: "engineers",
      words: "New · Ada is your first engineer",
    });
    sign.hide();
    expect(sign.root.hidden).toBe(true);
    expect(sign.shown()).toBeUndefined();
  });

  it("writes nothing when shown again with the same words", () => {
    const sign = createBoardSign();
    sign.show("workshop", "New · The Workshop is open");
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((records) => {
      seen.push(...records);
    });
    watch.observe(sign.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    sign.show("workshop", "New · The Workshop is open");
    seen.push(...watch.takeRecords());
    watch.disconnect();
    expect(seen).toEqual([]);
  });
});
