import { describe, it, expect } from 'vitest';
import { VirtualHost } from '../../devices/host';
import { VirtualRouter } from '../../devices/router';
import { VirtualSwitch } from '../../devices/switch';
import { IosCliSession } from '../ios-cli';

describe('Cisco IOS CLI - State Machine & Mode Transitions', () => {
  it('navigates through Cisco modes with correct prompts', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);

    // Initial mode
    expect(cli.state.mode).toBe('USER_EXEC');
    expect(cli.getPrompt()).toBe('Router>');

    // enable
    cli.executeLine('enable');
    expect(cli.state.mode).toBe('PRIVILEGED_EXEC');
    expect(cli.getPrompt()).toBe('Router#');

    // configure terminal (abbreviated: conf t)
    cli.executeLine('conf t');
    expect(cli.state.mode).toBe('GLOBAL_CONFIG');
    expect(cli.getPrompt()).toBe('Router(config)#');

    // change hostname
    cli.executeLine('hostname Edge-R1');
    expect(cli.getPrompt()).toBe('Edge-R1(config)#');
    expect(router.name).toBe('Edge-R1');

    // interface context
    cli.executeLine('interface GigabitEthernet0/0');
    expect(cli.state.mode).toBe('INTERFACE_CONFIG');
    expect(cli.getPrompt()).toBe('Edge-R1(config-if)#');
    expect(cli.state.contextInterfaceName).toBe('GigabitEthernet0/0');

    // exit back to global config
    cli.executeLine('exit');
    expect(cli.state.mode).toBe('GLOBAL_CONFIG');
    expect(cli.getPrompt()).toBe('Edge-R1(config)#');

    // end directly to privileged exec
    cli.executeLine('end');
    expect(cli.state.mode).toBe('PRIVILEGED_EXEC');
    expect(cli.getPrompt()).toBe('Edge-R1#');

    // disable back to user exec
    cli.executeLine('disable');
    expect(cli.state.mode).toBe('USER_EXEC');
    expect(cli.getPrompt()).toBe('Edge-R1>');
  });
});

describe('Cisco IOS CLI - Command Abbreviations & Parsing', () => {
  it('resolves standard Cisco abbreviations like sh ip int br', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);
    cli.executeLine('enable');

    // Configure interface via CLI
    cli.executeLine('conf t');
    cli.executeLine('int gi0/0');
    cli.executeLine('ip address 192.168.10.1 255.255.255.0');
    cli.executeLine('no shutdown');
    cli.executeLine('end');

    const iface = router.getInterface('GigabitEthernet0/0')!;
    expect(iface.ipAddress).toBe('192.168.10.1');
    expect(iface.adminStatus).toBe('UP');

    // Run "sh ip int br"
    const output = cli.executeLine('sh ip int br');
    expect(output).toContain('GigabitEthernet0/0');
    expect(output).toContain('192.168.10.1');
    expect(output).toContain('up');
  });

  it('reports syntax error with Cisco marker on unknown commands', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);
    cli.executeLine('enable');

    const output = cli.executeLine('invalidcommand 123');
    expect(output).toContain("% Invalid input detected at '^' marker.");
  });
});

describe('Cisco IOS CLI - Switchport & L2 Configuration', () => {
  it('configures switchport trunk and access vlan on switch interfaces', () => {
    const sw = new VirtualSwitch({ id: 'sw1', name: 'Switch' });
    const cli = new IosCliSession(sw);
    cli.executeLine('enable');
    cli.executeLine('conf t');

    // Set Fa0/1 to access vlan 20
    cli.executeLine('int fa0/1');
    cli.executeLine('switchport mode access');
    cli.executeLine('switchport access vlan 20');

    // Set Fa0/24 to trunk
    cli.executeLine('int fa0/24');
    cli.executeLine('switchport mode trunk');
    cli.executeLine('end');

    const fa1 = sw.getInterface('FastEthernet0/1')!;
    expect(fa1.mode).toBe('access');
    expect(fa1.accessVlan).toBe(20);

    const fa24 = sw.getInterface('FastEthernet0/24')!;
    expect(fa24.mode).toBe('trunk');
  });
});

describe('Cisco IOS CLI - Pipes & Filtering', () => {
  it('filters command output using | include', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);
    cli.executeLine('enable');

    const output = cli.executeLine('show ip interface brief | include GigabitEthernet0/0');
    expect(output).toContain('GigabitEthernet0/0');
    expect(output).not.toContain('GigabitEthernet0/1');
  });
});

