import { describe, it, expect } from 'vitest';

import { parseSignalStyles } from './signal-formatting.js';

describe('parseSignalStyles', () => {
  it('returns unchanged text when no markers present', () => {
    const result = parseSignalStyles('hello world');
    expect(result.text).toBe('hello world');
    expect(result.textStyle).toEqual([]);
  });

  it('handles empty string', () => {
    const result = parseSignalStyles('');
    expect(result.text).toBe('');
    expect(result.textStyle).toEqual([]);
  });

  it('parses *bold*', () => {
    const result = parseSignalStyles('hello *world*');
    expect(result.text).toBe('hello world');
    expect(result.textStyle).toEqual([
      { style: 'BOLD', start: 6, length: 5 },
    ]);
  });

  it('parses _italic_', () => {
    const result = parseSignalStyles('hello _world_');
    expect(result.text).toBe('hello world');
    expect(result.textStyle).toEqual([
      { style: 'ITALIC', start: 6, length: 5 },
    ]);
  });

  it('parses `code`', () => {
    const result = parseSignalStyles('run `npm test` now');
    expect(result.text).toBe('run npm test now');
    expect(result.textStyle).toEqual([
      { style: 'MONOSPACE', start: 4, length: 8 },
    ]);
  });

  it('parses ~~strikethrough~~', () => {
    const result = parseSignalStyles('this is ~~wrong~~ right');
    expect(result.text).toBe('this is wrong right');
    expect(result.textStyle).toEqual([
      { style: 'STRIKETHROUGH', start: 8, length: 5 },
    ]);
  });

  it('handles multiple different styles', () => {
    const result = parseSignalStyles('*bold* and _italic_ and `code`');
    expect(result.text).toBe('bold and italic and code');
    expect(result.textStyle).toHaveLength(3);
    expect(result.textStyle).toEqual([
      { style: 'BOLD', start: 0, length: 4 },
      { style: 'ITALIC', start: 9, length: 6 },
      { style: 'MONOSPACE', start: 20, length: 4 },
    ]);
  });

  it('does not treat **double asterisks** as bold', () => {
    const result = parseSignalStyles('**not bold**');
    expect(result.text).toBe('**not bold**');
    expect(result.textStyle).toEqual([]);
  });

  it('does not match _italic_ inside words like some_var_name', () => {
    const result = parseSignalStyles('some_var_name');
    expect(result.text).toBe('some_var_name');
    expect(result.textStyle).toEqual([]);
  });

  it('leaves unmatched markers as literal text', () => {
    const result = parseSignalStyles('hello *world');
    expect(result.text).toBe('hello *world');
    expect(result.textStyle).toEqual([]);
  });

  it('backtick protects inner markers from parsing', () => {
    const result = parseSignalStyles('`*not bold*`');
    expect(result.text).toBe('*not bold*');
    expect(result.textStyle).toEqual([
      { style: 'MONOSPACE', start: 0, length: 10 },
    ]);
  });

  it('handles emoji before styled text (UTF-16 position check)', () => {
    // 🎉 is U+1F389, which is 2 UTF-16 code units
    const result = parseSignalStyles('🎉 *bold*');
    expect(result.text).toBe('🎉 bold');
    // '🎉 ' = 3 code units (2 for emoji + 1 space)
    expect(result.textStyle).toEqual([
      { style: 'BOLD', start: 3, length: 4 },
    ]);
  });

  it('handles multiple bold spans', () => {
    const result = parseSignalStyles('*one* and *two*');
    expect(result.text).toBe('one and two');
    expect(result.textStyle).toEqual([
      { style: 'BOLD', start: 0, length: 3 },
      { style: 'BOLD', start: 8, length: 3 },
    ]);
  });

  it('handles adjacent styled spans', () => {
    const result = parseSignalStyles('*bold*_italic_');
    expect(result.text).toBe('bolditalic');
    expect(result.textStyle).toEqual([
      { style: 'BOLD', start: 0, length: 4 },
      { style: 'ITALIC', start: 4, length: 6 },
    ]);
  });

  it('does not match italic with inner underscores like _a_b_', () => {
    // _a_b_ — closing underscores are followed by word chars, so no italic match
    const result = parseSignalStyles('_a_b_');
    expect(result.text).toBe('_a_b_');
    expect(result.textStyle).toEqual([]);
  });

  it('parses ~single tilde strikethrough~', () => {
    const result = parseSignalStyles('this is ~wrong~ right');
    expect(result.text).toBe('this is wrong right');
    expect(result.textStyle).toEqual([
      { style: 'STRIKETHROUGH', start: 8, length: 5 },
    ]);
  });

  it('parses ||spoiler||', () => {
    const result = parseSignalStyles('the answer is ||42||');
    expect(result.text).toBe('the answer is 42');
    expect(result.textStyle).toEqual([
      { style: 'SPOILER', start: 14, length: 2 },
    ]);
  });
});
