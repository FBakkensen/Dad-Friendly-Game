### Code lens: does it do what the issue asked, and is it right where the compiler and the tests are blind?

Strict TypeScript, typescript-eslint, the function limits and the coverage floors already run in the gate. Skip what they prove.

- Intent: read the issue and the plan, then trace one real input through the change. Does the result match what was asked?
- Walk the states, before anything else. For each behaviour the change adds or alters, list the states it can meet and trace each one through the code with Read and `review-git grep`, from what starts it to what the player sees and what is saved. The states: none (nothing owned, nothing loaded yet, a rate of zero), the first and the last (the first of something, the final moments before it is due, the last that can be had), again (the same event a second time, or while the first is still in flight), interrupted (hidden, reloaded or killed partway), elsewhere (another tab or device acting at the same time), and changed underneath (something that ends, runs out or moves on while the game is open or closed). Report each state that gives a wrong number, a stuck or lying screen, lost progress or a silent change, and name the steps that reach it. A finding like this is worth more than any finding about wording or docs.
- Escapes from the type checker: each new `as`, `!`, `any`, `@ts-expect-error` or `eslint-disable` needs a reason the code gives.
- Edges: data from the save, Firestore, `localStorage` and the clock is unknown until it is parsed into a type that cannot hold an illegal state.
- Time and numbers: eight hours away in one step, a rate of zero, `NaN` or `Infinity` reaching the save or the screen, rounding in prices.
- Order of events: a write that must finish before the page hides, a listener that is never removed, a tap handled twice.
- Tests that can fail: a test that only mirrors the code, or one loosened until it passes, is a finding.
- Too much: needless machinery, and a copy of a mechanism the codebase already has. Search with `review-git grep` before you report a copy; a real copy is Important.
