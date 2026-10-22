/** One writer tab per device. The lease is a note, not a save. */

export const WRITER_LEASE_KEY = "dad-friendly-writer-lease";
export const WRITER_CHANNEL = "dad-friendly-writer";
export const WRITER_LOCK_NAME = "dad-friendly-writer";

/** How long a fallback lease stays valid without a heartbeat. */
export const WRITER_LEASE_MS = 8_000;

export type WriterLease = {
  readonly tabId: string;
  readonly until: number;
};

export type WriterNote =
  | { readonly type: "yield"; readonly tabId: string }
  | { readonly type: "taken"; readonly tabId: string };

export function parseWriterLease(raw: string | null): WriterLease | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    if (!("tabId" in value) || !("until" in value)) {
      return undefined;
    }
    const tabId = value.tabId;
    const until = value.until;
    if (
      !isTabId(tabId) ||
      typeof until !== "number" ||
      !Number.isFinite(until)
    ) {
      return undefined;
    }
    return { tabId, until };
  } catch {
    return undefined;
  }
}

export function parseWriterNote(value: unknown): WriterNote | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!("type" in value) || !("tabId" in value)) {
    return undefined;
  }
  const tabId = value.tabId;
  if (!isTabId(tabId)) {
    return undefined;
  }
  if (value.type === "yield" || value.type === "taken") {
    return { type: value.type, tabId };
  }
  return undefined;
}

/** True when some other tab still holds a live lease. */
export function leaseBlocks(
  lease: WriterLease | undefined,
  tabId: string,
  now: number,
): boolean {
  return lease !== undefined && lease.tabId !== tabId && lease.until > now;
}

function isTabId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64;
}
