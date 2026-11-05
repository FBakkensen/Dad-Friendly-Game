import { describe, expect, it } from "vitest";
import { inOrder } from "./lab-pool";

describe("lab pool", () => {
  it("returns results in task order, whichever finishes first", async () => {
    const delays = [30, 5, 15, 0];
    const results = await inOrder(
      delays.map(
        (ms, index) => () =>
          new Promise<number>((resolve) =>
            setTimeout(() => {
              resolve(index);
            }, ms),
          ),
      ),
      2,
    );
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never runs more tasks at once than the limit", async () => {
    let running = 0;
    let most = 0;
    const tasks = Array.from({ length: 7 }, () => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running -= 1;
    });
    await inOrder(tasks, 3);
    expect(most).toBe(3);
  });

  it("runs one at a time below a limit of one, and passes a failure on", async () => {
    let most = 0;
    let running = 0;
    const one = async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return 1;
    };
    await expect(inOrder([one, one], 0)).resolves.toEqual([1, 1]);
    expect(most).toBe(1);
    await expect(
      inOrder([one, () => Promise.reject(new Error("seed 2"))], 2),
    ).rejects.toThrow("seed 2");
  });

  it("starts no new task once one has failed", async () => {
    const started: number[] = [];
    const tasks = [0, 1, 2, 3].map((index) => async () => {
      started.push(index);
      if (index === 0) {
        throw new Error("seed 1");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      return index;
    });
    await expect(inOrder(tasks, 2)).rejects.toThrow("seed 1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toEqual([0, 1]);
  });

  it("runs one lane when the limit is not a number", async () => {
    await expect(
      inOrder([() => Promise.resolve(1), () => Promise.resolve(2)], Number.NaN),
    ).resolves.toEqual([1, 2]);
  });
});
