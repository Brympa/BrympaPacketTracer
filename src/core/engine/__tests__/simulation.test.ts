import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation-engine';
import { VirtualHost, PingResult } from '../../devices/host';
import { VirtualSwitch } from '../../devices/switch';
import { VirtualRouter } from '../../devices/router';
import { PhysicalLink } from '../../topology/link';

describe('SimulationEngine - L2 Switching & ARP', () => {
  it('learns MAC addresses in CAM table and forwards unicast frames', () => {
    const engine = new SimulationEngine();

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

    const sw = new VirtualSwitch({
      id: 'sw1',
      name: 'Switch-1',
      portCount: 8,
    });

    engine.addDevice(pc1);
    engine.addDevice(pc2);
    engine.addDevice(sw);

    // Connect PC1 to Switch Fa0/1 and PC2 to Switch Fa0/2
    engine.connectLink(
      new PhysicalLink({
        id: 'link1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'sw1', interfaceName: 'FastEthernet0/1' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'link2',
        source: { deviceId: 'pc2', interfaceName: 'eth0' },
        target: { deviceId: 'sw1', interfaceName: 'FastEthernet0/2' },
      })
    );

    expect(sw.getCamTable().length).toBe(0);

    // PC1 pings PC2
    let pingResult: PingResult | undefined;
    pc1.ping('192.168.1.20', (res) => {
      pingResult = res;
    });

    // Run discrete simulation steps until queue is drained
    const executedSteps = engine.runSteps(100);
    expect(executedSteps).toBeGreaterThan(0);

    // Verification
    expect(pingResult).toBeDefined();
    expect(pingResult?.status).toBe('SUCCESS');
    expect(pingResult?.targetIp).toBe('192.168.1.20');
    expect(pingResult?.roundTripTimeNs).toBeGreaterThan(0n);

    // Check switch CAM table
    const cam = sw.getCamTable();
    expect(cam.length).toBe(2);

    const pc1Cam = cam.find((e) => e.mac === pc1.primaryInterface.macAddress);
    const pc2Cam = cam.find((e) => e.mac === pc2.primaryInterface.macAddress);

    expect(pc1Cam).toBeDefined();
    expect(pc1Cam?.interfaceName).toBe('FastEthernet0/1');

    expect(pc2Cam).toBeDefined();
    expect(pc2Cam?.interfaceName).toBe('FastEthernet0/2');

    // Check ARP caches on hosts
    expect(pc1.getArpTable().length).toBe(1);
    expect(pc1.getArpTable()[0].ip).toBe('192.168.1.20');
    expect(pc1.getArpTable()[0].mac).toBe(pc2.primaryInterface.macAddress);

    expect(pc2.getArpTable().length).toBe(1);
    expect(pc2.getArpTable()[0].ip).toBe('192.168.1.10');
    expect(pc2.getArpTable()[0].mac).toBe(pc1.primaryInterface.macAddress);
  });
});

describe('SimulationEngine - L3 Routing across subnets', () => {
  it('routes packets between two subnets via Router with LPM', () => {
    const engine = new SimulationEngine();

    // Topology:
    // PC-1 (192.168.1.10/24, GW: 192.168.1.1)
    //   |
    // Router-1 (Gi0/0: 192.168.1.1/24, Gi0/1: 192.168.2.1/24)
    //   |
    // PC-2 (192.168.2.10/24, GW: 192.168.2.1)

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

    const router = new VirtualRouter({
      id: 'rtr1',
      name: 'Router-1',
    });

    engine.addDevice(pc1);
    engine.addDevice(pc2);
    engine.addDevice(router);

    // Connect PC1 to Router Gi0/0
    engine.connectLink(
      new PhysicalLink({
        id: 'link-r1-pc1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/0' },
      })
    );

    // Connect PC2 to Router Gi0/1
    engine.connectLink(
      new PhysicalLink({
        id: 'link-r1-pc2',
        source: { deviceId: 'pc2', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/1' },
      })
    );

    // Configure router interfaces
    router.configureInterface('GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
    router.configureInterface('GigabitEthernet0/1', '192.168.2.1', '255.255.255.0');

    // Verify router routing table has 2 connected routes
    const routes = router.getRoutingTable();
    expect(routes.length).toBe(2);
    expect(routes.map((r) => r.network)).toContain('192.168.1.0');
    expect(routes.map((r) => r.network)).toContain('192.168.2.0');

    // PC1 pings PC2 across router
    let pingResult: PingResult | undefined;
    pc1.ping('192.168.2.10', (res) => {
      pingResult = res;
    });

    engine.runSteps(200);

    expect(pingResult).toBeDefined();
    expect(pingResult?.status).toBe('SUCCESS');
    expect(pingResult?.targetIp).toBe('192.168.2.10');
  });

  it('handles TTL expiration and generates ICMP Time Exceeded', () => {
    const engine = new SimulationEngine();

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

    const router = new VirtualRouter({
      id: 'rtr1',
      name: 'Router-1',
    });

    engine.addDevice(pc1);
    engine.addDevice(pc2);
    engine.addDevice(router);

    engine.connectLink(
      new PhysicalLink({
        id: 'l1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/0' },
      })
    );

    engine.connectLink(
      new PhysicalLink({
        id: 'l2',
        source: { deviceId: 'pc2', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/1' },
      })
    );

    router.configureInterface('GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
    router.configureInterface('GigabitEthernet0/1', '192.168.2.1', '255.255.255.0');

    // First do ARP discovery to prime tables
    pc1.ping('192.168.1.1');
    engine.runSteps(50);

    // Now send packet with TTL = 1 to 192.168.2.10
    // Router should decrement TTL to 0 and send ICMP Time Exceeded (Type 11)
    let pingResult: PingResult | undefined;
    const seq = 99;
    pc1['activePings'].set(seq, {
      targetIp: '192.168.2.10',
      sentAt: engine.now(),
      callback: (res) => {
        pingResult = res;
      },
    });

    // Send packet with TTL = 1
    pc1.sendIpv4Packet(
      '192.168.2.10',
      1,
      {
        type: 8,
        code: 0,
        checksum: 0,
        identifier: 1,
        sequenceNumber: seq,
      },
      1 // TTL = 1
    );

    engine.runSteps(100);

    expect(pingResult).toBeDefined();
    expect(pingResult?.status).toBe('TTL_EXPIRED');
  });

  it('handles Destination Unreachable when no route exists', () => {
    const engine = new SimulationEngine();

    const pc1 = new VirtualHost({
      id: 'pc1',
      name: 'PC-1',
      ipAddress: '192.168.1.10',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.1.1',
    });

    const router = new VirtualRouter({
      id: 'rtr1',
      name: 'Router-1',
    });

    engine.addDevice(pc1);
    engine.addDevice(router);

    engine.connectLink(
      new PhysicalLink({
        id: 'l1',
        source: { deviceId: 'pc1', interfaceName: 'eth0' },
        target: { deviceId: 'rtr1', interfaceName: 'GigabitEthernet0/0' },
      })
    );

    router.configureInterface('GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');

    let pingResult: PingResult | undefined;
    pc1.ping('10.0.0.1', (res) => {
      pingResult = res;
    });

    engine.runSteps(50);

    expect(pingResult).toBeDefined();
    expect(pingResult?.status).toBe('UNREACHABLE');
  });
});
