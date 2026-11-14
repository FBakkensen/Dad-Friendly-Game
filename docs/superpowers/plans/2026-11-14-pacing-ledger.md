# The pacing ledger: the gate shows when a change moves the pace (#554)

An agent-run sitting under M16 (#551).

## Plan

1. `src/lab/ledger.ts` (new; no ledger existed): `createLedgerLog` watches one run and stamps the day each band is reached, each machine in play is first owned and each relic is found; `endHash` hashes the end world (FNV-1a over its JSON); `renderLedger` writes one row per player type and seed, sorted; `ledgerDiff` names the rows that moved. Tests first (`ledger.test.ts`).
2. `src/lab/tournament.ts`: `samplePolicy` keeps a ledger log beside the reveal, band and sitting logs and returns the run with its ledger row; the result carries `ledger`.
3. The worst seed (`tournament.ts`, `report.ts`): each cell keeps its per-seed figures. A guarded cell names the seed furthest on the guardrail's wrong side; a measure with no guardrail shows the seeds' range.
4. `tools/strategy-lab.ts`: always writes `reports/pacing-ledger.md`; `--ledger check` compares with `docs/pacing-ledger.md` and exits 1 with the moved rows; `--ledger write` (`npm run lab:ledger`) writes it. Both refuse any run but the gate's.
5. The gate (`src/gate.ts`, `scripts/gate.mjs`): the `lab` step adds `--ledger check`; the ledger joins `LAB_ENTRIES`, so it is in the reuse key; any touched file in the lab's closure counts as an economy change, so a hand edit of the ledger runs the lab.
6. The rule and the docs: `.claude/rules/dad-friendly-work.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`.

## Rulings

- **Markdown only, no JSON beside it.** One row per player type and seed reads well as a diff, and the check compares text.
- **Days to two places, and a hash.** The days are what a reader looks at; the hash catches a move too small to show in two places.
- **Machines are the machines in play,** as the band report counts them. Workers and kids are not milestones.
- **The worst seed needs a direction,** which only a guardrail gives. A measure no guardrail reads shows the seeds' range instead, which holds the worst either way.
- **The ledger is not formatted by prettier** (`.prettierignore`): the check compares it byte for byte with what the lab writes.
- **A hand edit of the ledger runs the lab.** The economy test now reads every touched file, not only code, against the lab's closure.
- **Proof the gate goes red:** a 10% dearer first cart (600 to 660) fails `--ledger check` with 90 moved lines; the plain dad's finish moves from day 4.0 to 4.5.
- **The check is exact** (review): the gate passes only a ledger identical to what the lab writes; the moved-lines diff is only the printout. Rows sort in code-unit order, not the machine's locale.
- **A guarded cell whose guardrails all came back n/a shows no seeds' range** (review), and a worst seed or range that prints the same as the mean is left out.
- **Time:** one CI lab run on `main` took 70.2 s; with the ledger, 72.0 s.
- **The report is otherwise unchanged:** with the worst-seed notes stripped, this branch's report matches `main`'s.
