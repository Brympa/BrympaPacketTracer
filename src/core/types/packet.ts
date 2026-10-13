/**
 * Protocol packet structures (L2 ARP, L3 IPv4, L3 ICMP).
 */

import { Ipv4Address, MacAddress } from './network';

export interface ArpPacket {
  hardwareType: 1; // 1 = Ethernet
  protocolType: 0x0800; // 0x0800 = IPv4
  hardwareSize: 6; // 6 bytes for MAC
  protocolSize: 4; // 4 bytes for IPv4
  operation: 'REQUEST' | 'REPLY';
  senderMac: MacAddress;
  senderIp: Ipv4Address;
  targetMac: MacAddress;
  targetIp: Ipv4Address;
}

export type IpProtocol = 1 | 6 | 17; // 1 = ICMP, 6 = TCP, 17 = UDP

export interface Ipv4Packet {
  version: 4;
  ihl: 5; // Internet Header Length (5 x 32-bit words = 20 bytes)
  tos: 0; // Type of Service
  totalLength: number; // in bytes
  identification: number;
  flags: number; // 3 bits
  fragmentOffset: number; // 13 bits
  ttl: number; // Time to Live
  protocol: IpProtocol;
  checksum: number;
  srcIp: Ipv4Address;
  destIp: Ipv4Address;
  payload: IcmpPacket | Uint8Array;
}

export type IcmpType = 
  | 0  // Echo Reply
  | 3  // Destination Unreachable
  | 8  // Echo Request
  | 11; // Time Exceeded

export interface IcmpPacket {
  type: IcmpType;
  code: number;
  checksum: number;
  identifier: number;
  sequenceNumber: number;
  data?: Uint8Array | string;
}
