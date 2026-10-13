import { EthernetFrame } from '../types/frame';
import { ArpEntry, Ipv4Address, MacAddress, PingResult, SubnetMask } from '../types/network';
import { ArpPacket, IcmpPacket, Ipv4Packet } from '../types/packet';
import { isBroadcastIp, isSameSubnet } from '../utils/ip';
import { BROADCAST_MAC, generateMac, isBroadcastMac, normalizeMac } from '../utils/mac';
import { BaseDevice } from './base-device';

export type { PingResult };

export interface HostConfig {
  id: string;
  name: string;
  macAddress?: MacAddress;
  ipAddress?: Ipv4Address;
  subnetMask?: SubnetMask;
  defaultGateway?: Ipv4Address;
  arpAgingTimeoutNs?: bigint;
}

export class VirtualHost extends BaseDevice {
  public defaultGateway?: Ipv4Address;
  private readonly arpTable = new Map<Ipv4Address, ArpEntry>();
  private readonly pendingPackets = new Map<Ipv4Address, Ipv4Packet[]>();
  private readonly arpAgingTimeoutNs: bigint;
  private icmpSeqCounter = 1;
  private activePings = new Map<number, { targetIp: Ipv4Address; sentAt: bigint; callback?: (res: PingResult) => void }>();

  constructor(config: HostConfig) {
    super(config.id, config.name, 'HOST');
    this.defaultGateway = config.defaultGateway;
    this.arpAgingTimeoutNs = config.arpAgingTimeoutNs ?? 300_000_000_000n;

    const mac = config.macAddress ?? generateMac('00:50:79'); // Host vendor OUI
    this.addInterface({
      id: `${this.id}-eth0`,
      name: 'eth0',
      macAddress: mac,
      ipAddress: config.ipAddress,
      subnetMask: config.subnetMask,
      status: 'DOWN',
      adminStatus: 'UP',
      mode: 'routed',
      accessVlan: 1,
      allowedVlans: [1],
      nativeVlan: 1,
    });
  }

  public get primaryInterface() {
    return this.getInterface('eth0')!;
  }

  public configureNetwork(ip: Ipv4Address, mask: SubnetMask, gateway?: Ipv4Address): void {
    const iface = this.primaryInterface;
    iface.configureIp(ip, mask);
    this.defaultGateway = gateway;
  }

