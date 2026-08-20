import { describe, it, expect, vi } from "vitest";
import {
  revokeHistoryUrls,
  clearHistoryRevoking,
  historyForStorage,
  hydrateHistory,
  trimHistoryRevoking,
  MAX_HISTORY_ENTRIES,
} from "./historyCleanup";
import { ConversionHistoryItem } from "../types";

function entry(id: string, downloadUrl: string): ConversionHistoryItem {
  return {
    id,
    originalName: "a.txt",
    convertedName: "a.html",
    category: "document",
    sourceFormat: "txt",
    targetFormat: "html",
    originalSize: 1,
    convertedSize: 2,
    timestamp: "12:00",
    downloadUrl,
  };
}

describe("revokeHistoryUrls", () => {
  it("revokes every removed URL not retained by the queue", () => {
    const revoke = vi.fn();
    const history = [entry("1", "blob:one"), entry("2", "blob:two"), entry("3", "blob:three")];
    revokeHistoryUrls(history, new Set(["blob:two"]), revoke);
    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(revoke).toHaveBeenCalledWith("blob:three");
    expect(revoke).not.toHaveBeenCalledWith("blob:two");
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("revokes nothing when every URL is retained", () => {
    const revoke = vi.fn();
    revokeHistoryUrls([entry("1", "blob:one")], new Set(["blob:one"]), revoke);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes every URL when nothing is retained", () => {
    const revoke = vi.fn();
    revokeHistoryUrls([entry("1", "blob:one"), entry("2", "blob:two")], new Set(), revoke);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

describe("clearHistoryRevoking (atomic clear vs queue race)", () => {
  it("never revokes a URL still referenced by the queue at the moment of the clear", () => {
    const revoke = vi.fn();
    // Race-shaped input: the history and the queue both reference blob:new
    // because a conversion completed in the same state window as the clear.
    const queueUrls = new Set(["blob:new", "blob:kept"]);
    const history = [entry("h1", "blob:new"), entry("h2", "blob:kept"), entry("h3", "blob:old")];
    const next = clearHistoryRevoking(history, queueUrls, revoke);
    expect(next).toEqual([]);
    expect(revoke).toHaveBeenCalledWith("blob:old");
    expect(revoke).not.toHaveBeenCalledWith("blob:new");
    expect(revoke).not.toHaveBeenCalledWith("blob:kept");
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("revokes every cleared URL once a queue item has also been removed", () => {
    const revoke = vi.fn();
    // After handleRemove, the URL leaves the queue's set, so clearing history
    // revokes it exactly once — no double revoke, no leak.
    const next = clearHistoryRevoking([entry("h1", "blob:gone")], new Set(), revoke);
    expect(next).toEqual([]);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe("trimHistoryRevoking (bounded in-memory history)", () => {
  function newestFirstHistory(count: number) {
    // Newest at index 0, oldest at the end — the same ordering App maintains.
    return Array.from({ length: count }, (_, i) => entry(`n${i}`, `blob:n${i}`));
  }

  it("bounds history to MAX_HISTORY_ENTRIES, newest-first", () => {
    const history = newestFirstHistory(MAX_HISTORY_ENTRIES + 1);
    const next = trimHistoryRevoking(history, new Set(), vi.fn());
    expect(next).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(next[0].id).toBe("n0"); // newest retained
    expect(next[0].downloadUrl).toBe("blob:n0");
  });

  it("revokes URLs dropped by the bound when the queue does not retain them", () => {
    const revoke = vi.fn();
    const history = newestFirstHistory(MAX_HISTORY_ENTRIES + 3);
    trimHistoryRevoking(history, new Set(), revoke);
    // Only the last 3 entries fall off the end; only their URLs are revoked.
    expect(revoke).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledWith("blob:n100");
    expect(revoke).toHaveBeenCalledWith("blob:n102");
    expect(revoke).not.toHaveBeenCalledWith("blob:n0");
    expect(revoke).not.toHaveBeenCalledWith("blob:n99");
  });

  it("does not revoke a dropped URL still referenced by an active queue item", () => {
    const revoke = vi.fn();
    const history = newestFirstHistory(MAX_HISTORY_ENTRIES + 2);
    // The oldest dropped entries are still being shown/downloaded from the queue.
    trimHistoryRevoking(history, new Set(["blob:n100", "blob:n101"]), revoke);
    expect(revoke).toHaveBeenCalledTimes(0);
  });

  it("revokes nothing when history is within the bound", () => {
    const revoke = vi.fn();
    const history = newestFirstHistory(MAX_HISTORY_ENTRIES - 1);
    const next = trimHistoryRevoking(history, new Set(), revoke);
    expect(next).toHaveLength(MAX_HISTORY_ENTRIES - 1);
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe("history persistence (metadata only, never blob URLs)", () => {
  it("strips session-scoped downloadUrl before writing to storage", () => {
    const forStorage = historyForStorage([entry("1", "blob:dead-after-reload")]);
    expect(forStorage[0].downloadUrl).toBeUndefined();
    expect(forStorage[0].originalName).toBe("a.txt");
    expect(forStorage[0].convertedSize).toBe(2);
  });

  it("caps persisted history to the newest 100 entries (runtime is newest-first)", () => {
    // App prepends each new entry, so index 0 is the newest (highest id) and
    // index 149 the oldest. A `slice(-100)`-style cap would keep the OLDEST
    // 100 — the bug this regression guards against.
    const history = Array.from({ length: 150 }, (_, i) => entry(String(149 - i), `blob:${149 - i}`));
    const forStorage = historyForStorage(history);
    expect(forStorage).toHaveLength(100);
    expect(forStorage[0].id).toBe("149"); // newest kept
    expect(forStorage[99].id).toBe("50"); // 100th newest kept
    expect(forStorage.some((item) => item.id === "0")).toBe(false); // oldest dropped
  });

  it("drops stale blob URLs when hydrating persisted history", () => {
    const raw = JSON.stringify([entry("1", "blob:stale"), { ...entry("2", "blob:also-stale"), id: "2" }]);
    const restored = hydrateHistory(raw);
    expect(restored).toHaveLength(2);
    for (const item of restored) {
      expect(item.downloadUrl).toBeUndefined();
    }
  });

  it("handles missing or corrupt stored history", () => {
    expect(hydrateHistory(null)).toEqual([]);
    expect(hydrateHistory("{not json")).toEqual([]);
  });
});
