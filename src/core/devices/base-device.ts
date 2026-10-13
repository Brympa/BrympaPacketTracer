import { NetworkInterface } from '../topology/interface';
import { EthernetFrame } from '../types/frame';
import { NetworkInterfaceConfig } from '../types/network';

export type DeviceType = 'HOST' | 'SWITCH' | 'ROUTER';

export interface ISimulationEngineContext {
  now(): bigint;
  transmitFrame(sourceDeviceId: string, egressInterfaceName: string, frame: EthernetFrame): void;
  scheduleTimer(deviceId: string, delayNs: bigint, callback: () => void): void;
  logTrace(message: string, metadata?: Record<string, unknown>): void;
}

export abstract class BaseDevice {
  public readonly id: string;
  public name: string;
  public readonly type: DeviceType;
  public readonly interfaces = new Map<string, NetworkInterface>();
  protected context?: ISimulationEngineContext;

  constructor(id: string, name: string, type: DeviceType) {
    this.id = id;
    this.name = name;
    this.type = type;
  }

  public setContext(context: ISimulationEngineContext): void {
    this.context = context;
  }

  public addInterface(config: NetworkInterfaceConfig): NetworkInterface {
    const iface = new NetworkInterface(config);
    this.interfaces.set(iface.name, iface);
    return iface;
  }

  public getInterface(name: string): NetworkInterface | undefined {
    return this.interfaces.get(name);
  }

  public getAllInterfaces(): NetworkInterface[] {
    return Array.from(this.interfaces.values());
  }

  /**
   * Called by the simulation engine when an Ethernet frame arrives on an interface.
   */
  public abstract receiveFrame(
    frame: EthernetFrame,
    ingressInterfaceName: string,
    arrivalTime: bigint
  ): void;

  /**
   * Transmits a frame out of a specified interface.
   */
  public sendFrame(frame: EthernetFrame, egressInterfaceName: string): void {
    const iface = this.getInterface(egressInterfaceName);
    if (!iface) {
      throw new Error(`Interface ${egressInterfaceName} not found on device ${this.name} (${this.id})`);
    }

    if (!iface.isUp()) {
      iface.stats.droppedFrames++;
      this.context?.logTrace(`Drop frame on down interface ${this.name}:${egressInterfaceName}`);
      return;
    }

    iface.stats.txFrames++;
    this.context?.transmitFrame(this.id, egressInterfaceName, frame);
  }
}
