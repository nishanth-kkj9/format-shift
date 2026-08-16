/** Cap on total uncompressed bytes JSZip will pack in one batch download. */
export const ZIP_MAX_TOTAL_BYTES = 400 * 1024 * 1024;

/**
 * True when zipping `sizes` would exceed ZIP_MAX_TOTAL_BYTES. JSZip holds the
 * full uncompressed data in memory to build the archive, so an oversized batch
 * can OOM the tab — refuse before materializing any blobs.
 */
export function zipBatchOverLimit(sizes: number[]): boolean {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return total > ZIP_MAX_TOTAL_BYTES;
}
