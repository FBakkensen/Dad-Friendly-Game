import { describe, expect, it } from "vitest";
import {
  LOCAL_AUTH_USER,
  createAuth,
  createMemoryAuth,
  parseFirebaseWebConfig,
  type AuthController,
  type FirebaseWebOptions,
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

describe("createAuth", () => {
  it("signs in locally on localhost and never calls Firebase", async () => {
    const firebaseCalls: FirebaseWebOptions[] = [];
    const auth = createAuth({
      config: readyConfig,
      hostname: "localhost",
      createFirebase: ({ options }) => {
        firebaseCalls.push(options);
        return createMemoryAuth();
      },
    });

    expect(firebaseCalls).toEqual([]);
    await auth.signIn();
    expect(auth.getState()).toEqual({
      kind: "signed-in",
      user: LOCAL_AUTH_USER,
    });
  });

  it("signs in locally on 127.0.0.1", async () => {
    const auth = createAuth({
      config: readyConfig,
      hostname: "127.0.0.1",
      createFirebase: () => {
        throw new Error("Firebase should not start");
      },
    });

    await auth.signIn();
    expect(auth.getState()).toEqual({
      kind: "signed-in",
      user: LOCAL_AUTH_USER,
    });
  });

  it("uses Firebase on a real host when config is ready", () => {
    const firebaseCalls: FirebaseWebOptions[] = [];
    const stub: AuthController = createMemoryAuth({
      user: { uid: "prod", label: "Prod" },
    });
    const auth = createAuth({
      config: readyConfig,
      hostname: "dad-friendly-game.web.app",
      createFirebase: ({ options }) => {
        firebaseCalls.push(options);
        return stub;
      },
    });

    expect(firebaseCalls).toEqual([readyConfig.options]);
    expect(auth).toBe(stub);
  });

  it("stays signed out on a real host when config is missing", async () => {
    const auth = createAuth({
      config: { kind: "absent" },
      hostname: "dad-friendly-game.web.app",
      createFirebase: () => {
        throw new Error("Firebase should not start");
      },
    });

    await auth.signIn();
    expect(auth.getState()).toEqual({ kind: "signed-out" });
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
