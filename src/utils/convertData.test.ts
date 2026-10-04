import { describe, it, expect, vi } from "vitest";
import {
  convertDataDocument,
  jsonToCsv,
  csvToJson,
  jsonToXml,
  jsonToYaml,
  markdownToHtml,
} from "./convertData";

function makeFile(text: string, name: string): File {
  return new File([text], name, { type: "text/plain" });
}

describe("jsonToCsv", () => {
  it("serializes an array of objects with a header row", () => {
    const csv = jsonToCsv([
      { name: "Ada", age: 36 },
      { name: "Grace", age: 45 },
    ]);
    expect(csv).toBe("name,age\nAda,36\nGrace,45");
  });

  it("quotes values containing the delimiter and doubles embedded quotes", () => {
    const csv = jsonToCsv([{ a: 'say "hi", ok' }]);
    expect(csv).toBe('a\n"say ""hi"", ok"');
  });

  it("guards spreadsheet formula-injection prefixes (OWASP CSV injection)", () => {
    const csv = jsonToCsv([{ cmd: "=SUM(A1:A2)" }]);
    expect(csv.split("\n")[1]).toBe("'=SUM(A1:A2)");
  });

  it("uses a custom delimiter when asked", () => {
    expect(jsonToCsv([{ a: 1, b: 2 }], ";")).toBe("a;b\n1;2");
  });
});

