import { Router } from "express";
import { planConversion, CONVERSION_REGISTRY } from "../../src/core/conversionRegistry";
import type { FileCategory } from "../../src/core/conversionRegistry";

export const templatesRouter = Router();

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

  const engine = plan.target.engine;

  const pythonCode = buildPython(cat, src, tgt, engine);
  const nodeCode = buildNode(cat, src, tgt, engine);
  const htmlCode = buildHtml(cat, src, tgt, engine);

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
      return `# Python Code (ffmpeg)
import subprocess

def convert_video(input_path, output_path):
    subprocess.run(["ffmpeg", "-i", input_path, "-c:v", "libx264", "-c:a", "aac", output_path], check=True)

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

  return `# Python Code (pandas / json)
import json

with open("input.${src}") as f:
    data = json.load(f)
print(json.dumps(data, indent=2))`;
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

  return `// Node.js Code (fs + JSON conversion)
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('input.${src}', 'utf8'));
console.log(JSON.stringify(data, null, 2));`;
}

function buildHtml(cat: FileCategory, src: string, tgt: string, engine: string): string {
  if (engine === "server") {
    return `<!-- Server-side conversion: POST the file to your FFmpeg endpoint -->
<form method="POST" action="/api/convert" enctype="multipart/form-data">
  <input type="file" name="file" />
  <input type="hidden" name="category" value="${cat}" />
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
