import { getApps, initializeApp } from "firebase/app";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import type { FirebaseWebOptions } from "./auth";
import type {
  CloudLoadResult,
  CloudSave,
  CloudWriteResult,
} from "./cloud-save";
import { parseGridSaveValue, serializeGridSave } from "./persist";

const SAVES = "saves";

export function createFirebaseCloudSave({
  options,
}: {
  options: FirebaseWebOptions;
}): CloudSave {
  const existing = getApps()[0];
  const app = existing ?? initializeApp(options);
  const db = getFirestore(app);
  const ref = (uid: string) => doc(db, SAVES, uid);

  const readSnap = (snap: {
    exists: () => boolean;
    data: () => unknown;
  }): CloudLoadResult => {
    if (!snap.exists()) {
      return { kind: "missing" };
    }
    const parsed = parseGridSaveValue(snap.data());
    if (parsed === undefined) {
      return { kind: "unavailable" };
    }
    return { kind: "found", grid: parsed.grid, lastSeen: parsed.lastSeen };
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
      grid,
      lastSeen = Date.now(),
    }): Promise<CloudWriteResult> => {
      try {
        await setDoc(ref(uid), serializeGridSave({ grid, lastSeen }));
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
        () => {
          onChange({ kind: "unavailable" });
        },
      ),
  };
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
