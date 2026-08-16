import { getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type {
  AuthController,
  AuthState,
  AuthUser,
  FirebaseWebOptions,
} from "./auth";

export function createFirebaseAuth({
  options,
}: {
  options: FirebaseWebOptions;
}): AuthController {
  const existing = getApps()[0];
  const app = existing ?? initializeApp(options);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  let state: AuthState = userToState(auth.currentUser);
  const listeners = new Set<(next: AuthState) => void>();
  const emit = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  onAuthStateChanged(auth, (user) => {
    if (state.kind === "signing-in" && user === null) {
      return;
    }
    state = userToState(user);
    emit();
  });

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    signIn: async () => {
      if (state.kind !== "signed-out") {
        return;
      }
      state = { kind: "signing-in" };
      emit();
      try {
        await signInWithPopup(auth, provider);
      } catch {
        state = userToState(auth.currentUser);
        emit();
      }
    },
    signOut: async () => {
      if (state.kind !== "signed-in") {
        return;
      }
      await signOut(auth);
    },
  };
}

function userToState(user: User | null): AuthState {
  if (user === null) {
    return { kind: "signed-out" };
  }
  return { kind: "signed-in", user: authUserFromFirebase({ user }) };
}

function authUserFromFirebase({ user }: { user: User }): AuthUser {
  return { uid: user.uid, label: labelFromUser({ user }) };
}

function labelFromUser({ user }: { user: User }): string {
  const name = user.displayName?.trim();
  if (name !== undefined && name !== "") {
    return name;
  }
  const email = user.email?.trim();
  if (email !== undefined && email !== "") {
    return email;
  }
  return "Signed in";
}
