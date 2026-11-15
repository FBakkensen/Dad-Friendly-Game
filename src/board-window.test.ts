import { afterEach, describe, expect, it, vi } from "vitest";
import { runBoardLoop } from "./board-window";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runBoardLoop", () => {
  /** A fake frame clock: frames asked for, run in turn, and cancellable. */
  const fakeFrames = () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      id += 1;
      frames.set(id, cb);
      return id;
    });
    const cancel = vi.fn((handle: number) => {
      frames.delete(handle);
    });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const next = (at: number): void => {
      const first = frames.entries().next();
      if (first.done) throw new Error("no frame asked for");
      const [handle, cb] = first.value;
      frames.delete(handle);
      cb(at);
    };
    return { frames, cancel, next };
  };

  it("steps in seconds, caps a long gap at 0.1s and stops on abort", () => {
    const { frames, cancel, next } = fakeFrames();
    const step = vi.fn<(dt: number) => void>();
    const stop = new AbortController();
    runBoardLoop(step, stop.signal);
    next(1000);
    next(1016);
    expect(step).toHaveBeenLastCalledWith(expect.closeTo(0.016, 6));
    next(6016);
    expect(step).toHaveBeenLastCalledWith(0.1);
    const calls = step.mock.calls.length;
    expect(frames.size).toBe(1);
    stop.abort();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(step).toHaveBeenCalledTimes(calls);
  });

  it("keeps going after a step throws", () => {
    const { frames, next } = fakeFrames();
    const step = vi.fn<(dt: number) => void>(() => {
      throw new Error("a bad frame");
    });
    runBoardLoop(step);
    next(1000);
    expect(() => {
      next(1016);
    }).toThrow("a bad frame");
    expect(frames.size).toBe(1);
    step.mockImplementation(() => undefined);
    next(1032);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it("asks for no frame when the signal has already aborted", () => {
    const { frames } = fakeFrames();
    const stop = new AbortController();
    stop.abort();
    runBoardLoop(vi.fn(), stop.signal);
    expect(frames.size).toBe(0);
  });

  it("does nothing without requestAnimationFrame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const step = vi.fn<(dt: number) => void>();
    expect(() => {
      runBoardLoop(step);
    }).not.toThrow();
    expect(step).not.toHaveBeenCalled();
  });
});
