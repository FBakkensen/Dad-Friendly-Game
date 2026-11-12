# One Sound key for the whole game (#491)

**Goal:** the game's one sound switch sits in the Ledger's head, where it can be reached from the first open, and this device remembers it across a reload. Quiet stays the default. The Workshop's knock reads the same setting.

**Shared module:** new `src/sound.ts`. No module holds a device's sound today: the key (`createSoundKey`) and the knock (`playHammer`) move there from `src/workshop-parts.ts`, beside a small `soundSetting(storage)` that is kept the way `src/buys-amount.ts` keeps the Buys amount (one localStorage key, a store that throws reads as Quiet, never in the save). The Ledger (`src/ledger-panel.ts`) mounts the key as its head key, the way Buys mounts its amount key. `src/screen-panels.ts` makes the one setting from `ctx.deviceStorage` and hands it to both drawers.

## Rulings (agent-run sitting)

1. **Home:** the Ledger's head, beside the "i" (Flemming, 12 Nov: the recommendation, the Ledger). The Workshop's head loses its key. One key, one home.
2. **Words:** unchanged: `Quiet`, and `Sound` once on, with the same aria labels. Turning it on still plays the knock once, so he hears what he turned on.
3. **Stored:** `dad-friendly-sound` = `on` or `off`. Anything else, or a store that throws, is Quiet. A write that throws still turns it on for this open.
4. **Desktop:** no layout work beyond what the shared head-key rule gives (PC support is being dropped).

## Tasks

1. `src/sound.ts`: the setting (default off, reload keeps it, a throwing store is Quiet), the key (layer `ledger`), the knock. Tests move with them.
2. The Ledger mounts the key; the Workshop drops its key and reads the setting for the craft knock; `screen-panels.ts` wires one setting. Panel tests: the key on the `fresh` Ledger, the reload, the Workshop knock reading the Ledger's switch.
3. CSS: the key's size rule follows it (`.sound-key`); style test list.
4. Docs: `DESIGN.md`, `ARCHITECTURE.md`, `ui-audit.md`.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the drawers visual section, and `npm run play` on `fresh` at 424×830 with no page scroll.
