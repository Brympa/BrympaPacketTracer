import { EthernetFrame } from '../types/frame';
import { ArpEntry, Ipv4Address, RouteEntry, SubnetMask } from '../types/network';
import { ArpPacket, IcmpPacket, Ipv4Packet } from '../types/packet';
import { getNetworkAddress, ipToNumber, maskToPrefix } from '../utils/ip';
import { BROADCAST_MAC, generateMac, isBroadcastMac, normalizeMac } from '../utils/mac';
import { BaseDevice } from './base-device';

export interface RouterConfig {
  id: string;
  name: string;
  interfaceCount?: number; // Default 4 Gigabit interfaces
}

export class VirtualRouter extends BaseDevice {
  private readonly routingTable: RouteEntry[] = [];
  private readonly arpTable = new Map<Ipv4Address, ArpEntry>();
  private readonly pendingPackets = new Map<Ipv4Address, Ipv4Packet[]>();
  private readonly arpAgingTimeoutNs = 300_000_000_000n;

  constructor(config: RouterConfig) {
    super(config.id, config.name, 'ROUTER');

    const ifaceCount = config.interfaceCount ?? 4;
    for (let i = 0; i < ifaceCount; i++) {
      const ifaceName = `GigabitEthernet0/${i}`;
      this.addInterface({
        id: `${this.id}-${ifaceName}`,
        name: ifaceName,
        macAddress: generateMac(`00:D0:BA`),
        status: 'DOWN',
        adminStatus: 'UP',
        mode: 'routed',
        accessVlan: 1,
        allowedVlans: [1],
        nativeVlan: 1,
      });
    }
  }

  public configureInterface(
    interfaceName: string,
    ip: Ipv4Address,
    mask: SubnetMask,
    adminStatus: 'UP' | 'DOWN' = 'UP'
  ): void {
    const iface = this.getInterface(interfaceName);
    if (!iface) {
      throw new Error(`Interface ${interfaceName} not found on Router ${this.name}`);
    }

    iface.configureIp(ip, mask);
    iface.setAdminStatus(adminStatus);
    this.refreshConnectedRoutes();
  }

  public addStaticRoute(
    network: Ipv4Address,
    netmask: SubnetMask,
    nextHop: Ipv4Address,
    interfaceName?: string,
    metric = 1
  ): void {
    let resolvedIface = interfaceName;
    if (!resolvedIface) {
      // Find which interface can reach the nextHop IP
      const match = this.findLongestPrefixMatch(nextHop);
      if (match) {
        resolvedIface = match.interfaceName;
      } else {
        throw new Error(`Cannot resolve outgoing interface for next-hop: ${nextHop}`);
      }
    }

    const prefixLength = maskToPrefix(netmask);
    const normalizedNet = getNetworkAddress(network, netmask);

    // Remove existing identical route if any
    const existingIndex = this.routingTable.findIndex(
      (r) => r.network === normalizedNet && r.prefixLength === prefixLength
    );
    if (existingIndex >= 0) {
      this.routingTable.splice(existingIndex, 1);
    }

    this.routingTable.push({
      network: normalizedNet,
      netmask,
      prefixLength,
      nextHop,
      interfaceName: resolvedIface,
      metric,
      type: 'STATIC',
    });

    this.sortRoutingTable();
  }

  public refreshConnectedRoutes(): void {
    // Remove all old connected routes
    for (let i = this.routingTable.length - 1; i >= 0; i--) {
      if (this.routingTable[i].type === 'CONNECTED') {
        this.routingTable.splice(i, 1);
      }
    }

    // Add active connected routes
    for (const iface of this.getAllInterfaces()) {
      if (iface.isUp() && iface.ipAddress && iface.subnetMask) {
        const prefixLength = maskToPrefix(iface.subnetMask);
        const network = getNetworkAddress(iface.ipAddress, iface.subnetMask);
        this.routingTable.push({
          network,
          netmask: iface.subnetMask,
          prefixLength,
          interfaceName: iface.name,
          metric: 0,
          type: 'CONNECTED',
        });
      }
    }

    this.sortRoutingTable();
  }

  private sortRoutingTable(): void {
    // Sort descending by prefix length (Longest Prefix Match first), then ascending by metric
    this.routingTable.sort((a, b) => {
      if (b.prefixLength !== a.prefixLength) {
        return b.prefixLength - a.prefixLength;
      }
      return a.metric - b.metric;
    });
  }

