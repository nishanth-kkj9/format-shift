import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./ffmpeg/runner", () => ({
  runFFmpeg: vi.fn(),
}));

import {
  convertFile,
  UnsupportedConversionError,
  NoAudioStreamError,
  UnsupportedFormatError,
} from "./convert";
import { runFFmpeg } from "./ffmpeg/runner";

const mockRunFFmpeg = vi.mocked(runFFmpeg);

const fakeResult = { outPath: "/tmp/fs-/output.bin", size: 10, tempDir: "/tmp/fs-", cleanup: vi.fn() };

describe("convertFile", () => {
  afterEach(() => vi.clearAllMocks());

  it("runs the image pipeline for image targets and returns the plan mime", async () => {
    mockRunFFmpeg.mockResolvedValue(fakeResult);
    const { mime, data } = await convertFile({
      targetFormat: "jpg",
      category: "image",
    });
    expect(mime).toBe("image/jpeg");
    expect(data.length).toBe(0);
    expect(mockRunFFmpeg).toHaveBeenCalledTimes(1);
  });

  it("runs the audio pipeline for audio targets", async () => {
    mockRunFFmpeg.mockResolvedValue(fakeResult);
    const { mime } = await convertFile({
      targetFormat: "wav",
      category: "audio",
    });
    expect(mime).toBe("audio/wav");
  });

  it("runs the video pipeline for video targets", async () => {
    mockRunFFmpeg.mockResolvedValue(fakeResult);
    const { mime } = await convertFile({
      targetFormat: "mov",
      category: "video",
      resolution: "original",
    });
    expect(mime).toBe("video/quicktime");
  });

  it("maps an audio-stream-less failure to NoAudioStreamError", async () => {
    mockRunFFmpeg.mockRejectedValue(new Error("does not contain any stream"));
    await expect(convertFile({ targetFormat: "mp3", category: "audio" })).rejects.toBeInstanceOf(
      NoAudioStreamError
    );
  });

  it("rejects svg as browser-only even though it is registered", async () => {
    await expect(convertFile({ targetFormat: "svg", category: "image" })).rejects.toBeInstanceOf(
      UnsupportedConversionError
    );
    expect(mockRunFFmpeg).not.toHaveBeenCalled();
  });

  it("rejects a conversion the registry does not support", async () => {
    await expect(convertFile({ targetFormat: "pdf", category: "image" })).rejects.toBeInstanceOf(
      UnsupportedConversionError
    );
  });

  it("rejects a registered-but-browser-only category/target pair", async () => {
    // data/json is a real registered target, but the server has no pipeline for
    // it — convertFile must refuse rather than hand garbage to ffmpeg.
    await expect(convertFile({ targetFormat: "json", category: "data" })).rejects.toBeInstanceOf(
      UnsupportedConversionError
    );
    expect(mockRunFFmpeg).not.toHaveBeenCalled();
  });
});

describe("error classes", () => {
  it("UnsupportedFormatError carries its name", () => {
    const err = new UnsupportedFormatError("xyz");
    expect(err.name).toBe("UnsupportedFormatError");
    expect(err.message).toContain("xyz");
  });
});
