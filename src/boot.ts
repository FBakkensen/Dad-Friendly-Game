export type BootScreen = { kind: "idle" } | { kind: "tapped" };

export function tapBoot(screen: BootScreen): BootScreen {
  switch (screen.kind) {
    case "idle":
      return { kind: "tapped" };
    case "tapped":
      return screen;
    default: {
      const _exhaustive: never = screen;
      return _exhaustive;
    }
  }
}
