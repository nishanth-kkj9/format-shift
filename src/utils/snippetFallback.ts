import { FileCategory, CodeTemplateResponse } from "../types";

/**
 * Offline starter templates for the code-snippets modal (finding D-4).
 *
 * Used when `/api/code-template` cannot be reached. They are category-aware (and
 * source-aware for data/document) so the suggestion matches the file the user
 * actually picked instead of always proposing an image toolchain, and they carry
 * the same "illustrative" framing the server-generated templates use.
 *
 * Pure and DOM-free so it can be unit tested directly; snippets are written as
 * multi-line template literals (the server's convention) to avoid escape
 * sequences leaking into the generated code.
 */
export function buildLocalFallback(
  category: FileCategory,
  source: string,
  target: string
): CodeTemplateResponse["code"] {
  const src = source || "input";
  const tgt = target || "output";

  const image: CodeTemplateResponse["code"] = {
    python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (PIL / Pillow)
from PIL import Image

img = Image.open("input.${src}")
img.save("output.${tgt}")`,
    node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (sharp)
import sharp from "sharp";

await sharp("input.${src}").toFile("output.${tgt}");`,
    html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: <canvas> -->
<canvas id="stage"></canvas>
<script>
  const img = new Image();
  img.src = "input.${src}";
  img.onload = () => {
    const canvas = document.getElementById("stage");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    canvas.toBlob((blob) => console.log("${tgt} ready:", blob.size));
  };
</script>`,
  };

  const mediaElement = category === "audio" ? "audio" : "video";
  const media: CodeTemplateResponse["code"] = {
    python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (ffmpeg)
import subprocess

subprocess.run(["ffmpeg", "-i", "input.${src}", "-y", "output.${tgt}"], check=True)`,
    node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (fluent-ffmpeg)
import ffmpeg from "fluent-ffmpeg";

ffmpeg("input.${src}").save("output.${tgt}");`,
    html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: media element (${tgt} export needs the server engine) -->
<${mediaElement} src="input.${src}" controls></${mediaElement}>`,
  };

  const data: CodeTemplateResponse["code"] =
    src === "json"
      ? {
          python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (json -> delimited)
import csv, json

with open("input.${src}") as handle:
    rows = json.load(handle)
with open("output.${tgt}", "w", newline="") as handle:
    csv.writer(handle).writerows(rows)`,
          node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (no dependencies)
import { readFile, writeFile } from "node:fs/promises";
import { EOL } from "node:os";

const rows = JSON.parse(await readFile("input.${src}", "utf8"));
await writeFile("output.${tgt}", rows.map((row) => row.join(",")).join(EOL));`,
          html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: JSON rows -> delimited text -->
<script>
  const rows = await (await fetch("input.${src}")).json();
  console.log("Columns:", rows[0].length, "Rows:", rows.length);
</script>`,
        }
      : {
          python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (delimited -> json)
import csv, json

with open("input.${src}", newline="") as handle:
    rows = list(csv.reader(handle))
with open("output.${tgt}", "w") as handle:
    json.dump(rows, handle, indent=2)`,
          node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (no dependencies)
import { readFile, writeFile } from "node:fs/promises";
import { EOL } from "node:os";

const rows = (await readFile("input.${src}", "utf8")).trim().split(EOL);
await writeFile("output.${tgt}", JSON.stringify(rows, null, 2));`,
          html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: delimited text -> JSON -->
<script>
  const text = await (await fetch("input.${src}")).text();
  console.log(JSON.stringify({ preview: text.slice(0, 200) }, null, 2));
</script>`,
        };

  const document: CodeTemplateResponse["code"] =
    src === "md"
      ? {
          python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (Markdown -> HTML)
import markdown

body = open("input.${src}", encoding="utf-8").read()
open("output.${tgt}", "w", encoding="utf-8").write(markdown.markdown(body))`,
          node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (marked)
import { readFile, writeFile } from "node:fs/promises";
import { marked } from "marked";

await writeFile("output.${tgt}", marked.parse(await readFile("input.${src}", "utf8")));`,
          html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: render Markdown into the page -->
<script>
  const body = await (await fetch("input.${src}")).text();
  console.log("Markdown ready to render:", body.length, "characters");
</script>`,
        }
      : {
          python: `# Illustrative example — adapt paths and codecs to your pipeline.
# Python (text -> ${tgt})
with open("input.${src}", encoding="utf-8") as handle:
    text = handle.read()
with open("output.${tgt}", "w", encoding="utf-8") as handle:
    handle.write(text)`,
          node: `// Illustrative example — adapt paths and codecs to your pipeline.
// Node.js (node:fs)
import { readFile, writeFile } from "node:fs/promises";

await writeFile("output.${tgt}", await readFile("input.${src}", "utf8"));`,
          html: `<!-- Illustrative example — adapt paths and codecs to your pipeline. -->
<!-- Browser: read the document, then export it -->
<script>
  const text = await (await fetch("input.${src}")).text();
  console.log(text.length, "characters ready to export");
</script>`,
        };

  const byCategory: Record<FileCategory, CodeTemplateResponse["code"]> = {
    image,
    audio: media,
    video: media,
    data,
    document,
  };

  // Defensive: callers pass props that were cast, so fall back to the image set.
  return byCategory[category] ?? image;
}
