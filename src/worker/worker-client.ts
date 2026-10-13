import { DeviceType } from '../core/devices/base-device';
import {
  FlyingPacketVisual,
  SerializedDevice,
  SerializedLink,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from './protocol';

export type TopologySyncCallback = (devices: SerializedDevice[], links: SerializedLink[]) => void;
export type CliOutputCallback = (deviceId: string, output: string, prompt: string) => void;
export type VisualDeltaCallback = (packets: FlyingPacketVisual[], virtualTimeNs: string) => void;
export type SimStatsCallback = (stats: { virtualTimeNs: string; queueSize: number; isRunning: boolean }) => void;
export type PingReplyCallback = (reply: { hostId: string; targetIp: string; status: string; rttMs?: number; message?: string }) => void;

export class SimulationWorkerClient {
  private worker: Worker | null = null;
  private mockHost: any = null; // For headless node test environments where Web Worker is unavailable

  public onTopologySync?: TopologySyncCallback;
  public onCliOutput?: CliOutputCallback;
  public onCliTabReply?: (res: { deviceId: string; completedLine: string; candidates: string[]; isAmbiguous: boolean }) => void;
  public onCliHelpReply?: (res: { deviceId: string; items: Array<{ token: string; description: string }> }) => void;
  public onVisualDelta?: VisualDeltaCallback;
  public onSimStats?: SimStatsCallback;
  public onPingReply?: PingReplyCallback;

  constructor(workerInstance?: Worker) {
    if (workerInstance) {
      this.worker = workerInstance;
      this.worker.onmessage = (e: MessageEvent<WorkerToUiMessage>) => {
        this.handleWorkerMessage(e.data);
      };
    }
  }

  public setMockHost(mockHost: any): void {
    this.mockHost = mockHost;
  }

  public post(msg: UiToWorkerMessage): void {
    if (this.worker) {
      this.worker.postMessage(msg);
    } else if (this.mockHost) {
      this.mockHost.handleMessage(msg);
    }
  }

  public handleWorkerMessage(msg: WorkerToUiMessage): void {
    switch (msg.type) {
      case 'TOPOLOGY_SYNC':
        this.onTopologySync?.(msg.payload.devices, msg.payload.links);
        break;
      case 'CLI_OUTPUT':
        this.onCliOutput?.(msg.payload.deviceId, msg.payload.output, msg.payload.prompt);
        break;
      case 'CLI_TAB_REPLY':
        this.onCliTabReply?.(msg.payload);
        break;
      case 'CLI_HELP_REPLY':
        this.onCliHelpReply?.(msg.payload);
        break;
      case 'VISUAL_DELTA_BATCH':
        this.onVisualDelta?.(msg.payload.packets, msg.payload.virtualTimeNs);
        break;
      case 'SIM_STATS':
        this.onSimStats?.(msg.payload);
        break;
      case 'PING_REPLY':
        this.onPingReply?.(msg.payload);
        break;
    }
  }

  public initEngine(): void {
    this.post({ type: 'INIT_ENGINE' });
  }

  public addDevice(id: string, name: string, type: DeviceType, portCount?: number): void {
    this.post({ type: 'ADD_DEVICE', payload: { id, name, type, portCount } });
  }

  public removeDevice(deviceId: string): void {
    this.post({ type: 'REMOVE_DEVICE', payload: { deviceId } });
  }

  public connectLink(
    id: string,
    source: { deviceId: string; interfaceName: string },
    target: { deviceId: string; interfaceName: string },
    delayNs?: string
  ): void {
    this.post({ type: 'CONNECT_LINK', payload: { id, source, target, delayNs } });
  }

  public disconnectLink(linkId: string): void {
    this.post({ type: 'DISCONNECT_LINK', payload: { linkId } });
  }

  public sendCliInput(deviceId: string, line: string): void {
    this.post({ type: 'CLI_INPUT', payload: { deviceId, line } });
  }

  public sendCliTab(deviceId: string, currentLine: string): void {
    this.post({ type: 'CLI_TAB', payload: { deviceId, currentLine } });
  }

  public sendCliHelp(deviceId: string, currentLine: string): void {
    this.post({ type: 'CLI_HELP', payload: { deviceId, currentLine } });
  }

  public startSimulation(speedMultiplier = 1.0): void {
    this.post({ type: 'SIM_START', payload: { speedMultiplier } });
  }

  public pauseSimulation(): void {
    this.post({ type: 'SIM_PAUSE' });
  }

  public stepSimulation(): void {
    this.post({ type: 'SIM_STEP' });
  }

  public resetSimulation(): void {
    this.post({ type: 'SIM_RESET' });
  }

  public ping(hostId: string, targetIp: string): void {
    this.post({ type: 'HOST_PING', payload: { hostId, targetIp } });
  }

  public configureHost(hostId: string, ip?: string, mask?: string, gateway?: string): void {
    this.post({ type: 'CONFIGURE_HOST', payload: { hostId, ip, mask, gateway } });
  }

  public configureInterface(
    deviceId: string,
    interfaceName: string,
    config: { ip?: string; mask?: string; adminStatus?: 'UP' | 'DOWN'; mode?: 'access' | 'trunk'; accessVlan?: number }
  ): void {
    this.post({ type: 'CONFIGURE_INTERFACE', payload: { deviceId, interfaceName, ...config } });
  }

  public addStaticRoute(routerId: string, network: string, netmask: string, nextHop: string): void {
    this.post({ type: 'ADD_STATIC_ROUTE', payload: { routerId, network, netmask, nextHop } });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.mockHost) {
      this.mockHost.destroy();
      this.mockHost = null;
    }
  }
}
