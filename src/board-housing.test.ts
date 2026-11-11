// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mountHousing } from "./board-housing";

describe("mountHousing (#376)", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("mounts one skinned housing before #app, hidden from readers, however often it runs", () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.append(document.createElement("p"), app);
    mountHousing(document);
    mountHousing(document);
    const housings = document.querySelectorAll(".board-housing");
    expect(housings).toHaveLength(1);
    const housing = housings[0];
    expect(housing?.getAttribute("aria-hidden")).toBe("true");
    expect(housing?.nextElementSibling).toBe(app);
    expect(
      housing?.querySelectorAll(":scope > canvas.board-skin"),
    ).toHaveLength(1);
  });

  it("mounts the housing first in the body when there is no #app", () => {
    document.body.append(document.createElement("p"));
    mountHousing(document);
    expect(document.body.firstElementChild?.className).toContain(
      "board-housing",
    );
  });
});
