/**
 * Cisco IOS Pipe filtering and pagination support.
 */

export interface PipeFilter {
  type: 'include' | 'begin' | 'exclude' | 'section';
  pattern: string;
}

/**
 * Parses pipe syntax from command string:
 * e.g. "show ip interface brief | include Gigabit" ->
 * { baseCommand: "show ip interface brief", filter: { type: "include", pattern: "Gigabit" } }
 */
export function parsePipeSyntax(rawLine: string): { baseCommand: string; filter?: PipeFilter } {
  const pipeIndex = rawLine.indexOf('|');
  if (pipeIndex === -1) {
    return { baseCommand: rawLine.trim() };
  }

  const baseCommand = rawLine.substring(0, pipeIndex).trim();
  const pipePart = rawLine.substring(pipeIndex + 1).trim();

  const match = pipePart.match(/^(include|begin|exclude|section)\s+(.*)$/i);
  if (!match) {
    return { baseCommand, filter: undefined };
  }

  const type = match[1].toLowerCase() as PipeFilter['type'];
  const pattern = match[2].trim();

  return { baseCommand, filter: { type, pattern } };
}

/**
 * Applies Cisco IOS pipe filter to multi-line output text.
 */
export function applyPipeFilter(text: string, filter?: PipeFilter): string {
  if (!filter || !filter.pattern) return text;

  const lines = text.split('\n');
  const regex = new RegExp(filter.pattern, 'i');

  switch (filter.type) {
    case 'include':
      return lines.filter((line) => regex.test(line)).join('\n');

    case 'exclude':
      return lines.filter((line) => !regex.test(line)).join('\n');

    case 'begin': {
      const startIndex = lines.findIndex((line) => regex.test(line));
      if (startIndex === -1) return '';
      return lines.slice(startIndex).join('\n');
    }

    case 'section': {
      // In Cisco IOS, 'section' begins at the match and continues until the next unindented block
      const startIndex = lines.findIndex((line) => regex.test(line));
      if (startIndex === -1) return '';
      const sectionLines: string[] = [lines[startIndex]];
      for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          break; // Next section began
        }
        sectionLines.push(line);
      }
      return sectionLines.join('\n');
    }

    default:
      return text;
  }
}
