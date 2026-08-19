import { FileCategory, TargetFormat, DataConversionOptions } from "../types";
import { getMimeForTarget } from "../core/conversionRegistry";

export async function convertDataDocument(
  file: File,
  targetFormat: TargetFormat,
  options?: DataConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; convertedText?: string }> {
  onProgress?.(20);
  const text = await file.text();
  onProgress?.(50);

  const tgt = targetFormat.toLowerCase();
  const browserDataTargets = ["json", "csv", "tsv", "xml", "yaml", "txt", "md", "html"];
  if (!browserDataTargets.includes(tgt)) {
    throw new Error(`Document/Data -> ${targetFormat} is not supported; use a server engine`);
  }
  // HTML -> Markdown is not a real conversion (no HTML parser is integrated);
  // passing HTML markup through as markdown would be dishonest.
  if (tgt === "md" && /\.html?$/i.test(file.name)) {
    throw new Error("HTML -> Markdown is not supported; no HTML parser is integrated");
  }
  let resultText = "";
  let sourceIsData = false;

  try {
    if (file.name.endsWith(".json") || isJson(text)) {
      sourceIsData = true;
      const parsed = JSON.parse(text);
      if (tgt === "csv" || tgt === "tsv") {
        const sep = tgt === "tsv" || options?.delimiter === "\t" ? "\t" : options?.delimiter || ",";
        resultText = jsonToCsv(parsed, sep);
      } else if (tgt === "xml") {
        resultText = jsonToXml(parsed);
      } else if (tgt === "yaml") {
        resultText = jsonToYaml(parsed);
      } else if (tgt === "txt" || tgt === "md") {
        resultText =
          typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, options?.indentSpaces || 2);
      } else {
        resultText = JSON.stringify(parsed, null, options?.indentSpaces || 2);
      }
    } else {
      const sep = tabularSeparator(text, file.name);
      if (sep) {
        sourceIsData = true;
        const parsedJson = csvToJson(text, sep);
        if (tgt === "json") {
          resultText = JSON.stringify(parsedJson, null, options?.indentSpaces || 2);
        } else if (tgt === "xml") {
          resultText = jsonToXml({ record: parsedJson });
        } else if (tgt === "yaml") {
          resultText = jsonToYaml(parsedJson);
        } else if (tgt === "tsv") {
          resultText = jsonToCsv(parsedJson, "\t");
        } else {
          resultText = text;
        }
      } else {
        if (tgt === "html") {
          resultText = markdownToHtml(text);
        } else if (tgt === "json") {
          resultText = JSON.stringify({ content: text, lines: text.split("\n") }, null, 2);
        } else {
          resultText = text;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Data conversion failed";
    throw new Error(`Failed to convert to ${targetFormat}: ${message}`);
  }

  onProgress?.(90);

  const category: FileCategory = sourceIsData ? "data" : "document";
  const mimeType = getMimeForTarget(category, tgt) || "text/plain";

  const blob = new Blob([resultText], { type: mimeType });
  onProgress?.(100);

  return { blob, convertedText: resultText };
}

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide whether a document/data file is genuinely tabular (CSV/TSV), returning
 * the delimiter when it is. A .csv/.tsv/.tab extension is authoritative;
 * otherwise require strong evidence (quoted first field, 2+ columns in the
 * first row, or a delimiter spread across multiple lines) so prose like
 * "Hello, world" is never misread as a data file.
 */
function tabularSeparator(text: string, name: string): string | null {
  const nameLower = name.toLowerCase();
  const sep =
    nameLower.endsWith(".tsv") || nameLower.endsWith(".tab") || (text.includes("\t") && !text.includes(","))
      ? "\t"
      : ",";
  if (nameLower.endsWith(".csv") || nameLower.endsWith(".tsv") || nameLower.endsWith(".tab")) return sep;
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const firstLine = lines[0] ?? "";
  const delimCount = (firstLine.match(sep === "\t" ? /\t/g : /,/g) ?? []).length;
  const tabular =
    /^\s*"/.test(firstLine) ||
    delimCount >= 2 ||
    (delimCount >= 1 && lines.length >= 2 && lines.slice(1).some((l) => l.includes(sep)));
  return tabular ? sep : null;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoted = false;
  let i = 0;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const endField = () => {
    // Quoted fields keep their whitespace verbatim; unquoted fields are trimmed.
    fields.push(quoted ? current : current.trim());
    current = "";
    quoted = false;
  };
  const endRecord = () => {
    endField();
    rows.push(fields);
    fields = [];
  };
  while (i < src.length) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        quoted = true;
      } else if (char === delimiter) {
        endField();
      } else if (char === "\n") {
        endRecord();
      } else {
        current += char;
      }
    }
    i++;
  }
  if (current !== "" || fields.length > 0 || inQuotes) endRecord();
  return rows;
}

