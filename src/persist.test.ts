import { describe, expect, it } from "vitest";
import type { Engineer } from "./engineers";
import {
  BARE_MOUNTAIN,
  MAX_LEGACY,
  MOUNTAIN_STONES,
  STAFF_GRANT,
  createMountain,
  digStones,
  minedOut,
  type Mountain,
} from "./mountain";
import { readSave, serializeSave, type SaveRead } from "./persist";
import { BAND_STARTS } from "./scale";
import { minedMountain } from "./test-fixtures";
import { STARTING_RECIPE_IDS } from "./workshop";

/** Through JSON, as the phone and the cloud store it. */
function stored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function okMountain(read: SaveRead): Mountain | undefined {
  return read.kind === "ok" ? read.save.mountain : undefined;
}

const ADA: Engineer = { name: "Ada", rank: 1, trips: 3, post: "borer" };
const NILS: Engineer = { name: "Nils", rank: 0, trips: 0, post: "camp" };

/** A late crew with something in every map. */
function lived(): Mountain {
  const fresh = createMountain();
  return {
    ...fresh,
    remaining: MOUNTAIN_STONES - 80_000,
    pocket: 1_234,
    helpers: 30,
    carts: 12,
    drills: 4,
    borers: 1,
    kids: 2,
    legacy: 3,
    startedAt: 1_700,
    engineers: [ADA, { ...NILS, post: "drill" }],
    expeditions: [
      {
        engineer: "Nils",
        tunnel: "side-seam",
        sentAt: 100,
        returnsAt: 200,
        find: { kind: "quiet" },
      },
    ],
    bench: { recipe: "iron-rails", startedAt: 10, endsAt: 20 },
    upgrades: { ...fresh.upgrades, tap: 2, boots: 1 },
    boosts: { ...fresh.boosts, sharper: 9_000 },
    clocks: { ...fresh.clocks, "axle-grease": 3_000 },
    crafted: { ...fresh.crafted, "sturdy-props": 1 },
    recipes: [...fresh.recipes, "reinforce"],
    seen: ["workshop"],
    taught: ["engineers"],
  };
}

/** A written save with one part of its game map replaced. */
function withGame(part: Record<string, unknown>): unknown {
  const saved = stored(serializeSave({ mountain: lived(), lastSeen: 9 })) as {
    game: Record<string, unknown>;
  };
  return { ...saved, game: { ...saved.game, ...part } };
}

