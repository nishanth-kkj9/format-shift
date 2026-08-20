import { TargetFormat, ImageConversionOptions } from "../types";
import { SOCIAL_PRESETS } from "./detect";
import { getMimeForTarget } from "../core/conversionRegistry";

export { dataUrlToBlob };

// Targets that must run on the FFmpeg server — the browser canvas cannot
// reliably encode these. Rejecting here prevents silently mislabeled output.
const SERVER_ONLY_IMAGE_TARGETS = new Set(["gif", "bmp", "ico", "avif"]);

// Browser-supported targets (Canvas can encode these).
const BROWSER_IMAGE_TARGETS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

function assertBlobMatches(blob: Blob | null, target: string): void {
  const expected = getMimeForTarget("image", target);
  if (!blob) {
    throw new Error(`This browser cannot encode .${target} images (no blob output).`);
  }
  if (expected && blob.type !== expected) {
    throw new Error(`This browser cannot encode .${target} images (got ${blob.type || "unknown"} instead).`);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Guards a promise's resolve/reject against a caller-supplied AbortSignal:
 * - a signal already aborted (or an abort that arrives mid-operation) settles
 *   the promise with AbortError exactly once;
 * - after the promise settles, no further resolve/reject call has any effect
 *   (no double-settle from racing callbacks like canvas.toBlob);
 * - `checkAborted` is a stage guard for the gaps between callbacks, where an
 *   abort event cannot interrupt synchronous work.
 * Exported so the contract is unit-testable without a DOM.
 */
export function guardedSettlers<T>(
  signal: AbortSignal | undefined,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void
): {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  checkAborted: () => boolean;
} {
  let settled = false;
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    if (!settled) {
      settled = true;
      reject(new DOMException("Conversion aborted", "AbortError"));
    }
  };
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }
  const cleanup = () => {
    settled = true;
    signal?.removeEventListener("abort", onAbort);
  };
  return {
    resolve: (value) => {
      if (settled) return;
      cleanup();
      resolve(value);
    },
    reject: (reason) => {
      if (settled) return;
      cleanup();
      reject(reason);
    },
    checkAborted: () => {
      if (signal?.aborted) {
        onAbort();
      }
      return aborted;
    },
  };
}

