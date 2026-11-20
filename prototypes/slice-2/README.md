# Slice 2 prototype (throwaway)

A standalone, tappable phone prototype of Slice 2: Crystal Caves, physical transport runs across all four sites (#762), multi-input Refinery (Glassworks) and steady-flow multi-input Factory (#751), Research Lab in the City, and Rail Depot / Trains. It is the reference for `docs/superpowers/specs/2026-11-19-slice-2-design.md` (#763, #764). It is not game code and nothing in `src/` imports it.

- `proto.src.html` is the self-contained prototype (424×820 phone layout, fake fast numbers, live simulation loop, Part 1 even-share ↔ Part 2 `−`/`+` transport toggle, scenario presets, and an 8h Night Shift simulator).

What Flemming answered and settled on 19 Nov 2026 ("Continue"):

- **Global Transport sheet (top bar, sibling to Workforce):** Keeps the bottom site bar at 4 tabs (`Mine · Refinery · Factory · City`), with single-good runs between every pair of sites (`Mine → Refinery`, `Stockyard → Refinery/Factory/City/Research`).
- **Two-part `#762` transport:** Even, visible auto-share first (Part 1), then dedicated `−`/`+` run assignment with unassigned remainder sharing evenly (Part 3).
- **Multi-input Refinery & steady-flow Factory:** Retire clay/iron trickle; Glassworks takes `Crystal rock + Stone → Glass`; Factory runs continuously (`Parts Press`: 2 inputs, `Precision Assembly`: 3 inputs), with separate visible input buffers so starvation is seen without naming the bottleneck.
- **City progression:** Foundry opens Crystal Caves, Glassworks & Factory; Building 4 (**The Research Lab**) opens Research inside the City as the single home for lasting upgrades & gear; Building 5 (**The Rail Depot**) opens Trains and ends Slice 2.
