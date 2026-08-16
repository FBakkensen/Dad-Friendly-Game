import { createAuth, parseFirebaseWebConfig } from "./auth";
import { createFirebaseAuth } from "./firebase-auth";
import { mountPocketGridScreen } from "./pocket-grid-screen";
import lanternUrl from "./assets/boot-tile.png";
import cellSheetUrl from "./assets/dig-cells.png";
import "./style.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

const auth = createAuth({
  config: parseFirebaseWebConfig({
    env: {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    },
  }),
  hostname: window.location.hostname,
  createFirebase: createFirebaseAuth,
});

mountPocketGridScreen({ root, lanternUrl, cellSheetUrl, auth });
