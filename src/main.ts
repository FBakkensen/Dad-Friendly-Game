import lanternUrl from "./assets/boot-tile.png";
import rockUrl from "./assets/dig-cells.png";
import stoneUrl from "./assets/ore-lump.png";
import { createAppServices } from "./boot";
import { mountMountainScreen } from "./mountain-screen";
import "./style.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

try {
  const { auth, progress } = await createAppServices({
    env: {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    },
  });
  mountMountainScreen({ root, lanternUrl, rockUrl, stoneUrl, auth, progress });
} catch (error) {
  console.error(error);
  root.textContent = "Boot failed — reload to try again.";
}
