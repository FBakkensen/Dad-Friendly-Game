// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMemoryAuth } from "./auth";
import { createMemoryStorage } from "./mountain-screen.harness";
import { createMenuPanel } from "./menu-panel";
import { createProgressStore } from "./progress-store";

const build = (signal?: AbortSignal) => {
  const auth = createMemoryAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: createMemoryStorage(),
  });
  const panel = createMenuPanel({
    progress,
    getView: () => progress.getSnapshot(),
    auth,
    onStartOver: () => undefined,
    door: document.createElement("button"),
    requestRender: () => undefined,
    ...(signal === undefined ? {} : { signal }),
  });
  const authWords = () =>
    panel.menu.querySelector(".auth-action")?.textContent ?? "";
  return { auth, authWords };
};

describe("the menu's account button", () => {
  it("follows the account when no signal is given, as in the app", async () => {
    const { auth, authWords } = build();
    expect(authWords()).toBe("Sign in with Google");
    await auth.signIn();
    expect(authWords()).toBe("Sign out");
  });

  it("stops following the account once its signal aborts", async () => {
    const stop = new AbortController();
    const { auth, authWords } = build(stop.signal);
    expect(authWords()).toBe("Sign in with Google");
    stop.abort();
    await auth.signIn();
    expect(authWords()).toBe("Sign in with Google");
  });
});
