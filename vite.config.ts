import { defineConfig } from "vitest/config";
import { assertProductionFirebaseWebConfig } from "./src/auth.ts";

export default defineConfig({
  plugins: [
    {
      // Runs only for real `vite build`, so tools that load this config (knip) don't trip it.
      name: "require-firebase-config",
      apply: "build",
      configResolved: (config) => {
        const env = config.env as Record<string, string | undefined>;
        assertProductionFirebaseWebConfig({
          mode: config.mode,
          env: {
            VITE_FIREBASE_API_KEY: env["VITE_FIREBASE_API_KEY"],
            VITE_FIREBASE_AUTH_DOMAIN: env["VITE_FIREBASE_AUTH_DOMAIN"],
            VITE_FIREBASE_PROJECT_ID: env["VITE_FIREBASE_PROJECT_ID"],
            VITE_FIREBASE_APP_ID: env["VITE_FIREBASE_APP_ID"],
          },
        });
      },
    },
  ],
  test: {
    environment: "happy-dom",
  },
});
