import { BaseDevice } from '../devices/base-device';

export type CliMode = 
  | 'USER_EXEC'          // Router>
  | 'PRIVILEGED_EXEC'    // Router#
  | 'GLOBAL_CONFIG'      // Router(config)#
  | 'INTERFACE_CONFIG'   // Router(config-if)#
  | 'LINE_CONFIG';       // Router(config-line)#

export interface CliSessionState {
  mode: CliMode;
  contextInterfaceName?: string;
  contextLineName?: string;
  terminalRows: number;
  terminalCols: number;
}

export interface CliExecutionContext {
  device: BaseDevice;
  session: CliSessionState;
  rawCommand: string;
  args: string[];
}

export interface CliExecutionResult {
  output?: string;
  error?: string;
  errorIndex?: number; // Position for Cisco '^' error marker
  modeChanged?: boolean;
}

export interface CliHelpItem {
  token: string;
  description: string;
}

export interface CliTabResult {
  completedLine: string;
  candidates: string[];
  isAmbiguous: boolean;
}

export interface CommandNode {
  token: string; // e.g. "show", "interface", "ip"
  description: string; // e.g. "Show running system information"
  isParam?: boolean; // If true, token is a placeholder like "<ip-address>"
  paramType?: 'IP' | 'MASK' | 'IFACE' | 'INT' | 'STRING';
  children?: CommandNode[];
  handler?: (context: CliExecutionContext, parsedArgs: string[]) => string | void;
}
