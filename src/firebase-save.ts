import { getApps, initializeApp } from "firebase/app";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { FirebaseWebOptions } from "./auth";
import type {
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
  const db = getFirestore(app);
  const ref = (uid: string) => doc(db, SAVES, uid);
  const fieldLogRef = (uid: string) => doc(db, FIELD_LOGS, uid);

  const readSnap = (snap: {
    exists: () => boolean;
    data: () => unknown;
  }): CloudLoadResult => {
    if (!snap.exists()) {
      return { kind: "missing" };
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
    };
  };

  return {
    load: async ({ uid }) => {
      try {
        return readSnap(await getDoc(ref(uid)));
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
    }): Promise<CloudWriteResult> => {
      try {
        await setDoc(ref(uid), {
          ...serializeSave({ mountain, lastSeen, rev, deviceId }),
          savedAt: serverTimestamp(),
        });
        return { kind: "ok" };
      } catch (error: unknown) {
        return cloudWriteResult(error);
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

function cloudWriteResult(error: unknown): CloudWriteResult {
  const message = cloudErrorMessage(error);
  if (message === "permission-denied") {
    return { kind: "rejected", message };
  }
  return { kind: "failed", message };
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
