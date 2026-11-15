import { createAppServices, parseBootOptions } from "./boot";
import { mountFrameScreen } from "./frame-screen";
import { showAppUpdate } from "./screen-prompts";
import { registerServiceWorker } from "./pwa";
import { trackBoardFit } from "./board-fit";
import { bindWriterPageHide } from "./tab-writer";
import "./tokens.css";
import "./board.css";

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

try {
  const { auth, progress, tabWriter } = await createAppServices({
    env: {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    },
  });
  // Part 1 is switched on (#664): the frame on the fresh mine, for everyone.
  mountFrameScreen({ root, auth, progress });
  // Dev-only: the update card, so play and the checks can see it (#464).
  if (
    import.meta.env.DEV &&
    parseBootOptions(window.location.search).previewUpdate
  ) {
    showAppUpdate(root);
  }
  // Reload fires pagehide. A back/forward-cache restore fires pageshow.
  bindWriterPageHide(tabWriter);
  trackBoardFit();
  void registerServiceWorker({
    onUpdate: () => {
      showAppUpdate(root);
    },
  });
} catch (error) {
  console.error(error);
  root.textContent = "Boot failed — reload to try again.";
}
