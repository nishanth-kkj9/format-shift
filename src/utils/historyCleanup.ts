import { ConversionHistoryItem } from "../types";

/**
 * Revoke the blob URLs of history entries being removed, without touching URLs
 * still referenced by a queue item (those are revoked later, when the item is
 * removed). `revoke` is injectable for testing.
 */
export function revokeHistoryUrls(
  history: ConversionHistoryItem[],
  retainedUrls: ReadonlySet<string>,
  revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)
): void {
  for (const entry of history) {
    if (entry.downloadUrl && !retainedUrls.has(entry.downloadUrl)) {
      revoke(entry.downloadUrl);
    }
  }
}

/**
 * The atomic clear-history transition: revoke history URLs that are no longer
 * referenced by the queue, then return the empty history. `queueUrls` must be
 * the queue's URL set at the moment of the transition (not render-captured
 * state) so a URL created/completed in the same state window is never revoked.
 * `revoke` is injectable for testing.
 */
export function clearHistoryRevoking(
  history: ConversionHistoryItem[],
  queueUrls: ReadonlySet<string>,
  revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)
): ConversionHistoryItem[] {
  revokeHistoryUrls(history, queueUrls, revoke);
  return [];
}

/**
 * Single bound for history everywhere: runtime state and persisted storage both
 * keep at most this many entries. Runtime history is newest-first, so the first
 * N entries are the newest N — keeping this in one place means the ordering
 * invariant can't drift between memory and storage again.
 */
export const MAX_HISTORY_ENTRIES = 100;

/**
 * History persistence must never carry blob URLs: they are session-scoped and
 * die on reload, so a persisted entry would advertise a download that cannot
 * work. Strip the volatile field before writing to storage. Only the newest
 * 100 entries are persisted so an unbounded history can't blow the 5MB
 * localStorage quota (QuotaExceededError would break persistence entirely).
 */
export function historyForStorage(history: ConversionHistoryItem[]): ConversionHistoryItem[] {
  return history.slice(0, MAX_HISTORY_ENTRIES).map(({ downloadUrl, ...rest }) => rest);
}

/**
 * Bound in-memory history to MAX_HISTORY_ENTRIES (newest-first, matching how
 * App prepends entries) and revoke the blob URLs of entries dropped off the end
 * — unless the queue still references them (those are revoked later, when the
 * queue item is removed). `revoke` is injectable for testing.
 */
export function trimHistoryRevoking(
  history: ConversionHistoryItem[],
  retainedUrls: ReadonlySet<string>,
  revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)
): ConversionHistoryItem[] {
  const dropped = history.slice(MAX_HISTORY_ENTRIES);
  revokeHistoryUrls(dropped, retainedUrls, revoke);
  return history.slice(0, MAX_HISTORY_ENTRIES);
}

/** Read persisted history, dropping any stale blob URLs from older versions. */
export function hydrateHistory(raw: string | null): ConversionHistoryItem[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as ConversionHistoryItem[]).map(({ downloadUrl, ...rest }) => rest);
  } catch {
    return [];
  }
}
