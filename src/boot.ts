import {
  createMemoryAuth,
  createUnconfiguredAuth,
  parseFirebaseWebConfig,
  type AuthController,
  type FirebaseEnv,
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
};

export function parseBootOptions(search: string): { memorySave: boolean } {
  return {
    memorySave: new URLSearchParams(search).get("memorySave") === "1",
  };
}

export async function createAppServices({
  env,
  search = window.location.search,
  devMode = import.meta.env.DEV,
}: {
  env: FirebaseEnv;
  search?: string;
  devMode?: boolean;
}): Promise<AppServices> {
  const services =
    devMode && parseBootOptions(search).memorySave
      ? memoryServices()
      : await configuredServices({ env });
  const progress = createProgressStore({
    auth: services.auth,
    cloudSave: services.cloudSave,
  });
  return { auth: services.auth, progress };
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

async function configuredServices({ env }: { env: FirebaseEnv }): Promise<{
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
          import("./firebase-auth").then((m) =>
            m.createFirebaseAuth({ options: config.options }),
          ),
          import("./firebase-save").then((m) =>
            m.createFirebaseCloudSave({ options: config.options }),
          ),
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