describe("csvToJson", () => {
  it("maps header names to values per record", () => {
    expect(csvToJson("name,age\nAda,36\nGrace,45")).toEqual([
      { name: "Ada", age: "36" },
      { name: "Grace", age: "45" },
    ]);
  });

  it("keeps quoted fields containing commas and escaped quotes intact", () => {
    expect(csvToJson('name,quote\n"Lee, Ann","she said ""ok"""')).toEqual([
      { name: "Lee, Ann", quote: 'she said "ok"' },
    ]);
  });

  it("skips blank lines instead of emitting empty records", () => {
    expect(csvToJson("a,b\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("jsonToXml", () => {
  it("escapes XML-unsafe characters in values", () => {
    expect(jsonToXml({ note: '<b> & "stuff"' })).toContain("<note>&lt;b&gt; &amp; &quot;stuff&quot;</note>");
  });

  it("normalizes keys that would be invalid XML element names", () => {
    const xml = jsonToXml({ "1key": 1, "weird key!": 2 });
    expect(xml).toContain("<_1key>1</_1key>");
    expect(xml).toContain("<weird_key_>2</weird_key_>");
  });
});

describe("jsonToYaml", () => {
  it("emits safe scalars bare and risky-looking scalars quoted", () => {
    expect(jsonToYaml({ plain: "hello", numeric: "123", bracket: "[1]" })).toBe(
      'plain: hello\nnumeric: "123"\nbracket: "[1]"\n'
    );
  });
});

describe("markdownToHtml", () => {
  it("escapes raw HTML before applying markdown transforms", () => {
    const html = markdownToHtml("# Hi <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<h1>");
  });

  it("sanitizes javascript: link URLs down to #", () => {
    const html = markdownToHtml("[click](javascript:alert(1))");
    expect(html).toContain('<a href="#">click</a>');
    expect(html).not.toContain("javascript:");
  });

  it("allows https links through untouched", () => {
    expect(markdownToHtml("[ok](https://example.com)")).toContain('<a href="https://example.com">ok</a>');
  });
});

describe("convertDataDocument", () => {
  it("converts JSON to CSV and reports progress milestones", async () => {
    const onProgress = vi.fn();
    const { blob, convertedText } = await convertDataDocument(
      makeFile('[{"a":1,"b":2}]', "data.json"),
      "csv",
      undefined,
      onProgress
    );
    expect(convertedText).toBe("a,b\n1,2");
    expect(blob.type).toBe("text/csv");
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("uses tab separation for a tsv target regardless of the delimiter option", async () => {
    const { convertedText } = await convertDataDocument(makeFile('[{"a":1,"b":2}]', "data.json"), "tsv", {
      delimiter: ";",
      prettyPrint: true,
      indentSpaces: 2,
    });
    expect(convertedText).toBe("a\tb\n1\t2");
  });

  it("routes JSON sources through the XML emitter", async () => {
    const { convertedText } = await convertDataDocument(makeFile('{"a":1}', "d.json"), "xml");
    expect(convertedText).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(convertedText).toContain("<a>1</a>");
  });

  it("routes JSON sources through the YAML emitter", async () => {
    const { convertedText } = await convertDataDocument(makeFile('{"a":"x"}', "d.json"), "yaml");
    expect(convertedText).toBe("a: x\n");
  });

  it("pretty-prints JSON passthrough honoring indentSpaces", async () => {
    const { convertedText } = await convertDataDocument(makeFile('{"a":[1]}', "d.json"), "json", {
      delimiter: ",",
      prettyPrint: true,
      indentSpaces: 4,
    });
    expect(convertedText).toBe('{\n    "a": [\n        1\n    ]\n}');
  });

  it("converts a .csv source to JSON using the extension as the authoritative hint", async () => {
    const { convertedText } = await convertDataDocument(makeFile("a,b\n1,2", "table.csv"), "json");
    expect(JSON.parse(convertedText!)).toEqual([{ a: "1", b: "2" }]);
  });

  it("converts a .tsv source to JSON rows", async () => {
    const { convertedText } = await convertDataDocument(makeFile("a\tb\n1\t2", "t.tsv"), "json");
    expect(JSON.parse(convertedText!)).toEqual([{ a: "1", b: "2" }]);
  });

  it("wraps prose into a JSON document rather than misreading commas as data", async () => {
    const { convertedText } = await convertDataDocument(
      makeFile("Hello, world\nSecond line", "notes.txt"),
      "json"
    );
    const parsed = JSON.parse(convertedText!) as { content: string; lines: string[] };
    expect(parsed.content).toContain("Hello, world");
    expect(parsed.lines).toHaveLength(2);
  });

  it("renders markdown documents to sanitized HTML", async () => {
    const { convertedText } = await convertDataDocument(
      makeFile("# Title\n[link](javascript:alert(1))", "readme.md"),
      "html"
    );
    expect(convertedText).toContain("<h1>Title</h1>");
    expect(convertedText).toContain('<a href="#">link</a>');
    expect(convertedText).not.toContain("javascript:");
  });

  it("rejects unsupported targets instead of guessing", async () => {
    await expect(convertDataDocument(makeFile("{}", "d.json"), "exe" as never)).rejects.toThrow(
      /is not supported/
    );
  });

  it("refuses HTML -> Markdown honestly (no HTML parser is integrated)", async () => {
    await expect(convertDataDocument(makeFile("<p>x</p>", "page.html"), "md")).rejects.toThrow(
      /HTML -> Markdown is not supported/
    );
  });
});

// Every advertised document pair (src/core/conversionRegistry.ts document
// category) with its explicitly defined expected semantics. Derived pair counts
// are pinned in src/core/consistency.test.ts.
describe("document pair semantics", () => {
  const HTML_DOC =
    "<html><head><style>p{color:red}</style></head><body><h1>Title</h1><p>Hello <b>world</b></p><script>alert(1)</script></body></html>";

  it("txt -> txt: identity passthrough", async () => {
    const { blob, convertedText } = await convertDataDocument(
      makeFile("plain notes\nline 2", "notes.txt"),
      "txt"
    );
    expect(convertedText).toBe("plain notes\nline 2");
    expect(blob.type).toBe("text/plain");
  });

  it("txt -> md: identity passthrough (plain text is valid Markdown)", async () => {
    const { convertedText } = await convertDataDocument(
      makeFile("# not a heading\nplain", "notes.txt"),
      "md"
    );
    expect(convertedText).toBe("# not a heading\nplain");
  });

  it("txt -> html: wrapped into a Markdown-rendered HTML document", async () => {
    const { convertedText, blob } = await convertDataDocument(makeFile("# Title", "notes.txt"), "html");
    expect(convertedText).toContain("<!DOCTYPE html>");
    expect(convertedText).toContain("<h1>Title</h1>");
    expect(blob.type).toBe("text/html");
  });

  it("md -> txt: identity passthrough (Markdown is already plain text)", async () => {
    const { convertedText } = await convertDataDocument(makeFile("# Title\n**bold**", "readme.md"), "txt");
    expect(convertedText).toBe("# Title\n**bold**");
  });

  it("md -> md: identity passthrough", async () => {
    const { blob, convertedText } = await convertDataDocument(makeFile("# Title", "readme.md"), "md");
    expect(convertedText).toBe("# Title");
    expect(blob.type).toBe("text/markdown");
  });

  it("html -> txt: markup, scripts and entities are stripped", async () => {
    const { blob, convertedText } = await convertDataDocument(makeFile(HTML_DOC, "page.html"), "txt");
    expect(convertedText).toBe("Title\nHello world");
    expect(convertedText).not.toMatch(/[<>]/);
    expect(convertedText).not.toContain("alert(1)");
    expect(blob.type).toBe("text/plain");
  });

  it("htm -> txt: same strip, with entities decoded last", async () => {
    const { convertedText } = await convertDataDocument(
      makeFile("<p>Tom &amp; Jerry &lt;3</p>", "page.htm"),
      "txt"
    );
    expect(convertedText).toBe("Tom & Jerry <3");
  });

  it("html -> html: kept verbatim instead of being escaped into a second document", async () => {
    const { blob, convertedText } = await convertDataDocument(makeFile(HTML_DOC, "page.html"), "html");
    expect(convertedText).toBe(HTML_DOC);
    expect(blob.type).toBe("text/html");
  });

  it("htm -> html: normalized to the same verbatim document", async () => {
    const { convertedText } = await convertDataDocument(makeFile("<p>x</p>", "page.htm"), "html");
    expect(convertedText).toBe("<p>x</p>");
  });

  it("strips markup even when the HTML also looks tabular", async () => {
    // A multi-line HTML table would otherwise be misread as CSV and passed
    // through verbatim as "plain text".
    const table = "<table>\n<tr><td>a,b</td></tr>\n<tr><td>c,d</td></tr>\n</table>";
    const { convertedText } = await convertDataDocument(makeFile(table, "table.html"), "txt");
    expect(convertedText).not.toMatch(/[<>]/);
    expect(convertedText).toContain("a,b");
  });
});
