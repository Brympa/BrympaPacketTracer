/**
 * L2 Ethernet Frame structures with optional 802.1Q VLAN Tagging.
 */

import { MacAddress } from './network';
import { ArpPacket, Ipv4Packet } from './packet';

export type EtherType = 0x0806 | 0x0800; // 0x0806 = ARP, 0x0800 = IPv4

export interface EthernetFrame {
  destMac: MacAddress;
  srcMac: MacAddress;
  etherType: EtherType;
  vlanId?: number; // 802.1Q VLAN Tag (1 - 4094), undefined if untagged
  payload: ArpPacket | Ipv4Packet;
  fcs?: number; // Frame Check Sequence (CRC32 simulation)
}
