import { describe, expect, it } from "vitest";
import type { BandSummary } from "./bands";
import { renderReport, reportJson } from "./report";
import { judgeTournament, type TournamentResult } from "./tournament";

const EMPTY = judgeTournament({
  policies: [],
  measures: [],
  targets: [],
  seeds: [1, 2],
  days: 1,
  runs: [],
});

const spread = (mean: number, max: number, runs: number) => ({
  mean,
  max,
  runs,
});

const SUMMARY: BandSummary = {
  runs: 2,
  favoured: [
    {
      layer: "granite",
      machine: "borer",
      afford: spread(0.1, 0.2, 2),
      buy: spread(0.3, 0.3, 1),
    },
    {
      layer: "heart",
      machine: "machine",
      afford: spread(0, 0, 0),
      buy: spread(0, 0, 0),
    },
  ],
  unbought: [{ layer: "granite", machine: "cart", runs: 1, of: 2 }],
  buys: [
    { layer: "granite", machine: "cart", mean: 0.5 },
    { layer: "granite", machine: "borer", mean: 2 },
  ],
  machines: [
    {
      machine: "borer",
      layer: "granite",
      share: 0.05,
      minutes: spread(24, 30, 2),
      sittings: spread(2.5, 3, 2),
      flagged: true,
    },
    {
      machine: "drill",
      layer: "topsoil",
      share: 0,
      minutes: spread(5, 5, 2),
      sittings: spread(0, 0, 2),
      flagged: false,
    },
    {
      machine: "machine",
      layer: "crystal",
      share: 0.5,
      minutes: spread(0, 0, 0),
      sittings: spread(0, 0, 0),
      flagged: false,
    },
  ],
  small: [{ id: "system:workshop", sittings: 3, minutes: 9 }],
};

function withBands(summary: BandSummary): TournamentResult {
  return {
    ...EMPTY,
    bands: [{ policyId: "casual-2x10", label: "Casual", summary }],
  };
}

describe("band report", () => {
  it("leaves the section out when no player type ran", () => {
    expect(renderReport(EMPTY)).not.toContain("## Bands");
  });

  it("shows favoured shares, rule 3 misses and reveal waits", () => {
    const markdown = renderReport(withBands(SUMMARY));
    expect(markdown).toContain(
      "| Casual | affordable at 10%, bought at 30% (1 of 2 runs) | never affordable, never bought |",
    );
    expect(markdown).toContain("Cart 0.5 ⚠, Borer 2.0 | none on sale");
    expect(markdown).toContain(
      "- Casual: Cart in The Granite, unbought in 1 of 2 runs",
    );
    expect(markdown).toContain(
      "| Casual | never shown | The Topsoil 0%, 5 min, 0.0 sittings (worst 0) | The Granite 5%, 24 min, 2.5 sittings (worst 3) ⚠ | The Crystal Caves 50%, never bought |",
    );
    expect(markdown).toContain(
      "- Casual: system:workshop, worst 3 sittings (9 live min)",
    );
    expect(reportJson(withBands(SUMMARY))).toMatchObject({
      bands: [{ policyId: "casual-2x10" }],
    });
  });

  it("says none when nothing misses", () => {
    const markdown = renderReport(
      withBands({ ...SUMMARY, unbought: [], small: [] }),
    );
    expect(markdown).toContain("Rule 3 misses:\n\n- none");
    expect(markdown).toContain("more than one sitting\n\n- none");
  });
});
