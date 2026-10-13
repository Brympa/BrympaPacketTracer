import { MacAddress, Ipv4Address, SubnetMask } from '../core/types/network';
import { DeviceType } from '../core/devices/base-device';

// Visual packet representation for 60 FPS Canvas 2D overlay
export interface FlyingPacketVisual {
  id: number;
  linkId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  progress: number; // 0.0 (departure) to 1.0 (arrival)
  etherType: number; // 0x0806 (ARP), 0x0800 (IPv4)
  srcMac: MacAddress;
  destMac: MacAddress;
  srcIp?: Ipv4Address;
  destIp?: Ipv4Address;
  protocol?: number; // 1 (ICMP), etc.
}

export interface SerializedInterface {
  id: string;
  name: string;
  macAddress: MacAddress;
  ipAddress?: Ipv4Address;
  subnetMask?: SubnetMask;
  status: 'UP' | 'DOWN';
  adminStatus: 'UP' | 'DOWN';
  mode: 'access' | 'trunk' | 'routed';
  accessVlan: number;
  allowedVlans: number[];
  connectedLinkId?: string;
}

import { RouteEntry, CamEntry, ArpEntry } from '../core/types/network';

export interface SerializedDevice {
  id: string;
  name: string;
  type: DeviceType;
  interfaces: SerializedInterface[];
  defaultGateway?: Ipv4Address;
  routingTable?: RouteEntry[];
  camTable?: CamEntry[];
  arpTable?: ArpEntry[];
}

export interface SerializedLink {
  id: string;
  source: { deviceId: string; interfaceName: string };
  target: { deviceId: string; interfaceName: string };
  status: 'UP' | 'DOWN';
  delayNs: string; // Serialized bigint
}

// UI -> Worker Messages
export type UiToWorkerMessage =
  | { type: 'INIT_ENGINE' }
  | { type: 'ADD_DEVICE'; payload: { id: string; name: string; type: DeviceType; portCount?: number } }
  | { type: 'REMOVE_DEVICE'; payload: { deviceId: string } }
  | { type: 'CONNECT_LINK'; payload: { id: string; source: { deviceId: string; interfaceName: string }; target: { deviceId: string; interfaceName: string }; delayNs?: string } }
  | { type: 'DISCONNECT_LINK'; payload: { linkId: string } }
  | { type: 'CONFIGURE_HOST'; payload: { hostId: string; ip?: string; mask?: string; gateway?: string } }
  | { type: 'CONFIGURE_INTERFACE'; payload: { deviceId: string; interfaceName: string; ip?: string; mask?: string; adminStatus?: 'UP' | 'DOWN'; mode?: 'access' | 'trunk'; accessVlan?: number } }
  | { type: 'ADD_STATIC_ROUTE'; payload: { routerId: string; network: string; netmask: string; nextHop: string } }
  | { type: 'REMOVE_STATIC_ROUTE'; payload: { routerId: string; network: string; netmask: string } }
  | { type: 'CLI_INPUT'; payload: { deviceId: string; line: string } }
  | { type: 'CLI_TAB'; payload: { deviceId: string; currentLine: string } }
  | { type: 'CLI_HELP'; payload: { deviceId: string; currentLine: string } }
  | { type: 'SIM_START'; payload?: { speedMultiplier?: number } }
  | { type: 'SIM_PAUSE' }
  | { type: 'SIM_STEP' }
  | { type: 'SIM_RESET' }
  | { type: 'HOST_PING'; payload: { hostId: string; targetIp: string } };

// Worker -> UI Messages
export type WorkerToUiMessage =
  | { type: 'TOPOLOGY_SYNC'; payload: { devices: SerializedDevice[]; links: SerializedLink[] } }
  | { type: 'CLI_OUTPUT'; payload: { deviceId: string; output: string; prompt: string } }
  | { type: 'CLI_TAB_REPLY'; payload: { deviceId: string; completedLine: string; candidates: string[]; isAmbiguous: boolean } }
  | { type: 'CLI_HELP_REPLY'; payload: { deviceId: string; items: Array<{ token: string; description: string }> } }
  | { type: 'VISUAL_DELTA_BATCH'; payload: { packets: FlyingPacketVisual[]; virtualTimeNs: string } }
  | { type: 'SIM_STATS'; payload: { virtualTimeNs: string; queueSize: number; isRunning: boolean } }
  | { type: 'PING_REPLY'; payload: { hostId: string; targetIp: string; status: string; rttMs?: number; message?: string } };
