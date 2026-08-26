// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { FileList } from "./FileList";
import { ConversionItem, ImageConversionOptions, TargetFormat } from "../types";

afterEach(cleanup);

export const BASE_IMAGE_OPTS: ImageConversionOptions = {
  quality: 85,
  maintainAspectRatio: true,
  bgColor: "#0f172a",
  grayscale: false,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  socialPreset: "custom",
};

function makeItem(overrides: Partial<ConversionItem> = {}): ConversionItem {
  return {
    id: "item-1",
    file: new File([new Uint8Array([1])], "photo.png", { type: "image/png" }),
    name: "photo.png",
    originalSize: 2048,
    originalExtension: "png",
    category: "image",
    targetFormat: "jpg",
    availableTargets: ["jpg", "png", "webp"] as TargetFormat[],
    status: "idle",
    progress: 0,
    options: {},
    ...overrides,
  };
}

function renderList(items: ConversionItem[]) {
  const handlers = {
    onTargetFormatChange: vi.fn(),
    onOpenOptions: vi.fn(),
    onConvertSingle: vi.fn(),
    onCancelConversion: vi.fn(),
    onPreview: vi.fn(),
    onDownload: vi.fn(),
    onRemove: vi.fn(),
  };
  render(<FileList items={items} {...handlers} />);
  return handlers;
}

describe("FileList", () => {
  it("renders nothing when the queue is empty", () => {
    renderList([]);
    expect(screen.queryByText("Conversion Queue")).not.toBeInTheDocument();
  });

  it("renders an idle item with its filename and working Convert / Remove actions", async () => {
    const user = userEvent.setup();
    const h = renderList([makeItem()]);

    expect(screen.getByText("Conversion Queue")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Convert$/ }));
    expect(h.onConvertSingle).toHaveBeenCalledWith("item-1");

    await user.click(screen.getByRole("button", { name: "Remove from Queue" }));
    expect(h.onRemove).toHaveBeenCalledWith("item-1");

    await user.click(screen.getByRole("button", { name: "Adjust Quality & Fine-Tuning Options" }));
    expect(h.onOpenOptions).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
  });

  it("shows live progress and offers cancel while converting", async () => {
    const user = userEvent.setup();
    const h = renderList([makeItem({ status: "converting", progress: 42 })]);

    expect(screen.getAllByText("42%").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Convert$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel Conversion" }));
    expect(h.onCancelConversion).toHaveBeenCalledWith("item-1");
  });

  it("offers Preview and Save actions once conversion completed", async () => {
    const user = userEvent.setup();
    const item = makeItem({ status: "completed", convertedSize: 1024 });
    const h = renderList([item]);

    expect(screen.getByText(/Saved 50%/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview Before / After Quality" }));
    expect(h.onPreview).toHaveBeenCalledWith(item);

    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(h.onDownload).toHaveBeenCalledWith(item);
  });

  it("surfaces the error message for failed conversions", () => {
    renderList([makeItem({ status: "error", errorMessage: "Server exploded" })]);
    expect(screen.getByText(/Server exploded/)).toBeInTheDocument();
  });

  it("changes the target format via the embedded dropdown", async () => {
    const user = userEvent.setup();
    const h = renderList([makeItem()]);

    await user.click(screen.getByRole("button", { name: /choose output format, currently jpg/i }));
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /PNG/i }));

    expect(h.onTargetFormatChange).toHaveBeenCalledWith("item-1", "png");
  });

  // Regression guard for UX-A11Y-01: icon-only controls must keep an accessible
  // name that does not depend on the (unreliable) title attribute alone.
  it("keeps accessible names on every icon-only control across all states", () => {
    renderList([
      makeItem({ id: "idle-1", status: "idle" }),
      makeItem({ id: "busy-1", status: "converting", progress: 10 }),
      makeItem({ id: "done-1", name: "done.png", status: "completed", convertedSize: 10 }),
    ]);

    for (const [name, count] of [
      ["Adjust Quality & Fine-Tuning Options", 3],
      ["Remove from Queue", 3],
      ["Cancel Conversion", 1],
      ["Preview Before / After Quality", 1],
    ] as const) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(count);
    }
  });

  it("renders the correct category badge for every non-image category", () => {
    const categories = [
      { category: "audio", targetFormat: "wav" },
      { category: "video", targetFormat: "mp4" },
      { category: "data", targetFormat: "csv" },
      { category: "document", targetFormat: "txt" },
    ] as const;
    renderList(
      categories.map(({ category, targetFormat }, i) =>
        makeItem({
          id: `cat-${i}`,
          name: `file-${i}.bin`,
          category,
          originalExtension: "bin",
          targetFormat,
          availableTargets: [targetFormat],
        })
      )
    );
    for (const { category } of categories) {
      expect(screen.getByText(category.toUpperCase())).toBeInTheDocument();
    }
  });

  it("shows the thumbnail image when a preview URL is available", () => {
    renderList([makeItem({ previewUrl: "blob:preview" })]);
    expect(screen.getByRole("img", { name: "photo.png" })).toHaveAttribute("src", "blob:preview");
  });

  it("advances the dynamic status message through the progress tiers", () => {
    renderList([
      makeItem({ id: "tier-1", status: "converting", progress: 10 }),
      makeItem({ id: "tier-2", status: "converting", progress: 60 }),
      makeItem({ id: "tier-3", status: "converting", progress: 95 }),
    ]);
    expect(screen.getByText("Reading file stream & decoding...")).toBeInTheDocument();
    expect(screen.getByText("Encoding into target format stream...")).toBeInTheDocument();
    expect(screen.getByText("Finalizing file buffer & optimizing size...")).toBeInTheDocument();
  });

  it("falls back to a generic message when a failure carries no detail", () => {
    renderList([makeItem({ status: "error" })]);
    expect(screen.getByText(/Conversion failed/)).toBeInTheDocument();
  });

  it("locks the target dropdown to the preset format while a social preset is active", () => {
    renderList([makeItem({ options: { image: { ...BASE_IMAGE_OPTS, socialPreset: "instagram-square" } } })]);
    expect(screen.getByRole("button", { name: /choose output format, currently jpg/i })).toBeDisabled();
  });
});
