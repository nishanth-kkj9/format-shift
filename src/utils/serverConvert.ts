import { ConversionOptions } from "../types";
import {
  FileCategory,
  needsServerEngine,
  planConversion,
  SERVER_OPTION_KEYS,
} from "../core/conversionRegistry";

export { needsServerEngine };

function serverOptions(
  options: ConversionOptions,
  categoryKey: keyof ConversionOptions
): Record<string, unknown> {
  const source = (options[categoryKey] || {}) as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of SERVER_OPTION_KEYS) {
    const value = source[key];
    if (value !== undefined) filtered[key] = value;
  }
  return filtered;
}

/** Client-side router: should this category+target go to the ffmpeg backend? */
export function needsServerConversion(category: string, targetFormat: string): boolean {
  return needsServerEngine(category as FileCategory, targetFormat);
}

/** Validate a conversion plan up front so we never hit the network for fake ops. */
export function assertSupportedConversion(
  category: string,
  targetFormat: string,
  sourceFormat?: string
): void {
  const plan = planConversion(category as FileCategory, targetFormat, sourceFormat);
  if (plan.supported === false) throw new Error(plan.reason);
}

export interface ServerConversionHooks {
  /** input duration; enables real ffmpeg progress instead of a static bar */
  durationSeconds?: number | undefined;
  /** called with 0-99 while ffmpeg encodes */
  onProgress?: ((percent: number) => void) | undefined;
}

function progressChannelId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function convertServerSide(
  file: File,
  category: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConversionOptions,
  abortSignal?: AbortSignal,
  hooks: ServerConversionHooks = {}
): Promise<Blob> {
  assertSupportedConversion(category, targetFormat, sourceFormat);

  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  form.append("sourceFormat", sourceFormat);
  form.append("targetFormat", targetFormat);
  const categoryKey = category as keyof ConversionOptions;
  form.append("options", JSON.stringify(serverOptions(options, categoryKey)));
  if (hooks.durationSeconds && hooks.durationSeconds > 0) {
    form.append("durationSeconds", String(hooks.durationSeconds));
  }

  const progressId = progressChannelId();
  const events =
    hooks.onProgress && typeof EventSource !== "undefined"
      ? new EventSource(`/api/convert/progress/${progressId}`)
      : null;
  if (events && hooks.onProgress) {
    events.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { progress?: unknown };
        if (typeof parsed.progress === "number") hooks.onProgress?.(parsed.progress);
      } catch {
        // ignore malformed progress frames; conversion result is what matters
      }
    };
  }

  try {
    // Send category in header so server can enforce category-specific limits during streaming
    const res = await fetch(`/api/convert?category=${encodeURIComponent(category)}`, {
      method: "POST",
      body: form,
      signal: abortSignal ?? null,
      headers: {
        "x-category": category,
        "x-progress-id": progressId,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Server conversion failed (${res.status})`);
    }
    return await res.blob();
  } finally {
    events?.close();
  }
}
