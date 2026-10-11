import lanternUrl from "./assets/boot-tile.png";
import helperUrl from "./assets/helper-miner.png";
import cartUrl from "./assets/mine-cart.png";
import drillUrl from "./assets/steam-drill.png";
import veinUrl from "./assets/gold-nugget.png";
import mountainUrl from "./assets/mountain.png";
import stoneUrl from "./assets/ore-lump.png";
import relicCrown from "./assets/relics/crown.png";
import relicHammer from "./assets/relics/hammer.png";
import relicHeart from "./assets/relics/heart.png";
import relicLantern from "./assets/relics/lantern.png";
import relicMantle from "./assets/relics/mantle.png";
import relicShield from "./assets/relics/shield.png";
import { createAppServices } from "./boot";
import { mountMountainScreen } from "./mountain-screen";
import { registerServiceWorker } from "./pwa";
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
  mountMountainScreen({
    root,
    lanternUrl,
    mountainUrl,
    stoneUrl,
    veinUrl,
    tierArt: { helper: helperUrl, cart: cartUrl, drill: drillUrl },
    relicArt: {
      lantern: relicLantern,
      shield: relicShield,
      hammer: relicHammer,
      heart: relicHeart,
      crown: relicCrown,
      mantle: relicMantle,
    },
    auth,
    progress,
  });
  void registerServiceWorker();
} catch (error) {
  console.error(error);
  root.textContent = "Boot failed — reload to try again.";
}
