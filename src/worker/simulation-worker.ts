import { IosCliSession } from '../core/cli/ios-cli';
import { BaseDevice } from '../core/devices/base-device';
import { VirtualHost } from '../core/devices/host';
import { VirtualRouter } from '../core/devices/router';
import { VirtualSwitch } from '../core/devices/switch';
import { SimulationEngine } from '../core/engine/simulation-engine';
import { PhysicalLink } from '../core/topology/link';
import { Ipv4Packet } from '../core/types/packet';
import {
  FlyingPacketVisual,
  SerializedDevice,
  SerializedLink,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from './protocol';

interface InFlightPacket {
  id: number;
  linkId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  departedAt: bigint;
  arrivesAt: bigint;
  etherType: number;
  srcMac: string;
  destMac: string;
  srcIp?: string;
  destIp?: string;
  protocol?: number;
}

export class SimulationWorkerHost {
  public readonly engine = new SimulationEngine();
  private readonly cliSessions = new Map<string, IosCliSession>();
  private readonly inFlightPackets = new Map<number, InFlightPacket>();
  private readonly links = new Map<string, PhysicalLink>();

  private isRunning = false;
  private simTimer: any = null;
  private visualTimer: any = null;
  private speedMultiplier = 1.0;
  private postMessageFn: (msg: WorkerToUiMessage) => void;

  constructor(postMessageFn: (msg: WorkerToUiMessage) => void) {
    this.postMessageFn = postMessageFn;

    // Track scheduled events for packet flight visualization
    this.engine.onEventScheduled = (event) => {
      if (event.type === 'FRAME_ARRIVAL' && event.frame && event.linkId) {
        const link = this.links.get(event.linkId);
        const duration = link ? link.delayNs : 1_000_000n;
        const departedAt = event.timestamp - duration;

        const ipv4 = event.frame.etherType === 0x0800 ? (event.frame.payload as Ipv4Packet) : undefined;

        this.inFlightPackets.set(event.id, {
          id: event.id,
          linkId: event.linkId,
          sourceDeviceId: event.sourceDeviceId,
          targetDeviceId: event.targetDeviceId,
          departedAt,
          arrivesAt: event.timestamp,
          etherType: event.frame.etherType,
          srcMac: event.frame.srcMac,
          destMac: event.frame.destMac,
          srcIp: ipv4?.srcIp,
          destIp: ipv4?.destIp,
          protocol: ipv4?.protocol,
        });
      }
    };

    // When an event is dispatched, remove from flight if delivered
    this.engine.onEventDispatched = (event) => {
      if (event.type === 'FRAME_ARRIVAL') {
        this.inFlightPackets.delete(event.id);
      }
    };

    // Start 30Hz visual broadcast timer
    this.startVisualBroadcastTimer();
  }

  public handleMessage(msg: UiToWorkerMessage): void {
    switch (msg.type) {
      case 'INIT_ENGINE':
        this.engine.clear();
        this.cliSessions.clear();
        this.inFlightPackets.clear();
        this.links.clear();
        this.syncTopology();
        break;

      case 'ADD_DEVICE': {
        const { id, name, type, portCount } = msg.payload;
        let device: BaseDevice;
        if (type === 'SWITCH') {
          device = new VirtualSwitch({ id, name, portCount });
        } else if (type === 'ROUTER') {
          device = new VirtualRouter({ id, name, interfaceCount: portCount });
        } else {
          device = new VirtualHost({ id, name });
        }

        this.engine.addDevice(device);
        this.cliSessions.set(id, new IosCliSession(device));
        this.syncTopology();
        break;
      }

      case 'REMOVE_DEVICE':
        this.engine.removeDevice(msg.payload.deviceId);
        this.cliSessions.delete(msg.payload.deviceId);
        this.syncTopology();
        break;

      case 'CONNECT_LINK': {
        const { id, source, target, delayNs } = msg.payload;
        const link = new PhysicalLink({
          id,
          source,
          target,
          delayNs: delayNs ? BigInt(delayNs) : 1_000_000n,
        });
        this.links.set(id, link);
        this.engine.connectLink(link);
        this.syncTopology();
        break;
      }

      case 'DISCONNECT_LINK':
        this.links.delete(msg.payload.linkId);
        this.engine.disconnectLink(msg.payload.linkId);
        this.syncTopology();
        break;

      case 'CLI_INPUT': {
        const { deviceId, line } = msg.payload;
        const session = this.cliSessions.get(deviceId);
        if (session) {
          const output = session.executeLine(line);
          this.postMessageFn({
            type: 'CLI_OUTPUT',
            payload: {
              deviceId,
              output,
              prompt: session.getPrompt(),
            },
          });
          this.syncTopology();
        }
        break;
      }

      case 'CLI_TAB': {
        const { deviceId, currentLine } = msg.payload;
        const session = this.cliSessions.get(deviceId);
        if (session) {
          const res = session.handleTab(currentLine);
          this.postMessageFn({
            type: 'CLI_TAB_REPLY',
            payload: {
              deviceId,
              completedLine: res.completedLine,
              candidates: res.candidates,
              isAmbiguous: res.isAmbiguous,
            },
          });
        }
        break;
      }

      case 'CLI_HELP': {
        const { deviceId, currentLine } = msg.payload;
        const session = this.cliSessions.get(deviceId);
        if (session) {
          const items = session.handleHelp(currentLine);
          this.postMessageFn({
            type: 'CLI_HELP_REPLY',
            payload: { deviceId, items },
          });
        }
        break;
      }

      case 'SIM_START':
        this.speedMultiplier = msg.payload?.speedMultiplier ?? 1.0;
        this.startSimulationLoop();
        break;

      case 'SIM_PAUSE':
        this.pauseSimulationLoop();
        break;

      case 'SIM_STEP':
        this.pauseSimulationLoop();
        this.engine.step();
        this.broadcastStats();
        break;

      case 'SIM_RESET':
        this.pauseSimulationLoop();
        this.engine.clear();
        this.inFlightPackets.clear();
        this.broadcastStats();
        break;

      case 'HOST_PING': {
        const { hostId, targetIp } = msg.payload;
        const dev = this.engine.getDevice(hostId);
        if (dev && dev.type === 'HOST') {
          (dev as VirtualHost).ping(targetIp, (res) => {
            this.postMessageFn({
              type: 'PING_REPLY',
              payload: {
                hostId,
                targetIp: res.targetIp,
                status: res.status,
                rttMs: res.roundTripTimeNs ? Number(res.roundTripTimeNs / 1_000_000n) : undefined,
                message: res.message,
              },
            });
          });
        }
        break;
      }
    }
  }

  private startSimulationLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Simulate 20ms of virtual time every 20ms of real time (speed = 1.0)
    const tickIntervalMs = 20;
    this.simTimer = setInterval(() => {
      const virtualDeltaNs = BigInt(Math.floor(tickIntervalMs * 1_000_000 * this.speedMultiplier));
      const targetTime = this.engine.now() + virtualDeltaNs;
      this.engine.runUntil(targetTime);
      this.broadcastStats();
    }, tickIntervalMs);
  }

  private pauseSimulationLoop(): void {
    this.isRunning = false;
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.broadcastStats();
  }

  private startVisualBroadcastTimer(): void {
    // 30 Hz updates = every 33ms
    this.visualTimer = setInterval(() => {
      const now = this.engine.now();
      const visuals: FlyingPacketVisual[] = [];

      for (const [id, flight] of this.inFlightPackets.entries()) {
        const total = Number(flight.arrivesAt - flight.departedAt);
        const elapsed = Number(now - flight.departedAt);
        const progress = total > 0 ? Math.min(1.0, Math.max(0.0, elapsed / total)) : 1.0;

        visuals.push({
          id,
          linkId: flight.linkId,
          sourceDeviceId: flight.sourceDeviceId,
          targetDeviceId: flight.targetDeviceId,
          progress,
          etherType: flight.etherType,
          srcMac: flight.srcMac,
          destMac: flight.destMac,
          srcIp: flight.srcIp,
          destIp: flight.destIp,
          protocol: flight.protocol,
        });
      }

      this.postMessageFn({
        type: 'VISUAL_DELTA_BATCH',
        payload: {
          packets: visuals,
          virtualTimeNs: now.toString(),
        },
      });
    }, 33);
  }

  public syncTopology(): void {
    const devices: SerializedDevice[] = [];
    for (const [id, dev] of this.cliSessions.entries()) {
      devices.push({
        id,
        name: dev.device.name,
        type: dev.device.type,
        interfaces: dev.device.getAllInterfaces().map((iface) => ({
          id: iface.id,
          name: iface.name,
          macAddress: iface.macAddress,
          ipAddress: iface.ipAddress,
          subnetMask: iface.subnetMask,
          status: iface.status,
          adminStatus: iface.adminStatus,
          mode: iface.mode,
          accessVlan: iface.accessVlan,
          allowedVlans: iface.allowedVlans,
          connectedLinkId: iface.connectedLinkId,
        })),
      });
    }

    const links: SerializedLink[] = [];
    for (const [id, link] of this.links.entries()) {
      links.push({
        id,
        source: link.source,
        target: link.target,
        status: link.status,
        delayNs: link.delayNs.toString(),
      });
    }

    this.postMessageFn({
      type: 'TOPOLOGY_SYNC',
      payload: { devices, links },
    });
  }

  private broadcastStats(): void {
    this.postMessageFn({
      type: 'SIM_STATS',
      payload: {
        virtualTimeNs: this.engine.now().toString(),
        queueSize: this.engine.getQueueLength(),
        isRunning: this.isRunning,
      },
    });
  }

  public destroy(): void {
    this.pauseSimulationLoop();
    if (this.visualTimer) {
      clearInterval(this.visualTimer);
    }
  }
}

// In real browser Web Worker context:
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  const host = new SimulationWorkerHost((msg) => (self as any).postMessage(msg));
  self.onmessage = (e: MessageEvent<UiToWorkerMessage>) => {
    host.handleMessage(e.data);
  };
}
