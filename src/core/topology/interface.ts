import { MacAddress, Ipv4Address, SubnetMask, NetworkInterfaceConfig } from '../types/network';

export class NetworkInterface {
  public readonly id: string;
  public readonly name: string;
  public macAddress: MacAddress;
  public ipAddress?: Ipv4Address;
  public subnetMask?: SubnetMask;
  public status: 'UP' | 'DOWN' = 'DOWN';
  public adminStatus: 'UP' | 'DOWN' = 'UP';
  public mode: 'access' | 'trunk' | 'routed' = 'routed';
  public accessVlan = 1;
  public allowedVlans: number[] = [1];
  public nativeVlan = 1;
  public connectedLinkId?: string;

  // Interface statistics
  public stats = {
    rxFrames: 0,
    txFrames: 0,
    rxBytes: 0,
    txBytes: 0,
    droppedFrames: 0,
  };

  constructor(config: NetworkInterfaceConfig) {
    this.id = config.id;
    this.name = config.name;
    this.macAddress = config.macAddress;
    this.ipAddress = config.ipAddress;
    this.subnetMask = config.subnetMask;
    this.adminStatus = config.adminStatus;
    this.mode = config.mode;
    this.accessVlan = config.accessVlan;
    this.allowedVlans = config.allowedVlans.slice();
    this.nativeVlan = config.nativeVlan;
    this.updateOperationalStatus();
  }

  public setAdminStatus(status: 'UP' | 'DOWN'): void {
    this.adminStatus = status;
    this.updateOperationalStatus();
  }

  public setLinkConnected(connected: boolean, linkId?: string): void {
    this.connectedLinkId = connected ? linkId : undefined;
    this.updateOperationalStatus();
  }

  public updateOperationalStatus(): void {
    this.status = this.adminStatus === 'UP' && !!this.connectedLinkId ? 'UP' : 'DOWN';
  }

  public isUp(): boolean {
    return this.status === 'UP';
  }

  public configureIp(ip?: Ipv4Address, mask?: SubnetMask): void {
    this.ipAddress = ip;
    this.subnetMask = mask;
  }
}
