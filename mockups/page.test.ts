import { describe, expect, it } from "vitest";
import { MOCK_RECIPES, UNFOUND_HINT } from "../src/screen-words.ts";
import {
  craftTap,
  parseMockView,
  renderMock,
  shortReason,
  type MockView,
} from "./page.ts";

const view = (patch: Partial<MockView> = {}): MockView => ({
  scene: "workshop",
  phase: "rest",
  control: "",
  shot: true,
  ...patch,
});

function host(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("workshop mock page (#193)", () => {
  it("reads the scene from the query", () => {
    expect(parseMockView("")).toEqual({
      scene: "workshop",
      phase: "rest",
      control: "",
      shot: false,
    });
    expect(
      parseMockView("?scene=layer&phase=press&control=dig&shot=1"),
    ).toEqual({
      scene: "layer",
      phase: "press",
      control: "dig",
      shot: true,
    });
    expect(() => parseMockView("?scene=nope")).toThrow(/scene/);
    expect(() => parseMockView("?phase=nope")).toThrow(/phase/);
    expect(parseMockView("?phase=shake&control=rails").phase).toBe("shake");
  });

  it("names the iron the rails still need", () => {
    const rails = MOCK_RECIPES.find((recipe) => recipe.id === "rails");
    const props = MOCK_RECIPES.find((recipe) => recipe.id === "props");
    const charge = MOCK_RECIPES.find((recipe) => recipe.id === "charge");
    expect(rails).toBeDefined();
    expect(props).toBeDefined();
    expect(charge).toBeDefined();
    if (rails === undefined || props === undefined || charge === undefined) {
      return;
    }
    expect(shortReason(rails)).toBe("Need 5 more iron");
    expect(shortReason(props)).toBeUndefined();
    expect(shortReason(charge)).toBeUndefined();
  });

  it("spells the craft tap for one material and for two", () => {
    expect(craftTap(["12 iron"])).toBe(
      "Presses in. 12 iron floats from the material line to the bench. A short hammer tap plays on the bench. Silent until unmuted.",
    );
    expect(craftTap(["20 clay", "6 iron"])).toBe(
      "Presses in. 20 clay and 6 iron float from the material line to the bench. A short hammer tap plays on the bench. Silent until unmuted.",
    );
    expect(() => craftTap([])).toThrow(/material/);
  });

  it("shows three priced recipes and one dark silhouette", () => {
    const page = host(renderMock(view()));
    const recipes = [...page.querySelectorAll(".recipe")];
    expect(recipes).toHaveLength(4);
    const hidden = page.querySelector(".is-hidden-recipe");
    expect(hidden?.querySelector("button")).toBeNull();
    expect(hidden?.textContent).toContain(UNFOUND_HINT);
    expect(hidden?.textContent ?? "").not.toMatch(/[0-9?]/);
    expect(page.textContent).not.toMatch(/\?/);
    expect(page.textContent).toContain("Need 5 more iron");
    expect(page.textContent).toContain("Craft · 1.8M");
    expect(page.textContent).toContain("Craft · 800K");
    const rails = page.querySelector("[data-craft='rails']");
    expect(rails?.textContent).toBe("Need 5 more iron");
    expect(rails?.hasAttribute("disabled")).toBe(true);
    expect(rails?.getAttribute("data-tap")).toContain("gentle shake");
    expect(rails?.getAttribute("data-tap")).toContain("Need 5 more iron");
    expect(page.textContent).toContain("Carts 10/s to 12/s");
    expect(page.textContent).toContain("Trouble comes 30% less often.");
    expect(page.textContent).toContain("The crew digs at 2× for 20 min.");
    expect(page.textContent).toContain("12 iron");
    expect(page.textContent).toContain("20 clay");
    expect(page.textContent).toContain("Clay 42");
    expect(page.textContent).toContain("Iron 7");
    expect(page.textContent).toContain("The bench is free");
    expect(page.textContent).toContain("Back to the mountain");
    const buttons = [...page.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const button of buttons) {
      const tap = button.getAttribute("data-tap") ?? "";
      expect(tap).toContain("Silent until unmuted");
      const reason = button.getAttribute("data-short");
      if (reason === null) {
        expect(tap).toContain("Presses in");
      } else {
        expect(tap).toContain("gentle shake");
        expect(tap).toContain(reason);
      }
    }
    for (const button of page.querySelectorAll("[data-craft]")) {
      if (button.hasAttribute("data-short")) {
        continue;
      }
      const tap = button.getAttribute("data-tap") ?? "";
      expect(tap).toContain("float");
      expect(tap).toContain("hammer tap");
    }
    expect(page.querySelector("audio, video")).toBeNull();
  });

  it("presses the tapped control and floats that craft's materials", () => {
    const pressed = host(
      renderMock(view({ phase: "press", control: "props" })),
    );
    const button = pressed.querySelector("[data-craft='props']");
    expect(button?.classList.contains("is-pressed")).toBe(true);
    expect(pressed.querySelectorAll(".is-pressed")).toHaveLength(1);
    const floating = host(
      renderMock(view({ phase: "float", control: "props" })),
    );
    const chips = [...floating.querySelectorAll(".float-chip")].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(["20 clay", "6 iron"]);
    const hammer = host(
      renderMock(view({ phase: "hammer", control: "props" })),
    );
    expect(hammer.querySelector(".hammer")).not.toBeNull();
    const denied = host(renderMock(view({ phase: "shake", control: "rails" })));
    const short = denied.querySelector("[data-craft='rails']");
    expect(short?.classList.contains("is-shaking")).toBe(true);
    expect(short?.classList.contains("is-pressed")).toBe(false);
    expect(short?.hasAttribute("disabled")).toBe(true);
    const noFloat = host(
      renderMock(view({ phase: "float", control: "rails" })),
    );
    expect(noFloat.querySelector(".float-chip")).toBeNull();
  });

  it("puts rails on the bench and holds the other crafts", () => {
    const page = host(renderMock(view({ phase: "busy" })));
    expect(page.textContent).toContain(
      "On the bench: Iron rails · 38 min left",
    );
    expect(page.querySelector(".bar")).not.toBeNull();
    const rails = page.querySelector("[data-craft='rails']");
    const props = page.querySelector("[data-craft='props']");
    expect(rails?.textContent).toBe("On the bench");
    expect(props?.textContent).toBe("Waiting its turn");
    expect(rails?.hasAttribute("disabled")).toBe(true);
    expect(props?.hasAttribute("disabled")).toBe(true);
    expect(page.querySelector(".back")?.hasAttribute("disabled")).toBe(false);
  });

  it("keeps the layer card and the craft-done notice free of question marks", () => {
    const layer = host(renderMock(view({ scene: "layer", control: "dig" })));
    expect(layer.textContent).toContain("You broke into the Granite!");
    expect(layer.textContent).toContain("Tough on carts. Drills love it.");
    expect(layer.textContent).toContain("Dig on");
    expect(layer.textContent).toContain("Clay 42");
    expect(layer.textContent).not.toMatch(/\?/);
    const done = host(
      renderMock(
        view({ scene: "craft-done", phase: "press", control: "done" }),
      ),
    );
    expect(done.textContent).toContain(
      "Your Iron rails are fitted. Carts now 12/s.",
    );
    expect(done.querySelector(".go")?.classList.contains("is-pressed")).toBe(
      true,
    );
    expect(done.textContent).not.toMatch(/\?/);
  });
});
