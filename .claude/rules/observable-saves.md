# Observable saves

Cloud save is the cross-device copy. The phone keeps a backup. Failures must be visible and logged.

Signed-in progress lives in one Firestore document per Google uid. The phone also keeps one localStorage backup of the full save for that uid. It is written when the mountain changes, and synchronously on hide and pagehide. It is never deleted. Launch keeps the copy that is ahead: a later run, else more stones mined, else a newer `lastSeen`. A tie between two real copies keeps the phone. A phone that has never saved keeps the cloud document. The phone is uploaded only when it is strictly ahead.

Every copy has one shape, version 8 (`docs/ARCHITECTURE.md`, The save). A save from a later build is read-only: it is never played, and nothing is written to the cloud, the phone or Saved copies while it is there; the update card asks for the new build. A save from before the current version is set aside, never converted: the phone keeps its text at `{key}:v{version}`, the cloud keeps it in Saved copies, and a fresh mountain starts with the old run stamp.

## Do

- Treat the cloud document as the cross-device copy while signed in. Watch it. Write it on a dig, hide, and pagehide. Keep the phone backup current, and never remove it.
- Put a new save fact in the game map (`src/save-format.ts`) and the ledger (`src/save-ledger.test.ts`). The save reader checks the game map; `firestore.rules` checks only the envelope. A new envelope key goes in the rules, with the emulator test passing.
- Removing a shipped id or lowering a cap needs a version bump, and that resets the save: say "Resets the save" in the issue and PR body first.
- The writer reads back what it sends: a save this build could not read is not written, and `save.shape` is logged.
- Show a save line: account, loading (also while a later build's save holds play, with `save.newer` as its log), or unreachable.
- Record structured log events (`code`, `detail`, counts). Put the latest on the save line as `data-log`.
- Keep boot HTML `no-cache, no-store`. Hashed `/assets/**` may be immutable.

## Don't

```ts
// BAD: a second save, and a swallowed failure
writeGridSave({ storage: localStorage, grid });
try {
  await setDoc(ref, payload);
} catch {
  return;
}

// GOOD: the caller sees the miss. The phone backup is a separate write.
const result = await cloudSave.write({ uid, grid });
if (result.kind === "failed") {
  logger.record({ level: "error", code: "save.write", detail: result.message });
}
```

Do not claim two devices match from code inspection. Read the save line in the browser.
