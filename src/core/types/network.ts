/**
 * Domain types for network addressing and interfaces.
 * Zero-dependency pure TypeScript.
 */

export type MacAddress = string; // e.g. "00:1A:2B:3C:4D:5E"
export type Ipv4Address = string; // e.g. "192.168.1.1"
export type SubnetMask = string; // e.g. "255.255.255.0"
export type PortId = string;

export interface NetworkInterfaceConfig {
  id: string;
  name: string; // e.g. "FastEthernet0/1", "GigabitEthernet0/0", "eth0"
  macAddress: MacAddress;
  ipAddress?: Ipv4Address;
  subnetMask?: SubnetMask;
  status: 'UP' | 'DOWN';
  adminStatus: 'UP' | 'DOWN';
  mode: 'access' | 'trunk' | 'routed';
  accessVlan: number; // Default 1
  allowedVlans: number[]; // e.g. [1, 10, 20]
  nativeVlan: number; // Default 1
  duplex?: 'full' | 'half';
  bandwidthMbps?: number; // e.g. 100, 1000
}

export interface RouteEntry {
  network: Ipv4Address;
  netmask: SubnetMask;
  prefixLength: number; // e.g. 24 for 255.255.255.0
  nextHop?: Ipv4Address; // undefined for CONNECTED
  interfaceName: string;
  metric: number;
  type: 'CONNECTED' | 'STATIC';
}

export interface ArpEntry {
  ip: Ipv4Address;
  mac: MacAddress;
  interfaceName: string;
  learnedAt: bigint; // Virtual time in nanoseconds
}

export interface CamEntry {
  mac: MacAddress;
  interfaceName: string;
  vlanId: number;
  learnedAt: bigint; // Virtual time in nanoseconds
}
