import express from "express";
import multer from "multer";
import { convertFile } from "./server/convert";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cap
});

// API endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "FormatShift Universal Converter", timestamp: new Date().toISOString() });
});

// Actual file conversion via local ffmpeg. Multipart: file + category + sourceFormat + targetFormat + options(JSON string)
app.post("/api/convert", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const { category, sourceFormat, targetFormat } = req.body;
    let options = {};
    try {
      options = JSON.parse(req.body.options || "{}");
    } catch {
      // ignore malformed options
    }

    const { data, mime } = await convertFile(file.buffer, {
      category,
      targetFormat,
      ...options,
    });

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="converted.${targetFormat}"`
    );
    res.send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    const isClientError =
      message.startsWith("Unsupported target format") ||
      message.startsWith("Conversion not supported") ||
      message.startsWith("Source has no audio stream");
    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

// Code generator endpoint for Python & Node.js code snippets
app.post("/api/code-template", (req, res) => {
  const { category, sourceFormat, targetFormat } = req.body || {};

  const cat = category || "image";
  const src = (sourceFormat || "png").toLowerCase();
  const tgt = (targetFormat || "jpg").toLowerCase();

  const ALLOWED_TARGETS: Record<string, string[]> = {
    image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg", "avif"],
    audio: ["mp3", "wav", "ogg", "aac", "m4a", "flac"],
    video: ["mp4", "webm", "gif", "mov", "mkv", "avi", "mp3", "wav"],
    data: ["json", "csv", "xml", "yaml", "tsv"],
    document: ["pdf", "txt", "md", "html", "png", "jpg"],
  };
  if (!ALLOWED_TARGETS[cat] || !ALLOWED_TARGETS[cat].includes(tgt)) {
    return res.status(400).json({ error: `Unsupported conversion: ${cat} -> ${tgt}` });
  }

  let pythonCode = "";
  let nodeCode = "";
  let htmlCode = "";

  if (cat === "image") {
    pythonCode = `# Python Code (PIL / Pillow)
from PIL import Image

def convert_image(input_path, output_path, quality=90):
    img = Image.open(input_path)
    if "${tgt}" in ["jpg", "jpeg"] and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(output_path, format="${tgt.toUpperCase()}", quality=quality)
    print(f"Converted {input_path} to {output_path}")

convert_image("input.${src}", "output.${tgt}")`;

    nodeCode = `// Node.js Code (Sharp library)
import sharp from 'sharp';

async function convertImage() {
  await sharp('input.${src}')
    .${tgt === 'jpg' || tgt === 'jpeg' ? 'jpeg({ quality: 90 })' : tgt === 'webp' ? 'webp({ quality: 85 })' : tgt === 'png' ? 'png({ compressionLevel: 9 })' : tgt + '()'}
    .toFile('output.${tgt}');
  console.log('Conversion completed successfully');
}

convertImage();`;

    htmlCode = `<!-- HTML5 + JavaScript Browser Canvas Conversion -->
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
    
    // Export to selected format
    const mimeType = 'image/${tgt === 'jpg' ? 'jpeg' : tgt}';
    const dataUrl = canvas.toDataURL(mimeType, 0.9);
    
    // Download link
    const link = document.createElement('a');
    link.download = 'converted.${tgt}';
    link.href = dataUrl;
    link.click();
  };
  img.src = URL.createObjectURL(file);
});
</script>`;
  } else if (cat === "audio") {
    pythonCode = `# Python Code (pydub + ffmpeg)
from pydub import AudioSegment

def convert_audio(input_file, output_file, bitrate="192k"):
    sound = AudioSegment.from_file(input_file, format="${src}")
    sound.export(output_file, format="${tgt}", bitrate=bitrate)
    print("Audio converted successfully")

convert_audio("input.${src}", "output.${tgt}")`;

    nodeCode = `// Node.js Code (fluent-ffmpeg)
import ffmpeg from 'fluent-ffmpeg';

ffmpeg('input.${src}')
  .toFormat('${tgt}')
  .audioBitrate(192)
  .on('end', () => console.log('Audio conversion finished!'))
  .on('error', (err) => console.error('Error:', err))
  .save('output.${tgt}');`;

    htmlCode = `<!-- HTML5 Web Audio API decoding + WAV export -->
<script>
async function convertAudioBlob(audioBlob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  console.log('Channels:', audioBuffer.numberOfChannels, 'Duration:', audioBuffer.duration);
  // Audio render logic...
}
</script>`;
  } else if (cat === "video") {
    pythonCode = `# Python Code (moviepy)
from moviepy.editor import VideoFileClip

clip = VideoFileClip("input.${src}")
${tgt === 'gif' ? 'clip.write_gif("output.gif", fps=15)' : 'clip.write_videofile("output.' + tgt + '", codec="libx264")'}
clip.close()`;

    nodeCode = `// Node.js Code (fluent-ffmpeg)
import ffmpeg from 'fluent-ffmpeg';

ffmpeg('input.${src}')
  .output('output.${tgt}')
  .videoCodec('${tgt === 'webm' ? 'libvpx' : 'libx264'}')
  .size('1280x720')
  .on('end', () => console.log('Video processing complete'))
  .run();`;

    htmlCode = `<!-- HTML5 Video + Canvas frame processing -->
<video id="video" controls></video>
<canvas id="frameCanvas"></canvas>
<script>
// Load video element, draw to canvas, record stream via MediaRecorder
</script>`;
  } else {
    pythonCode = `# Python Code (pandas / json / yaml)
import pandas as pd
import json

# Reading data and exporting to ${tgt}
${src === 'json' ? 'df = pd.read_json("input.json")' : src === 'csv' ? 'df = pd.read_csv("input.csv")' : 'with open("input.txt") as f: text = f.read()'}
${tgt === 'csv' ? 'df.to_csv("output.csv", index=False)' : tgt === 'json' ? 'df.to_json("output.json", orient="records", indent=2)' : 'print(df)'}`;

    nodeCode = `// Node.js Code (fs + JSON/CSV conversion)
import fs from 'fs';

const rawData = fs.readFileSync('input.${src}', 'utf8');
${src === 'json' && tgt === 'csv' ? 'const json = JSON.parse(rawData);\n// Convert array of objects to CSV' : 'console.log("Processing " + rawData.length + " bytes")'}`;

    htmlCode = `<!-- Client-side JavaScript file converter -->
<script>
function convertData(text, fromFormat, toFormat) {
  if (fromFormat === 'json' && toFormat === 'csv') {
    const data = JSON.parse(text);
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).join(',')).join('\\n');
    return headers + '\\n' + rows;
  }
}
</script>`;
  }

  res.json({
    category: cat,
    sourceFormat: src,
    targetFormat: tgt,
    code: {
      python: pythonCode,
      node: nodeCode,
      html: htmlCode,
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on http://localhost:${PORT}`);
});