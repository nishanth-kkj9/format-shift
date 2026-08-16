import { Router } from "express";
import { createReadStream } from "node:fs";
import { parseUploadStream, cleanup, UploadError } from "../upload";
import { convertFile, NoAudioStreamError, UnsupportedFormatError, UnsupportedConversionError, InvalidOptionError } from "../convert";
import { ServerBusyError } from "../ffmpeg/runner";
import type { ParsedUpload } from "../upload";
import { planConversion, CONVERSION_REGISTRY } from "../../src/core/conversionRegistry";
import { randomUUID } from "node:crypto";

// Simple structured logger for conversion errors.
function logError(context: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    level: 'error',
    ...context,
  };
  // Console output is structured JSON for log aggregation.
  console.error(JSON.stringify(entry));
}

export const convertRouter = Router();

// Actual file conversion via local ffmpeg. Multipart: file + category + sourceFormat + targetFormat + options(JSON string)
convertRouter.post("/", async (req, res) => {
  const requestId = randomUUID();
  const startTime = Date.now();
  let upload: ParsedUpload | null = null;
  const controller = new AbortController();

  // If the client disconnects mid-conversion, kill ffmpeg and stop work.
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    upload = await parseUploadStream(req);

    // Authoritative server-side validation of category, source format, and target format.
    // Do not trust client-provided metadata.
    const category = upload.category.toLowerCase();
    const registryCategory = category as keyof typeof CONVERSION_REGISTRY;
    if (!CONVERSION_REGISTRY[registryCategory]) {
      throw new UnsupportedConversionError(category, upload.targetFormat);
    }

    const targetFormat = upload.targetFormat.toLowerCase();
    const plan = planConversion(registryCategory, targetFormat);
    if (plan.supported === false) {
      throw new UnsupportedConversionError(category, targetFormat);
    }

    // Validate source format resolved from magic bytes / mime / filename against
    // the registry. Client-provided sourceFormat is ignored. When the source is
    // genuinely unknown (no magic bytes, unhelpful mime, no extension) we let it
    // through — ffmpeg probes the input itself.
    const sourceFormat = upload.sourceFormat.toLowerCase();
    const spec = CONVERSION_REGISTRY[registryCategory];
    if (sourceFormat && !spec.sourceFormats.includes(sourceFormat)) {
      throw new UnsupportedConversionError(category, targetFormat);
    }

    // Validate options against allowed keys for this category/target
    const validatedOpts = { ...upload.options };
    // Options validation happens in convertFile -> validateOptions

    const { mime, result } = await convertFile(
      Buffer.alloc(0),
      {
        category: upload.category,
        targetFormat: upload.targetFormat,
        ...validatedOpts,
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
    const durationMs = Date.now() - startTime;
    
    // Structured error logging with request context.
    logError({
      requestId,
      category: upload?.category,
      sourceFormat: upload?.sourceFormat,
      targetFormat: upload?.targetFormat,
      inputSize: upload?.size,
      errorType: err?.constructor?.name,
      httpStatus: err instanceof UploadError ? err.status :
                  err instanceof ServerBusyError ? 503 :
                  err instanceof InvalidOptionError ? 400 :
                  err instanceof UnsupportedFormatError ||
                  err instanceof UnsupportedConversionError ||
                  err instanceof NoAudioStreamError ? 400 : 500,
      durationMs,
    });
    
    if (err instanceof UploadError) {
      return res.status(err.status).json({ error: message });
    }
    if (err instanceof ServerBusyError) {
      return res.status(503).json({ error: message });
    }
    const isClientError =
      err instanceof UnsupportedFormatError ||
      err instanceof UnsupportedConversionError ||
      err instanceof NoAudioStreamError ||
      err instanceof InvalidOptionError;
    res.status(isClientError ? 400 : 500).json({ error: message });
  } finally {
    if (upload) cleanup(upload.tempDir, upload.filePath);
  }
});
