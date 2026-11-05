import { describe, expect, it } from "vitest";
import { simulateDad, simulateDadRun } from "./pacing";
import { RELICS } from "./relics";

const depth = (id: string) =>
  RELICS.find((relic) => relic.id === id)?.depth ?? 0;

describe("pacing: a sampler may watch the table (#173)", () => {
  it("reads each decision without moving the days", () => {
    const milestones = [depth("lantern")];
    const plain = simulateDad({ milestones, maxDays: 1 });
    let seen = 0;
    const watched = simulateDadRun({
      milestones,
      maxDays: 1,
      onDecision(_world, second) {
        if (second === 0) {
          seen += 1;
        }
      },
    });
    expect(seen).toBeGreaterThan(0);
    expect(watched.reached).toEqual(plain);
  });
});
