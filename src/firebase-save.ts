import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseWebOptions } from "./auth";
import type {
  ArchivedCopy,
  CloudLoadResult,
  CloudSave,
  CloudWriteResult,
} from "./cloud-save";
import { fieldLogWithinBudget } from "./field-log";
import { parseSaveValue, serializeSave } from "./persist";

const SAVES = "saves";
const FIELD_LOGS = "fieldLogs";
const ARCHIVE = "saveArchive";
const ARCHIVE_COPIES = "copies";
const ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;
const LISTED_COPIES = 3;

type ArchiveCopyArgs = Parameters<NonNullable<CloudSave["archiveCopy"]>>[0];

/** The parts of a Firestore snapshot that a load reads. */
type SaveSnap = {
  exists: () => boolean;
  data: () => unknown;
  metadata?: { fromCache: boolean; hasPendingWrites: boolean };
};

export function createFirebaseCloudSave({
  options,
}: {
  options: FirebaseWebOptions;
}): CloudSave {
  const existing = getApps()[0];
  const app = existing ?? initializeApp(options);
  const db = openFirestore(app);
  const ref = (uid: string) => doc(db, SAVES, uid);
  const fieldLogRef = (uid: string) => doc(db, FIELD_LOGS, uid);

  return {
    load: async ({ uid, fresh = false }) => {
      try {
        const snap = fresh
          ? await getDocFromServer(ref(uid))
          : await getDoc(ref(uid));
        return readSnap(snap);
      } catch {
        return { kind: "unavailable" };
      }
    },
    write: async ({
      uid,
      mountain,
      lastSeen = Date.now(),
      rev,
      deviceId,
      deviceLabel,
    }): Promise<CloudWriteResult> => {
      try {
        await setDoc(ref(uid), {
          ...serializeSave({ mountain, lastSeen, rev, deviceId, deviceLabel }),
          savedAt: serverTimestamp(),
        });
        return { kind: "ok" };
      } catch (error: unknown) {
        return cloudWriteResult(error);
      }
    },
    archiveCopy: (args) => archiveConflictCopy(db, args),
    listCopies: ({ uid, now }) => listArchivedCopies(db, uid, now),
    writeFieldLog: async ({ uid, log }): Promise<CloudWriteResult> => {
      if (!fieldLogWithinBudget(log)) {
        return { kind: "failed", message: "field-log.size" };
      }
      try {
        await setDoc(fieldLogRef(uid), log);
        return { kind: "ok" };
      } catch (error: unknown) {
        return { kind: "failed", message: cloudErrorMessage(error) };
      }
    },
    watch: ({ uid, onChange }) =>
      onSnapshot(
        ref(uid),
        { includeMetadataChanges: true },
        (snap) => {
          onChange(readSnap(snap));
        },
        // The snapshot stops after an error. The progress store starts a new
        // listener with backoff; this callback only reports the gap.
        () => {
          onChange({ kind: "unavailable" });
        },
      ),
  };
}

function readSnap(snap: SaveSnap): CloudLoadResult {
  const cached = snap.metadata?.fromCache === true;
  const pending = snap.metadata?.hasPendingWrites === true;
  if (!snap.exists()) {
    return cached ? { kind: "missing", cached: true } : { kind: "missing" };
  }
  const parsed = parseSaveValue(snap.data());
  if (parsed === undefined) {
    return { kind: "unavailable" };
  }
  return {
    kind: "found",
    mountain: parsed.mountain,
    lastSeen: parsed.lastSeen,
    rev: parsed.rev ?? 0,
    ...(parsed.deviceId === undefined ? {} : { deviceId: parsed.deviceId }),
    ...(parsed.deviceLabel === undefined
      ? {}
      : { deviceLabel: parsed.deviceLabel }),
    ...(pending ? { pending: true } : {}),
    ...(cached ? { cached: true } : {}),
  };
}

/** Adds the copy that was not chosen to the archive. It expires after a week. */
async function archiveConflictCopy(
  db: Firestore,
  { uid, mountain, lastSeen, rev, deviceId, deviceLabel }: ArchiveCopyArgs,
): Promise<CloudWriteResult> {
  try {
    const saved = serializeSave({
      mountain,
      lastSeen,
      rev: rev >= 1 ? rev : 1,
      deviceId,
    });
    await addDoc(collection(db, ARCHIVE, uid, ARCHIVE_COPIES), {
      ...saved,
      version: 7,
      rev,
      deviceId,
      deviceLabel,
      archivedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ARCHIVE_MS),
      reason: "conflict",
    });
    return { kind: "ok" };
  } catch (error: unknown) {
    return { kind: "failed", message: cloudErrorMessage(error) };
  }
}

/** The newest archived copies that have not expired. Empty when the read fails. */
async function listArchivedCopies(
  db: Firestore,
  uid: string,
  now: number,
): Promise<readonly ArchivedCopy[]> {
  try {
    const snap = await getDocs(collection(db, ARCHIVE, uid, ARCHIVE_COPIES));
    const copies: ArchivedCopy[] = [];
    for (const item of snap.docs) {
      const copy = readArchivedCopy(item.id, item.data(), now);
      if (copy !== undefined) {
        copies.push(copy);
      }
    }
    copies.sort((left, right) => right.archivedAt - left.archivedAt);
    return copies.slice(0, LISTED_COPIES);
  } catch {
    return [];
  }
}

/** One archived copy, or undefined when it is malformed or has expired. */
function readArchivedCopy(
  id: string,
  data: unknown,
  now: number,
): ArchivedCopy | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const parsed = parseSaveValue(data);
  const record = data as Record<string, unknown>;
  const archivedAt = timestampMillis(record["archivedAt"]);
  const expiresAt = timestampMillis(record["expiresAt"]);
  const deviceLabel = record["deviceLabel"];
  if (
    parsed === undefined ||
    parsed.rev === undefined ||
    parsed.deviceId === undefined ||
    typeof deviceLabel !== "string" ||
    expiresAt <= now
  ) {
    return undefined;
  }
  return {
    id,
    mountain: parsed.mountain,
    lastSeen: parsed.lastSeen ?? 0,
    rev: parsed.rev,
    deviceId: parsed.deviceId,
    deviceLabel,
    archivedAt,
    expiresAt,
  };
}

/**
 * IndexedDB cache shared by every tab. A second copy of the server doc, not
 * a second save: rev rules still reject a stale write, and a fresh read asks
 * the server. The phone backup stays the on-phone copy.
 */
function openFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.error("firestore.cache", error);
    try {
      return getFirestore(app);
    } catch {
      return initializeFirestore(app, { localCache: memoryLocalCache() });
    }
  }
}

function cloudWriteResult(error: unknown): CloudWriteResult {
  const message = cloudErrorMessage(error);
  if (message === "permission-denied") {
    return { kind: "rejected", message };
  }
  return { kind: "failed", message };
}

function timestampMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return typeof value === "number" ? value : 0;
}

function cloudErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && code !== "") {
      return code;
    }
  }
  return "unavailable";
}
