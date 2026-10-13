/**
 * Discrete Event Simulation (DES) event types.
 * All timestamps are in integer nanoseconds (bigint) to avoid float rounding errors.
 */

import { EthernetFrame } from './frame';

export type SimEventType = 
  | 'FRAME_TRANSMISSION'  // Frame departing a node
  | 'FRAME_ARRIVAL'       // Frame arriving at destination node interface
  | 'ARP_TIMEOUT'         // ARP cache entry expired
  | 'CAM_TIMEOUT'         // CAM entry expired
  | 'CUSTOM_TIMER';       // Protocol timer

export interface SimEvent {
  id: number;
  timestamp: bigint; // Virtual time in nanoseconds
  type: SimEventType;
  sourceDeviceId: string;
  sourceInterfaceName?: string;
  targetDeviceId: string;
  targetInterfaceName: string;
  linkId?: string;
  frame?: EthernetFrame;
  metadata?: Record<string, unknown>;
}
