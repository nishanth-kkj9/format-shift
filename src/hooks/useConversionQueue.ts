import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { ConversionHistoryItem, ConversionItem, TargetFormat } from "../types";
import {
  convertAudio,
  convertDataDocument,
  convertImage,
  detectCategoryAndFormats,
} from "../utils/converter";
import { extractFileMetadata } from "../utils/metadata";
import {
  clearHistoryRevoking,
  historyForStorage,
  hydrateHistory,
  MAX_HISTORY_ENTRIES,
  trimHistoryRevoking,
} from "../utils/historyCleanup";
import { convertServerSide, needsServerConversion } from "../utils/serverConvert";
import { ZIP_MAX_TOTAL_BYTES, zipBatchOverLimit } from "../utils/zipPolicy";
import { extensionForMime } from "../core/conversionRegistry";

/** UUID when the runtime has it; short fallback for older/jsdom environments. */
function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/**
 * Owns the conversion queue and history: detection, per-item and batch
 * conversion, cancellation, downloads, ZIP batching, and localStorage sync.
 * App keeps only presentation state (theme, tab, open modals).
 */
export function useConversionQueue() {
  // File Queue
  const [queue, setQueue] = useState<ConversionItem[]>([]);

  // History (persisted metadata only: blob URLs are session-scoped and are
  // stripped on write / on load, so restored entries never carry dead links).
  const [history, setHistory] = useState<ConversionHistoryItem[]>(() => {
    try {
      // Older versions could have persisted more than the cap; trim on load so
      // runtime state respects the same bound as storage.
      return hydrateHistory(localStorage.getItem("formatshift_history")).slice(0, MAX_HISTORY_ENTRIES);
    } catch {
      return [];
    }
  });

  // Track in-flight abort controllers so the UI can cancel conversions.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Latest history for removal-time revocation checks: those run inside state
  // updaters, where the render-captured `history` can already be stale.
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // URLs currently referenced by queue items, kept in sync at the exact
  // transitions where those references begin (conversion) and end (remove /
  // clear all). Clear History reads this ref inside its state updater so the
  // retained set is atomic with the history transition, never render-captured.
  const queueUrlsRef = useRef<Set<string>>(new Set());

  // Always holds latest queue so long-lived async batch closures see edits
  // made after handleConvertAll was invoked (mirrors abortControllersRef pattern).
  const queueRef = useRef<ConversionItem[]>(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Sync history to localStorage (metadata only; never blob URLs)
  useEffect(() => {
    try {
      localStorage.setItem("formatshift_history", JSON.stringify(historyForStorage(history)));
    } catch {
      // ignore quota error
    }
  }, [history]);

  // Add Files to Queue with Auto-Detection & Async Metadata Extraction
  const handleFilesAdded = (files: File[]) => {
    const newItems: ConversionItem[] = files.map((file) => {
      let detected: ReturnType<typeof detectCategoryAndFormats> | null = null;
      let detectError: string | null = null;
      try {
        detected = detectCategoryAndFormats(file);
      } catch (err) {
        detectError = err instanceof Error ? err.message : "Unsupported file type";
      }

      const newItem: ConversionItem = {
        id: newId(),
        file,
        name: file.name,
        originalSize: file.size,
        originalExtension: detected?.sourceFormat || (file.name.split(".").pop() || "").toLowerCase(),
        category: detected?.category || "document",
        targetFormat: detected?.defaultTargetFormat || "txt",
        availableTargets: detected?.availableTargets ?? [],
        status: detectError ? "error" : "idle",
        progress: 0,
        errorMessage: detectError || undefined,
        options: {
          image: {
            quality: 85,
            maintainAspectRatio: true,
            bgColor: "#ffffff",
            grayscale: false,
            rotation: 0,
            flipHorizontal: false,
            flipVertical: false,
          },
          audio: {
            bitrate: "192k",
            sampleRate: 44100,
            channels: 2,
            volume: 100,
          },
          video: {
            resolution: "original",
            fps: 30,
            muteAudio: false,
          },
          data: {
            delimiter: ",",
            prettyPrint: true,
            indentSpaces: 2,
          },
        },
      };

      // Asynchronously extract metadata (preview image, duration, dimensions).
      // If the item was removed while extraction was in flight, the queue
      // update is a no-op and the preview blob URL must be revoked, or it
      // leaks for the session.
      if (!detectError) {
        extractFileMetadata(file).then((meta) => {
          setQueue((prev) => {
            if (!prev.some((item) => item.id === newItem.id)) {
              if (meta.previewUrl) URL.revokeObjectURL(meta.previewUrl);
              return prev;
            }
            return prev.map((item) =>
              item.id === newItem.id
                ? {
                    ...item,
                    previewUrl: meta.previewUrl,
                    dimensions: meta.dimensions,
                    duration: meta.duration,
                    lineCount: meta.lineCount,
                  }
                : item
            );
          });
        });
      }

      return newItem;
    });

    // Keep the ref synchronous so "Convert All" clicked in the same tick as the
    // drop still sees these files (the effect that mirrors state runs later).
    queueRef.current = [...queueRef.current, ...newItems];
    setQueue(queueRef.current);
  };

  // Target Format Change per item
  const handleTargetFormatChange = (id: string, newTarget: TargetFormat) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, targetFormat: newTarget } : item)));
  };

  // Global Target Format apply (source-aware: never force a target a source
  // cannot actually be converted to, e.g. HTML -> Markdown).
  const handleApplyGlobalFormat = (format: TargetFormat) => {
    setQueue((prev) =>
      prev.map((item) => (item.availableTargets.includes(format) ? { ...item, targetFormat: format } : item))
    );
  };

  // Update Conversion Options for single item
  const handleSaveOptions = (itemId: string, updatedOptions: ConversionItem["options"]) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        // Social presets are for posting; social platforms want a single raster
        // format, so a preset pins the target to jpg.
        const isPreset =
          item.category === "image" &&
          updatedOptions.image?.socialPreset &&
          updatedOptions.image.socialPreset !== "custom";
        const targetFormat = isPreset ? "jpg" : item.targetFormat;
        return { ...item, options: updatedOptions, targetFormat };
      })
    );
  };

  // Convert Single File — reads latest queue via ref so batch edits after start are honored.
  const convertSingleFile = async (id: string) => {
    const item = queueRef.current.find((q) => q.id === id);
    if (!item) return;
    // A second click (or a batch that already picked this item up) must not
    // start a parallel conversion for the same id: it would overwrite the abort
    // controller and append a second history entry. A file with no detected
    // targets (unsupported source, e.g. PDF) cannot be converted at all — the
    // old fallback would have run its raw bytes through the text pipeline.
    if (item.status === "converting" || item.availableTargets.length === 0) return;

    // Create abort controller for this conversion
    const abortController = new AbortController();
    abortControllersRef.current.set(id, abortController);

    // Update state to converting
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status: "converting", progress: 5 } : q)));

    let resultBlob: Blob;
    let dimensions: { width: number; height: number } | undefined;
    let duration: number | undefined;

    const updateProgress = (pct: number) => {
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, progress: pct } : q)));
    };

    // Listen for abort signal to update status if conversion is cancelled
    const handleAbort = () => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: "error", errorMessage: "Conversion cancelled", progress: 0 } : q
        )
      );
    };

    abortController.signal.addEventListener("abort", handleAbort);

    try {
      if (needsServerConversion(item.category, item.targetFormat)) {
        updateProgress(30);
        resultBlob = await convertServerSide(
          item.file,
          item.category,
          item.originalExtension,
          item.targetFormat,
          item.options,
          abortController.signal,
          { durationSeconds: item.duration, onProgress: updateProgress }
        );
        updateProgress(100);
      } else if (item.category === "image") {
        const res = await convertImage(
          item.file,
          item.targetFormat,
          item.options.image!,
          updateProgress,
          abortController.signal
        );
        resultBlob = res.blob;
        dimensions = res.dimensions;
      } else if (item.category === "audio") {
        const res = await convertAudio(
          item.file,
          item.targetFormat,
          item.options.audio!,
          updateProgress,
          abortController.signal
        );
        resultBlob = res.blob;
        duration = res.duration;
      } else {
        const res = await convertDataDocument(
          item.file,
          item.targetFormat,
          item.options.data,
          updateProgress
        );
        resultBlob = res.blob;
      }

      const convertedUrl = URL.createObjectURL(resultBlob);
      queueUrlsRef.current.add(convertedUrl);
      const nameWithoutExt = item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
      const actualExt = extensionForMime(resultBlob.type) || item.targetFormat;
      const convertedName = `${nameWithoutExt}_converted.${actualExt}`;

      // Update item in queue as completed
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: "completed",
                progress: 100,
                convertedBlob: resultBlob,
                convertedUrl,
                convertedSize: resultBlob.size,
                convertedName,
                dimensions,
                duration,
              }
            : q
        )
      );

      // Add to history
      const historyEntry: ConversionHistoryItem = {
        id: newId(),
        originalName: item.name,
        convertedName,
        category: item.category,
        sourceFormat: item.originalExtension,
        targetFormat: item.targetFormat,
        originalSize: item.originalSize,
        convertedSize: resultBlob.size,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        downloadUrl: convertedUrl,
      };

      // Add to history, bounded to MAX_HISTORY_ENTRIES. The queue URL set is
      // current here (convertedUrl was added synchronously above), so an entry
      // trimmed off the end is revoked only when no queue item still shows it.
      setHistory((prev) => trimHistoryRevoking([historyEntry, ...prev], queueUrlsRef.current));
    } catch (err: unknown) {
      // Ignore abort errors as they're handled separately
      if (err instanceof DOMException && err.name === "AbortError") {
        // Already handled by the abort event listener
        return;
      }

      const errorMsg = err instanceof Error ? err.message : "Conversion failed";
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: "error", errorMessage: errorMsg, progress: 0 } : q))
      );
    } finally {
      // Clean up abort controller event listener
      abortController.signal.removeEventListener("abort", handleAbort);
      abortControllersRef.current.delete(id);
    }
  };

  // Cancel an in-progress conversion
  const handleCancelConversion = (id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
  };

  // Convert All Pending Files — run up to 3 conversions concurrently for
  // better batch throughput without overwhelming the browser/server.
  const handleConvertAll = async () => {
    const pendingItems = queueRef.current.filter(
      (item) => item.status !== "completed" && item.availableTargets.length > 0
    );
    const CONCURRENCY = 3;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < pendingItems.length) {
        const item = pendingItems[nextIndex++];
        await convertSingleFile(item.id);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pendingItems.length) }, () => worker());
    await Promise.allSettled(workers);

    // Trigger celebratory confetti on batch completion!
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
  };

  // Download Single File
  const handleDownloadSingle = (item: ConversionItem) => {
    if (!item.convertedUrl || !item.convertedName) return;
    const a = document.createElement("a");
    a.href = item.convertedUrl;
    a.download = item.convertedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download All as ZIP
  const handleDownloadZip = async () => {
    const completedItems = queue.filter((item) => item.status === "completed" && item.convertedBlob);
    if (completedItems.length === 0) return;

    // JSZip holds every blob in memory while building the archive; refuse a
    // batch that would blow past the cap instead of OOM-ing the tab.
    if (zipBatchOverLimit(completedItems.map((i) => i.convertedBlob!.size))) {
      window.alert(
        `Batch exceeds the ${ZIP_MAX_TOTAL_BYTES / 1024 / 1024}MB ZIP limit. Download files individually instead.`
      );
      return;
    }

    // JSZip loads only when the user actually zips — keeps it out of the initial bundle.
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    completedItems.forEach((item) => {
      if (item.convertedBlob && item.convertedName) {
        zip.file(item.convertedName, item.convertedBlob);
      }
    });

    // STORE (no recompression): the media is already compressed, so DEFLATE
    // only wastes CPU/memory for nothing.
    const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const zipUrl = URL.createObjectURL(content);

    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = `formatshift_converted_files.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // The ZIP URL is only referenced by the transient <a> element; revoke it
    // right after the click so it does not leak for the session.
    URL.revokeObjectURL(zipUrl);
  };

  // Remove single item from queue
  const handleRemove = (id: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.convertedUrl) {
        queueUrlsRef.current.delete(item.convertedUrl);
      }
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      // Only revoke convertedUrl if it's not referenced in history
      if (item?.convertedUrl && !historyRef.current.some((h) => h.downloadUrl === item.convertedUrl)) {
        URL.revokeObjectURL(item.convertedUrl);
      }
      const next = prev.filter((item) => item.id !== id);
      queueRef.current = next;
      return next;
    });
  };

  // Clear All Queue
  const handleClearAll = () => {
    setQueue((prev) => {
      queueUrlsRef.current.clear();
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        // Only revoke convertedUrl if it's not referenced in history
        if (item.convertedUrl && !historyRef.current.some((h) => h.downloadUrl === item.convertedUrl)) {
          URL.revokeObjectURL(item.convertedUrl);
        }
      });
      queueRef.current = [];
      return [];
    });
  };

  // Clear History (revokes removed blob URLs, never a URL still shown by a queue item)
  const handleClearHistory = () => {
    // queueUrlsRef is current at updater time (it is synced synchronously at
    // every queue URL transition), so retention is atomic with the history clear.
    setHistory((prev) => clearHistoryRevoking(prev, queueUrlsRef.current));
  };

  // Pending items are shown in the batch bar; completed history lives separately.
  const isConvertingAny = queue.some((i) => i.status === "converting");

  return {
    queue,
    history,
    isConvertingAny,
    handleFilesAdded,
    handleTargetFormatChange,
    handleApplyGlobalFormat,
    handleSaveOptions,
    convertSingleFile,
    handleCancelConversion,
    handleConvertAll,
    handleDownloadSingle,
    handleDownloadZip,
    handleRemove,
    handleClearAll,
    handleClearHistory,
  };
}
