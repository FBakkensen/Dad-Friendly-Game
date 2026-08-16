type LogLevel = "info" | "error";

export type LogEvent = {
  readonly level: LogLevel;
  readonly code: string;
  readonly detail: string;
  readonly data: Readonly<Record<string, string | number>>;
};

export type Logger = {
  readonly record: (event: LogEvent) => void;
  readonly latest: () => LogEvent | undefined;
};

export function createLogger({ limit }: { limit: number }): Logger {
  const events: LogEvent[] = [];
  return {
    record: (event) => {
      events.push(event);
      if (events.length > limit) {
        events.shift();
      }
    },
    latest: () => events[events.length - 1],
  };
}

export function formatLogEvent(event: LogEvent): string {
  const parts = [event.level, event.code, event.detail];
  for (const [key, value] of Object.entries(event.data)) {
    parts.push(`${key}=${String(value)}`);
  }
  return parts.join(" ");
}
