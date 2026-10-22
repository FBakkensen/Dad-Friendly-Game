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
  createUnavailableCloudSave,
  type CloudSave,
} from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore, type ProgressStore } from "./progress-store";
import { MOUNTAIN_STONES } from "./scale";
import { createBrowserTabWriter, type TabWriter } from "./tab-writer";

export type AppServices = {
  readonly auth: AuthController;
  readonly progress: ProgressStore;
  /** The one writer seat. `main` releases it on pagehide. */
  readonly tabWriter: TabWriter;
};

/** Dev-only save-line previews. Ignored outside `import.meta.env.DEV`. */
export type PreviewSave = "loading" | "error";

export function parseBootOptions(search: string): {
  memorySave: boolean;
  /** Dev-only layout hook: trouble is never saved, so the check asks for it. */
  previewTrouble: boolean;
  /** Dev-only layout hook: the conflict sheet, with two sample saves. */
  previewConflict: boolean;
  /** Dev-only layout hook: hold the save line on loading or unreachable. */
  previewSave: PreviewSave | undefined;
  /** Dev-only layout hook: two archived copies, one from an earlier run. */
  previewCopies: boolean;
} {
  const params = new URLSearchParams(search);
  const save = params.get("save");
  return {
    memorySave: params.get("memorySave") === "1",
    previewTrouble: params.get("trouble") === "cave-in",
    previewConflict: params.get("saves") === "two",
    previewSave: save === "loading" || save === "error" ? save : undefined,
    previewCopies: params.get("copies") === "shelf",
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
  const options = parseBootOptions(search);
  const previewing =
    options.memorySave ||
    options.previewSave !== undefined ||
    options.previewCopies;
  let services =
    devMode && previewing
      ? memoryServices()
      : await configuredServices({ env });
  if (devMode && options.previewSave === "error") {
    services = {
      auth: services.auth,
      cloudSave: createUnavailableCloudSave(),
    };
  } else if (devMode && options.previewSave === "loading") {
    services = {
      auth: services.auth,
      cloudSave: hangCloudWatch(services.cloudSave),
    };
  }
  if (devMode && options.previewCopies) {
    await seedPreviewCopies(services.cloudSave);
  }
  const tabWriter = createBrowserTabWriter();
  const progress = createProgressStore({
    auth: services.auth,
    cloudSave: services.cloudSave,
    tabWriter,
  });
  if (devMode && options.previewTrouble) {
    progress.previewTrouble("cart");
  }
  if (devMode && options.previewConflict) {
    progress.previewConflict();
  }
  return { auth: services.auth, progress, tabWriter };
}

/** The watch never answers, so the save line stays on "Loading your save...". */
function hangCloudWatch(cloudSave: CloudSave): CloudSave {
  return {
    ...cloudSave,
    watch: () => () => undefined,
  };
}

/**
 * Two archived copies for the Saved copies sheet. The earlier run is greyed
 * out. The kitchen tablet is a later run, so it can still be played.
 */
async function seedPreviewCopies(cloudSave: CloudSave): Promise<void> {
  if (cloudSave.archiveCopy === undefined) {
    return;
  }
  const now = Date.now();
  const earlier: Mountain = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 2_400_000,
    pocket: 18_000,
    helpers: 6,
    carts: 2,
    startedAt: 1,
  };
  const playable: Mountain = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 48_000_000,
    pocket: 3_200_000,
    helpers: 36,
    carts: 10,
    drills: 4,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    startedAt: now,
  };
  await cloudSave.archiveCopy({
    uid: "dev-dad",
    mountain: earlier,
    lastSeen: now - 86_400_000,
    rev: 2,
    deviceId: "earlier-phone",
    deviceLabel: "Old phone",
  });
  await cloudSave.archiveCopy({
    uid: "dev-dad",
    mountain: playable,
    lastSeen: now - 3_600_000,
    rev: 8,
    deviceId: "kitchen-tablet",
    deviceLabel: "Kitchen tablet",
  });
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
        const auth = await import("./firebase-auth").then((m) =>
          m.createFirebaseAuth({ options: config.options }),
        );
        const cloudSave = await import("./firebase-save").then((m) =>
          m.createFirebaseCloudSave({ options: config.options }),
        );
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
