import { describe, expect, it } from "vitest";
import {
  applySignedInSave,
  createMemoryCloudSave,
  createNoopCloudSave,
} from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";

describe("applySignedInSave", () => {
  const local = minedMountain(1);
  const remoteMountain = minedMountain(9);

  it("uses the cloud mountain when one is found", () => {
    expect(
      applySignedInSave({
        local,
        remote: { kind: "found", mountain: remoteMountain },
      }),
    ).toEqual({ mountain: remoteMountain, upload: false });
  });

  it("keeps the session mountain and uploads when the cloud has no save", () => {
    expect(applySignedInSave({ local, remote: { kind: "missing" } })).toEqual({
      mountain: local,
      upload: true,
    });
  });

  it("keeps the session mountain and does not upload when the cloud is down", () => {
    expect(
      applySignedInSave({ local, remote: { kind: "unavailable" } }),
    ).toEqual({ mountain: local, upload: false });
  });

  it("keeps the session mountain when cloud save is disabled", () => {
    expect(applySignedInSave({ local, remote: { kind: "disabled" } })).toEqual({
      mountain: local,
      upload: false,
    });
  });
});

describe("createMemoryCloudSave", () => {
  it("round-trips a mountain for one uid and notifies watchers", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const mountain = minedMountain(5);
    const seen: string[] = [];
    const stop = cloud.watch({
      uid: "dad",
      onChange: (remote) => {
        seen.push(remote.kind);
      },
    });

    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "missing",
    });
    await expect(cloud.write({ uid: "dad", mountain })).resolves.toEqual({
      kind: "ok",
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "found",
      mountain,
    });
    expect(docs.get("dad")).toEqual(mountain);
    expect(seen).toEqual(["missing", "found"]);
    stop();
  });
});

describe("createNoopCloudSave", () => {
  it("never stores a mountain", async () => {
    const cloud = createNoopCloudSave();
    await cloud.write({
      uid: "dad",
      mountain: createMountain(),
    });
    await expect(cloud.load({ uid: "dad" })).resolves.toEqual({
      kind: "disabled",
    });
  });
});
