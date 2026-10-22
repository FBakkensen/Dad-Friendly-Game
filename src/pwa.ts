/** Registers the app-shell service worker in production builds only. */
export function registerServiceWorker({
  container = "serviceWorker" in globalThis.navigator
    ? globalThis.navigator.serviceWorker
    : undefined,
  production = import.meta.env.PROD,
  onUpdate,
}: {
  container?: ServiceWorkerContainer | undefined;
  production?: boolean;
  /** A newer build has taken control. The page shows a reload prompt. */
  onUpdate?: () => void;
} = {}): Promise<"registered" | "skipped" | "failed"> {
  if (!production || container === undefined) {
    return Promise.resolve("skipped");
  }
  return container.register("/sw.js", { scope: "/" }).then(
    (registration) => {
      if (onUpdate !== undefined) {
        watchForAppUpdate({ container, registration, onUpdate });
      }
      return "registered" as const;
    },
    (error: unknown) => {
      console.error("pwa.register", error);
      return "failed" as const;
    },
  );
}

/**
 * The first controller is this install. A later controllerchange means a
 * newer build is running and the open page should reload.
 */
export function watchForAppUpdate({
  container,
  registration,
  onUpdate,
  subscribeVisible = (listener: () => void): (() => void) => {
    document.addEventListener("visibilitychange", listener);
    return () => {
      document.removeEventListener("visibilitychange", listener);
    };
  },
}: {
  container: ServiceWorkerContainer;
  registration: ServiceWorkerRegistration;
  onUpdate: () => void;
  subscribeVisible?: (listener: () => void) => () => void;
}): () => void {
  let hadController = container.controller !== null;
  const onController = (): void => {
    const hasController = container.controller !== null;
    if (hadController && hasController) {
      onUpdate();
    }
    hadController = hasController;
  };
  container.addEventListener("controllerchange", onController);
  if (registration.waiting !== null && hadController) {
    onUpdate();
  }
  const onVisible = (): void => {
    if (document.visibilityState !== "visible") {
      return;
    }
    void registration.update();
  };
  const stopVisible = subscribeVisible(onVisible);
  return () => {
    container.removeEventListener("controllerchange", onController);
    stopVisible();
  };
}
