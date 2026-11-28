import { describe, expect, it } from "vitest";
import type { Engineer } from "./engineers";
import { BARE_MOUNTAIN, createMountain, type Mountain } from "./mountain";
import { withFactors } from "./economy/factors";
import { PLAY_FACTORS } from "./part-switch";
import {
  SAVE_VERSION,
  readSave,
  serializeSave,
  type SaveRead,
} from "./persist";
import { minedMountain } from "./test-fixtures";

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
    rockDug: 80_000,
    stock: { ...fresh.stock, stones: 1_234 },
    owned: { ...fresh.owned, helper: 30, cart: 12, drill: 4, borer: 1, kid: 2 },
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
    upgrades: { ...fresh.upgrades, boots: 1 },
    seen: ["engineers"],
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

describe("the version 11 save (#558, #769)", () => {
  it("a fresh mountain writes a few lines", () => {
    const fresh = createMountain();
    // The start's one worker on drilling and its horse wagon (#703).
    expect(serializeSave({ mountain: fresh, lastSeen: 5 })).toEqual({
      version: 11,
      lastSeen: 5,
      game: {
        owned: { helper: 1 },
        jobs: { drilling: 1 },
        fleet: { horseWagon: 1 },
      },
    });
  });

  it("reads its own save back", () => {
    const mountain = lived();
    const read = readSave(stored(serializeSave({ mountain, lastSeen: 9 })));
    expect(read).toEqual({ kind: "ok", save: { mountain, lastSeen: 9 } });
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

  it("a version above 11 is newer, below is older, with its stamp and rev", () => {
    expect(readSave({ version: 12, lastSeen: 1, world: {} })).toEqual({
      kind: "newer",
      version: 12,
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
    // Version 10 is set aside for the version 11 Slice 2 Part 1 reset (#769).
    expect(
      readSave({
        version: 10,
        lastSeen: 1,
        startedAt: 40,
        rev: 6,
        deviceId: "device-1234",
        game: { owned: { helper: 3 } },
      }),
    ).toEqual({ kind: "older", version: 10, startedAt: 40, rev: 6 });
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
      readSave(withGame({ marks: { operational: ["lightTower", "spire"] } }))
        .kind,
    ).toBe("newer");
    expect(
      readSave(
        withGame({ marks: { operational: ["lightTower"], wonders: [] } }),
      ).kind,
    ).toBe("newer");
    expect(
      readSave(withGame({ engineers: [{ ...ADA, post: "saw" }] })).kind,
    ).toBe("newer");
    expect(readSave(withGame({ run: { rock: 1, weather: 2 } })).kind).toBe(
      "newer",
    );
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
  });

  it("stock has no cap but the safe-integer limit", () => {
    const read = readSave(withGame({ stock: { brick: 10 ** 12 } }));
    expect(okMountain(read)?.stock.brick).toBe(10 ** 12);
    expect(
      readSave(withGame({ stock: { brick: Number.MAX_SAFE_INTEGER + 2 } }))
        .kind,
    ).toBe("bad");
  });

  it("nonsense is bad", () => {
    const saved = stored(
      serializeSave({ mountain: lived(), lastSeen: 9 }),
    ) as Record<string, unknown>;
    expect(readSave(withGame({ owned: { helper: "3" } })).kind).toBe("bad");
    expect(readSave(withGame({ stock: { stones: -1 } })).kind).toBe("bad");
    expect(readSave(withGame({ levels: { boots: 1.5 } })).kind).toBe("bad");
    expect(readSave(withGame({ marks: { seen: [1] } })).kind).toBe("bad");
    expect(readSave(withGame({ marks: "seen" })).kind).toBe("bad");
    expect(readSave(withGame({ run: [] })).kind).toBe("bad");
    expect(readSave(withGame({ engineers: [{ name: "Ada" }] })).kind).toBe(
      "bad",
    );
    expect(readSave(withGame({ owned: [] })).kind).toBe("bad");
    expect(readSave({ ...saved, game: undefined }).kind).toBe("bad");
    expect(readSave({ ...saved, lastSeen: undefined }).kind).toBe("bad");
    expect(readSave({ ...saved, version: 7.5 }).kind).toBe("bad");
    expect(readSave({ ...saved, version: "11" }).kind).toBe("bad");
    expect(readSave(null).kind).toBe("bad");
    expect(readSave([saved]).kind).toBe("bad");
  });

  it("bad wins over newer: nonsense is never a newer build's save", () => {
    expect(
      readSave(withGame({ owned: { rocket: 1 }, stock: { brick: -1 } })).kind,
    ).toBe("bad");
  });

  it("a missing key reads as its default", () => {
    expect(readSave({ version: 11, lastSeen: 1, game: {} })).toEqual({
      kind: "ok",
      save: {
        mountain: BARE_MOUNTAIN,
        lastSeen: 1,
      },
    });
  });

  it("ignores the rules' savedAt on a cloud copy", () => {
    const saved = serializeSave({ mountain: lived(), lastSeen: 9 });
    expect(readSave({ ...saved, savedAt: { seconds: 1 } }).kind).toBe("ok");
  });

  it("keeps SAVE_VERSION at 11 and round-trips v11 Part 1 & Part 2 saves under PLAY_FACTORS (#780)", () => {
    expect(SAVE_VERSION).toBe(11);
    withFactors(PLAY_FACTORS, () => {
      const part1Doc = {
        version: 11,
        lastSeen: 1_700_000_000_000,
        rev: 4,
        deviceId: "device-dad-1234",
        game: {
          owned: { helper: 28, cart: 5, drill: 5, hoist: 3 },
          stock: { stones: 2_000_000, brick: 1_800_000, cutStone: 1_200_000 },
          levels: { boots: 1, cartSyn: 1, drillSyn: 1 },
          marks: { operational: ["lightTower", "warehouse", "foundry"] },
          makers: { kiln: 2, saw: 1 },
          mineLevels: { granite: {} },
          jobs: {
            drilling: 6,
            haulage: 5,
            hoisting: 4,
            graniteDrilling: 4,
            graniteHaulage: 3,
            driving: 3,
            kilns: 2,
            saws: 1,
          },
          fleet: { horseWagon: 2, truck: 1 },
        },
      };
      const loaded = readSave(stored(part1Doc));
      expect(loaded.kind).toBe("ok");
      if (loaded.kind !== "ok") {
        return;
      }
      expect(loaded.save.mountain.upgrades).toEqual({
        boots: 1,
        cartSyn: 1,
        drillSyn: 1,
        borerSyn: 0,
      });
      const reserialized = serializeSave({
        mountain: loaded.save.mountain,
        lastSeen: loaded.save.lastSeen ?? 0,
        rev: loaded.save.rev,
        deviceId: loaded.save.deviceId,
      });
      expect(reserialized.version).toBe(11);
      expect(readSave(stored(reserialized))).toEqual(loaded);
    });
  });
});
