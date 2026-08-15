import { Router } from "express";
import { createReadStream } from "node:fs";
import { parseUploadStream, cleanup, UploadError } from "../upload";
import { convertFile, NoAudioStreamError, UnsupportedFormatError, UnsupportedConversionError } from "../convert";
import type { ParsedUpload } from "../upload";

export const convertRouter = Router();

// Actual file conversion via local ffmpeg. Multipart: file + category + sourceFormat + targetFormat + options(JSON string)
convertRouter.post("/", async (req, res) => {
  let upload: ParsedUpload | null = null;
  const controller = new AbortController();

  // If the client disconnects mid-conversion, kill ffmpeg and stop work.
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    upload = await parseUploadStream(req);

    const { mime, result } = await convertFile(
      Buffer.alloc(0),
      {
        category: upload.category,
        targetFormat: upload.targetFormat,
        ...upload.options,
      },
      upload.filePath,
      { signal: controller.signal }
    );

    if (!result) throw new Error("No conversion result produced");
    if (controller.signal.aborted) {
      result.cleanup();
      return res.status(499).json({ error: "Client closed the connection" });
    }

    res.setHeader("Content-Type", mime);
    // Only set Content-Length when we actually know the size. If statSync failed
    // (size === 0), omitting the header lets Express use chunked transfer encoding
    // instead of telling the client the body is empty.
    if (result.size > 0) {
      res.setHeader("Content-Length", String(result.size));
    }
    res.setHeader("Content-Disposition", `attachment; filename="converted.${upload.targetFormat}"`);

    // Stream the on-disk ffmpeg output straight to the client — never buffer it in RAM.
    const stream = createReadStream(result.outPath);
    stream.pipe(res);
    stream.on("close", () => result.cleanup());
    stream.on("error", () => {
      result.cleanup();
      if (!res.headersSent) res.status(500).json({ error: "Failed to stream conversion output" });
      res.end();
    });
  } catch (err: unknown) {
    if (controller.signal.aborted) return; // client already gone; nothing to send
    const message = err instanceof Error ? err.message : "Conversion failed";
    if (err instanceof UploadError) {
      return res.status(err.status).json({ error: message });
    }
    const isClientError =
      err instanceof UnsupportedFormatError ||
      err instanceof UnsupportedConversionError ||
      err instanceof NoAudioStreamError;
    res.status(isClientError ? 400 : 500).json({ error: message });
  } finally {
    if (upload) cleanup(upload.tempDir, upload.filePath);
  }
});
