import { describe, it, expect } from 'vitest';
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
