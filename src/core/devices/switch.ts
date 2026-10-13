import { EthernetFrame } from '../types/frame';
import { CamEntry } from '../types/network';
import { isBroadcastMac, normalizeMac } from '../utils/mac';
import { BaseDevice } from './base-device';

export interface SwitchConfig {
  id: string;
  name: string;
  portCount?: number; // Default 24 ports (FastEthernet0/1 .. FastEthernet0/24)
  camAgingTimeoutNs?: bigint; // Default 300 seconds
}

export class VirtualSwitch extends BaseDevice {
  private readonly camTable = new Map<string, CamEntry>(); // Key: `${vlanId}:${normalizedMac}`
  private readonly camAgingTimeoutNs: bigint;

  constructor(config: SwitchConfig) {
    super(config.id, config.name, 'SWITCH');
    this.camAgingTimeoutNs = config.camAgingTimeoutNs ?? 300_000_000_000n; // 300s in nanoseconds

    const portCount = config.portCount ?? 24;
    for (let i = 1; i <= portCount; i++) {
      const portName = `FastEthernet0/${i}`;
      this.addInterface({
        id: `${this.id}-${portName}`,
        name: portName,
        macAddress: `00:E0:F9:SW:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 0xff).toString(16).padStart(2, '0')}`.toUpperCase(),
        status: 'DOWN',
        adminStatus: 'UP',
        mode: 'access',
        accessVlan: 1,
        allowedVlans: [1],
        nativeVlan: 1,
      });
    }
  }

  public receiveFrame(
    frame: EthernetFrame,
    ingressInterfaceName: string,
    arrivalTime: bigint
  ): void {
    const ingressIface = this.getInterface(ingressInterfaceName);
    if (!ingressIface || !ingressIface.isUp()) return;

    // 1. Determine Frame VLAN
    let frameVlan = 1;
    if (ingressIface.mode === 'access') {
      if (frame.vlanId !== undefined) {
        // Access ports drop tagged frames
        this.context?.logTrace(`Switch ${this.name} dropped tagged frame on access port ${ingressInterfaceName}`);
        ingressIface.stats.droppedFrames++;
        return;
      }
      frameVlan = ingressIface.accessVlan;
    } else if (ingressIface.mode === 'trunk') {
      if (frame.vlanId !== undefined) {
        if (!ingressIface.allowedVlans.includes(frame.vlanId)) {
          this.context?.logTrace(`Switch ${this.name} dropped frame: VLAN ${frame.vlanId} not allowed on trunk`);
          ingressIface.stats.droppedFrames++;
          return;
        }
        frameVlan = frame.vlanId;
      } else {
        frameVlan = ingressIface.nativeVlan;
      }
    }

    // 2. CAM Learning (Source MAC)
    const srcMac = normalizeMac(frame.srcMac);
    const camKey = `${frameVlan}:${srcMac}`;
    this.camTable.set(camKey, {
      mac: srcMac,
      interfaceName: ingressInterfaceName,
      vlanId: frameVlan,
      learnedAt: arrivalTime,
    });

    // 3. Forwarding logic
    const destMac = normalizeMac(frame.destMac);

    if (isBroadcastMac(destMac)) {
      this.floodFrame(frame, frameVlan, ingressInterfaceName);
      return;
    }

    // Unicast lookup
    const targetKey = `${frameVlan}:${destMac}`;
    const entry = this.camTable.get(targetKey);

    if (entry && arrivalTime - entry.learnedAt <= this.camAgingTimeoutNs) {
      // Known unicast
      if (entry.interfaceName !== ingressInterfaceName) {
        this.forwardOutInterface(frame, frameVlan, entry.interfaceName);
      }
    } else {
      // Unknown unicast: flood to all ports in same VLAN
      if (entry) {
        this.camTable.delete(targetKey); // Expired
      }
      this.floodFrame(frame, frameVlan, ingressInterfaceName);
    }
  }

  private floodFrame(frame: EthernetFrame, vlanId: number, ingressInterfaceName: string): void {
    for (const iface of this.getAllInterfaces()) {
      if (iface.name === ingressInterfaceName || !iface.isUp()) continue;
      this.forwardOutInterface(frame, vlanId, iface.name);
    }
  }

  private forwardOutInterface(
    frame: EthernetFrame,
    vlanId: number,
    egressInterfaceName: string
  ): void {
    const egressIface = this.getInterface(egressInterfaceName);
    if (!egressIface || !egressIface.isUp()) return;

    let egressFrame: EthernetFrame;

    if (egressIface.mode === 'access') {
      if (egressIface.accessVlan !== vlanId) return; // Not in this VLAN
      // Strip tag on access port
      egressFrame = {
        destMac: frame.destMac,
        srcMac: frame.srcMac,
        etherType: frame.etherType,
        payload: frame.payload,
      };
    } else {
      // Trunk mode
      if (!egressIface.allowedVlans.includes(vlanId)) return;
      if (vlanId === egressIface.nativeVlan) {
        // Native VLAN untagged
        egressFrame = {
          destMac: frame.destMac,
          srcMac: frame.srcMac,
          etherType: frame.etherType,
          payload: frame.payload,
        };
      } else {
        // Tag with 802.1Q
        egressFrame = {
          destMac: frame.destMac,
          srcMac: frame.srcMac,
          etherType: frame.etherType,
          vlanId,
          payload: frame.payload,
        };
      }
    }

    this.sendFrame(egressFrame, egressInterfaceName);
  }

  public getCamTable(now?: bigint): CamEntry[] {
    const entries: CamEntry[] = [];
    for (const [key, entry] of this.camTable.entries()) {
      if (now !== undefined && now - entry.learnedAt > this.camAgingTimeoutNs) {
        this.camTable.delete(key);
        continue;
      }
      entries.push({ ...entry });
    }
    return entries;
  }

  public clearCamTable(): void {
    this.camTable.clear();
  }
}
