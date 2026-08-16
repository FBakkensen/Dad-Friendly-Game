import { tapBoot, type BootScreen } from "./boot";

export function mountBootScreen({
  root,
  tileUrl,
}: {
  root: HTMLElement;
  tileUrl: string;
}): void {
  let screen: BootScreen = { kind: "idle" };

  const button = document.createElement("button");
  button.type = "button";
  button.className = "boot-target";
  button.setAttribute("aria-label", "Light the lantern");
  button.setAttribute("aria-pressed", "false");

  const img = document.createElement("img");
  img.src = tileUrl;
  img.alt = "";
  img.width = 32;
  img.height = 32;
  img.draggable = false;

  const status = document.createElement("p");
  status.className = "boot-status";
  status.setAttribute("aria-live", "polite");

  const render = (): void => {
    switch (screen.kind) {
      case "idle":
        button.setAttribute("aria-pressed", "false");
        status.textContent = "";
        break;
      case "tapped":
        button.setAttribute("aria-pressed", "true");
        status.textContent = "You're in.";
        break;
      default: {
        const _exhaustive: never = screen;
        return _exhaustive;
      }
    }
  };

  button.addEventListener("click", () => {
    screen = tapBoot(screen);
    render();
  });

  button.append(img);
  root.replaceChildren(button, status);
  render();
}
