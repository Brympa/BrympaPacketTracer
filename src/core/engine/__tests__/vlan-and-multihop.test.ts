import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation-engine';
import { VirtualHost, PingResult } from '../../devices/host';
import { VirtualSwitch } from '../../devices/switch';
import { VirtualRouter } from '../../devices/router';
import { PhysicalLink } from '../../topology/link';

describe('802.1Q VLAN Trunking between Switches', () => {
  it('allows traffic within same VLAN across trunk and isolates different VLANs', () => {
    const engine = new SimulationEngine();

    // Topology:
    // PC1 (VLAN 10: 192.168.10.1) -> SW1 (Fa0/1: access vlan 10)
    // SW1 (Fa0/24: trunk) <======> SW2 (Fa0/24: trunk)
    // SW2 (Fa0/1: access vlan 10) -> PC2 (VLAN 10: 192.168.10.2)
    // SW2 (Fa0/2: access vlan 20) -> PC3 (VLAN 20: 192.168.20.1)

    const pc1 = new VirtualHost({
      id: 'pc1',
      name: 'PC-1',
      ipAddress: '192.168.10.1',
      subnetMask: '255.255.255.0',
    });

    const pc2 = new VirtualHost({
      id: 'pc2',
      name: 'PC-2',
      ipAddress: '192.168.10.2',
      subnetMask: '255.255.255.0',
    });

    const pc3 = new VirtualHost({
      id: 'pc3',
      name: 'PC-3',
      ipAddress: '192.168.10.3', // Same subnet IP, but physically isolated on VLAN 20
      subnetMask: '255.255.255.0',
    });

    const sw1 = new VirtualSwitch({ id: 'sw1', name: 'SW-1' });
    const sw2 = new VirtualSwitch({ id: 'sw2', name: 'SW-2' });

    engine.addDevice(pc1);
    engine.addDevice(pc2);
    engine.addDevice(pc3);
    engine.addDevice(sw1);
    engine.addDevice(sw2);

    // Configure SW1 ports
    const sw1Fa01 = sw1.getInterface('FastEthernet0/1')!;
    sw1Fa01.mode = 'access';
    sw1Fa01.accessVlan = 10;

    const sw1Fa024 = sw1.getInterface('FastEthernet0/24')!;
    sw1Fa024.mode = 'trunk';
    sw1Fa024.allowedVlans = [1, 10, 20];

    // Configure SW2 ports
    const sw2Fa01 = sw2.getInterface('FastEthernet0/1')!;
    sw2Fa01.mode = 'access';
    sw2Fa01.accessVlan = 10;

    const sw2Fa02 = sw2.getInterface('FastEthernet0/2')!;
    sw2Fa02.mode = 'access';
    sw2Fa02.accessVlan = 20;

    const sw2Fa024 = sw2.getInterface('FastEthernet0/24')!;
    sw2Fa024.mode = 'trunk';
    sw2Fa024.allowedVlans = [1, 10, 20];

    // Connect cables
    engine.connectLink(
      new PhysicalLink({
        id: 'l1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'sw1', interfaceName: 'FastEthernet0/1' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l-trunk',
        source: { deviceId: 'sw1', interfaceName: 'FastEthernet0/24' },
        target: { deviceId: 'sw2', interfaceName: 'FastEthernet0/24' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l2',
        source: { deviceId: 'pc2', interfaceName: 'eth0' },
        target: { deviceId: 'sw2', interfaceName: 'FastEthernet0/1' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l3',
        source: { deviceId: 'pc3', interfaceName: 'eth0' },
        target: { deviceId: 'sw2', interfaceName: 'FastEthernet0/2' },
      })
    );

    // PC1 pings PC2 (Both in VLAN 10)
    let pingResultPC2: PingResult | undefined;
    pc1.ping('192.168.10.2', (res) => {
      pingResultPC2 = res;
    });

    engine.runSteps(100);

    expect(pingResultPC2).toBeDefined();
    expect(pingResultPC2?.status).toBe('SUCCESS');

    // PC1 attempts to ping PC3 (PC3 is in VLAN 20, traffic should be isolated!)
    let pingResultPC3: PingResult | undefined;
    pc1.ping('192.168.10.3', (res) => {
      pingResultPC3 = res;
    });

    engine.runSteps(100);

    // PC3 should not receive ARP or be able to reply across isolated VLAN
    expect(pingResultPC3).toBeUndefined();
    expect(pc3.primaryInterface.stats.rxFrames).toBe(0); // Zero frames leaked to VLAN 20!
  });
});

describe('Multi-Hop Routing with Static Routes', () => {
  it('successfully routes packets across multiple routers using static routes', () => {
    const engine = new SimulationEngine();

    // Topology:
    // PC1 (192.168.1.10/24, GW: 192.168.1.1)
    //   |
    // Router1 (Gi0/0: 192.168.1.1/24, Gi0/1: 10.0.0.1/30)
    //   | (10.0.0.0/30)
    // Router2 (Gi0/1: 10.0.0.2/30, Gi0/0: 192.168.2.1/24)
    //   |
    // PC2 (192.168.2.10/24, GW: 192.168.2.1)

    const pc1 = new VirtualHost({
      id: 'pc1',
      name: 'PC-1',
      ipAddress: '192.168.1.10',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.1.1',
    });

    const pc2 = new VirtualHost({
      id: 'pc2',
      name: 'PC-2',
      ipAddress: '192.168.2.10',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.2.1',
    });

    const rtr1 = new VirtualRouter({ id: 'rtr1', name: 'RTR-1' });
    const rtr2 = new VirtualRouter({ id: 'rtr2', name: 'RTR-2' });

    engine.addDevice(pc1);
    engine.addDevice(pc2);
    engine.addDevice(rtr1);
    engine.addDevice(rtr2);

    // Links
    engine.connectLink(
      new PhysicalLink({
        id: 'l-pc1-r1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/0' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l-r1-r2',
        source: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/1' },
        target: { deviceId: 'rtr2', interfaceName: 'GigabitEthernet0/1' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l-r2-pc2',
        source: { deviceId: 'rtr2', interfaceName: 'GigabitEthernet0/0' },
        target: { deviceId: 'pc2', interfaceName: 'eth0' },
      })
    );

    // Configure RTR-1
    rtr1.configureInterface('GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
    rtr1.configureInterface('GigabitEthernet0/1', '10.0.0.1', '255.255.255.252');
    // Static route to PC2 network via RTR-2
    rtr1.addStaticRoute('192.168.2.0', '255.255.255.0', '10.0.0.2');

    // Configure RTR-2
    rtr2.configureInterface('GigabitEthernet0/0', '192.168.2.1', '255.255.255.0');
    rtr2.configureInterface('GigabitEthernet0/1', '10.0.0.2', '255.255.255.252');
    // Static route to PC1 network via RTR-1
    rtr2.addStaticRoute('192.168.1.0', '255.255.255.0', '10.0.0.1');

    // PC1 pings PC2 across 2 routers (2 hops)
    let pingResult: PingResult | undefined;
    pc1.ping('192.168.2.10', (res) => {
      pingResult = res;
    });

    engine.runSteps(250);

    expect(pingResult).toBeDefined();
    expect(pingResult?.status).toBe('SUCCESS');
    expect(pingResult?.targetIp).toBe('192.168.2.10');
  });
});

describe('Switch CAM Aging & Re-flooding', () => {
  it('expires CAM entries after timeout and floods frame again', () => {
    const engine = new SimulationEngine();

    // 10 second CAM aging timeout (10_000_000_000n ns)
    const sw = new VirtualSwitch({
      id: 'sw1',
      name: 'SW-1',
      camAgingTimeoutNs: 10_000_000_000n,
    });

    const pc1 = new VirtualHost({
      id: 'pc1',
      name: 'PC-1',
      ipAddress: '192.168.1.10',
      subnetMask: '255.255.255.0',
    });

    const pc2 = new VirtualHost({
      id: 'pc2',
      name: 'PC-2',
      ipAddress: '192.168.1.20',
      subnetMask: '255.255.255.0',
    });

    engine.addDevice(sw);
    engine.addDevice(pc1);
    engine.addDevice(pc2);

    engine.connectLink(
      new PhysicalLink({
        id: 'l1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'sw1', interfaceName: 'FastEthernet0/1' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l2',
        source: { deviceId: 'pc2', interfaceName: 'eth0' },
        target: { deviceId: 'sw1', interfaceName: 'FastEthernet0/2' },
      })
    );

    // Initial ping to populate CAM
    pc1.ping('192.168.1.20');
    engine.runSteps(50);

    expect(sw.getCamTable(engine.now()).length).toBe(2);

    // Advance clock past aging timeout (15 seconds)
    engine.clock.advanceBy(15_000_000_000n);

    // CAM entries should be expired
    expect(sw.getCamTable(engine.now()).length).toBe(0);
  });
});
