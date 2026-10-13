import { BaseDevice } from '../devices/base-device';
import { buildCliTrees } from './commands/build-cli-trees';
import { CommandTree } from './command-tree';
import { applyPipeFilter, parsePipeSyntax } from './pager';
import { CliHelpItem, CliMode, CliSessionState, CliTabResult } from './types';

export class IosCliSession {
  public readonly device: BaseDevice;
  public readonly state: CliSessionState;
  private readonly trees: Map<CliMode, CommandTree>;
  private readonly history: string[] = [];
  private historyPointer = -1;

  constructor(device: BaseDevice) {
    this.device = device;
    this.state = {
      mode: 'USER_EXEC',
      terminalRows: 24,
      terminalCols: 80,
    };

    const treeSpecs = buildCliTrees();
    this.trees = new Map<CliMode, CommandTree>([
      ['USER_EXEC', new CommandTree(treeSpecs.USER_EXEC)],
      ['PRIVILEGED_EXEC', new CommandTree(treeSpecs.PRIVILEGED_EXEC)],
      ['GLOBAL_CONFIG', new CommandTree(treeSpecs.GLOBAL_CONFIG)],
      ['INTERFACE_CONFIG', new CommandTree(treeSpecs.INTERFACE_CONFIG)],
      ['LINE_CONFIG', new CommandTree(treeSpecs.LINE_CONFIG)],
    ]);
  }

  public getPrompt(): string {
    const name = this.device.name;
    switch (this.state.mode) {
      case 'USER_EXEC':
        return `${name}>`;
      case 'PRIVILEGED_EXEC':
        return `${name}#`;
      case 'GLOBAL_CONFIG':
        return `${name}(config)#`;
      case 'INTERFACE_CONFIG':
        return `${name}(config-if)#`;
      case 'LINE_CONFIG':
        return `${name}(config-line)#`;
      default:
        return `${name}>`;
    }
  }

  public executeLine(rawLine: string): string {
    const trimmed = rawLine.trim();
    if (!trimmed) return '';

    // Add to history
    this.history.push(trimmed);
    this.historyPointer = this.history.length;

    // Check for pipes
    const { baseCommand, filter } = parsePipeSyntax(trimmed);

    // Get current mode tree
    const tree = this.trees.get(this.state.mode);
    if (!tree) {
      return '% Internal CLI state error';
    }

    const context = {
      device: this.device,
      session: this.state,
      rawCommand: baseCommand,
      args: [],
    };

    const rawOutput = tree.execute(baseCommand, context);
    if (!rawOutput) return '';

    return applyPipeFilter(rawOutput, filter);
  }

  public handleTab(currentLine: string): CliTabResult {
    const tree = this.trees.get(this.state.mode);
    if (!tree) return { completedLine: currentLine, candidates: [], isAmbiguous: false };
    return tree.complete(currentLine);
  }

  public handleHelp(currentLine: string): CliHelpItem[] {
    const tree = this.trees.get(this.state.mode);
    if (!tree) return [];
    return tree.getHelp(currentLine);
  }

  public historyPrevious(): string | null {
    if (this.history.length === 0) return null;
    if (this.historyPointer > 0) {
      this.historyPointer--;
      return this.history[this.historyPointer];
    }
    return this.history[0];
  }

  public historyNext(): string | null {
    if (this.history.length === 0) return null;
    if (this.historyPointer < this.history.length - 1) {
      this.historyPointer++;
      return this.history[this.historyPointer];
    }
    this.historyPointer = this.history.length;
    return '';
  }
}
