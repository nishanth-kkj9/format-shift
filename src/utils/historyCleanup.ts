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
    if (!retainedUrls.has(entry.downloadUrl)) {
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
