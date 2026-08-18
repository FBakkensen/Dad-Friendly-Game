import { createAuth, parseFirebaseWebConfig } from "./auth";
import { createCloudSave } from "./cloud-save";
import { createFirebaseAuth } from "./firebase-auth";
import { createFirebaseCloudSave } from "./firebase-save";
import { mountPocketGridScreen } from "./pocket-grid-screen";
import { createProgressStore } from "./progress-store";
import lanternUrl from "./assets/boot-tile.png";
import cellSheetUrl from "./assets/dig-cells.png";
import stoneUrl from "./assets/ore-lump.png";
import chunkUrl from "./assets/ore-chunk.png";
import "./style.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

const config = parseFirebaseWebConfig({
  env: {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  },
});
const auth = createAuth({
  config,
  createFirebase: createFirebaseAuth,
});
const cloudSave = createCloudSave({
  config,
  createFirebase: createFirebaseCloudSave,
});

const progress = createProgressStore({ auth, cloudSave });
mountPocketGridScreen({
  root,
  lanternUrl,
  cellSheetUrl,
  stoneUrl,
  chunkUrl,
  auth,
  progress,
});
