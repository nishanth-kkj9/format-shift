import { Router } from "express";
import { parseUploadStream, cleanup, UploadError } from "../upload";
import { convertFile, NoAudioStreamError, UnsupportedFormatError, UnsupportedConversionError } from "../convert";
import type { ParsedUpload } from "../upload";

export const convertRouter = Router();

// Actual file conversion via local ffmpeg. Multipart: file + category + sourceFormat + targetFormat + options(JSON string)
convertRouter.post("/", async (req, res) => {
  let upload: ParsedUpload | null = null;
  try {
    upload = await parseUploadStream(req);

    const { data, mime } = await convertFile(Buffer.alloc(0), {
      category: upload.category,
      targetFormat: upload.targetFormat,
      ...upload.options,
    }, upload.filePath);

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="converted.${upload.targetFormat}"`);
    res.send(data);
  } catch (err: unknown) {
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
