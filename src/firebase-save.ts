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

  const readSnap = (snap: {
    exists: () => boolean;
    data: () => unknown;
    metadata?: { fromCache: boolean; hasPendingWrites: boolean };
  }): CloudLoadResult => {
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
  };

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
    archiveCopy: async ({
      uid,
      mountain,
      lastSeen,
      rev,
      deviceId,
      deviceLabel,
    }): Promise<CloudWriteResult> => {
      try {
        const saved = serializeSave({
          mountain,
          lastSeen,
          rev: rev >= 1 ? rev : 1,
          deviceId,
        });
        await addDoc(collection(db, "saveArchive", uid, "copies"), {
          ...saved,
          version: 7,
          rev,
          deviceId,
          deviceLabel,
          archivedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reason: "conflict",
        });
        return { kind: "ok" };
      } catch (error: unknown) {
        return { kind: "failed", message: cloudErrorMessage(error) };
      }
    },
    listCopies: async ({ uid, now }): Promise<readonly ArchivedCopy[]> => {
      try {
        const snap = await getDocs(
          collection(db, "saveArchive", uid, "copies"),
        );
        const copies: ArchivedCopy[] = [];
        for (const item of snap.docs) {
          const data: unknown = item.data();
          if (typeof data !== "object" || data === null) {
            continue;
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
            continue;
          }
          copies.push({
            id: item.id,
            mountain: parsed.mountain,
            lastSeen: parsed.lastSeen ?? 0,
            rev: parsed.rev,
            deviceId: parsed.deviceId,
            deviceLabel,
            archivedAt,
            expiresAt,
          });
        }
        copies.sort((left, right) => right.archivedAt - left.archivedAt);
        return copies.slice(0, 3);
      } catch {
        return [];
      }
    },
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
