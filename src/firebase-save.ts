import { getApps, initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import type { FirebaseWebOptions } from "./auth";
import type { CloudSave } from "./cloud-save";
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
  return {
    load: async ({ uid }) => {
      try {
        const snap = await getDoc(doc(db, SAVES, uid));
        if (!snap.exists()) {
          return { kind: "missing" };
        }
        const data: unknown = snap.data();
        const grid = parseGridSaveValue(data);
        if (grid === undefined) {
          return { kind: "missing" };
        }
        return { kind: "found", grid };
      } catch {
        return { kind: "unavailable" };
      }
    },
    write: async ({ uid, grid }) => {
      try {
        await setDoc(doc(db, SAVES, uid), serializeGridSave({ grid }));
      } catch {
        return;
      }
    },
  };
}
