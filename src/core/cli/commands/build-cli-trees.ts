import { VirtualHost } from '../../devices/host';
import { VirtualRouter } from '../../devices/router';
import { VirtualSwitch } from '../../devices/switch';
import { isValidIpv4 } from '../../utils/ip';
import { CommandNode, CliMode } from '../types';
import { normalizeInterfaceName } from './common-handlers';

export function buildCliTrees(): Record<CliMode, CommandNode[]> {
  // 1. USER EXEC TREE
  const userExecNodes: CommandNode[] = [
    {
      token: 'enable',
      description: 'Turn on privileged commands',
      handler: (ctx) => {
        ctx.session.mode = 'PRIVILEGED_EXEC';
        return '';
      },
    },
    {
      token: 'show',
      description: 'Show running system information',
      children: [
        {
          token: 'version',
          description: 'System hardware & software status',
          handler: () =>
            'Cisco IOS Software, Brympa Simulator (fc1)\nTechnical Support: http://www.cisco.com/techsupport\nCompiled 2026 by Antigravity',
        },
      ],
    },
    {
      token: 'exit',
      description: 'Exit from the EXEC',
      handler: () => 'Session closed.',
    },
  ];

  // 2. PRIVILEGED EXEC TREE
  const privExecNodes: CommandNode[] = [
    {
      token: 'disable',
      description: 'Turn off privileged commands',
      handler: (ctx) => {
        ctx.session.mode = 'USER_EXEC';
        return '';
      },
    },
    {
      token: 'configure',
      description: 'Enter configuration mode',
      children: [
        {
          token: 'terminal',
          description: 'Configure from the terminal',
          handler: (ctx) => {
            ctx.session.mode = 'GLOBAL_CONFIG';
            return 'Enter configuration commands, one per line.  End with CNTL/Z.';
          },
        },
      ],
    },
    {
      token: 'show',
      description: 'Show running system information',
      children: [
        {
          token: 'ip',
          description: 'IP information',
          children: [
            {
              token: 'interface',
              description: 'IP interface status and configuration',
              children: [
                {
                  token: 'brief',
                  description: 'Brief summary of IP status and configuration',
                  handler: (ctx) => {
                    const lines = [
                      'Interface                  IP-Address      OK? Method Status                Protocol',
                    ];
                    for (const iface of ctx.device.getAllInterfaces()) {
                      const name = iface.name.padEnd(26, ' ');
                      const ip = (iface.ipAddress || 'unassigned').padEnd(15, ' ');
                      const ok = 'YES manual '.padEnd(11, ' ');
                      const status = (iface.adminStatus === 'UP' ? 'up' : 'administratively down').padEnd(22, ' ');
                      const proto = iface.isUp() ? 'up' : 'down';
                      lines.push(`${name} ${ip} ${ok} ${status} ${proto}`);
                    }
                    return lines.join('\n');
                  },
                },
              ],
            },
            {
              token: 'route',
              description: 'IP routing table',
              handler: (ctx) => {
                if (ctx.device.type !== 'ROUTER') {
                  return '% IP routing not enabled on this device';
                }
                const router = ctx.device as VirtualRouter;
                const routes = router.getRoutingTable();
                const lines = [
                  'Codes: C - connected, S - static, R - RIP, M - mobile, B - BGP',
                  '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
                  '',
                  'Gateway of last resort is not set',
                  '',
                ];
                for (const r of routes) {
                  if (r.type === 'CONNECTED') {
                    lines.push(`C    ${r.network}/${r.prefixLength} is directly connected, ${r.interfaceName}`);
                  } else {
                    lines.push(`S    ${r.network}/${r.prefixLength} [${r.metric}/0] via ${r.nextHop}`);
                  }
                }
                return lines.join('\n');
              },
            },
          ],
        },
        {
          token: 'mac',
          description: 'MAC configuration',
          children: [
            {
              token: 'address-table',
              description: 'MAC forwarding table',
              handler: (ctx) => {
                if (ctx.device.type !== 'SWITCH') {
                  return '% Device does not have a MAC address table';
                }
                const sw = ctx.device as VirtualSwitch;
                const cam = sw.getCamTable();
                const lines = [
                  '          Mac Address Table',
                  '-------------------------------------------',
                  'Vlan    Mac Address       Type        Ports',
                  '----    -----------       --------    -----',
                ];
                for (const entry of cam) {
                  const vlan = entry.vlanId.toString().padStart(4, ' ');
                  const mac = entry.mac.toLowerCase().padEnd(17, ' ');
                  const type = 'DYNAMIC   ';
                  lines.push(`${vlan}    ${mac} ${type} ${entry.interfaceName}`);
                }
                return lines.join('\n');
              },
            },
          ],
        },
        {
          token: 'running-config',
          description: 'Current operating configuration',
          handler: (ctx) => {
            const lines = [
              'Building configuration...',
              '',
              `hostname ${ctx.device.name}`,
              '!',
            ];
            for (const iface of ctx.device.getAllInterfaces()) {
              lines.push(`interface ${iface.name}`);
              if (iface.ipAddress && iface.subnetMask) {
                lines.push(` ip address ${iface.ipAddress} ${iface.subnetMask}`);
              }
              if (iface.mode === 'trunk') {
                lines.push(' switchport mode trunk');
              } else if (iface.mode === 'access' && iface.accessVlan !== 1) {
                lines.push(` switchport access vlan ${iface.accessVlan}`);
              }
              if (iface.adminStatus === 'DOWN') {
                lines.push(' shutdown');
              } else {
                lines.push(' no shutdown');
              }
              lines.push('!');
            }
            lines.push('end');
            return lines.join('\n');
          },
        },
        {
          token: 'version',
          description: 'System hardware & software status',
          handler: () =>
            'Cisco IOS Software, Brympa Simulator (fc1)\nCompiled 2026 by Antigravity',
        },
      ],
    },
    {
      token: 'ping',
      description: 'Send echo messages',
      children: [
        {
          token: '<ip-address>',
          description: 'Target IP address',
          isParam: true,
          paramType: 'IP',
          handler: (ctx, args) => {
            const targetIp = args[0];
            if (!isValidIpv4(targetIp)) {
              return `% Invalid IP address: "${targetIp}"`;
            }
            if (ctx.device.type === 'HOST') {
              const host = ctx.device as VirtualHost;
              host.ping(targetIp);
              return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:\n!!!!!\nSuccess rate is 100 percent (5/5)`;
            }
            return `Sending ICMP Echos to ${targetIp}...`;
          },
        },
      ],
    },
    {
      token: 'write',
      description: 'Write running configuration to memory',
      children: [
        {
          token: 'memory',
          description: 'Write to NV memory',
          handler: () => 'Building configuration...\n[OK]',
        },
      ],
    },
    {
      token: 'exit',
      description: 'Exit from the EXEC',
      handler: (ctx) => {
        ctx.session.mode = 'USER_EXEC';
        return '';
      },
    },
  ];

  // 3. GLOBAL CONFIG TREE
  const globalConfigNodes: CommandNode[] = [
    {
      token: 'hostname',
      description: 'Set system network name',
      children: [
        {
          token: '<name>',
          description: 'System network name',
          isParam: true,
          paramType: 'STRING',
          handler: (ctx, args) => {
            ctx.device.name = args[0];
            return '';
          },
        },
      ],
    },
    {
      token: 'interface',
      description: 'Select an interface to configure',
      children: [
        {
          token: '<interface-name>',
          description: 'Interface name (e.g. GigabitEthernet0/0, FastEthernet0/1)',
          isParam: true,
          paramType: 'IFACE',
          handler: (ctx, args) => {
            const fullName = normalizeInterfaceName(args[0]);
            const iface = ctx.device.getInterface(fullName);
            if (!iface) {
              return `% Invalid interface type and number: ${args[0]}`;
            }
            ctx.session.contextInterfaceName = fullName;
            ctx.session.mode = 'INTERFACE_CONFIG';
            return '';
          },
        },
      ],
    },
    {
      token: 'ip',
      description: 'Global IP configuration subcommands',
      children: [
        {
          token: 'route',
          description: 'Establish static routes',
          children: [
            {
              token: '<network>',
              description: 'Destination network IP',
              isParam: true,
              paramType: 'IP',
              children: [
                {
                  token: '<netmask>',
                  description: 'Destination network mask',
                  isParam: true,
                  paramType: 'MASK',
                  children: [
                    {
                      token: '<next-hop>',
                      description: 'Forwarding router address',
                      isParam: true,
                      paramType: 'IP',
                      handler: (ctx, args) => {
                        if (ctx.device.type !== 'ROUTER') {
                          return '% IP routing not supported on this device';
                        }
                        const router = ctx.device as VirtualRouter;
                        const [network, netmask, nextHop] = args;
                        try {
                          router.addStaticRoute(network, netmask, nextHop);
                          return '';
                        } catch (err: any) {
                          return `% ${err.message}`;
                        }
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      token: 'exit',
      description: 'Exit from configure mode',
      handler: (ctx) => {
        ctx.session.mode = 'PRIVILEGED_EXEC';
        return '';
      },
    },
    {
      token: 'end',
      description: 'Exit to EXEC mode',
      handler: (ctx) => {
        ctx.session.mode = 'PRIVILEGED_EXEC';
        return '';
      },
    },
  ];

  // 4. INTERFACE CONFIG TREE
  const interfaceConfigNodes: CommandNode[] = [
    {
      token: 'interface',
      description: 'Select an interface to configure',
      children: [
        {
          token: '<interface-name>',
          description: 'Interface name (e.g. GigabitEthernet0/0, FastEthernet0/1)',
          isParam: true,
          paramType: 'IFACE',
          handler: (ctx, args) => {
            const fullName = normalizeInterfaceName(args[0]);
            const iface = ctx.device.getInterface(fullName);
            if (!iface) {
              return `% Invalid interface type and number: ${args[0]}`;
            }
            ctx.session.contextInterfaceName = fullName;
            ctx.session.mode = 'INTERFACE_CONFIG';
            return '';
          },
        },
      ],
    },
    {
      token: 'ip',
      description: 'Interface Internet Protocol config commands',
      children: [
        {
          token: 'address',
          description: 'Set the IP address of an interface',
          children: [
            {
              token: '<ip-address>',
              description: 'IP address',
              isParam: true,
              paramType: 'IP',
              children: [
                {
                  token: '<subnet-mask>',
                  description: 'IP subnet mask',
                  isParam: true,
                  paramType: 'MASK',
                  handler: (ctx, args) => {
                    const ifaceName = ctx.session.contextInterfaceName;
                    if (!ifaceName) return '% No interface in context';
                    const iface = ctx.device.getInterface(ifaceName);
                    if (!iface) return `% Interface not found: ${ifaceName}`;

                    const [ip, mask] = args;
                    if (!isValidIpv4(ip) || !isValidIpv4(mask)) {
                      return '% Invalid IP address or subnet mask';
                    }

                    iface.configureIp(ip, mask);
                    if (ctx.device.type === 'ROUTER') {
                      (ctx.device as VirtualRouter).refreshConnectedRoutes();
                    }
                    return '';
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      token: 'shutdown',
      description: 'Shutdown the selected interface',
      handler: (ctx) => {
        const ifaceName = ctx.session.contextInterfaceName;
        if (!ifaceName) return '% No interface in context';
        const iface = ctx.device.getInterface(ifaceName);
        if (iface) {
          iface.setAdminStatus('DOWN');
          if (ctx.device.type === 'ROUTER') {
            (ctx.device as VirtualRouter).refreshConnectedRoutes();
          }
        }
        return '';
      },
    },
    {
      token: 'no',
      description: 'Negate a command or set its defaults',
      children: [
        {
          token: 'shutdown',
          description: 'Restart the selected interface',
          handler: (ctx) => {
            const ifaceName = ctx.session.contextInterfaceName;
            if (!ifaceName) return '% No interface in context';
            const iface = ctx.device.getInterface(ifaceName);
            if (iface) {
              iface.setAdminStatus('UP');
              if (ctx.device.type === 'ROUTER') {
                (ctx.device as VirtualRouter).refreshConnectedRoutes();
              }
            }
            return '';
          },
        },
        {
          token: 'ip',
          description: 'Interface IP address',
          children: [
            {
              token: 'address',
              description: 'Set the IP address of an interface',
              handler: (ctx) => {
                const ifaceName = ctx.session.contextInterfaceName;
                if (!ifaceName) return '% No interface in context';
                const iface = ctx.device.getInterface(ifaceName);
                if (iface) {
                  iface.configureIp(undefined, undefined);
                  if (ctx.device.type === 'ROUTER') {
                    (ctx.device as VirtualRouter).refreshConnectedRoutes();
                  }
                }
                return '';
              },
            },
          ],
        },
      ],
    },
    {
      token: 'switchport',
      description: 'Set switching characteristics of the Layer 2 port',
      children: [
        {
          token: 'mode',
          description: 'Set trunk or access mode of the interface',
          children: [
            {
              token: 'access',
              description: 'Set trunking mode to ACCESS unconditionally',
              handler: (ctx) => {
                const ifaceName = ctx.session.contextInterfaceName;
                const iface = ctx.device.getInterface(ifaceName || '');
                if (iface) iface.mode = 'access';
                return '';
              },
            },
            {
              token: 'trunk',
              description: 'Set trunking mode to TRUNK unconditionally',
              handler: (ctx) => {
                const ifaceName = ctx.session.contextInterfaceName;
                const iface = ctx.device.getInterface(ifaceName || '');
                if (iface) iface.mode = 'trunk';
                return '';
              },
            },
          ],
        },
        {
          token: 'access',
          description: 'Set access mode characteristics of the interface',
          children: [
            {
              token: 'vlan',
              description: 'VLAN ID of the access mode of the interface',
              children: [
                {
                  token: '<vlan-id>',
                  description: 'VLAN ID (1-4094)',
                  isParam: true,
                  paramType: 'INT',
                  handler: (ctx, args) => {
                    const ifaceName = ctx.session.contextInterfaceName;
                    const iface = ctx.device.getInterface(ifaceName || '');
                    const vlan = parseInt(args[0], 10);
                    if (isNaN(vlan) || vlan < 1 || vlan > 4094) {
                      return '% Invalid VLAN ID. Must be between 1 and 4094.';
                    }
                    if (iface) iface.accessVlan = vlan;
                    return '';
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      token: 'exit',
      description: 'Exit from interface configuration mode',
      handler: (ctx) => {
        ctx.session.mode = 'GLOBAL_CONFIG';
        ctx.session.contextInterfaceName = undefined;
        return '';
      },
    },
    {
      token: 'end',
      description: 'Exit to EXEC mode',
      handler: (ctx) => {
        ctx.session.mode = 'PRIVILEGED_EXEC';
        ctx.session.contextInterfaceName = undefined;
        return '';
      },
    },
  ];

  return {
    USER_EXEC: userExecNodes,
    PRIVILEGED_EXEC: privExecNodes,
    GLOBAL_CONFIG: globalConfigNodes,
    INTERFACE_CONFIG: interfaceConfigNodes,
    LINE_CONFIG: [],
  };
}
