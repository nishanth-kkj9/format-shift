import type { ConvertOptions } from "../convert";

/** Build `-vf` + quality args for image conversions. */
export function imageFilters(opts: ConvertOptions): string[] {
  const filters: string[] = [];
  const q = opts.quality ?? 90;

  // Crop first, then everything else, so the result matches the client canvas
  // pipeline (crop -> adjust -> rotate -> scale).
  if (opts.cropWidth && opts.cropHeight && (opts.cropWidth < 100 || opts.cropHeight < 100)) {
    const x = opts.cropX ?? 0;
    const y = opts.cropY ?? 0;
    // ponytail: percent crop, no pixel-perfect box UI. Swap to a draggable
    // overlay if users need exact framing.
    filters.push(`crop=iw*${opts.cropWidth / 100}:ih*${opts.cropHeight / 100}:iw*${x / 100}:ih*${y / 100}`);
  }
  if (opts.grayscale) filters.push("format=gray");
  // Brightness must multiply like CSS `brightness()`, so use a channel mixer
  // (eq's brightness is additive and would not match the client canvas).
  if (opts.brightness) {
    const k = 1 + opts.brightness / 100;
    filters.push(`colorchannelmixer=rr=${k}:gg=${k}:bb=${k}`);
  }
  if (opts.contrast || opts.saturation) {
    const contrast = 1 + (opts.contrast ?? 0) / 100;
    const saturation = 1 + (opts.saturation ?? 0) / 100;
    filters.push(`eq=contrast=${contrast}:saturation=${saturation}`);
  }
  if (opts.rotation) {
    // transpose: 1 = 90° clockwise, 2 = 90° counter-clockwise (270° CW).
    // 180° is two axis flips (a single transpose can only do 90°).
    if (opts.rotation === 180) {
      filters.push("hflip", "vflip");
    } else {
      const t = opts.rotation === 90 ? "1" : "2";
      filters.push(`transpose=${t}`);
    }
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
    filters.push("split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5");
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
  // Every image target except GIF can hold exactly one frame, and the bmp/ico/
  // image2 muxers abort ("Conversion failed!") when an animated GIF source keeps
  // feeding them frames — so an animated source is pinned to its first frame.
  // GIF output keeps all frames.
  const frameArgs = tgt === "gif" ? [] : ["-frames:v", "1"];
  const outFmt =
    tgt === "gif"
      ? ["-f", "gif"]
      : tgt === "ico"
        ? ["-f", "ico"]
        : tgt === "jpg"
          ? ["-f", "mjpeg"]
          : ["-f", "image2"];
  return [...imageFilters(opts), ...frameArgs, ...codecArgs, ...outFmt];
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