  public receiveFrame(
    frame: EthernetFrame,
    ingressInterfaceName: string,
    arrivalTime: bigint
  ): void {
    const iface = this.getInterface(ingressInterfaceName);
    if (!iface || !iface.isUp()) return;

    const destMac = normalizeMac(frame.destMac);
    const myMac = normalizeMac(iface.macAddress);

    // Filter frames not destined to this host or broadcast
    if (destMac !== myMac && !isBroadcastMac(destMac)) {
      return;
    }

    if (frame.etherType === 0x0806) {
      // ARP
      this.handleArpPacket(frame.payload as ArpPacket, ingressInterfaceName, arrivalTime);
    } else if (frame.etherType === 0x0800) {
      // IPv4
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

    // Learn sender in ARP cache
    this.arpTable.set(arp.senderIp, {
      ip: arp.senderIp,
      mac: normalizeMac(arp.senderMac),
      interfaceName,
      learnedAt: arrivalTime,
    });

    if (arp.operation === 'REQUEST') {
      if (arp.targetIp === iface.ipAddress) {
        // Send ARP Reply
        const replyArp: ArpPacket = {
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
          payload: replyArp,
        };

        this.sendFrame(frame, interfaceName);
      }
    } else if (arp.operation === 'REPLY') {
      // Flush pending packets waiting for this IP/MAC
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
    const iface = this.getInterface(ingressInterfaceName);
    if (!iface || !iface.ipAddress) return;

    const isForMe = packet.destIp === iface.ipAddress;
    const isBroadcast = isBroadcastIp(packet.destIp, iface.subnetMask);

    if (!isForMe && !isBroadcast) return;

    if (packet.protocol === 1) {
      // ICMP
      const icmp = packet.payload as IcmpPacket;
      if (icmp.type === 8 && isForMe) {
        // Echo Request -> Send Echo Reply
        const replyIcmp: IcmpPacket = {
          type: 0,
          code: 0,
          checksum: 0,
          identifier: icmp.identifier,
          sequenceNumber: icmp.sequenceNumber,
          data: icmp.data,
        };

        this.sendIpv4Packet(packet.srcIp, 1, replyIcmp);
      } else if (icmp.type === 0) {
        // Echo Reply
        const active = this.activePings.get(icmp.sequenceNumber);
        if (active) {
          const rtt = arrivalTime - active.sentAt;
          this.activePings.delete(icmp.sequenceNumber);
          active.callback?.({
            targetIp: packet.srcIp,
            sequenceNumber: icmp.sequenceNumber,
            status: 'SUCCESS',
            roundTripTimeNs: rtt,
            message: `Reply from ${packet.srcIp}: seq=${icmp.sequenceNumber} time=${Number(rtt / 1_000_000n)}ms`,
          });
        }
      } else if (icmp.type === 3) {
        // Destination Unreachable
        const active = this.activePings.get(icmp.sequenceNumber);
        if (active) {
          this.activePings.delete(icmp.sequenceNumber);
          active.callback?.({
            targetIp: packet.srcIp,
            sequenceNumber: icmp.sequenceNumber,
            status: 'UNREACHABLE',
            message: `Destination host unreachable from ${packet.srcIp}`,
          });
        }
      } else if (icmp.type === 11) {
        // Time Exceeded
        const active = this.activePings.get(icmp.sequenceNumber);
        if (active) {
          this.activePings.delete(icmp.sequenceNumber);
          active.callback?.({
            targetIp: packet.srcIp,
            sequenceNumber: icmp.sequenceNumber,
            status: 'TTL_EXPIRED',
            message: `TTL expired in transit from ${packet.srcIp}`,
          });
        }
      }
    }
  }

  public sendIpv4Packet(
    destIp: Ipv4Address,
    protocol: 1 | 6 | 17,
    payload: IcmpPacket | Uint8Array,
    ttl = 64
  ): void {
    const iface = this.primaryInterface;
    if (!iface || !iface.isUp() || !iface.ipAddress || !iface.subnetMask) {
      this.context?.logTrace(`Host ${this.name} has no valid UP IP interface to send packet`);
      return;
    }

    const packet: Ipv4Packet = {
      version: 4,
      ihl: 5,
      tos: 0,
      totalLength: 20 + 64,
      identification: Math.floor(Math.random() * 65535),
      flags: 0,
      fragmentOffset: 0,
      ttl,
      protocol,
      checksum: 0,
      srcIp: iface.ipAddress,
      destIp,
      payload,
    };

    // Determine Next Hop IP
    let nextHopIp: Ipv4Address;
    if (isSameSubnet(iface.ipAddress, destIp, iface.subnetMask)) {
      nextHopIp = destIp;
    } else if (this.defaultGateway) {
      nextHopIp = this.defaultGateway;
    } else {
      this.context?.logTrace(`Host ${this.name}: No gateway to reach subnet of ${destIp}`);
      return;
    }

    // Lookup MAC in ARP cache
    const now = this.context?.now() ?? 0n;
    const arpEntry = this.arpTable.get(nextHopIp);

    if (arpEntry && now - arpEntry.learnedAt <= this.arpAgingTimeoutNs) {
      // Known MAC -> send immediately
      const frame: EthernetFrame = {
        srcMac: iface.macAddress,
        destMac: arpEntry.mac,
        etherType: 0x0800,
        payload: packet,
      };
      this.sendFrame(frame, iface.name);
    } else {
      // Queue packet and send ARP Request
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
        senderMac: iface.macAddress,
        senderIp: iface.ipAddress,
        targetMac: '00:00:00:00:00:00',
        targetIp: nextHopIp,
      };

      const frame: EthernetFrame = {
        srcMac: iface.macAddress,
        destMac: BROADCAST_MAC,
        etherType: 0x0806,
        payload: arpRequest,
      };

      this.sendFrame(frame, iface.name);
    }
  }

  public ping(targetIp: Ipv4Address, callback?: (res: PingResult) => void): number {
    const seq = this.icmpSeqCounter++;
    const now = this.context?.now() ?? 0n;

    this.activePings.set(seq, {
      targetIp,
      sentAt: now,
      callback,
    });

    const icmpRequest: IcmpPacket = {
      type: 8,
      code: 0,
      checksum: 0,
      identifier: 1,
      sequenceNumber: seq,
      data: 'packet-tracer-ping',
    };

    this.sendIpv4Packet(targetIp, 1, icmpRequest);
    return seq;
  }

  public getArpTable(): ArpEntry[] {
    return Array.from(this.arpTable.values());
  }

  public clearArpTable(): void {
    this.arpTable.clear();
  }
}
