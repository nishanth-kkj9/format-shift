// Manual E2E: exercises the real HTTP server like the React client does.
// Usage: node server.mjs <base-url>
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:4000";

function form(fields, filePath, filename, fileType) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const buf = readFileSync(filePath);
  fd.append("file", new File([buf], filename, { type: fileType }));
  return fd;
}

const cases = [
  {
    name: "image png->gif (server)",
    fields: { category: "image", targetFormat: "gif", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/t1.png",
    filename: "t1.png",
    type: "image/png",
    expectMagic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46, // GIF8
  },
  {
    name: "image png->png (browser engine, server capable)",
    fields: { category: "image", targetFormat: "png", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/t1.png",
    filename: "t1.png",
    type: "image/png",
    expectMagic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e, // \x89PN
  },
  {
    name: "image png->jpg (server)",
    fields: { category: "image", targetFormat: "jpg", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/t1.png",
    filename: "t1.png",
    type: "image/png",
    expectMagic: (b) => b[0] === 0xff && b[1] === 0xd8, // JPEG
  },
  {
    name: "video mp4->mkv (server)",
    fields: { category: "video", targetFormat: "mkv", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/test.mp4",
    filename: "test.mp4",
    type: "video/mp4",
    expectMagic: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, // EBML
  },
  {
    name: "video mp4->mp3 (audio extract, server)",
    fields: { category: "video", targetFormat: "mp3", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/test.mp4",
    filename: "test.mp4",
    type: "video/mp4",
    expectMagic: (b) => b.subarray(0, 3).toString() === "ID3",
  },
  {
    name: "video mp4->wav (audio extract, server)",
    fields: { category: "video", targetFormat: "wav", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/test.mp4",
    filename: "test.mp4",
    type: "video/mp4",
    expectMagic: (b) => b.subarray(0, 4).toString() === "RIFF",
  },
  {
    name: "reject document->pdf (fake target)",
    fields: { category: "document", targetFormat: "pdf", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/t1.png",
    filename: "doc.txt",
    type: "text/plain",
    expectStatus: 400,
  },
  {
    name: "reject image->svg on server (browser-only)",
    fields: { category: "image", targetFormat: "svg", options: "{}" },
    file: "C:/Users/Nishanth/AppData/Local/Temp/opencode/t1.png",
    filename: "t1.png",
    type: "image/png",
    expectStatus: 400,
  },
];

let failed = 0;
for (const c of cases) {
  try {
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form(c.fields, c.file, c.filename, c.type),
    });
    if (c.expectStatus !== undefined) {
      const ok = res.status === c.expectStatus;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  status=${res.status}`);
      if (!ok) failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const magicOk = res.status === 200 && c.expectMagic(buf);
    const contentType = res.headers.get("content-type");
    console.log(
      `${magicOk && res.status === 200 ? "PASS" : "FAIL"}  ${c.name}  status=${res.status} bytes=${buf.length} type=${contentType}`
    );
    if (!magicOk || res.status !== 200) failed++;
  } catch (e) {
    console.log(`ERROR ${c.name}  ${e.message}`);
    failed++;
  }
}
console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
