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
    // Rules tests need the Firestore emulator: npm run test:rules.
    exclude: ["**/node_modules/**", "rules-test/**", "**/*.emulator.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Thin wiring around the Firebase SDK and the DOM entry point; covered by
      // the emulator rules tests and the browser layout check instead.
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/firebase-auth.ts",
        "src/firebase-save.ts",
        "src/test-fixtures.ts",
      ],
      reporter: ["text-summary", "json-summary"],
      // Floors per module (#114): coverage may rise, never drop. Raise these
      // when tests improve; never lower them to make a PR pass.
      thresholds: {
        "src/boosts.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/cloud-save.ts": {
          statements: 82,
          branches: 93,
          functions: 72,
          lines: 82,
        },
        "src/crew.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/format.ts": {
          statements: 94,
          branches: 100,
          functions: 100,
          lines: 94,
        },
        "src/mountain-screen.ts": {
          statements: 99,
          branches: 87,
          functions: 100,
          lines: 99,
        },
        "src/mountain.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/pacing.ts": {
          statements: 100,
          branches: 96,
          functions: 100,
          lines: 100,
        },
        "src/persist.ts": {
          statements: 97,
          branches: 94,
          functions: 100,
          lines: 97,
        },
        "src/progress-store.ts": {
          statements: 95,
          branches: 93,
          functions: 97,
          lines: 95,
        },
        "src/rates.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/relics.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/session-save.ts": {
          statements: 100,
          branches: 91,
          functions: 100,
          lines: 100,
        },
        "src/tiers.ts": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 94,
        },
        "src/upgrades.ts": {
          statements: 100,
          branches: 96,
          functions: 100,
          lines: 100,
        },
        "src/relic-panels.ts": {
          statements: 99,
          branches: 86,
          functions: 100,
          lines: 99,
        },
        "src/welcome-panel.ts": {
          statements: 100,
          branches: 96,
          functions: 100,
          lines: 100,
        },
        "src/menu-panel.ts": {
          statements: 99,
          branches: 87,
          functions: 100,
          lines: 99,
        },
        "src/float-text.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/crew-panel.ts": {
          statements: 97,
          branches: 88,
          functions: 100,
          lines: 97,
        },
        "src/legacy.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/legacy-panel.ts": {
          statements: 100,
          branches: 85,
          functions: 100,
          lines: 100,
        },
        "src/screen-words.ts": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        "src/upgrades-panel.ts": {
          statements: 98,
          branches: 85,
          functions: 100,
          lines: 98,
        },
        "src/veins.ts": {
          statements: 90,
          branches: 95,
          functions: 100,
          lines: 90,
        },
        "src/field-log.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/engineers.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/hazards.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/expeditions.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lost-tools.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/engineers-panel.ts": {
          statements: 97,
          branches: 91,
          functions: 100,
          lines: 97,
        },
        "src/economy/actions.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
