import { describe, expect, it } from "vitest";
import {
  assertProductionFirebaseWebConfig,
  createMemoryAuth,
  parseFirebaseWebConfig,
} from "./auth";

const readyConfig = {
  kind: "ready",
  options: {
    apiKey: "key",
    authDomain: "demo.firebaseapp.com",
    projectId: "demo",
    appId: "1:2:web:3",
  },
} as const;

describe("parseFirebaseWebConfig", () => {
  it("is ready only when every field is present", () => {
    expect(parseFirebaseWebConfig({ env: {} })).toEqual({ kind: "absent" });
    expect(
      parseFirebaseWebConfig({
        env: {
          VITE_FIREBASE_API_KEY: "  ",
          VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
          VITE_FIREBASE_PROJECT_ID: "demo",
          VITE_FIREBASE_APP_ID: "1:2:web:3",
        },
      }),
    ).toEqual({ kind: "absent" });
    expect(
      parseFirebaseWebConfig({
        env: {
          VITE_FIREBASE_API_KEY: "key",
          VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
          VITE_FIREBASE_PROJECT_ID: "demo",
          VITE_FIREBASE_APP_ID: "1:2:web:3",
        },
      }),
    ).toEqual(readyConfig);
  });
});

describe("assertProductionFirebaseWebConfig", () => {
  it("allows non-production builds without env", () => {
    expect(() => {
      assertProductionFirebaseWebConfig({ mode: "test", env: {} });
    }).not.toThrow();
  });

  it("rejects a production build when Firebase env is missing", () => {
    expect(() => {
      assertProductionFirebaseWebConfig({ mode: "production", env: {} });
    }).toThrow("production build needs VITE_FIREBASE_*");
  });

  it("allows a production build when every field is present", () => {
    expect(() => {
      assertProductionFirebaseWebConfig({
        mode: "production",
        env: {
          VITE_FIREBASE_API_KEY: "key",
          VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
          VITE_FIREBASE_PROJECT_ID: "demo",
          VITE_FIREBASE_APP_ID: "1:2:web:3",
        },
      });
    }).not.toThrow();
  });
});

describe("createMemoryAuth", () => {
  it("signs in and out", async () => {
    const auth = createMemoryAuth();
    expect(auth.getState()).toEqual({ kind: "signed-out" });

    await auth.signIn();
    expect(auth.getState()).toEqual({
      kind: "signed-in",
      user: { uid: "test-dad", label: "Test Dad" },
    });

    await auth.signOut();
    expect(auth.getState()).toEqual({ kind: "signed-out" });
  });
});
