import {
  createMemoryAuth,
  createUnconfiguredAuth,
  parseFirebaseWebConfig,
  type AuthController,
  type FirebaseEnv,
  type FirebaseWebOptions,
} from "./auth";
import {
  createMemoryCloudSave,
  createNoopCloudSave,
  type CloudSave,
} from "./cloud-save";
import { createProgressStore, type ProgressStore } from "./progress-store";

export type AppServices = {
  readonly auth: AuthController;
  readonly progress: ProgressStore;
  readonly now: () => number;
};

export type BootOptions = {
  readonly memorySave: boolean;
  readonly idleOffsetMs: number;
};

export function parseBootOptions(search: string): BootOptions {
  const params = new URLSearchParams(search);
  return {
    memorySave: params.get("memorySave") === "1",
    idleOffsetMs: parseIdleOffsetMs(params.get("idleOffsetMs")),
  };
}

export function createOffsetNow({
  base,
  offsetMs,
}: {
  base: () => number;
  offsetMs: number;
}): () => number {
  return () => base() + offsetMs;
}

type FirebaseImporters = {
  readonly importAuth: (args: {
    options: FirebaseWebOptions;
  }) => Promise<AuthController>;
  readonly importCloudSave: (args: {
    options: FirebaseWebOptions;
  }) => Promise<CloudSave>;
};

const firebaseImporters: FirebaseImporters = {
  importAuth: async ({ options }) => {
    const { createFirebaseAuth } = await import("./firebase-auth");
    return createFirebaseAuth({ options });
  },
  importCloudSave: async ({ options }) => {
    const { createFirebaseCloudSave } = await import("./firebase-save");
    return createFirebaseCloudSave({ options });
  },
};

export async function createAppServices({
  env,
  search = window.location.search,
  baseNow = () => Date.now(),
  importers = firebaseImporters,
}: {
  env: FirebaseEnv;
  search?: string;
  baseNow?: () => number;
  importers?: FirebaseImporters;
}): Promise<AppServices> {
  const options = parseBootOptions(search);
  const now = createOffsetNow({
    base: baseNow,
    offsetMs: options.idleOffsetMs,
  });

  const services = options.memorySave
    ? memoryServices()
    : await configuredServices({ env, importers });

  const progress = createProgressStore({
    auth: services.auth,
    cloudSave: services.cloudSave,
  });
  return { auth: services.auth, progress, now };
}

function memoryServices(): {
  readonly auth: AuthController;
  readonly cloudSave: CloudSave;
} {
  return {
    auth: createMemoryAuth({
      state: { kind: "signed-in", user: { uid: "dev-dad", label: "Dev Dad" } },
    }),
    cloudSave: createMemoryCloudSave(),
  };
}

async function configuredServices({
  env,
  importers,
}: {
  env: FirebaseEnv;
  importers: FirebaseImporters;
}): Promise<{
  readonly auth: AuthController;
  readonly cloudSave: CloudSave;
}> {
  const config = parseFirebaseWebConfig({ env });
  switch (config.kind) {
    case "absent":
      return {
        auth: createUnconfiguredAuth(),
        cloudSave: createNoopCloudSave(),
      };
    case "ready": {
      try {
        const [auth, cloudSave] = await Promise.all([
          importers.importAuth({ options: config.options }),
          importers.importCloudSave({ options: config.options }),
        ]);
        return { auth, cloudSave };
      } catch (error) {
        console.error("boot.firebase", error);
        return {
          auth: createUnconfiguredAuth(),
          cloudSave: createNoopCloudSave(),
        };
      }
    }
    default: {
      const _exhaustive: never = config;
      return _exhaustive;
    }
  }
}

function parseIdleOffsetMs(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}
