export interface TextStyle {
  style: 'BOLD' | 'ITALIC' | 'SPOILER' | 'STRIKETHROUGH' | 'MONOSPACE';
  start: number;
  length: number;
}

export interface StyledText {
  text: string;
  textStyle: TextStyle[];
}

interface MarkerMatch {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  style: TextStyle['style'];
}

/**
 * Parse markdown-style markers from text, strip them, and compute
 * UTF-16 code unit ranges for signal-cli's textStyle parameter.
 *
 * Supported: *bold*, _italic_, `code`, ~strikethrough~, ~~strikethrough~~, ||spoiler||
 * Italic requires word boundary before the opening _ to avoid
 * matching snake_case identifiers.
 */
export function parseSignalStyles(input: string): StyledText {
  if (!input) return { text: input, textStyle: [] };

  // Collect all marker matches in precedence order.
  // Backtick first so inner markers inside code spans are not parsed.
  const matches: MarkerMatch[] = [];
  const markers = new Set<number>();   // indices to strip from output
  const protected_ = new Set<number>(); // content inside code spans (blocks other patterns)

  const patterns: Array<{ re: RegExp; style: TextStyle['style']; markerLen: number }> = [
    // Backtick: `code` — no nesting inside
    { re: /`([^`]+)`/g, style: 'MONOSPACE', markerLen: 1 },
    // Spoiler: ||text||
    { re: /\|\|([^|]+)\|\|/g, style: 'SPOILER', markerLen: 2 },
    // Strikethrough: ~~text~~ or ~text~
    { re: /~~([^~]+)~~/g, style: 'STRIKETHROUGH', markerLen: 2 },
    { re: /(?<!~)~(?!~)([^~]+?)(?<!~)~(?!~)/g, style: 'STRIKETHROUGH', markerLen: 1 },
    // Bold: *text* — but not **double** and not \*escaped\*
    { re: /(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, style: 'BOLD', markerLen: 1 },
    // Italic: _text_ — only when _ is at word boundary (not inside snake_case)
    { re: /(?<!\w)_([^_]+?)_(?!\w)/g, style: 'ITALIC', markerLen: 1 },
  ];

  for (const { re, style, markerLen } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const openStart = m.index;
      const openEnd = openStart + markerLen;
      const closeStart = openStart + m[0].length - markerLen;
      const closeEnd = openStart + m[0].length;

      // Check no overlap with already-claimed indices (markers or protected content)
      let overlaps = false;
      for (let i = openStart; i < closeEnd; i++) {
        if (markers.has(i) || protected_.has(i)) { overlaps = true; break; }
      }
      if (overlaps) continue;

      // Mark marker indices for stripping
      for (let i = openStart; i < openEnd; i++) markers.add(i);
      for (let i = closeStart; i < closeEnd; i++) markers.add(i);
      // For code spans, protect content indices so inner markers don't match
      if (style === 'MONOSPACE') {
        for (let i = openEnd; i < closeStart; i++) protected_.add(i);
      }

      matches.push({ openStart, openEnd, closeStart, closeEnd, style });
    }
  }

  if (matches.length === 0) return { text: input, textStyle: [] };

  // Build output string skipping marker indices, and remap positions
  const indexMap: number[] = []; // indexMap[originalIdx] = newIdx
  let out = '';
  for (let i = 0; i < input.length; i++) {
    if (markers.has(i)) {
      indexMap.push(-1);
    } else {
      indexMap.push(out.length);
      out += input[i];
    }
  }

  // Build textStyle array from matches using remapped positions
  const textStyle: TextStyle[] = [];
  for (const m of matches) {
    const start = indexMap[m.openEnd]; // first content char after opening marker
    // Find last content char before closing marker
    let lastContentIdx = m.closeStart - 1;
    while (lastContentIdx >= m.openEnd && indexMap[lastContentIdx] === -1) lastContentIdx--;
    if (start === -1 || lastContentIdx < m.openEnd) continue;
    const end = indexMap[lastContentIdx] + 1;
    const length = end - start;
    if (length > 0) {
      textStyle.push({ style: m.style, start, length });
    }
  }

  // Sort by start position for clean output
  textStyle.sort((a, b) => a.start - b.start);

  return { text: out, textStyle };
}
