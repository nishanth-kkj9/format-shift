import { describe, it, expect } from "vitest";
import { jsonToCsv, csvToJson, jsonToXml, jsonToYaml, markdownToHtml, formatBytes } from "./converter";
import { convertDataDocument } from "./convertData";
import { convertAudio } from "./convertAudio";
import { convertVideo } from "./convertVideo";
import { planConversion } from "../core/conversionRegistry";

describe("jsonToCsv", () => {
  it("converts array of objects to CSV with headers", () => {
    const input = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    expect(jsonToCsv(input)).toBe("id,name\n1,Alice\n2,Bob");
  });

  it("handles empty array", () => {
    expect(jsonToCsv([])).toBe("");
  });

  it("quotes values containing delimiter", () => {
    const input = [{ name: "Smith, John" }];
    expect(jsonToCsv(input)).toBe('name\n"Smith, John"');
  });

  it("handles null/undefined values as empty", () => {
    const input = [{ a: null, b: undefined, c: 1 }];
    expect(jsonToCsv(input)).toBe("a,b,c\n,,1");
  });

  it("quotes values containing double quotes", () => {
    const input = [{ name: 'He said "hi"' }];
    expect(jsonToCsv(input)).toBe('name\n"He said ""hi"""');
  });
});

describe("csvToJson", () => {
  it("converts CSV to array of objects", () => {
    const input = "id,name\n1,Alice\n2,Bob";
    expect(csvToJson(input)).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("handles empty input", () => {
    expect(csvToJson("")).toEqual([]);
  });

  it("skips empty lines", () => {
    const input = "id,name\n1,Alice\n\n2,Bob";
    expect(csvToJson(input)).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("handles quoted fields containing delimiter", () => {
    const input = 'name,note\n"Smith, John","said ""hi"""';
    expect(csvToJson(input)).toEqual([{ name: "Smith, John", note: 'said "hi"' }]);
  });

  it("handles quoted fields with escaped quotes", () => {
    const input = 'name,quote\nAlice,"She said ""hello"""';
    expect(csvToJson(input)).toEqual([{ name: "Alice", quote: 'She said "hello"' }]);
  });

  it("handles fields with leading/trailing spaces", () => {
    const input = "name,age\n  Alice  ,  30";
    expect(csvToJson(input)).toEqual([{ name: "Alice", age: "30" }]);
  });
});

describe("jsonToXml", () => {
  it("converts object to XML", () => {
    const input = { name: "Alice", age: 30 };
    const result = jsonToXml(input);
    expect(result).toContain("<name>Alice</name>");
    expect(result).toContain("<age>30</age>");
  });

  it("handles nested objects", () => {
    const input = { user: { name: "Alice" } };
    const result = jsonToXml(input);
    expect(result).toContain("<user>");
    expect(result).toContain("<name>Alice</name>");
  });
});

describe("jsonToYaml", () => {
  it("converts object to YAML", () => {
    const input = { name: "Alice", age: 30 };
    const result = jsonToYaml(input);
    expect(result).toContain("name: Alice");
    expect(result).toContain("age: 30");
  });

  it("handles arrays", () => {
    const input = { items: [1, 2, 3] };
    const result = jsonToYaml(input);
    expect(result).toContain("items:");
    expect(result).toContain("- 1");
  });
});

describe("markdownToHtml", () => {
  it("converts markdown headings", () => {
    const result = markdownToHtml("# Hello");
    expect(result).toContain("<h1>Hello</h1>");
  });

  it("converts bold text", () => {
    const result = markdownToHtml("**bold**");
    expect(result).toContain("<b>bold</b>");
  });

  it("converts italic text", () => {
    const result = markdownToHtml("*italic*");
    expect(result).toContain("<i>italic</i>");
  });

  it("converts links with safe URLs", () => {
    const result = markdownToHtml("[link](https://example.com)");
    expect(result).toContain('<a href="https://example.com">link</a>');
  });

  it("allows relative URLs in links", () => {
    const result = markdownToHtml("[link](/relative/path)");
    expect(result).toContain('<a href="/relative/path">link</a>');
  });

  it("allows mailto URLs in links", () => {
    const result = markdownToHtml("[email](mailto:test@example.com)");
    expect(result).toContain('<a href="mailto:test@example.com">email</a>');
  });

  it("prevents attribute breakout via a quoted URL", () => {
    const result = markdownToHtml('[x](https://example.com/" onmouseover="alert(1))');
    // Quotes inside the URL are entity-escaped, so they cannot terminate the href
    // attribute early and inject a new event-handler attribute.
    expect(result).not.toContain('" onmouseover');
    expect(result).toContain("&quot; onmouseover=&quot;");
  });

  it("sanitizes javascript: URLs in links", () => {
    const result = markdownToHtml("[xss](javascript:alert(1))");
    expect(result).toContain('<a href="#">xss</a>');
    expect(result).not.toContain("javascript:");
  });

  it("sanitizes data: URLs in links", () => {
    const result = markdownToHtml("[xss](data:text/html,<script>alert(1)</script>)");
    expect(result).toContain('<a href="#">xss</a>');
    expect(result).not.toContain("data:");
  });

  it("sanitizes vbscript: URLs in links", () => {
    const result = markdownToHtml("[xss](vbscript:msgbox(1))");
    expect(result).toContain('<a href="#">xss</a>');
    expect(result).not.toContain("vbscript:");
  });

  it("escapes raw HTML in markdown input", () => {
    const result = markdownToHtml("<script>alert(1)</script>");
    // HTML should be escaped, so literal <script> tags should not appear
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    // The escaped content should be present as text
    expect(result).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes HTML attributes in markdown input", () => {
    const result = markdownToHtml('<img onerror="alert(1)" src=x>');
    expect(result).not.toContain("<img");
    // The escaped content should be present as text (quotes also escaped)
    expect(result).toContain("&lt;img onerror=&quot;alert(1)&quot; src=x&gt;");
  });

  it("escapes iframe tags in markdown input", () => {
    const result = markdownToHtml('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("</iframe>");
    // The escaped content should be present as text (quotes also escaped)
    expect(result).toContain("&lt;iframe src=&quot;evil.com&quot;&gt;&lt;/iframe&gt;");
  });

  it("preserves normal markdown formatting", () => {
    const result = markdownToHtml("# Heading\n\n**Bold** and *italic* text.");
    expect(result).toContain("<h1>Heading</h1>");
    expect(result).toContain("<b>Bold</b>");
    expect(result).toContain("<i>italic</i>");
  });
});

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("formats KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });
});

describe("RFC-4180 CSV edge cases", () => {
  it("parses quoted fields containing commas", () => {
    const csv = 'name,city\n"Smith, John","Austin, TX"';
    expect(csvToJson(csv)).toEqual([{ name: "Smith, John", city: "Austin, TX" }]);
  });

  it("parses escaped quotes inside quoted fields", () => {
    const csv = 'note\n"He said ""hi"""';
    expect(csvToJson(csv)[0].note).toBe('He said "hi"');
  });

  it("parses quoted fields spanning multiple lines", () => {
    const csv = 'name,desc\nAlice,"line one\nline two"';
    const rows = csvToJson(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].desc).toBe("line one\nline two");
  });

  it("tolerates CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4\r\n";
    expect(csvToJson(csv)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("skips blank rows", () => {
    const csv = "a,b\n1,2\n\n3,4\n";
    expect(csvToJson(csv)).toHaveLength(2);
  });
});

describe("XML escaping", () => {
  it("escapes special characters in text values", () => {
    const xml = jsonToXml({ title: 'a < b & c > "d"' });
    // Only the text content is escaped; wrapper tags remain as XML tags
    expect(xml).toContain("<title>a &lt; b &amp; c &gt; &quot;d&quot;</title>");
    expect(xml).not.toContain("<title>a < b");
  });
});

describe("YAML quoting", () => {
  it("quotes strings that would parse as numbers or booleans", () => {
    const yaml = jsonToYaml({ version: "1.0", enabled: "true", empty: "" });
    expect(yaml).toContain('version: "1.0"');
    expect(yaml).toContain('enabled: "true"');
    expect(yaml).toContain('empty: ""');
  });

  it("quotes strings containing colons", () => {
    const yaml = jsonToYaml({ note: "http://example.com" });
    expect(yaml).toContain('note: "http://example.com"');
  });
});

// Negative tests: converting to a format the engine genuinely cannot produce must
// throw, never silently substitute a different format (P1#19).
describe("browser converters refuse unsupported targets", () => {
  const fakeFile = (name: string, type: string, content: BlobPart) => new File([content], name, { type });

  it("convertDataDocument rejects fake document targets", async () => {
    const file = fakeFile("doc.txt", "text/plain", "hello");
    await expect(convertDataDocument(file, "pdf" as never, undefined, () => {})).rejects.toThrow(
      /not supported/
    );
  });

  it("convertAudio rejects targets that must run server-side", async () => {
    const file = fakeFile("a.mp3", "audio/mpeg", "x");
    await expect(
      convertAudio(
        file,
        "mp3" as never,
        { bitrate: "192k", sampleRate: 44100, channels: 2, volume: 100 },
        () => {}
      )
    ).rejects.toThrow(/FFmpeg server/);
  });

  it("convertVideo rejects server-only containers", async () => {
    const file = fakeFile("v.mp4", "video/mp4", "x");
    await expect(
      convertVideo(file, "mkv" as never, { resolution: "original", fps: 30, muteAudio: false }, () => {})
    ).rejects.toThrow(/FFmpeg server/);
  });

  it("planConversion says document->pdf is unsupported", () => {
    const plan = planConversion("document", "pdf");
    expect(plan.supported).toBe(false);
  });

  it("planConversion says image->docx is unsupported", () => {
    expect(planConversion("image", "docx").supported).toBe(false);
  });
});

describe("convertDataDocument derives the MIME from the real category", () => {
  const fakeFile = (name: string, type: string, content: BlobPart) => new File([content], name, { type });

  it("document -> html produces text/html", async () => {
    const file = fakeFile("notes.txt", "text/plain", "# hello");
    const res = await convertDataDocument(file, "html", undefined, () => {});
    expect(res.blob.type).toBe("text/html");
  });

  it("document -> md produces text/markdown", async () => {
    const file = fakeFile("notes.txt", "text/plain", "# hello");
    const res = await convertDataDocument(file, "md", undefined, () => {});
    expect(res.blob.type).toBe("text/markdown");
  });

  it("data -> json stays application/json", async () => {
    const file = fakeFile("data.csv", "text/csv", "a,b\n1,2");
    const res = await convertDataDocument(file, "json", undefined, () => {});
    expect(res.blob.type).toBe("application/json");
  });

  it("data -> csv stays text/csv", async () => {
    const file = fakeFile("data.json", "application/json", '{"a":1}');
    const res = await convertDataDocument(file, "csv", undefined, () => {});
    expect(res.blob.type).toBe("text/csv");
  });
});
