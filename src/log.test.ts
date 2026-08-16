import { describe, expect, it } from "vitest";
import { createLogger, formatLogEvent } from "./log";

describe("createLogger", () => {
  it("keeps the latest event and drops the oldest past the limit", () => {
    const logger = createLogger({ limit: 2 });
    logger.record({
      level: "info",
      code: "save.watch",
      detail: "start",
      data: { dug: 0 },
    });
    logger.record({
      level: "info",
      code: "save.remote",
      detail: "found",
      data: { dug: 2 },
    });
    logger.record({
      level: "error",
      code: "save.write",
      detail: "unavailable",
      data: { dug: 2 },
    });

    const latest = logger.latest();
    if (latest === undefined) {
      throw new Error("logger had no event");
    }
    expect(latest).toEqual({
      level: "error",
      code: "save.write",
      detail: "unavailable",
      data: { dug: 2 },
    });
    expect(formatLogEvent(latest)).toBe("error save.write unavailable dug=2");
  });
});