export function jsonToCsv(json: unknown, delimiter = ","): string {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length === 0) return "";
  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const headerLine = headers.join(delimiter);
  const rows = arr.map((item) => {
    const record = item as Record<string, unknown>;
    return headers
      .map((header) => {
        const val = record[header];
        if (val === null || val === undefined) return "";
        const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
        // Spreadsheet formula injection guard: prefix cells that start with
        // =,+,-,@ plus tab/CR prefixes (OWASP CSV injection) so Excel/sheets
        // treat them as text.
        const guarded = /^[=+\-@\t\r]/.test(strVal) && !strVal.startsWith('"') ? "'" + strVal : strVal;
        return guarded.includes(delimiter) || guarded.includes("\n") || guarded.includes('"')
          ? `"${guarded.replace(/"/g, '""')}"`
          : guarded;
      })
      .join(delimiter);
  });
  return [headerLine, ...rows].join("\n");
}

export function csvToJson(csvText: string, delimiter = ","): Record<string, string>[] {
  const records = parseCsv(csvText, delimiter);
  if (records.length === 0) return [];
  const headers = records[0];
  const results: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length === 1 && values[0].trim() === "") continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] ?? "";
    });
    results.push(obj);
  }
  return results;
}

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function jsonToXml(obj: unknown, rootName = "root"): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
  function buildXml(data: unknown, indent = "  ") {
    if (Array.isArray(data)) {
      data.forEach((item) => {
        xml += `${indent}<item>\n`;
        buildXml(item, indent + "  ");
        xml += `${indent}</item>\n`;
      });
    } else if (typeof data === "object" && data !== null) {
      Object.entries(data as Record<string, unknown>).forEach(([key, val]) => {
        const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
        if (typeof val === "object" && val !== null) {
          xml += `${indent}<${cleanKey}>\n`;
          buildXml(val, indent + "  ");
          xml += `${indent}</${cleanKey}>\n`;
        } else {
          xml += `${indent}<${cleanKey}>${escapeXml(val)}</${cleanKey}>\n`;
        }
      });
    } else {
      xml += `${indent}${escapeXml(data)}\n`;
    }
  }
  buildXml(obj);
  xml += `</${rootName}>`;
  return xml;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") {
    if (
      value === "" ||
      value === "null" ||
      value === "true" ||
      value === "false" ||
      value === "yes" ||
      value === "no" ||
      value === "on" ||
      value === "off" ||
      value === "~" ||
      /^[-+0-9.]/.test(value) ||
      /[:#&*!|>'"%@`]/.test(value) ||
      /^\s|\s$/.test(value) ||
      /[\n\r\t]/.test(value)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "number" && Number.isNaN(value)) return "null";
  return String(value);
}

export function jsonToYaml(obj: unknown, indent = 0): string {
  let yaml = "";
  const spaces = " ".repeat(indent);
  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === "object" && item !== null) {
        yaml += `${spaces}-\n${jsonToYaml(item, indent + 2)}`;
      } else {
        yaml += `${spaces}- ${yamlScalar(item)}\n`;
      }
    });
  } else if (typeof obj === "object" && obj !== null) {
    Object.entries(obj as Record<string, unknown>).forEach(([key, val]) => {
      const safeKey = /[:#]/.test(key) ? JSON.stringify(key) : key;
      if (typeof val === "object" && val !== null) {
        yaml += `${spaces}${safeKey}:\n${jsonToYaml(val, indent + 2)}`;
      } else {
        yaml += `${spaces}${safeKey}: ${yamlScalar(val)}\n`;
      }
    });
  } else {
    yaml += `${spaces}${yamlScalar(obj)}\n`;
  }
  return yaml;
}

export function markdownToHtml(md: string): string {
  // Step 1: Escape all HTML entities to prevent raw HTML injection.
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Step 2: Apply Markdown transformations on the escaped text.
  html = html
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/\*\*(.*)\*\*/gim, "<b>$1</b>")
    .replace(/\*(.*)\*/gim, "<i>$1</i>")
    .replace(/\[(.*?)\]\((.*?)\)/gim, (_, text, url) => {
      // Sanitize URL: only allow safe schemes.
      const safeUrl = sanitizeUrl(url);
      return `<a href="${escapeHtmlAttr(safeUrl)}">${text}</a>`;
    })
    .replace(/\n$/gim, "<br />");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Converted Document</title></head>
<body style="font-family:sans-serif;padding:2rem;">
${html}
</body>
</html>`;
}

const ALLOWED_URL_SCHEMES = ["http:", "https:", "mailto:"];

function escapeHtmlAttr(s: string): string {
  // Input is already entity-escaped by markdownToHtml; re-escape quotes so a
  // value can never leak out of the attribute context even on raw input.
  return s.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    return trimmed;
  }
  return "#";
}
