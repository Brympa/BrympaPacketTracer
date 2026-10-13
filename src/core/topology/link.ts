export interface LinkEndpoint {
  deviceId: string;
  interfaceName: string;
}

export type LinkMedium = 'copper' | 'fiber' | 'serial';

export interface PhysicalLinkConfig {
  id: string;
  source: LinkEndpoint;
  target: LinkEndpoint;
  medium?: LinkMedium;
  delayNs?: bigint; // Default: 1_000_000n ns (1ms)
  bandwidthMbps?: number; // Default: 100 Mbps
}

export class PhysicalLink {
  public readonly id: string;
  public readonly source: LinkEndpoint;
  public readonly target: LinkEndpoint;
  public readonly medium: LinkMedium;
  public readonly delayNs: bigint;
  public readonly bandwidthMbps: number;
  public status: 'UP' | 'DOWN' = 'UP';

  constructor(config: PhysicalLinkConfig) {
    this.id = config.id;
    this.source = config.source;
    this.target = config.target;
    this.medium = config.medium ?? 'copper';
    this.delayNs = config.delayNs ?? 1_000_000n; // 1 ms default propagation delay
    this.bandwidthMbps = config.bandwidthMbps ?? 100;
  }

  public getOtherEnd(deviceId: string, interfaceName: string): LinkEndpoint | null {
    if (this.source.deviceId === deviceId && this.source.interfaceName === interfaceName) {
      return this.target;
    }
    if (this.target.deviceId === deviceId && this.target.interfaceName === interfaceName) {
      return this.source;
    }
    return null;
  }
}
