# Each device keeps its own field log (#485)

**Goal:** the phone and the PC played in one evening each keep their field log in the cloud; neither upload wipes the other's events, and `npm run field-log` reads both together.

**Shared modules:** the upload stays in `persistFieldLog` (`src/cloud-writer.ts`) and `writeFieldLog` (`src/cloud-save.ts`, `src/firebase-save.ts`); the reader stays `tools/field-log.ts`. No new module.

## Rulings (agent-run sitting)

1. **Path:** `fieldLogs/{uid}/devices/{deviceId}`, the same document shape (`isFieldLog`). Owner read, create and update; no delete; the device id in the path is 8 to 64 characters, as `isDeviceId` keeps it.
2. **The old account-wide document stays readable and writable.** `fieldLogs/{uid}` keeps its rule, so a phone still on a cached older build uploads without errors. New builds no longer write it. The reader shows it as the account's older log.
3. **Reader:** `npm run field-log -- <uid>` prints each device's log (the older account-wide one first, if any), then a **Together** timeline: every device's events in time order, each tagged with the device's first 8 characters. With no uid it lists every account that has either kind (a collection group read of `devices`, since a parent document need not exist). `--json` prints each record with its `uid` and `device` (`null` for the older one).
4. **The memory cloud** keys field logs by `uid/deviceId`; tests read one through a small helper.

## Tasks

1. `writeFieldLog` takes `deviceId`; the memory and Firebase clouds write the device document. Store tests.
2. `firestore.rules` match for the device document, emulator tests, drift test.
3. `tools/field-log.ts`: load both kinds, print per device and Together; unit and emulator tests.
4. Docs: `DESIGN.md`, `ARCHITECTURE.md`, rules header comment, project memory.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`, plus `npm run test:rules` (rules and the reader on the emulator).
