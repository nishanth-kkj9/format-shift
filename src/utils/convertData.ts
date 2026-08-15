import { TargetFormat, DataConversionOptions } from '../types';

// Convert Data / Document formats (JSON, CSV, XML, YAML, MD, HTML, TXT)
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
  const browserDataTargets = ['json', 'csv', 'tsv', 'xml', 'yaml', 'txt', 'md', 'html'];
  if (!browserDataTargets.includes(tgt)) {
    throw new Error(`Document/Data -> ${targetFormat} is not supported; use a server engine`);
  }
  let resultText = '';

  try {
    // 1. Convert JSON
    if (file.name.endsWith('.json') || isJson(text)) {
      const parsed = JSON.parse(text);
      if (tgt === 'csv' || tgt === 'tsv') {
        const sep = tgt === 'tsv' || options?.delimiter === '\t' ? '\t' : options?.delimiter || ',';
        resultText = jsonToCsv(parsed, sep);
      } else if (tgt === 'xml') {
        resultText = jsonToXml(parsed);
      } else if (tgt === 'yaml') {
        resultText = jsonToYaml(parsed);
      } else if (tgt === 'txt' || tgt === 'md') {
        resultText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, options?.indentSpaces || 2);
      } else {
        resultText = JSON.stringify(parsed, null, options?.indentSpaces || 2);
      }
    }
    // 2. Convert CSV / TSV (detect only when the header row looks tabular)
    else if (/^[^"']*[,\t]/.test(text.trim())) {
      const sep = file.name.endsWith('.tsv') || file.name.endsWith('.tab') ? '\t' : ',';
      const parsedJson = csvToJson(text, sep);
      if (tgt === 'json') {
        resultText = JSON.stringify(parsedJson, null, options?.indentSpaces || 2);
      } else if (tgt === 'xml') {
        resultText = jsonToXml({ record: parsedJson });
      } else if (tgt === 'yaml') {
        resultText = jsonToYaml(parsedJson);
      } else if (tgt === 'tsv') {
        resultText = jsonToCsv(parsedJson, '\t');
      } else {
        resultText = text;
      }
    }
    // 3. Convert Markdown / Text / HTML
    else {
      if (tgt === 'html') {
        resultText = markdownToHtml(text);
      } else if (tgt === 'json') {
        resultText = JSON.stringify({ content: text, lines: text.split('\n') }, null, 2);
      } else {
        resultText = text;
      }
    }
  } catch (err) {
    // Surface conversion errors instead of silently returning the input text.
    // A silent fallback hides real bugs (e.g. malformed JSON, unsupported nesting).
    const message = err instanceof Error ? err.message : 'Data conversion failed';
    throw new Error(`Failed to convert to ${targetFormat}: ${message}`);
  }

  onProgress?.(90);

  let mimeType = 'text/plain';
  if (tgt === 'json') mimeType = 'application/json';
  else if (tgt === 'csv') mimeType = 'text/csv';
  else if (tgt === 'tsv') mimeType = 'text/tab-separated-values';
  else if (tgt === 'yaml') mimeType = 'application/yaml';
  else if (tgt === 'xml') mimeType = 'application/xml';
  else if (tgt === 'html') mimeType = 'text/html';
  else if (tgt === 'md') mimeType = 'text/markdown';

  const blob = new Blob([resultText], { type: mimeType });
  onProgress?.(100);

  return { blob, convertedText: resultText };
}

// Data Helper Functions
function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Split CSV text into records respecting RFC-4180: double-quoted fields may span
// multiple lines, and "" is an escaped quote inside a quoted field.
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  // Normalize CRLF so records don't break on \r alone.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const endField = () => {
    fields.push(current.trim());
    current = '';
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
      } else if (char === delimiter) {
        endField();
      } else if (char === '\n') {
        endRecord();
      } else {
        current += char;
      }
    }
    i++;
  }
  // Flush any trailing field/record.
  if (current !== '' || fields.length > 0 || inQuotes) endRecord();

  return rows;
}

export function jsonToCsv(json: unknown, delimiter = ','): string {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length === 0) return '';

  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const headerLine = headers.join(delimiter);

  const rows = arr.map((item) => {
    const record = item as Record<string, unknown>;
    return headers
      .map((header) => {
        const val = record[header];
        if (val === null || val === undefined) return '';
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Quote if contains delimiter, newline, or double quote
        return strVal.includes(delimiter) || strVal.includes('\n') || strVal.includes('"')
          ? `"${strVal.replace(/"/g, '""')}"`
          : strVal;
      })
      .join(delimiter);
  });

  return [headerLine, ...rows].join('\n');
}

export function csvToJson(csvText: string, delimiter = ','): Record<string, string>[] {
  const records = parseCsv(csvText, delimiter);
  if (records.length === 0) return [];

  const headers = records[0];
  const results: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length === 1 && values[0].trim() === '') continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] ?? '';
    });
    results.push(obj);
  }

  return results;
}

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function jsonToXml(obj: unknown, rootName = 'root'): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;

  function buildXml(data: unknown, indent = '  ') {
    if (Array.isArray(data)) {
      data.forEach((item) => {
        xml += `${indent}<item>\n`;
        buildXml(item, indent + '  ');
        xml += `${indent}</item>\n`;
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data as Record<string, unknown>).forEach(([key, val]) => {
        const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        if (typeof val === 'object' && val !== null) {
          xml += `${indent}<${cleanKey}>\n`;
          buildXml(val, indent + '  ');
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

// Quote a scalar only when plain output would be ambiguous (colon+space,
// leading/trailing space, special indicators, or YAML-special values).
function yamlScalar(value: unknown): string {
  if (typeof value === 'string') {
    if (
      value === '' ||
      value === 'null' ||
      value === 'true' ||
      value === 'false' ||
      value === 'yes' ||
      value === 'no' ||
      value === 'on' ||
      value === 'off' ||
      value === '~' ||
      /^[-+0-9.]/.test(value) ||
      /[:#&*!|>'"%@`]/.test(value) ||
      /^\s|\s$/.test(value) ||
      /[\n\r\t]/.test(value)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === 'number' && Number.isNaN(value)) return 'null';
  return String(value);
}

export function jsonToYaml(obj: unknown, indent = 0): string {
  let yaml = '';
  const spaces = ' '.repeat(indent);

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        yaml += `${spaces}-\n${jsonToYaml(item, indent + 2)}`;
      } else {
        yaml += `${spaces}- ${yamlScalar(item)}\n`;
      }
    });
  } else if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj as Record<string, unknown>).forEach(([key, val]) => {
      const safeKey = /[:#]/.test(key) ? JSON.stringify(key) : key;
      if (typeof val === 'object' && val !== null) {
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
  let html = md
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
    .replace(/\n$/gim, '<br />');

  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>Converted Document</title></head>\n<body style="font-family:sans-serif;padding:2rem;">\n${html}\n</body>\n</html>`;
}
