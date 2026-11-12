import { describe, expect, it } from "vitest";
import { settleWithin } from "./settle-within";

describe("settleWithin (#480)", () => {
  it("gives the answer that comes in time, and clears its timer", async () => {
    const timers: unknown[] = [];
    await expect(
      settleWithin(Promise.resolve("ok"), 1_000, (timer) => {
        timers.push(timer);
      }),
    ).resolves.toBe("ok");
    expect(timers).toHaveLength(2);
    expect(timers[0]).toBeDefined();
    expect(timers[1]).toBeUndefined();
  });

  it("gives up after the wait, and a late answer changes nothing", async () => {
    let answer: (value: string) => void = () => undefined;
    const late = new Promise<string>((resolve) => {
      answer = resolve;
    });
    const settled = settleWithin(late, 5);
    await expect(settled).resolves.toBe("timeout");
    answer("ok");
    await expect(settled).resolves.toBe("timeout");
  });

  it("says rejected when the call throws", async () => {
    await expect(
      settleWithin(Promise.reject(new Error("offline")), 1_000),
    ).resolves.toBe("rejected");
  });
});
