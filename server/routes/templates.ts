import { Router, json } from "express";
import {
  planConversion,
  getAvailableTargetsForSource,
  CONVERSION_REGISTRY,
} from "../../src/core/conversionRegistry";
import type { FileCategory } from "../../src/core/conversionRegistry";
import { VIDEO_CODECS } from "../ffmpeg/video";
import { AUDIO_CODECS } from "../ffmpeg/audio";

export const templatesRouter = Router();

// /api/code-template only needs category/sourceFormat/targetFormat. Scope the
// body parser to this route with a small limit so oversized template requests
// are rejected (413) during parsing, before the handler runs, instead of being
// buffered by a global 50mb JSON parser.
templatesRouter.use(json({ limit: "10kb" }));

// Code generator endpoint for Python & Node.js code snippets.
// Allowed targets are derived from the shared conversion registry, so the API
// can only ever advertise conversions the app genuinely supports.
templatesRouter.post("/", (req, res) => {
  const { category, sourceFormat, targetFormat } = req.body || {};

  const cat = (category || "image").toLowerCase() as FileCategory;
  const src = (sourceFormat || "png").toLowerCase();
  const tgt = (targetFormat || "jpg").toLowerCase();

  if (!CONVERSION_REGISTRY[cat]) {
    return res.status(400).json({ error: `Unknown category: ${cat}` });
  }
  if (!CONVERSION_REGISTRY[cat].sourceFormats.includes(src)) {
    return res.status(400).json({ error: `Unsupported source format: ${src} for ${cat}` });
  }
  const plan = planConversion(cat, tgt);
  if (plan.supported === false) {
    return res.status(400).json({ error: plan.reason });
  }
  // Source-aware honesty: reject a target the source genuinely cannot be
  // converted to (e.g. HTML -> Markdown), even if it exists in the category.
  if (!getAvailableTargetsForSource(cat, src).includes(tgt)) {
    return res.status(400).json({ error: `${src} -> ${tgt} is not a supported conversion for ${cat}` });
  }

  const engine = plan.target.engine;

  // Every snippet is a starting point, not a turnkey script — say so instead
  // of presenting illustrative code as authoritative.
  const pythonCode =
    `# Illustrative example — adapt paths and codecs to your pipeline.\n` +
    buildPython(cat, src, tgt, engine);
  const nodeCode =
    `// Illustrative example — adapt paths and codecs to your pipeline.\n` + buildNode(cat, src, tgt, engine);
  const htmlCode =
    `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->\n` +
    buildHtml(cat, src, tgt, engine);

  return res.json({
    category: cat,
    sourceFormat: src,
    targetFormat: tgt,
    engine,
    code: { python: pythonCode, node: nodeCode, html: htmlCode },
  });
});

function buildPython(cat: FileCategory, src: string, tgt: string, engine: string): string {
  if (engine === "server") {
    if (cat === "video") {
      // Use the same codecs the API's own ffmpeg pipeline uses for this target.
      const codec = AUDIO_CODECS[tgt];
      const args =
        tgt === "gif"
          ? ["-vf", "fps=10,scale=320:-1"]
          : codec
            ? ["-vn", "-c:a", codec]
            : [...VIDEO_CODECS[tgt]!];
      const argv = JSON.stringify(["ffmpeg", "-i", "input_path", ...args, "output_path"]);
      return `# Python Code (ffmpeg)
import subprocess

def convert_video(input_path, output_path):
    subprocess.run(${argv}, check=True)

convert_video("input.${src}", "output.${tgt}")`;
    }
    return `# Python Code (ffmpeg)
import subprocess

def convert_media(input_path, output_path):
    subprocess.run(["ffmpeg", "-i", input_path, "-y", output_path], check=True)

convert_media("input.${src}", "output.${tgt}")`;
  }

  if (cat === "image") {
    return `# Python Code (PIL / Pillow)
from PIL import Image

def convert_image(input_path, output_path, quality=90):
    img = Image.open(input_path)
    if "${tgt}" in ["jpg", "jpeg"] and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(output_path, format="${tgt.toUpperCase()}", quality=quality)
    print(f"Converted {input_path} to {output_path}")

convert_image("input.${src}", "output.${tgt}")`;
  }

  if (cat === "audio") {
    return `# Python Code (pydub + ffmpeg)
from pydub import AudioSegment

def convert_audio(input_file, output_file, bitrate="192k"):
    sound = AudioSegment.from_file(input_file, format="${src}")
    sound.export(output_file, format="${tgt}", bitrate=bitrate)
    print("Audio converted successfully")

convert_audio("input.${src}", "output.${tgt}")`;
  }

  if (cat === "data") {
    if (tgt === "csv" || tgt === "tsv") {
      const delimiter = tgt === "tsv" ? "\\t" : ",";
      // Source-aware parsing: JSON sources are parsed with json.load, while
      // CSV/TSV sources are read with the csv module using the correct
      // delimiter. This keeps the generated example consistent with the
      // selected source format instead of always assuming JSON.
      if (src === "json") {
        return `# Python Code (csv module)
import json
import csv

with open("input.${src}") as f:
    data = json.load(f)

with open("output.${tgt}", "w", newline="") as f:
    writer = csv.writer(f, delimiter="${delimiter}")
    if isinstance(data, list) and data:
        writer.writerow(data[0].keys())
        for row in data:
            writer.writerow(row.values())
    else:
        writer.writerow(data)`;
      }
      if (src === "csv" || src === "tsv") {
        const srcDelimiter = src === "tsv" ? "\\t" : ",";
        return `# Python Code (csv module)
import csv

with open("input.${src}", newline="") as f:
    reader = csv.reader(f, delimiter="${srcDelimiter}")
    rows = list(reader)

with open("output.${tgt}", "w", newline="") as f:
    writer = csv.writer(f, delimiter="${delimiter}")
    writer.writerows(rows)`;
      }
      return `# Python Code (illustrative example)
# No single standard mapping for ${src} -> ${tgt}; adapt to your schema.`;
    }
    if (tgt === "json" && (src === "csv" || src === "tsv")) {
      // JSON target from a CSV/TSV source: read rows with the csv module and
      // serialize them to JSON — never json.load on a non-JSON source.
      const srcDelimiter = src === "tsv" ? "\\t" : ",";
      return `# Python Code (csv + json modules)
import csv
import json

with open("input.${src}", newline="") as f:
    reader = csv.reader(f, delimiter="${srcDelimiter}")
    rows = list(reader)

with open("output.json", "w") as f:
    json.dump(rows, f, indent=2)`;
    }
    return `# Python Code (illustrative example)
# No single standard mapping for ${src} -> ${tgt}; adapt to your schema.`;
  }

  return `# Python Code (illustrative example)
# No single standard recipe for ${cat} ${src} -> ${tgt}; adapt to your pipeline.`;
}