describe('Cisco IOS CLI - Tab Completion & Context Help', () => {
  it('auto-completes command on Tab', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);
    cli.executeLine('enable');

    const tabRes = cli.handleTab('conf');
    expect(tabRes.completedLine).toBe('configure ');
    expect(tabRes.isAmbiguous).toBe(false);
  });

  it('returns candidate help items on ?', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const cli = new IosCliSession(router);
    cli.executeLine('enable');

    const helpItems = cli.handleHelp('show ');
    expect(helpItems.length).toBeGreaterThan(0);
    expect(helpItems.map((h) => h.token)).toContain('ip');
    expect(helpItems.map((h) => h.token)).toContain('version');
  });
});

describe('Cisco IOS CLI & Host PC - User EXEC Commands (ping, ipconfig, arp)', () => {
  it('executes ping directly from PC> in USER_EXEC mode without enable', () => {
    const pc = new VirtualHost({ id: 'pc1', name: 'PC-1' });
    pc.configureNetwork('192.168.0.1', '255.255.255.0', '192.168.0.254');
    const cli = new IosCliSession(pc);

    expect(cli.state.mode).toBe('USER_EXEC');
    expect(cli.getPrompt()).toBe('PC-1>');

    // Ping IP in same subnet
    const output = cli.executeLine('ping 192.168.0.2');
    expect(output).toContain('Pinging 192.168.0.2 with 32 bytes of data:');
    expect(output).toContain('Reply from 192.168.0.2: bytes=32 time=1ms TTL=128');
    expect(output).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)');
  });

  it('reports error when host ping has unconfigured IP', () => {
    const pc = new VirtualHost({ id: 'pc1', name: 'PC-1' });
    const cli = new IosCliSession(pc);

    const output = cli.executeLine('ping 192.168.0.2');
    expect(output).toContain('% Host IP address is not configured');
  });

  it('reports destination host unreachable when pinging foreign subnet without gateway', () => {
    const pc = new VirtualHost({ id: 'pc1', name: 'PC-1' });
    pc.configureNetwork('192.168.0.1', '255.255.255.0'); // no gateway
    const cli = new IosCliSession(pc);

    const output = cli.executeLine('ping 10.0.0.1');
    expect(output).toContain('Destination host unreachable');
    expect(output).toContain('Lost = 4 (100% loss)');
  });

  it('executes ipconfig and ipconfig /all on host', () => {
    const pc = new VirtualHost({
      id: 'pc1',
      name: 'PC-1',
      ipAddress: '192.168.0.1',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.0.254',
      macAddress: '00:50:79:6B:11:22',
    });
    const cli = new IosCliSession(pc);

    // standard ipconfig
    const ipconfigOut = cli.executeLine('ipconfig');
    expect(ipconfigOut).toContain('IPv4 Address....................: 192.168.0.1');
    expect(ipconfigOut).toContain('Subnet Mask.....................: 255.255.255.0');
    expect(ipconfigOut).toContain('Default Gateway.................: 192.168.0.254');
    expect(ipconfigOut).not.toContain('Physical Address');

    // ipconfig /all
    const ipconfigAllOut = cli.executeLine('ipconfig /all');
    expect(ipconfigAllOut).toContain('Physical Address................: 00:50:79:6B:11:22');
    expect(ipconfigAllOut).toContain('IPv4 Address....................: 192.168.0.1');
  });

  it('executes arp -a and arp -d', () => {
    const pc = new VirtualHost({ id: 'pc1', name: 'PC-1' });
    const cli = new IosCliSession(pc);

    const emptyArp = cli.executeLine('arp -a');
    expect(emptyArp).toBe('No ARP Entries Found.');

    const clearArp = cli.executeLine('arp -d');
    expect(clearArp).toBe('ARP table cleared.');
  });

  it('allows show ip int br in USER_EXEC mode on router without enable', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    router.configureInterface('GigabitEthernet0/0', '192.168.0.254', '255.255.255.0');
    const cli = new IosCliSession(router);

    expect(cli.state.mode).toBe('USER_EXEC');
    const out = cli.executeLine('show ip interface brief');
    expect(out).toContain('GigabitEthernet0/0');
    expect(out).toContain('192.168.0.254');
  });

  it('executes router ping in USER_EXEC mode with route and without route', () => {
    const router = new VirtualRouter({ id: 'r1', name: 'Router' });
    const gi0 = router.getInterface('GigabitEthernet0/0')!;
    gi0.setLinkConnected(true, 'link-1');
    router.configureInterface('GigabitEthernet0/0', '192.168.0.254', '255.255.255.0');
    const cli = new IosCliSession(router);

    // Ping destination on connected subnet
    const successOut = cli.executeLine('ping 192.168.0.1');
    expect(successOut).toContain('Sending 5, 100-byte ICMP Echos to 192.168.0.1');
    expect(successOut).toContain('!!!!!');
    expect(successOut).toContain('Success rate is 100 percent (5/5)');

    // Ping unreachable subnet
    const failOut = cli.executeLine('ping 172.16.1.1');
    expect(failOut).toContain('.....');
    expect(failOut).toContain('Success rate is 0 percent (0/5)');
  });
});

