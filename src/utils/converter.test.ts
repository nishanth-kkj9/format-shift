import { describe, it, expect } from 'vitest';
import { jsonToCsv, csvToJson, jsonToXml, jsonToYaml, markdownToHtml, formatBytes } from './converter';

describe('jsonToCsv', () => {
  it('converts array of objects to CSV with headers', () => {
    const input = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    expect(jsonToCsv(input)).toBe('id,name\n1,Alice\n2,Bob');
  });

  it('handles empty array', () => {
    expect(jsonToCsv([])).toBe('');
  });

  it('quotes values containing delimiter', () => {
    const input = [{ name: 'Smith, John' }];
    expect(jsonToCsv(input)).toBe('name\n"Smith, John"');
  });

  it('handles null/undefined values as empty', () => {
    const input = [{ a: null, b: undefined, c: 1 }];
    expect(jsonToCsv(input)).toBe('a,b,c\n,,1');
  });

  it('quotes values containing double quotes', () => {
    const input = [{ name: 'He said "hi"' }];
    expect(jsonToCsv(input)).toBe('name\n"He said ""hi"""');
  });
});

describe('csvToJson', () => {
  it('converts CSV to array of objects', () => {
    const input = 'id,name\n1,Alice\n2,Bob';
    expect(csvToJson(input)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('handles empty input', () => {
    expect(csvToJson('')).toEqual([]);
  });

  it('skips empty lines', () => {
    const input = 'id,name\n1,Alice\n\n2,Bob';
    expect(csvToJson(input)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('handles quoted fields containing delimiter', () => {
    const input = 'name,note\n"Smith, John","said ""hi"""';
    expect(csvToJson(input)).toEqual([
      { name: 'Smith, John', note: 'said "hi"' },
    ]);
  });

  it('handles quoted fields with escaped quotes', () => {
    const input = 'name,quote\nAlice,"She said ""hello"""';
    expect(csvToJson(input)).toEqual([
      { name: 'Alice', quote: 'She said "hello"' },
    ]);
  });

  it('handles fields with leading/trailing spaces', () => {
    const input = 'name,age\n  Alice  ,  30';
    expect(csvToJson(input)).toEqual([
      { name: 'Alice', age: '30' },
    ]);
  });
});

describe('jsonToXml', () => {
  it('converts object to XML', () => {
    const input = { name: 'Alice', age: 30 };
    const result = jsonToXml(input);
    expect(result).toContain('<name>Alice</name>');
    expect(result).toContain('<age>30</age>');
  });

  it('handles nested objects', () => {
    const input = { user: { name: 'Alice' } };
    const result = jsonToXml(input);
    expect(result).toContain('<user>');
    expect(result).toContain('<name>Alice</name>');
  });
});

describe('jsonToYaml', () => {
  it('converts object to YAML', () => {
    const input = { name: 'Alice', age: 30 };
    const result = jsonToYaml(input);
    expect(result).toContain('name: Alice');
    expect(result).toContain('age: 30');
  });

  it('handles arrays', () => {
    const input = { items: [1, 2, 3] };
    const result = jsonToYaml(input);
    expect(result).toContain('items:');
    expect(result).toContain('- 1');
  });
});

describe('markdownToHtml', () => {
  it('converts markdown headings', () => {
    const result = markdownToHtml('# Hello');
    expect(result).toContain('<h1>Hello</h1>');
  });

  it('converts bold text', () => {
    const result = markdownToHtml('**bold**');
    expect(result).toContain('<b>bold</b>');
  });
});

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });
});