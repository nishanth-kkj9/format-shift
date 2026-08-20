import { describe, it, expect, vi } from "vitest";
import { revokeHistoryUrls, clearHistoryRevoking, historyForStorage, hydrateHistory } from "./historyCleanup";
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

describe("history persistence (metadata only, never blob URLs)", () => {
  it("strips session-scoped downloadUrl before writing to storage", () => {
    const forStorage = historyForStorage([entry("1", "blob:dead-after-reload")]);
    expect(forStorage[0].downloadUrl).toBeUndefined();
    expect(forStorage[0].originalName).toBe("a.txt");
    expect(forStorage[0].convertedSize).toBe(2);
  });

  it("caps persisted history to the last 100 entries", () => {
    const history = Array.from({ length: 150 }, (_, i) => entry(String(i), `blob:${i}`));
    const forStorage = historyForStorage(history);
    expect(forStorage).toHaveLength(100);
    expect(forStorage[0].originalName).toBe("a.txt");
    expect(forStorage[0].id).toBe("50");
    expect(forStorage[99].id).toBe("149");
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