  public findLongestPrefixMatch(destIp: Ipv4Address): RouteEntry | null {
    const destNum = ipToNumber(destIp);

    for (const route of this.routingTable) {
      const maskNum = ipToNumber(route.netmask);
      const netNum = ipToNumber(route.network);
      if (((destNum & maskNum) >>> 0) === netNum) {
        return route;
      }
    }
    return null;
  }

  public receiveFrame(
    frame: EthernetFrame,
    ingressInterfaceName: string,
    arrivalTime: bigint
  ): void {
    const ingressIface = this.getInterface(ingressInterfaceName);
    if (!ingressIface || !ingressIface.isUp()) return;

    const destMac = normalizeMac(frame.destMac);
    const myMac = normalizeMac(ingressIface.macAddress);

    // Frame must be destined for router's interface MAC or broadcast
    if (destMac !== myMac && !isBroadcastMac(destMac)) {
      return;
    }

    if (frame.etherType === 0x0806) {
      this.handleArpPacket(frame.payload as ArpPacket, ingressInterfaceName, arrivalTime);
    } else if (frame.etherType === 0x0800) {
      this.handleIpv4Packet(frame.payload as Ipv4Packet, ingressInterfaceName, arrivalTime);
    }
  }

  private handleArpPacket(
    arp: ArpPacket,
    interfaceName: string,
    arrivalTime: bigint
  ): void {
    const iface = this.getInterface(interfaceName);
    if (!iface || !iface.ipAddress) return;

    // Learn sender in router ARP cache
    this.arpTable.set(arp.senderIp, {
      ip: arp.senderIp,
      mac: normalizeMac(arp.senderMac),
      interfaceName,
      learnedAt: arrivalTime,
    });

    if (arp.operation === 'REQUEST') {
      if (arp.targetIp === iface.ipAddress) {
        // Send ARP Reply
        const reply: ArpPacket = {
          hardwareType: 1,
          protocolType: 0x0800,
          hardwareSize: 6,
          protocolSize: 4,
          operation: 'REPLY',
          senderMac: iface.macAddress,
          senderIp: iface.ipAddress,
          targetMac: arp.senderMac,
          targetIp: arp.senderIp,
        };

        const frame: EthernetFrame = {
          srcMac: iface.macAddress,
          destMac: arp.senderMac,
          etherType: 0x0806,
          payload: reply,
        };

        this.sendFrame(frame, interfaceName);
      }
    } else if (arp.operation === 'REPLY') {
      // Flush pending packets waiting for this IP
      const queued = this.pendingPackets.get(arp.senderIp);
      if (queued && queued.length > 0) {
        this.pendingPackets.delete(arp.senderIp);
        for (const packet of queued) {
          const frame: EthernetFrame = {
            srcMac: iface.macAddress,
            destMac: arp.senderMac,
            etherType: 0x0800,
            payload: packet,
          };
          this.sendFrame(frame, interfaceName);
        }
      }
    }
  }

