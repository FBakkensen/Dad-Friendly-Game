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
import { holdFactors } from "./economy/factors";
import { PART_THREE_OFF, PLAY_FACTORS } from "./part-switch";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore, type ProgressStore } from "./progress-store";
import { createBrowserTabWriter, type TabWriter } from "./tab-writer";
import { tierRecord } from "./tiers";

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
  /** Dev-only layout hook: two archived copies, one left by a Start over. */
  previewCopies: boolean;
  /** Dev-only layout hook: the update card, as a newer service worker opens it. */
  previewUpdate: boolean;
  /** Dev-only: part 3's rules and screens, before #682 switches them on (#681). */
  partThree: boolean;
} {
  const params = new URLSearchParams(search);
  const save = params.get("save");
  return {
    memorySave: params.get("memorySave") === "1",
    previewTrouble: params.get("trouble") === "cave-in",
    previewConflict: params.get("saves") === "two",
    previewSave: save === "loading" || save === "error" ? save : undefined,
    previewCopies: params.get("copies") === "shelf",
    previewUpdate: params.get("update") === "shown",
    partThree: params.get("part3") === "1",
  };
}

/** The dev account a preview plays a memory save as, or none for the real account. */
function memoryUser(
  options: ReturnType<typeof parseBootOptions>,
): { readonly uid: string; readonly label: string } | undefined {
  const memory =
    options.memorySave ||
    options.previewSave !== undefined ||
    options.previewCopies;
  return memory ? MEMORY_DEV : undefined;
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
  // Parts 1 and 2 are switched on (#664, #672): every page plays the fresh
  // mine with brick, the stockyard and the Warehouse. Outside the page both
  // switches read off, so the unit tests play what they set; the strategy
  // lab plays the same map (#737).
  // `?part3=1` plays part 3 on a dev page (#681) until #682 switches it on.
  holdFactors(
    devMode && options.partThree
      ? { ...PLAY_FACTORS, [PART_THREE_OFF]: 0 }
      : PLAY_FACTORS,
  );
  const user = devMode ? memoryUser(options) : undefined;
  let services =
    user === undefined
      ? await configuredServices({ env })
      : memoryServices(user);
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
    progress.layoutPreview.trouble("cart");
  }
  if (devMode && options.previewConflict) {
    progress.layoutPreview.conflict();
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
 * Two archived copies for the Saved copies sheet: the run an old phone left
 * by starting over, and the kitchen tablet's copy of this run. Both can be
 * played; the earlier run comes back as a new run (#480).
 */
async function seedPreviewCopies(cloudSave: CloudSave): Promise<void> {
  if (cloudSave.archiveCopy === undefined) {
    return;
  }
  const now = Date.now();
  const start = createMountain();
  const earlier: Mountain = {
    ...start,
    stock: { ...start.stock, stones: 18_000 },
    owned: { ...tierRecord(0), helper: 6, cart: 2, drill: 1 },
    rockDug: 40_000,
    startedAt: 1,
  };
  const playable: Mountain = {
    ...start,
    stock: { ...start.stock, stones: 1_200_000 },
    owned: { ...tierRecord(0), helper: 28, drill: 4, cart: 6, hoist: 3 },
    rockDug: 2_600_000,
    startedAt: now,
  };
  await cloudSave.archiveCopy({
    uid: MEMORY_DEV.uid,
    mountain: earlier,
    lastSeen: now - 86_400_000,
    rev: 2,
    deviceId: "earlier-phone",
    deviceLabel: "Old phone",
    reason: "start-over",
  });
  await cloudSave.archiveCopy({
    uid: MEMORY_DEV.uid,
    mountain: playable,
    lastSeen: now - 3_600_000,
    rev: 8,
    deviceId: "kitchen-tablet",
    deviceLabel: "Kitchen tablet",
    reason: "conflict",
  });
}

/** The dev account the memory previews play as. */
const MEMORY_DEV = { uid: "dev-dad", label: "Dev Dad" } as const;

function memoryServices(user: {
  readonly uid: string;
  readonly label: string;
}): {
  readonly auth: AuthController;
  readonly cloudSave: CloudSave;
} {
  return {
    auth: createMemoryAuth({
      state: { kind: "signed-in", user },
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
