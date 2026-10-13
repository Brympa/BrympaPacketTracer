import { BaseDevice, ISimulationEngineContext } from '../devices/base-device';
import { PhysicalLink } from '../topology/link';
import { SimEvent } from '../types/event';
import { EthernetFrame } from '../types/frame';
import { MinHeapPriorityQueue } from '../utils/priority-queue';
import { VirtualClock } from './virtual-clock';

export type EventDispatchedCallback = (event: SimEvent) => void;
export type TraceLogCallback = (message: string, metadata?: Record<string, unknown>) => void;

export class SimulationEngine implements ISimulationEngineContext {
  public readonly clock = new VirtualClock();
  private readonly eventQueue: MinHeapPriorityQueue<SimEvent>;
  private readonly devices = new Map<string, BaseDevice>();
  private readonly links = new Map<string, PhysicalLink>();
  private readonly timerCallbacks = new Map<number, () => void>();
  private eventIdCounter = 1;

  public onEventDispatched?: EventDispatchedCallback;
  public onEventScheduled?: (event: SimEvent) => void;
  public onTrace?: TraceLogCallback;

  constructor() {
    this.eventQueue = new MinHeapPriorityQueue<SimEvent>((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return a.id - b.id; // Deterministic tie-breaking by arrival order
    });
  }

  public now(): bigint {
    return this.clock.now();
  }

  public addDevice(device: BaseDevice): void {
    device.setContext(this);
    this.devices.set(device.id, device);
  }

  public removeDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Disconnect any links attached to this device
    for (const link of Array.from(this.links.values())) {
      if (link.source.deviceId === deviceId || link.target.deviceId === deviceId) {
        this.disconnectLink(link.id);
      }
    }
    this.devices.delete(deviceId);
  }

  public getDevice(deviceId: string): BaseDevice | undefined {
    return this.devices.get(deviceId);
  }

  public connectLink(link: PhysicalLink): void {
    this.links.set(link.id, link);

    const devA = this.devices.get(link.source.deviceId);
    const ifaceA = devA?.getInterface(link.source.interfaceName);
    if (ifaceA) ifaceA.setLinkConnected(true, link.id);

    const devB = this.devices.get(link.target.deviceId);
    const ifaceB = devB?.getInterface(link.target.interfaceName);
    if (ifaceB) ifaceB.setLinkConnected(true, link.id);
  }

  public disconnectLink(linkId: string): void {
    const link = this.links.get(linkId);
    if (!link) return;

    const devA = this.devices.get(link.source.deviceId);
    const ifaceA = devA?.getInterface(link.source.interfaceName);
    if (ifaceA) ifaceA.setLinkConnected(false);

    const devB = this.devices.get(link.target.deviceId);
    const ifaceB = devB?.getInterface(link.target.interfaceName);
    if (ifaceB) ifaceB.setLinkConnected(false);

    this.links.delete(linkId);
  }

  public transmitFrame(
    sourceDeviceId: string,
    egressInterfaceName: string,
    frame: EthernetFrame
  ): void {
    const dev = this.devices.get(sourceDeviceId);
    const iface = dev?.getInterface(egressInterfaceName);
    if (!iface || !iface.connectedLinkId) return;

    const link = this.links.get(iface.connectedLinkId);
    if (!link || link.status !== 'UP') return;

    const otherEnd = link.getOtherEnd(sourceDeviceId, egressInterfaceName);
    if (!otherEnd) return;

    const arrivalTime = this.clock.now() + link.delayNs;

    const event: SimEvent = {
      id: this.eventIdCounter++,
      timestamp: arrivalTime,
      type: 'FRAME_ARRIVAL',
      sourceDeviceId,
      sourceInterfaceName: egressInterfaceName,
      targetDeviceId: otherEnd.deviceId,
      targetInterfaceName: otherEnd.interfaceName,
      linkId: link.id,
      frame,
    };

    this.scheduleEvent(event);
  }

  public scheduleTimer(deviceId: string, delayNs: bigint, callback: () => void): void {
    const timerId = this.eventIdCounter++;
    this.timerCallbacks.set(timerId, callback);

    const event: SimEvent = {
      id: timerId,
      timestamp: this.clock.now() + delayNs,
      type: 'CUSTOM_TIMER',
      sourceDeviceId: deviceId,
      targetDeviceId: deviceId,
      targetInterfaceName: '',
      metadata: { timerId },
    };

    this.scheduleEvent(event);
  }

  public scheduleEvent(event: SimEvent): void {
    this.eventQueue.push(event);
    this.onEventScheduled?.(event);
  }

  public step(): SimEvent | null {
    const event = this.eventQueue.pop();
    if (!event) return null;

    // Advance clock to event timestamp
    this.clock.advanceTo(event.timestamp);

    // Dispatch event
    if (event.type === 'FRAME_ARRIVAL' && event.frame) {
      const targetDevice = this.devices.get(event.targetDeviceId);
      if (targetDevice) {
        const targetIface = targetDevice.getInterface(event.targetInterfaceName);
        if (targetIface && targetIface.isUp()) {
          targetIface.stats.rxFrames++;
          targetDevice.receiveFrame(event.frame, event.targetInterfaceName, event.timestamp);
        } else if (targetIface) {
          targetIface.stats.droppedFrames++;
        }
      }
    } else if (event.type === 'CUSTOM_TIMER') {
      const timerId = event.metadata?.timerId as number | undefined;
      if (timerId !== undefined && this.timerCallbacks.has(timerId)) {
        const cb = this.timerCallbacks.get(timerId)!;
        this.timerCallbacks.delete(timerId);
        cb();
      }
    }

    this.onEventDispatched?.(event);
    return event;
  }

  public runUntil(targetTime: bigint): number {
    let steps = 0;
    while (!this.eventQueue.isEmpty()) {
      const next = this.eventQueue.peek();
      if (!next || next.timestamp > targetTime) break;
      this.step();
      steps++;
    }
    if (this.clock.now() < targetTime) {
      this.clock.advanceTo(targetTime);
    }
    return steps;
  }

  public runSteps(maxSteps: number): number {
    let executed = 0;
    while (executed < maxSteps && !this.eventQueue.isEmpty()) {
      this.step();
      executed++;
    }
    return executed;
  }

  public logTrace(message: string, metadata?: Record<string, unknown>): void {
    this.onTrace?.(message, metadata);
  }

  public getQueueLength(): number {
    return this.eventQueue.size();
  }

  public clear(): void {
    this.eventQueue.clear();
    this.timerCallbacks.clear();
    this.clock.reset();
  }
}