function buildNode(cat: FileCategory, src: string, tgt: string, engine: string): string {
  if (engine === "server") {
    return `// Node.js Code (fluent-ffmpeg)
import ffmpeg from 'fluent-ffmpeg';

ffmpeg('input.${src}')
  .output('output.${tgt}')
  .on('end', () => console.log('Conversion finished'))
  .on('error', (err) => console.error('Error:', err))
  .run();`;
  }

  if (cat === "image") {
    return `// Node.js Code (Sharp library)
import sharp from 'sharp';

async function convertImage() {
  await sharp('input.${src}')
    .${tgt === "jpg" || tgt === "jpeg" ? "jpeg({ quality: 90 })" : tgt === "webp" ? "webp({ quality: 85 })" : tgt === "png" ? "png({ compressionLevel: 9 })" : tgt + "()"}
    .toFile('output.${tgt}');
  console.log('Conversion completed successfully');
}

convertImage();`;
  }

  if (cat === "data") {
    if (src === "csv" || src === "tsv") {
      const delimiter = src === "tsv" ? "\\t" : ",";
      return `// Node.js Code (fs + csv conversion)
import fs from 'fs';

const text = fs.readFileSync('input.${src}', 'utf8');
const rows = text.trim().split(/\\r?\\n/).map((line) => line.split('${delimiter}'));
console.log(JSON.stringify(rows, null, 2));`;
    }
    return `// Node.js Code (fs + JSON conversion)
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('input.${src}', 'utf8'));
console.log(JSON.stringify(data, null, 2));`;
  }

  return `// Node.js Code (illustrative example)
// No single standard recipe for ${cat} ${src} -> ${tgt}; adapt to your pipeline.`;
}

function buildHtml(cat: FileCategory, src: string, tgt: string, engine: string): string {
  if (engine === "server") {
    return `<!-- Server-side conversion: POST the file to your FFmpeg endpoint -->
<form method="POST" action="/api/convert?category=${cat}" enctype="multipart/form-data">
  <input type="file" name="file" />
  <input type="hidden" name="sourceFormat" value="${src}" />
  <input type="hidden" name="targetFormat" value="${tgt}" />
  <button type="submit">Convert to ${tgt.toUpperCase()}</button>
</form>`;
  }

  if (cat === "image") {
    return `<!-- HTML5 + JavaScript Browser Canvas Conversion -->
<input type="file" id="fileInput" accept="image/*" />
<canvas id="canvas" style="display:none;"></canvas>

<script>
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const mimeType = 'image/${tgt === "jpg" ? "jpeg" : tgt}';
    const dataUrl = canvas.toDataURL(mimeType, 0.9);
    const link = document.createElement('a');
    link.download = 'converted.${tgt}';
    link.href = dataUrl;
    link.click();
  };
  img.src = URL.createObjectURL(file);
});
</script>`;
  }

  return `<!-- Client-side JavaScript data converter -->
<script>
const input = 'input.${src}';
console.log('Converting ' + input + ' to ${tgt} (${cat})');
</script>`;
}
