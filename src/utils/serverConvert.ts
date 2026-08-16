import { ConversionOptions } from '../types';
import { FileCategory, needsServerEngine, planConversion } from '../core/conversionRegistry';

export { needsServerEngine };

/** Client-side router: should this category+target go to the ffmpeg backend? */
export function needsServerConversion(category: string, targetFormat: string): boolean {
  return needsServerEngine(category as FileCategory, targetFormat);
}

/** Validate a conversion plan up front so we never hit the network for fake ops. */
export function assertSupportedConversion(category: string, targetFormat: string): void {
  const plan = planConversion(category as FileCategory, targetFormat);
  if (plan.supported === false) throw new Error(plan.reason);

}

export async function convertServerSide(
  file: File,
  category: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConversionOptions,
  abortSignal?: AbortSignal
): Promise<Blob> {
  assertSupportedConversion(category, targetFormat);

  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('sourceFormat', sourceFormat);
  form.append('targetFormat', targetFormat);
  const categoryKey = category as keyof ConversionOptions;
  form.append('options', JSON.stringify(options[categoryKey] || {}));

  // Send category in header so server can enforce category-specific limits during streaming
  const res = await fetch(`/api/convert?category=${encodeURIComponent(category)}`, {
    method: 'POST',
    body: form,
    signal: abortSignal,
    headers: {
      'x-category': category,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Server conversion failed (${res.status})`);
  }
  return res.blob();
}
