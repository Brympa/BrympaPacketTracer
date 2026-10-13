import { describe, it, expect, afterEach } from 'vitest';
import { SimulationWorkerHost } from '../simulation-worker';
import { SimulationWorkerClient } from '../worker-client';
import { SerializedDevice } from '../protocol';

describe('Web Worker Simulation Host & IPC Protocol', () => {
  let client: SimulationWorkerClient;
  let host: SimulationWorkerHost;

  afterEach(() => {
    client?.terminate();
  });

  it('synchronizes topology across worker IPC boundary', () => {
    let syncedDevices: SerializedDevice[] = [];

    client = new SimulationWorkerClient();
    host = new SimulationWorkerHost((msg) => client.handleWorkerMessage(msg));
    client.setMockHost(host);

    client.onTopologySync = (devices) => {
      syncedDevices = devices;
    };

    // Add devices
    client.addDevice('r1', 'Router-1', 'ROUTER', 4);
    client.addDevice('pc1', 'PC-1', 'HOST');

    expect(syncedDevices.length).toBe(2);
    const r1 = syncedDevices.find((d) => d.id === 'r1');
    const pc1 = syncedDevices.find((d) => d.id === 'pc1');

    expect(r1).toBeDefined();
    expect(r1?.type).toBe('ROUTER');
    expect(r1?.interfaces.length).toBe(4);

    expect(pc1).toBeDefined();
    expect(pc1?.type).toBe('HOST');
    expect(pc1?.interfaces[0].name).toBe('eth0');
  });

  it('processes CLI input and responds with output and prompt via IPC', () => {
    let lastCliOutput = '';
    let lastPrompt = '';

    client = new SimulationWorkerClient();
    host = new SimulationWorkerHost((msg) => client.handleWorkerMessage(msg));
    client.setMockHost(host);

    client.onCliOutput = (_deviceId, output, prompt) => {
      lastCliOutput = output;
      lastPrompt = prompt;
    };

    client.addDevice('sw1', 'Switch-1', 'SWITCH', 24);

    // Initial state
    client.sendCliInput('sw1', 'enable');
    expect(lastPrompt).toBe('Switch-1#');

    // Configure terminal
    client.sendCliInput('sw1', 'configure terminal');
    expect(lastPrompt).toBe('Switch-1(config)#');

    // Hostname change
    client.sendCliInput('sw1', 'hostname Distribution-SW');
    expect(lastPrompt).toBe('Distribution-SW(config)#');

    // Show command
    client.sendCliInput('sw1', 'end');
    client.sendCliInput('sw1', 'show version');
    expect(lastCliOutput).toContain('Cisco IOS Software');
  });

  it('handles Tab completion and ? help queries over IPC', () => {
    let tabCompleted = '';
    let helpItemsCount = 0;

    client = new SimulationWorkerClient();
    host = new SimulationWorkerHost((msg) => client.handleWorkerMessage(msg));
    client.setMockHost(host);

    client.onCliTabReply = (res) => {
      tabCompleted = res.completedLine;
    };

    client.onCliHelpReply = (res) => {
      helpItemsCount = res.items.length;
    };

    client.addDevice('r1', 'Router-1', 'ROUTER');
    client.sendCliInput('r1', 'enable');

    // Tab test
    client.sendCliTab('r1', 'conf');
    expect(tabCompleted).toBe('configure ');

    // Help test
    client.sendCliHelp('r1', 'show ');
    expect(helpItemsCount).toBeGreaterThan(0);
  });
});
