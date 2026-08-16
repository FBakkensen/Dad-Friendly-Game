import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { assertProductionFirebaseWebConfig } from "./src/auth";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  assertProductionFirebaseWebConfig({
    mode,
    env: {
      VITE_FIREBASE_API_KEY: env["VITE_FIREBASE_API_KEY"],
      VITE_FIREBASE_AUTH_DOMAIN: env["VITE_FIREBASE_AUTH_DOMAIN"],
      VITE_FIREBASE_PROJECT_ID: env["VITE_FIREBASE_PROJECT_ID"],
      VITE_FIREBASE_APP_ID: env["VITE_FIREBASE_APP_ID"],
    },
  });
  return {
    test: {
      environment: "happy-dom",
    },
  };
});
