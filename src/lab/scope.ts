import { LAYERS, type LayerId } from "../layers";
import type { DecisionSample } from "./measure";
import { HOUR_MS, type TargetScope } from "./targets";

/**
 * Samples a guardrail looks at. Policy scopes are a tournament concern:
 * the runs are already chosen, so the samples come through unchanged.
 */
export function applyScope(
  scope: TargetScope,
  samples: readonly DecisionSample[],
): readonly DecisionSample[] {
  if (scope.kind === "afterHour") {
    const from = scope.hour * HOUR_MS;
    return samples.filter((sample) => sample.atMs >= from);
  }
  if (scope.kind === "fromSource") {
    const start = samples.findIndex(
      (sample) => (sample.outputShare[scope.source] ?? 0) > 0,
    );
    if (start < 0) {
      return [];
    }
    return samples.slice(start);
  }
  if (scope.kind === "fromLayer") {
    const floor = layerIndex(scope.layer);
    const start = samples.findIndex(
      (sample) => layerIndex(sample.layer) >= floor,
    );
    if (start < 0) {
      return [];
    }
    return samples.slice(start);
  }
  return samples;
}

function layerIndex(id: LayerId | undefined): number {
  if (id === undefined) {
    return 0;
  }
  const layer = LAYERS.find((item) => item.id === id);
  return layer === undefined ? 0 : layer.index;
}