  private handleIpv4Packet(
    packet: Ipv4Packet,
    ingressInterfaceName: string,
    arrivalTime: bigint
  ): void {
    const ingressIface = this.getInterface(ingressInterfaceName);
    if (!ingressIface || !ingressIface.ipAddress) return;

    // Check if packet is destined for any of the router's interfaces
    const localIface = this.getAllInterfaces().find((i) => i.ipAddress === packet.destIp);

    if (localIface) {
      // Local delivery to router
      if (packet.protocol === 1) {
        const icmp = packet.payload as IcmpPacket;
        if (icmp.type === 8) {
          // ICMP Echo Request -> reply
          const replyIcmp: IcmpPacket = {
            type: 0,
            code: 0,
            checksum: 0,
            identifier: icmp.identifier,
            sequenceNumber: icmp.sequenceNumber,
            data: icmp.data,
          };
          this.forwardOrReplyPacket(packet.srcIp, localIface.ipAddress!, 1, replyIcmp);
        }
      }
      return;
    }

    // Packet needs forwarding:
    // 1. Decrement TTL
    const newTtl = packet.ttl - 1;
    if (newTtl <= 0) {
      // TTL Expired in transit
      this.context?.logTrace(`Router ${this.name}: TTL expired for packet from ${packet.srcIp} to ${packet.destIp}`);
      const origIcmp = packet.payload as Partial<IcmpPacket>;
      const timeExceededIcmp: IcmpPacket = {
        type: 11,
        code: 0,
        checksum: 0,
        identifier: origIcmp?.identifier ?? 0,
        sequenceNumber: origIcmp?.sequenceNumber ?? 0,
      };
      this.forwardOrReplyPacket(packet.srcIp, ingressIface.ipAddress, 1, timeExceededIcmp);
      return;
    }

    // 2. Longest Prefix Match
    const route = this.findLongestPrefixMatch(packet.destIp);
    if (!route) {
      // Destination unreachable
      this.context?.logTrace(`Router ${this.name}: No route to ${packet.destIp}`);
      const origIcmp = packet.payload as Partial<IcmpPacket>;
      const unreachIcmp: IcmpPacket = {
        type: 3,
        code: 0,
        checksum: 0,
        identifier: origIcmp?.identifier ?? 0,
        sequenceNumber: origIcmp?.sequenceNumber ?? 0,
      };
      this.forwardOrReplyPacket(packet.srcIp, ingressIface.ipAddress, 1, unreachIcmp);
      return;
    }

    // 3. Forward packet via egress interface
    const egressIface = this.getInterface(route.interfaceName);
    if (!egressIface || !egressIface.isUp()) {
      return;
    }

    const forwardedPacket: Ipv4Packet = {
      ...packet,
      ttl: newTtl,
    };

    const nextHopIp = route.type === 'CONNECTED' ? packet.destIp : route.nextHop!;
    this.sendPacketToNextHop(forwardedPacket, nextHopIp, egressIface.name, arrivalTime);
  }

  private forwardOrReplyPacket(
    destIp: Ipv4Address,
    srcIp: Ipv4Address,
    protocol: 1 | 6 | 17,
    payload: IcmpPacket | Uint8Array
  ): void {
    const route = this.findLongestPrefixMatch(destIp);
    if (!route) return;

    const egressIface = this.getInterface(route.interfaceName);
    if (!egressIface || !egressIface.isUp()) return;

    const packet: Ipv4Packet = {
      version: 4,
      ihl: 5,
      tos: 0,
      totalLength: 84,
      identification: Math.floor(Math.random() * 65535),
      flags: 0,
      fragmentOffset: 0,
      ttl: 64,
      protocol,
      checksum: 0,
      srcIp,
      destIp,
      payload,
    };

    const nextHopIp = route.type === 'CONNECTED' ? destIp : route.nextHop!;
    const now = this.context?.now() ?? 0n;
    this.sendPacketToNextHop(packet, nextHopIp, egressIface.name, now);
  }

  private sendPacketToNextHop(
    packet: Ipv4Packet,
    nextHopIp: Ipv4Address,
    egressInterfaceName: string,
    now: bigint
  ): void {
    const egressIface = this.getInterface(egressInterfaceName);
    if (!egressIface || !egressIface.isUp() || !egressIface.ipAddress) return;

    const arpEntry = this.arpTable.get(nextHopIp);
    if (arpEntry && now - arpEntry.learnedAt <= this.arpAgingTimeoutNs) {
      // Known MAC
      const frame: EthernetFrame = {
        srcMac: egressIface.macAddress,
        destMac: arpEntry.mac,
        etherType: 0x0800,
        payload: packet,
      };
      this.sendFrame(frame, egressInterfaceName);
    } else {
      // Queue packet and send ARP Request on egress interface
      let queue = this.pendingPackets.get(nextHopIp);
      if (!queue) {
        queue = [];
        this.pendingPackets.set(nextHopIp, queue);
      }
      queue.push(packet);

      const arpRequest: ArpPacket = {
        hardwareType: 1,
        protocolType: 0x0800,
        hardwareSize: 6,
        protocolSize: 4,
        operation: 'REQUEST',
        senderMac: egressIface.macAddress,
        senderIp: egressIface.ipAddress,
        targetMac: '00:00:00:00:00:00',
        targetIp: nextHopIp,
      };

      const frame: EthernetFrame = {
        srcMac: egressIface.macAddress,
        destMac: BROADCAST_MAC,
        etherType: 0x0806,
        payload: arpRequest,
      };

      this.sendFrame(frame, egressInterfaceName);
    }
  }

  public getRoutingTable(): RouteEntry[] {
    return this.routingTable.slice();
  }

  public getArpTable(): ArpEntry[] {
    return Array.from(this.arpTable.values());
  }
}
