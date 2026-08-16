import { describe, it, expect } from "vitest";
import { ZIP_MAX_TOTAL_BYTES, zipBatchOverLimit } from "./zipPolicy";

describe("zipBatchOverLimit", () => {
  it("allows an empty batch", () => {
    expect(zipBatchOverLimit([])).toBe(false);
  });

  it("allows a batch exactly at the limit", () => {
    expect(zipBatchOverLimit([ZIP_MAX_TOTAL_BYTES])).toBe(false);
  });

  it("allows a batch under the limit", () => {
    expect(zipBatchOverLimit([100, 200, 300])).toBe(false);
  });

  it("rejects a batch over the limit", () => {
    expect(zipBatchOverLimit([ZIP_MAX_TOTAL_BYTES + 1])).toBe(true);
    expect(zipBatchOverLimit([ZIP_MAX_TOTAL_BYTES / 2, ZIP_MAX_TOTAL_BYTES / 2 + 1])).toBe(true);
  });
});