describe("the version 8 save (#558)", () => {
  it("a fresh mountain writes a few lines", () => {
    const fresh = createMountain();
    expect(serializeSave({ mountain: fresh, lastSeen: 5 })).toEqual({
      version: 8,
      lastSeen: 5,
      game: { marks: { recipes: STARTING_RECIPE_IDS } },
    });
  });

  it("reads its own save back", () => {
    const mountain = lived();
    const read = readSave(stored(serializeSave({ mountain, lastSeen: 9 })));
    expect(read).toEqual({ kind: "ok", save: { mountain, lastSeen: 9 } });
  });

  it("rounds remaining up, so a reload never gains depth (#356)", () => {
    const live = digStones(minedMountain(BAND_STARTS[3] + 1_000), 1);
    expect(Number.isInteger(live.remaining)).toBe(false);
    const parsed = okMountain(
      readSave(stored(serializeSave({ mountain: live, lastSeen: 1 }))),
    );
    expect(parsed?.remaining).toBe(Math.ceil(live.remaining));
    expect(minedOut(parsed ?? live)).toBeLessThanOrEqual(minedOut(live));
  });

  it("writes rev, device and label together, and reads them back", () => {
    const mountain = minedMountain(8);
    const saved = serializeSave({
      mountain,
      lastSeen: 4,
      rev: 3,
      deviceId: "device-dad-1234",
      deviceLabel: "Chrome on Android",
    });
    expect(readSave(stored(saved))).toEqual({
      kind: "ok",
      save: {
        mountain,
        lastSeen: 4,
        rev: 3,
        deviceId: "device-dad-1234",
        deviceLabel: "Chrome on Android",
      },
    });
    const lonely = serializeSave({ mountain, lastSeen: 4, rev: 3 });
    expect(lonely).not.toHaveProperty("rev");
    expect(lonely).not.toHaveProperty("deviceLabel");
    expect(
      serializeSave({
        mountain,
        lastSeen: 4,
        rev: 3,
        deviceId: "device-dad-1234",
        deviceLabel: "What?",
      }),
    ).not.toHaveProperty("deviceLabel");
    const longLabel = readSave({ ...saved, deviceLabel: "x".repeat(41) });
    expect(longLabel.kind === "ok" && longLabel.save.deviceLabel).toBe(
      undefined,
    );
    expect(readSave({ ...saved, rev: 0 }).kind).toBe("bad");
    expect(readSave({ ...saved, deviceId: "short" }).kind).toBe("bad");
    expect(readSave({ ...saved, deviceId: undefined }).kind).toBe("bad");
  });

  it("keeps the run's stamp in the envelope, left out at 0", () => {
    const saved = serializeSave({ mountain: lived(), lastSeen: 1 });
    expect(saved.startedAt).toBe(1_700);
    expect(saved.game).not.toHaveProperty("startedAt");
    expect(
      serializeSave({ mountain: createMountain(), lastSeen: 1 }),
    ).not.toHaveProperty("startedAt");
    expect(readSave({ ...saved, startedAt: -1 }).kind).toBe("bad");
  });

  it("a version above 8 is newer, below is older, with its stamp and rev", () => {
    expect(readSave({ version: 9, lastSeen: 1, world: {} })).toEqual({
      kind: "newer",
      version: 9,
    });
    expect(
      readSave({ version: 7, rev: 4, mountain: { startedAt: 12 } }),
    ).toEqual({ kind: "older", version: 7, startedAt: 0, rev: 4 });
    expect(readSave({ version: 7, startedAt: 12, rev: 4 })).toEqual({
      kind: "older",
      version: 7,
      startedAt: 12,
      rev: 4,
    });
    expect(readSave({ version: 1, grid: {} })).toEqual({
      kind: "older",
      version: 1,
      startedAt: 0,
      rev: 0,
    });
  });

  it("an unknown id, key or named value is newer", () => {
    expect(readSave(withGame({ owned: { helper: 1, rocket: 1 } })).kind).toBe(
      "newer",
    );
    expect(readSave(withGame({ village: { mill: 1 } })).kind).toBe("newer");
    expect(
      readSave(withGame({ marks: { recipes: ["iron-rails", "kiln"] } })).kind,
    ).toBe("newer");
    expect(
      readSave(withGame({ marks: { recipes: ["iron-rails"], wonders: [] } }))
        .kind,
    ).toBe("newer");
    expect(
      readSave(withGame({ engineers: [{ ...ADA, post: "saw" }] })).kind,
    ).toBe("newer");
    expect(
      readSave(withGame({ run: { generation: 1, weather: 2 } })).kind,
    ).toBe("newer");
    const saved = serializeSave({ mountain: lived(), lastSeen: 9 });
    expect(readSave({ ...saved, weather: "rain" }).kind).toBe("newer");
  });

  it("a count above its cap is newer", () => {
    expect(readSave(withGame({ levels: { boots: 2 } })).kind).toBe("newer");
    const crew = ["Ada", "Nils", "Ruth", "Otto", "Mae", "Bo"].map((name) => ({
      ...NILS,
      name,
    }));
    expect(readSave(withGame({ engineers: crew, expeditions: [] })).kind).toBe(
      "newer",
    );
    expect(
      readSave(withGame({ run: { generation: MAX_LEGACY + 1 } })).kind,
    ).toBe("newer");
    expect(readSave(withGame({ run: { dug: MOUNTAIN_STONES + 1 } })).kind).toBe(
      "newer",
    );
  });

  it("stock has no cap but the safe-integer limit", () => {
    const read = readSave(withGame({ stock: { clay: 10 ** 12 } }));
    expect(okMountain(read)?.materials.clay).toBe(10 ** 12);
    expect(
      readSave(withGame({ stock: { clay: Number.MAX_SAFE_INTEGER + 2 } })).kind,
    ).toBe("bad");
  });

  it("nonsense is bad", () => {
    const saved = stored(
      serializeSave({ mountain: lived(), lastSeen: 9 }),
    ) as Record<string, unknown>;
    expect(readSave(withGame({ owned: { helper: "3" } })).kind).toBe("bad");
    expect(readSave(withGame({ stock: { stones: -1 } })).kind).toBe("bad");
    expect(readSave(withGame({ levels: { tap: 1.5 } })).kind).toBe("bad");
    expect(readSave(withGame({ marks: { seen: [1] } })).kind).toBe("bad");
    expect(readSave(withGame({ engineers: [{ name: "Ada" }] })).kind).toBe(
      "bad",
    );
    expect(readSave(withGame({ owned: [] })).kind).toBe("bad");
    expect(readSave({ ...saved, game: undefined }).kind).toBe("bad");
    expect(readSave({ ...saved, lastSeen: undefined }).kind).toBe("bad");
    expect(readSave({ ...saved, version: 7.5 }).kind).toBe("bad");
    expect(readSave({ ...saved, version: "8" }).kind).toBe("bad");
    expect(readSave(null).kind).toBe("bad");
    expect(readSave([saved]).kind).toBe("bad");
  });

  it("bad wins over newer: nonsense is never a newer build's save", () => {
    expect(
      readSave(withGame({ owned: { rocket: 1 }, stock: { clay: -1 } })).kind,
    ).toBe("bad");
  });

  it("a missing key reads as its default", () => {
    expect(readSave({ version: 8, lastSeen: 1, game: {} })).toEqual({
      kind: "ok",
      save: {
        mountain: { ...BARE_MOUNTAIN, staffed: STAFF_GRANT },
        lastSeen: 1,
      },
    });
  });

  it("ignores the rules' savedAt on a cloud copy", () => {
    const saved = serializeSave({ mountain: lived(), lastSeen: 9 });
    expect(readSave({ ...saved, savedAt: { seconds: 1 } }).kind).toBe("ok");
  });
});
