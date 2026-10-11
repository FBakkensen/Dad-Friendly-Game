/** Registers the app-shell service worker in production builds only. */
export function registerServiceWorker({
  container = "serviceWorker" in globalThis.navigator
    ? globalThis.navigator.serviceWorker
    : undefined,
  production = import.meta.env.PROD,
}: {
  container?: ServiceWorkerContainer | undefined;
  production?: boolean;
} = {}): Promise<"registered" | "skipped" | "failed"> {
  if (!production || container === undefined) {
    return Promise.resolve("skipped");
  }
  return container.register("/sw.js", { scope: "/" }).then(
    () => "registered" as const,
    (error: unknown) => {
      console.error("pwa.register", error);
      return "failed" as const;
    },
  );
}
