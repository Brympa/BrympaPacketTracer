import { CommandNode, CliExecutionContext, CliHelpItem, CliTabResult } from './types';

export interface ParseResult {
  node?: CommandNode;
  parsedArgs: string[];
  error?: string;
  errorIndex?: number;
}

export class CommandTree {
  private readonly rootNodes: CommandNode[] = [];

  constructor(nodes: CommandNode[] = []) {
    this.rootNodes = nodes;
  }

  public registerCommand(node: CommandNode): void {
    this.rootNodes.push(node);
  }

  /**
   * Resolves a partial token against a list of candidate nodes.
   * Handles Cisco IOS prefix matching and ambiguity detection.
   */
  public matchToken(
    token: string,
    candidates: CommandNode[]
  ): { match?: CommandNode; ambiguousMatches?: CommandNode[]; isParam?: boolean } {
    const lowerToken = token.toLowerCase();

    // 1. Exact match has highest priority
    const exact = candidates.find((c) => !c.isParam && c.token.toLowerCase() === lowerToken);
    if (exact) {
      return { match: exact };
    }

    // 2. Prefix match
    const prefixMatches = candidates.filter(
      (c) => !c.isParam && c.token.toLowerCase().startsWith(lowerToken)
    );

    if (prefixMatches.length === 1) {
      return { match: prefixMatches[0] };
    } else if (prefixMatches.length > 1) {
      return { ambiguousMatches: prefixMatches };
    }

    // 3. Parameter node match (e.g. <ip-address>, <interface-name>)
    const paramNode = candidates.find((c) => c.isParam);
    if (paramNode) {
      return { match: paramNode, isParam: true };
    }

    return {};
  }

  /**
   * Parses and executes a command string against the command tree.
   */
  public execute(line: string, context: CliExecutionContext): string {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Tokenize line while preserving character positions for error markers
    const tokens = trimmed.split(/\s+/);
    let currentCandidates = this.rootNodes;
    let matchedNode: CommandNode | undefined;
    const parsedArgs: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const { match, ambiguousMatches, isParam } = this.matchToken(token, currentCandidates);

      if (ambiguousMatches && ambiguousMatches.length > 0) {
        return `% Ambiguous command:  "${trimmed}"`;
      }

      if (!match) {
        return `% Invalid input detected at '^' marker.\n${trimmed}\n${' '.repeat(
          trimmed.indexOf(token)
        )}^`;
      }

      matchedNode = match;
      if (isParam) {
        parsedArgs.push(token);
      }

      currentCandidates = match.children || [];
    }

    if (!matchedNode || !matchedNode.handler) {
      return `% Incomplete command.\n${trimmed}\n${' '.repeat(trimmed.length)}^`;
    }

    const output = matchedNode.handler(context, parsedArgs);
    return output ?? '';
  }

  /**
   * Provides contextual help for the '?' key.
   */
  public getHelp(line: string): CliHelpItem[] {
    const endsWithSpace = line.endsWith(' ');
    const tokens = line.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0 || (tokens.length === 1 && !endsWithSpace && line === '')) {
      // Show all top-level commands
      return this.formatCandidates(this.rootNodes);
    }

    let currentCandidates = this.rootNodes;

    if (endsWithSpace) {
      // Traverse all full tokens
      for (const token of tokens) {
        const { match } = this.matchToken(token, currentCandidates);
        if (!match) return [];
        currentCandidates = match.children || [];
      }
      return this.formatCandidates(currentCandidates);
    } else {
      // Traverse all except the last partial token
      for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i];
        const { match } = this.matchToken(token, currentCandidates);
        if (!match) return [];
        currentCandidates = match.children || [];
      }

      const partial = tokens[tokens.length - 1].toLowerCase();
      const filtered = currentCandidates.filter(
        (c) => c.isParam || c.token.toLowerCase().startsWith(partial)
      );
      return this.formatCandidates(filtered);
    }
  }

  /**
   * Handles Tab completion for a line of text.
   */
  public complete(line: string): CliTabResult {
    const endsWithSpace = line.endsWith(' ');
    const tokens = line.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0 || endsWithSpace) {
      return { completedLine: line, candidates: [], isAmbiguous: false };
    }

    let currentCandidates = this.rootNodes;

    // Traverse prior tokens
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i];
      const { match } = this.matchToken(token, currentCandidates);
      if (!match) {
        return { completedLine: line, candidates: [], isAmbiguous: false };
      }
      currentCandidates = match.children || [];
    }

    const partial = tokens[tokens.length - 1].toLowerCase();
    const matches = currentCandidates.filter(
      (c) => !c.isParam && c.token.toLowerCase().startsWith(partial)
    );

    if (matches.length === 1) {
      // Exactly one completion
      const prior = tokens.slice(0, tokens.length - 1).join(' ');
      const completed = (prior ? prior + ' ' : '') + matches[0].token + ' ';
      return {
        completedLine: completed,
        candidates: [matches[0].token],
        isAmbiguous: false,
      };
    } else if (matches.length > 1) {
      // Ambiguous completions
      return {
        completedLine: line,
        candidates: matches.map((m) => m.token),
        isAmbiguous: true,
      };
    }

    return { completedLine: line, candidates: [], isAmbiguous: false };
  }

  private formatCandidates(nodes: CommandNode[]): CliHelpItem[] {
    return nodes.map((n) => ({
      token: n.token,
      description: n.description,
    }));
  }
}
