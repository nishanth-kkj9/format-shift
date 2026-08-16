import { describe, it, expect } from "vitest";
import { FORMAT_META } from "./formatMeta";

describe("FORMAT_META svg honesty", () => {
  const svg = FORMAT_META.image.svg;

  it("does not claim svg is vector or scalable", () => {
    const all = `${svg.label} ${svg.badge} ${svg.description}`.toLowerCase();
    expect(all).not.toMatch(/vector/);
    expect(all).not.toMatch(/scalable/);
  });

  it("describes svg as a raster wrapper", () => {
    const all = `${svg.label} ${svg.badge} ${svg.description}`.toLowerCase();
    expect(all).toMatch(/raster/);
    expect(all).toMatch(/wrapper|embed/);
  });
});
