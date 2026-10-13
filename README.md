# Dad-Friendly Game

How the game plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

## Field log reader

Signed-in games copy a snapshot and the latest event ring to `fieldLogs/{uid}`.
`tools/field-log.ts` reads those documents with the Firebase Admin SDK. It is
not part of the game the player runs, and it is not bundled into the app.

### One-time sign-in

On the machine that reads logs:

```bash
gcloud auth application-default login
```

That writes Application Default Credentials. A service-account JSON file works
too, when `GOOGLE_APPLICATION_CREDENTIALS` points at it. Do not commit either
credential.

The Firestore emulator needs no credentials. When `FIRESTORE_EMULATOR_HOST` is
set (as `firebase emulators:exec` does), the script talks to that host.

### Usage

```bash
npm run field-log -- --uid <uid>
npm run field-log -- <uid>
npm run field-log
npm run field-log -- --uid <uid> --json
```

With no uid, every `fieldLogs` document is listed. The default print is a short
summary with times in this machine's local zone. `--json` prints the stored
documents (ISO times, `updatedAt` as epoch milliseconds) with the uid, which
lives in the document id.

### Privacy

Only household players are read. The document holds the uid, the latest
snapshot, and the latest event ring: stones, crew, relics, and recent events.
No email and no display name. Start over and passing the mine clear the ring
and overwrite the document. The Admin SDK bypasses the game's security rules,
so keep these credentials on a machine you trust.
