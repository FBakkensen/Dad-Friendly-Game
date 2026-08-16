export type AuthUser = {
  readonly uid: string;
  readonly label: string;
};

export type AuthState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "signing-in" }
  | { readonly kind: "signed-in"; readonly user: AuthUser };

export type AuthController = {
  readonly getState: () => AuthState;
  readonly subscribe: (listener: (state: AuthState) => void) => () => void;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
};

export type FirebaseEnv = {
  readonly VITE_FIREBASE_API_KEY?: string | undefined;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string | undefined;
  readonly VITE_FIREBASE_PROJECT_ID?: string | undefined;
  readonly VITE_FIREBASE_APP_ID?: string | undefined;
};

export type FirebaseWebOptions = {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
};

export type FirebaseWebConfig =
  | { readonly kind: "absent" }
  | { readonly kind: "ready"; readonly options: FirebaseWebOptions };

export function parseFirebaseWebConfig({
  env,
}: {
  env: FirebaseEnv;
}): FirebaseWebConfig {
  const apiKey = readEnv(env.VITE_FIREBASE_API_KEY);
  const authDomain = readEnv(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = readEnv(env.VITE_FIREBASE_PROJECT_ID);
  const appId = readEnv(env.VITE_FIREBASE_APP_ID);
  if (
    apiKey === undefined ||
    authDomain === undefined ||
    projectId === undefined ||
    appId === undefined
  ) {
    return { kind: "absent" };
  }
  return {
    kind: "ready",
    options: { apiKey, authDomain, projectId, appId },
  };
}

export function assertProductionFirebaseWebConfig({
  mode,
  env,
}: {
  mode: string;
  env: FirebaseEnv;
}): void {
  if (mode !== "production") {
    return;
  }
  const config = parseFirebaseWebConfig({ env });
  if (config.kind === "absent") {
    throw new Error("production build needs VITE_FIREBASE_*");
  }
}

export function createAuth({
  config,
  createFirebase,
}: {
  config: FirebaseWebConfig;
  createFirebase: (args: { options: FirebaseWebOptions }) => AuthController;
}): AuthController {
  switch (config.kind) {
    case "ready":
      return createFirebase({ options: config.options });
    case "absent":
      return createUnconfiguredAuth();
    default: {
      const _exhaustive: never = config;
      return _exhaustive;
    }
  }
}

export function createUnconfiguredAuth(): AuthController {
  const store = createAuthStore({ kind: "signed-out" });
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
}

export function createMemoryAuth({
  state = { kind: "signed-out" },
  user = { uid: "test-dad", label: "Test Dad" },
}: {
  state?: AuthState;
  user?: AuthUser;
} = {}): AuthController {
  const store = createAuthStore(state);
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    signIn: () => {
      store.setState({ kind: "signed-in", user });
      return Promise.resolve();
    },
    signOut: () => {
      store.setState({ kind: "signed-out" });
      return Promise.resolve();
    },
  };
}

function createAuthStore(initial: AuthState): {
  getState: () => AuthState;
  setState: (state: AuthState) => void;
  subscribe: (listener: (state: AuthState) => void) => () => void;
} {
  let state = initial;
  const listeners = new Set<(next: AuthState) => void>();
  return {
    getState: () => state,
    setState: (next) => {
      state = next;
      for (const listener of listeners) {
        listener(state);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function readEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
