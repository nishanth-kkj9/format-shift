import { describe, it, expect, vi, afterEach } from "vitest";
import { needsServerConversion, assertSupportedConversion, convertServerSide } from "./serverConvert";

describe("needsServerConversion", () => {
  it("routes server-engine targets to the backend", () => {
    expect(needsServerConversion("audio", "mp3")).toBe(true);
    expect(needsServerConversion("video", "mp4")).toBe(true);
  });

  it("keeps browser-engine targets client-side", () => {
    expect(needsServerConversion("image", "png")).toBe(false);
    expect(needsServerConversion("data", "csv")).toBe(false);
  });

  it("treats unknown categories/formats as non-server conversions", () => {
    // Unknown keys miss the registry lookup, so they are not routed to ffmpeg.
    expect(needsServerConversion("mystery", "xyz")).toBe(false);
  });
});

describe("assertSupportedConversion", () => {
  it("throws for unsupported conversions with a reason", () => {
    expect(() => assertSupportedConversion("image", "mp3")).toThrow();
  });

  it("accepts supported conversions", () => {
    expect(() => assertSupportedConversion("audio", "mp3")).not.toThrow();
  });

  it("rejects conversions excluded for the specific source format", () => {
    expect(() => assertSupportedConversion("document", "md", "html")).toThrow();
    expect(() => assertSupportedConversion("document", "md", "htm")).toThrow();
    expect(() => assertSupportedConversion("document", "md", "txt")).not.toThrow();
  });
});

describe("convertServerSide", () => {
  const file = { name: "song.mp3", type: "audio/mpeg" } as File;

  afterEach(() => vi.unstubAllGlobals());

  it("throws before hitting the network for unsupported conversions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(convertServerSide(file, "image", "png", "mp3", {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a multipart form and returns the response blob", async () => {
    const blob = new Blob(["data"]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await convertServerSide(file, "audio", "mp3", "wav", {
      audio: { bitrate: "192k", sampleRate: 44100, channels: 2, volume: 100 },
    });
    expect(result).toBe(blob);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/convert?category=audio");
    expect(init.method).toBe("POST");
    expect(init.headers["x-category"]).toBe("audio");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("strips client-only option keys the server's strict schema rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
    vi.stubGlobal("fetch", fetchMock);

    await convertServerSide(file, "audio", "mp3", "wav", {
      audio: {
        bitrate: "192k",
        volume: 100,
        sampleRate: 44100,
        channels: 2,
        spectrumVisualizer: true,
        spectrumStyle: "bars",
      },
    });

    const init = fetchMock.mock.calls[0][1];
    const options = JSON.parse((init.body as FormData).get("options") as string);
    expect(options).toEqual({ bitrate: "192k", volume: 100, sampleRate: 44100, channels: 2 });
  });

  it("surfaces server error messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: "bad option" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(convertServerSide(file, "audio", "mp3", "wav", {})).rejects.toThrow("bad option");
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.reject() });
    vi.stubGlobal("fetch", fetchMock);

    await expect(convertServerSide(file, "audio", "mp3", "wav", {})).rejects.toThrow(
      "Server conversion failed (503)"
    );
  });
});
