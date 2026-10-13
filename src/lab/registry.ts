import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Node-side discovery for a lab folder. Policies (#172) and measures (#173)
 * share it. The pure engine receives the result and never reads the disk.
 * Duplicate ids throw. Pass `targets` and a target that names an unknown
 * measure throws too.
 */
export type Identified = {
  readonly id: string;
};

export type DiscoverOptions = {
  readonly targets?: readonly {
    readonly id: string;
    readonly measure: string;
  }[];
};

/** A source file the loader will import. Tests are not measures or policies. */
export function isDiscoveredFile(name: string): boolean {
  return name.endsWith(".ts") && !name.endsWith(".test.ts");
}

export async function discover<T extends Identified>(
  directory: string,
  parse: (loaded: unknown, filename: string) => T,
  options?: DiscoverOptions,
): Promise<readonly T[]> {
  const names = readdirSync(directory)
    .filter(isDiscoveredFile)
    .sort((left, right) => left.localeCompare(right));
  const items: T[] = [];
  const seen = new Map<string, string>();
  for (const name of names) {
    const href = pathToFileURL(path.join(directory, name)).href;
    const loaded: unknown = await import(href);
    const item = parse(loaded, name);
    const first = seen.get(item.id);
    if (first !== undefined) {
      throw new Error(
        `Duplicate id "${item.id}" in ${directory}: ${first} and ${name}`,
      );
    }
    seen.set(item.id, name);
    items.push(item);
  }
  if (options?.targets !== undefined) {
    assertKnownMeasures(options.targets, items);
  }
  return items;
}

/** Throws when a target's `measure` is not a registered id. */
export function assertKnownMeasures(
  targets: readonly { readonly id: string; readonly measure: string }[],
  measures: readonly Identified[],
): void {
  const known = new Set(measures.map((measure) => measure.id));
  for (const target of targets) {
    if (!known.has(target.measure)) {
      throw new Error(
        `Target "${target.id}" names unknown measure "${target.measure}"`,
      );
    }
  }
}
