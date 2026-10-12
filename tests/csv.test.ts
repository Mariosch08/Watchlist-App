import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, parseCsvObjects, toCsv } from '../supabase/functions/_shared/csv.ts';

describe('csv parser', () => {
  it('handles BOM, quotes with commas/newlines, escaped quotes and CRLF', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","multi\nline"\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'multi\nline'],
    ]);
  });

  it('detects semicolon delimiters (Excel CH/DE)', () => {
    expect(detectDelimiter('Const;Your Rating;Title\n')).toBe(';');
    expect(parseCsv('a;b\n1;"x;y"')).toEqual([['a', 'b'], ['1', 'x;y']]);
  });

  it('ignores empty lines and normalises headers', () => {
    const { headers, records } = parseCsvObjects('Const,Your Rating,Runtime (mins)\n\ntt0133093,9,136\n\n');
    expect(headers).toEqual(['const', 'yourrating', 'runtimemins']);
    expect(records).toEqual([{ const: 'tt0133093', yourrating: '9', runtimemins: '136' }]);
  });

  it('round-trips through toCsv', () => {
    const rows = [['Title', 'Note'], ['Amélie, die "Fabelhafte"', 'x']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