// Convert Image using HTML5 Canvas
export async function convertImage(
  file: File,
  targetFormat: TargetFormat,
  options: ImageConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> {
  const tgt = targetFormat.toLowerCase();
  // Fail loudly for server-only targets instead of producing a mislabeled blob.
  if (SERVER_ONLY_IMAGE_TARGETS.has(tgt)) {
    throw new Error(`Image -> ${targetFormat} must run on the FFmpeg server`);
  }
  // Validate target is a known browser-supported format.
  if (!BROWSER_IMAGE_TARGETS.has(tgt)) {
    throw new Error(`Image -> ${targetFormat} is not supported in the browser`);
  }
  onProgress?.(10);

  return new Promise((resolve, reject) => {
    const g = guardedSettlers<{ blob: Blob; dimensions: { width: number; height: number } }>(
      abortSignal,
      resolve,
      reject
    );
    const reader = new FileReader();
    reader.onerror = () => g.reject(new Error("Failed to read image file"));
    reader.onload = () => {
      if (g.checkAborted()) return;
      onProgress?.(30);
      const img = new Image();
      img.onerror = () => g.reject(new Error("Invalid image data"));
      img.onload = () => {
        if (g.checkAborted()) return;
        onProgress?.(50);
        let width = img.width;
        let height = img.height;

        // Apply Social Media Preset dimensions if selected
        let presetDim: { w: number; h: number } | null = null;
        if (
          options.socialPreset &&
          options.socialPreset !== "custom" &&
          SOCIAL_PRESETS[options.socialPreset]
        ) {
          presetDim = SOCIAL_PRESETS[options.socialPreset];
        }

        if (presetDim) {
          // Preset target canvas dimensions
          const canvas = document.createElement("canvas");
          canvas.width = presetDim.w;
          canvas.height = presetDim.h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            g.reject(new Error("Could not get canvas 2d context"));
            return;
          }

          // Fill background
          ctx.fillStyle = options.bgColor || "#0f172a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Fit the rotated footprint so a 90°/270° rotation doesn't overflow the
          // preset canvas, then draw centered with the same transforms as the
          // custom-dimension branch (rotate + flip).
          const rotated = options.rotation === 90 || options.rotation === 270;
          const fitW = rotated ? height : width;
          const fitH = rotated ? width : height;
          const scale = Math.min(canvas.width / fitW, canvas.height / fitH);
          const drawW = width * scale;
          const drawH = height * scale;

          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((options.rotation * Math.PI) / 180);
          ctx.scale(options.flipHorizontal ? -1 : 1, options.flipVertical ? -1 : 1);
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // Grayscale filter
          if (options.grayscale) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = avg;
              data[i + 1] = avg;
              data[i + 2] = avg;
            }
            ctx.putImageData(imgData, 0, 0);
          }

          const qualityVal = (options.quality || 85) / 100;
          let mimeType = "image/jpeg";
          const tgt = targetFormat.toLowerCase();
          if (tgt === "png") mimeType = "image/png";
          else if (tgt === "webp") mimeType = "image/webp";

          if (g.checkAborted()) return;
          canvas.toBlob(
            (blob) => {
              onProgress?.(100);
              try {
                assertBlobMatches(blob, tgt);
                g.resolve({ blob: blob!, dimensions: { width: canvas.width, height: canvas.height } });
              } catch (err) {
                g.reject(err);
              }
            },
            mimeType,
            qualityVal
          );
          return;
        }

        // Scale max width/height for custom preset
        if (options.maxWidth && width > options.maxWidth) {
          if (options.maintainAspectRatio) {
            height = Math.round((height * options.maxWidth) / width);
          }
          width = options.maxWidth;
        }
        if (options.maxHeight && height > options.maxHeight) {
          if (options.maintainAspectRatio) {
            width = Math.round((width * options.maxHeight) / height);
          }
          height = options.maxHeight;
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          g.reject(new Error("Could not get canvas 2d context"));
          return;
        }

        // Handle rotation & flip canvas dimensions
        const rad = (options.rotation * Math.PI) / 180;
        const isSwapped = options.rotation === 90 || options.rotation === 270;
        canvas.width = isSwapped ? height : width;
        canvas.height = isSwapped ? width : height;

        ctx.save();
        // Background fill
        if (options.bgColor) {
          ctx.fillStyle = options.bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Transform canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.scale(options.flipHorizontal ? -1 : 1, options.flipVertical ? -1 : 1);

        // Draw image
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Apply Grayscale if requested
        if (options.grayscale) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg; // R
            data[i + 1] = avg; // G
            data[i + 2] = avg; // B
          }
          ctx.putImageData(imgData, 0, 0);
        }

        onProgress?.(80);

        // Determine target MIME type for browser-supported targets only
        let mimeType = "image/jpeg";
        const tgt = targetFormat.toLowerCase();
        if (tgt === "png") mimeType = "image/png";
        else if (tgt === "webp") mimeType = "image/webp";
        else if (tgt === "svg") mimeType = "image/svg+xml";

        // Special handling for SVG wrapper format
        if (tgt === "svg") {
          if (g.checkAborted()) return;
          const dataUrl = canvas.toDataURL("image/png");
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
            <image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}" />
          </svg>`;
          const blob = new Blob([svgString], { type: "image/svg+xml" });
          onProgress?.(100);
          g.resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
          return;
        }

        const qualityVal = (options.quality || 85) / 100;
        if (g.checkAborted()) return;
        canvas.toBlob(
          (blob) => {
            onProgress?.(100);
            try {
              assertBlobMatches(blob, tgt);
              g.resolve({ blob: blob!, dimensions: { width: canvas.width, height: canvas.height } });
            } catch (err) {
              g.reject(err);
            }
          },
          mimeType,
          qualityVal
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
