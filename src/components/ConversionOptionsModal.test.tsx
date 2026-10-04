// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ConversionOptionsModal } from "./ConversionOptionsModal";
import { ConversionItem, ImageConversionOptions } from "../types";

afterEach(cleanup);

const IMAGE_OPTS: ImageConversionOptions = {
  quality: 80,
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
    availableTargets: ["jpg"],
    status: "idle",
    progress: 0,
    options: { image: IMAGE_OPTS },
    ...overrides,
  };
}

function renderModal(item: ConversionItem) {
  const handlers = { onClose: vi.fn(), onSaveOptions: vi.fn() };
  render(
    <ConversionOptionsModal
      item={item}
      isOpen
      onClose={handlers.onClose}
      onSaveOptions={handlers.onSaveOptions}
    />
  );
  return handlers;
}

describe("ConversionOptionsModal", () => {
  it("renders a labelled dialog when open and nothing when closed", () => {
    const { rerender } = render(
      <ConversionOptionsModal item={makeItem()} isOpen={false} onClose={vi.fn()} onSaveOptions={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<ConversionOptionsModal item={makeItem()} isOpen onClose={vi.fn()} onSaveOptions={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: /Format Fine-Tuning/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("applies a social preset with its fixed dimensions and saves image options", async () => {
    const user = userEvent.setup();
    const h = renderModal(makeItem());

    await user.selectOptions(
      screen.getByDisplayValue(/Custom Aspect/i),
      screen.getByRole("option", { name: /Instagram Square/i })
    );
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));

    expect(h.onSaveOptions).toHaveBeenCalledTimes(1);
    const [, saved] = h.onSaveOptions.mock.calls[0];
    expect(saved.image).toMatchObject({
      socialPreset: "instagram-square",
      maxWidth: 1080,
      maxHeight: 1080,
    });
    expect(h.onClose).toHaveBeenCalled();
  });

  it("saves audio bitrate changes for a server-encoded audio target", async () => {
    const user = userEvent.setup();
    const h = renderModal(
      makeItem({
        category: "audio",
        name: "song.wav",
        originalExtension: "wav",
        targetFormat: "mp3",
        availableTargets: ["mp3"],
        options: {},
      })
    );

    await user.click(screen.getByRole("button", { name: /^320k$/ }));
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));

    const [, saved] = h.onSaveOptions.mock.calls[0];
    // Audio defaults apply because the item carried no audio options of its own.
    expect(saved.audio).toMatchObject({ bitrate: "320k", sampleRate: 44100, channels: 2 });
    expect(h.onClose).toHaveBeenCalled();
  });

  it("saves CSV delimiter and indentation choices for data items", async () => {
    const user = userEvent.setup();
    const h = renderModal(
      makeItem({
        category: "data",
        name: "table.json",
        originalExtension: "json",
        targetFormat: "csv",
        availableTargets: ["csv"],
        options: {},
      })
    );

    await user.click(screen.getByRole("button", { name: /Tab \(\\t\)/ }));
    await user.click(screen.getByRole("button", { name: /4 Spaces Indent/ }));
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));

    const [, saved] = h.onSaveOptions.mock.calls[0];
    expect(saved.data).toEqual({ delimiter: "\t", prettyPrint: true, indentSpaces: 4 });
  });

  it("closes without saving via Cancel", async () => {
    const user = userEvent.setup();
    const h = renderModal(makeItem());

    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(h.onClose).toHaveBeenCalled();
    expect(h.onSaveOptions).not.toHaveBeenCalled();
  });

  it("preserves untouched sibling option groups on save", async () => {
    const user = userEvent.setup();
    const h = renderModal(makeItem({ options: { image: IMAGE_OPTS, audio: undefined } }));
    // For an image item only the image group is editable; saving must not wipe
    // or invent entries for other categories beyond what handleSave defines.
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));
    const [, saved] = h.onSaveOptions.mock.calls[0];
    expect(saved.image).toMatchObject({ quality: 80, socialPreset: "custom" });
  });

  it("collects manual resize bounds, transforms and grayscale into saved image options", async () => {
    const user = userEvent.setup();
    const h = renderModal(makeItem());

    await user.type(screen.getByPlaceholderText("e.g. 1920"), "1920");
    await user.click(screen.getByRole("button", { name: /Rotate 90°/ }));
    await user.click(screen.getByRole("button", { name: "Flip Horizontal" }));
    await user.click(screen.getByRole("button", { name: "Flip Vertical" }));
    await user.click(screen.getByRole("checkbox", { name: /Convert to Grayscale/i }));
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));

    const [, saved] = h.onSaveOptions.mock.calls[0];
    expect(saved.image).toMatchObject({
      maxWidth: 1920,
      rotation: 90,
      flipHorizontal: true,
      flipVertical: true,
      grayscale: true,
    });
  });

  it("saves resolution, fps and mute choices for video items", async () => {
    const user = userEvent.setup();
    const h = renderModal(
      makeItem({
        category: "video",
        name: "clip.mp4",
        originalExtension: "mp4",
        targetFormat: "webm",
        availableTargets: ["webm"],
        options: {},
      })
    );

    await user.click(screen.getByRole("button", { name: "720p HD" }));
    await user.click(screen.getByRole("button", { name: "60 FPS" }));
    await user.click(screen.getByRole("checkbox", { name: /Mute audio track/i }));
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));

    const [, saved] = h.onSaveOptions.mock.calls[0];
    // Video defaults apply because the item carried no video options of its own.
    expect(saved.video).toMatchObject({ resolution: "720p", fps: 60, muteAudio: true });
  });

  it("exposes pressed state on the flip toggle buttons", async () => {
    const user = userEvent.setup();
    renderModal(makeItem());

    const flipHorizontal = screen.getByRole("button", { name: "Flip Horizontal" });
    const flipVertical = screen.getByRole("button", { name: "Flip Vertical" });
    expect(flipHorizontal).toHaveAttribute("aria-pressed", "false");
    expect(flipVertical).toHaveAttribute("aria-pressed", "false");

    await user.click(flipHorizontal);
    expect(flipHorizontal).toHaveAttribute("aria-pressed", "true");
    expect(flipVertical).toHaveAttribute("aria-pressed", "false");
  });

  // Registry capabilities drive the gating (src/components/optionGating.ts): a
  // control that cannot affect the selected target must not be offered.
  it("hides the bitrate control for in-browser wav, where it has no effect", async () => {
    const user = userEvent.setup();
    const h = renderModal(
      makeItem({
        category: "audio",
        name: "song.mp3",
        originalExtension: "mp3",
        targetFormat: "wav",
        availableTargets: ["wav"],
        options: {},
      })
    );

    expect(screen.queryByRole("button", { name: /^320k$/ })).not.toBeInTheDocument();
    // The knobs the Web Audio pipeline does honour stay available.
    expect(screen.getByText(/Output Gain/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Save Settings/ }));
    const [, saved] = h.onSaveOptions.mock.calls[0];
    expect(saved.audio).toMatchObject({ bitrate: "192k" });
  });

  it("hides the image quality slider for targets whose encoder ignores it", () => {
    renderModal(makeItem({ targetFormat: "svg", availableTargets: ["svg"] }));
    expect(screen.queryByText(/Image Quality \/ Compression/i)).not.toBeInTheDocument();
    // Layout controls still apply to the raster-wrapped output.
    expect(screen.getByText(/Social Media Resizer Presets/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Convert to Grayscale/i })).toBeInTheDocument();
  });

  it("keeps the quality slider for targets that honour it", () => {
    renderModal(makeItem({ targetFormat: "jpg", availableTargets: ["jpg"] }));
    expect(screen.getByText(/Image Quality \/ Compression/i)).toBeInTheDocument();
  });

  it("replaces the video geometry controls with an audio-only notice for extraction targets", () => {
    renderModal(
      makeItem({
        category: "video",
        name: "clip.mp4",
        originalExtension: "mp4",
        targetFormat: "mp3",
        availableTargets: ["mp3"],
        options: {},
      })
    );
    expect(screen.queryByText(/Target Resolution/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Target Frame Rate/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Mute audio track/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Audio-only output/i)).toBeInTheDocument();
  });
});
