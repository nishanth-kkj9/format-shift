import type { ConvertOptions } from "../convert";

/** Build `-vf` + quality args for image conversions. */
export function imageFilters(opts: ConvertOptions): string[] {
  const filters: string[] = [];
  const q = opts.quality ?? 90;

  if (opts.grayscale) filters.push("format=gray");
  if (opts.rotation) {
    // transpose filters: 0=90cw, 1=90ccw, 2=180
    const t = opts.rotation === 90 ? "0" : opts.rotation === 270 ? "1" : "2";
    filters.push(`transpose=${t}`);
  }
  if (opts.maxWidth || opts.maxHeight) {
    const w = opts.maxWidth ? String(opts.maxWidth) : "-2";
    const h = opts.maxHeight ? String(opts.maxHeight) : "-2";
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
  }
  if (opts.targetFormat === "ico") filters.push("scale=32:32:force_original_aspect_ratio=decrease");
  if (opts.targetFormat === "gif") {
    // Single-pass palette generation: split the (already scaled) stream, derive
    // a palette from one branch and apply it to the other. Avoids the muxer's
    // default 256-color per-frame quantization, which banding/dithers badly.
    filters.push(
      "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"
    );
  }

  const args: string[] = [];
  if (filters.length) args.push("-vf", filters.join(","));

  // mjpeg quality: qscale 2-31 (lower=better). convert 0-100 -> 31..2
  if (["jpg", "jpeg"].includes(opts.targetFormat)) {
    const qscale = Math.round(31 - (q / 100) * 29);
    args.push("-q:v", String(qscale));
  } else if (opts.targetFormat === "webp") {
    args.push("-quality", String(q));
  } else if (opts.targetFormat === "avif") {
    args.push("-crf", String(Math.round(32 - (q / 100) * 24)));
  }

  return args;
}

/** Full ffmpeg args for an image conversion. */
export function imageArgs(opts: ConvertOptions): string[] {
  const tgt = opts.targetFormat.toLowerCase();
  // Explicit codec + image2 muxer: the runner writes to a seekable temp file, so
  // `-f png`/`-f webp` (stdout-only single-frame muxers) are unusable. Without a
  // codec, image2 defaults to mjpeg when the output path has no extension.
  const codec = imageCodec(tgt);
  const codecArgs = codec ? ["-c:v", codec] : [];
  const outFmt =
    tgt === "gif"
      ? ["-f", "gif"]
      : tgt === "ico"
        ? ["-f", "ico"]
        : tgt === "jpg"
          ? ["-f", "mjpeg"]
          : ["-f", "image2"];
  return [...imageFilters(opts), ...codecArgs, ...outFmt];
}

/** Image encoder name per target (null = leave to the muxer's default). */
function imageCodec(tgt: string): string | null {
  switch (tgt) {
    case "jpg":
    case "jpeg":
      return "mjpeg";
    case "png":
      return "png";
    case "webp":
      return "libwebp";
    case "bmp":
      return "bmp";
    case "avif":
      return "libaom-av1";
    case "ico":
      return "bmp";
    default:
      return null;
  }
}
