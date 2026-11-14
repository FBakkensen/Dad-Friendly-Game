### Code lens: does it do what the issue asked, and is it right where the compiler and the tests are blind?

Strict TypeScript, typescript-eslint, the function limits and the coverage floors already run in the gate. Skip what they prove.

- Intent: read the issue and the plan, then trace one real input through the change. Does the result match what was asked?
- Escapes from the type checker: each new `as`, `!`, `any`, `@ts-expect-error` or `eslint-disable` needs a reason the code gives.
- Edges: data from the save, Firestore, `localStorage` and the clock is unknown until it is parsed into a type that cannot hold an illegal state.
- Time and numbers: eight hours away in one step, a rate of zero, `NaN` or `Infinity` reaching the save or the screen, rounding in prices.
- Order of events: a write that must finish before the page hides, a listener that is never removed, a tap handled twice.
- Tests that can fail: a test that only mirrors the code, or one loosened until it passes, is a finding.
- Too much: needless machinery, and a copy of a mechanism the codebase already has. Search with `git grep` before you report a copy; a real copy is Important.
