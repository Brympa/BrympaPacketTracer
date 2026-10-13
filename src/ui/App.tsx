import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Cable,
  Router as RouterIcon,
  Network,
  Monitor,
  Palette,
  Layers,
} from 'lucide-react';

import { SimulationWorkerClient } from '../worker/worker-client';
import { SimulationWorkerHost } from '../worker/simulation-worker';
import { FlyingPacketVisual, SerializedDevice, SerializedLink } from '../worker/protocol';

import { RouterNode } from './nodes/RouterNode';
import { SwitchNode } from './nodes/SwitchNode';
import { HostNode } from './nodes/HostNode';
import { PacketFlightOverlay } from './canvas/PacketFlightOverlay';
import { ConsoleModal } from './terminal/ConsoleModal';
import { WiringWizardModal } from './modals/WiringWizardModal';
import { PacketInspectorModal } from './modals/PacketInspectorModal';

import '../styles/themes.css';

const THEMES = [
  { id: 'dark-modern', label: 'Dark Modern (VS Code)' },
  { id: 'tokyo-night', label: 'Tokyo Night (NOC)' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
  { id: 'github-light', label: 'GitHub Light' },
  { id: 'high-contrast', label: 'High Contrast' },
];

export const App: React.FC = () => {
  // Theme state
  const [currentTheme, setCurrentTheme] = useState('dark-modern');

  // Simulation client
  const [client] = useState(() => {
    const c = new SimulationWorkerClient();
    const host = new SimulationWorkerHost((msg) => c.handleWorkerMessage(msg));
    c.setMockHost(host);
    return c;
  });

  // State
  const [devices, setDevices] = useState<SerializedDevice[]>([]);
  const [, setLinks] = useState<SerializedLink[]>([]);
  const [flyingPackets, setFlyingPackets] = useState<FlyingPacketVisual[]>([]);
  const [simStats, setSimStats] = useState({ virtualTimeNs: '0', queueSize: 0, isRunning: false });

  // UI Active Modals
  const [activeConsoleDeviceId, setActiveConsoleDeviceId] = useState<string | null>(null);
  const [showWiringWizard, setShowWiringWizard] = useState(false);
  const [inspectedPacket, setInspectedPacket] = useState<FlyingPacketVisual | null>(null);

  // React Flow Nodes and Edges
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Canvas dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      setCanvasDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Node Types map for React Flow
  const nodeTypes = useMemo(
    () => ({
      ROUTER: RouterNode,
      SWITCH: SwitchNode,
      HOST: HostNode,
    }),
    []
  );

  // Open Console callback
  const handleOpenConsole = useCallback((deviceId: string) => {
    setActiveConsoleDeviceId(deviceId);
  }, []);

  // Quick Ping prompt
  const handleQuickPing = useCallback((hostId: string) => {
    const targetIp = window.prompt('Enter Destination IP to Ping (e.g. 192.168.1.1 or 192.168.2.10):', '192.168.1.1');
    if (targetIp) {
      client.ping(hostId, targetIp.trim());
    }
  }, [client]);

  // Wire Worker Callbacks
  useEffect(() => {
    client.onTopologySync = (syncedDevices, syncedLinks) => {
      setDevices(syncedDevices);
      setLinks(syncedLinks);

      // Map to React Flow nodes preserving existing positions
      setNodes((prevNodes) => {
        const nodeMap = new Map(prevNodes.map((n) => [n.id, n]));
        return syncedDevices.map((d, index) => {
          const existing = nodeMap.get(d.id);
          return {
            id: d.id,
            type: d.type,
            position: existing ? existing.position : { x: 120 + index * 220, y: 160 + (index % 2) * 120 },
            data: {
              device: d,
              onOpenConsole: handleOpenConsole,
              onQuickPing: d.type === 'HOST' ? handleQuickPing : undefined,
            },
          };
        });
      });

      // Map to React Flow edges
      setEdges(
        syncedLinks.map((l) => ({
          id: l.id,
          source: l.source.deviceId,
          target: l.target.deviceId,
          animated: true,
          style: { stroke: l.status === 'UP' ? 'var(--status-up)' : 'var(--status-down)', strokeWidth: 2.5 },
        }))
      );
    };

    client.onVisualDelta = (packets) => {
      setFlyingPackets(packets);
    };

    client.onSimStats = (stats) => {
      setSimStats(stats);
    };

    client.onPingReply = (res) => {
      if (res.message) {
        window.alert(`[Ping Reply]: ${res.message}`);
      }
    };

    // Populate initial default lab topology
    client.addDevice('r1', 'Router-1', 'ROUTER', 4);
    client.addDevice('sw1', 'Switch-1', 'SWITCH', 24);
    client.addDevice('pc1', 'PC-1', 'HOST');

    client.connectLink(
      'link-r1-sw1',
      { deviceId: 'r1', interfaceName: 'GigabitEthernet0/0' },
      { deviceId: 'sw1', interfaceName: 'FastEthernet0/24' }
    );

    client.connectLink(
      'link-sw1-pc1',
      { deviceId: 'sw1', interfaceName: 'FastEthernet0/1' },
      { deviceId: 'pc1', interfaceName: 'eth0' }
    );

    // Initial configuration on Router and PC
    setTimeout(() => {
      client.sendCliInput('r1', 'enable');
      client.sendCliInput('r1', 'configure terminal');
      client.sendCliInput('r1', 'interface GigabitEthernet0/0');
      client.sendCliInput('r1', 'ip address 192.168.1.1 255.255.255.0');
      client.sendCliInput('r1', 'no shutdown');
      client.sendCliInput('r1', 'end');

      client.startSimulation(1.0);
    }, 100);

    return () => {
      client.terminate();
    };
  }, [client, handleOpenConsole, handleQuickPing]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnectEdge = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const linkId = `link-${connection.source}-${connection.target}-${Date.now()}`;
        client.connectLink(
          linkId,
          { deviceId: connection.source, interfaceName: 'eth0' },
          { deviceId: connection.target, interfaceName: 'FastEthernet0/1' }
        );
        setEdges((eds) => addEdge(connection, eds));
      }
    },
    [client]
  );

  const addDevice = (type: 'ROUTER' | 'SWITCH' | 'HOST') => {
    const count = devices.filter((d) => d.type === type).length + 1;
    const prefix = type === 'ROUTER' ? 'Router' : type === 'SWITCH' ? 'Switch' : 'PC';
    const id = `${type.toLowerCase()}-${Date.now().toString().slice(-4)}`;
    client.addDevice(id, `${prefix}-${count}`, type);
  };

  const activeDevice = devices.find((d) => d.id === activeConsoleDeviceId);

  const virtualTimeMs = (Number(BigInt(simStats.virtualTimeNs) / 1000n) / 1000).toFixed(3);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          height: 48,
          backgroundColor: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 20,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#090d14',
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            B
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: -0.3 }}>
            Brympa Packet Tracer
          </span>
          <span
            style={{
              fontSize: 10,
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              padding: '2px 6px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            SPA v0.3
          </span>
        </div>

        {/* Center: Simulation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {simStats.isRunning ? (
            <button onClick={() => client.pauseSimulation()} title="Pause Simulation">
              <Pause size={14} />
              Pause
            </button>
          ) : (
            <button className="primary" onClick={() => client.startSimulation()} title="Play Simulation">
              <Play size={14} />
              Real-Time
            </button>
          )}

          <button onClick={() => client.stepSimulation()} title="Step by step (Single packet event)">
            <SkipForward size={14} />
            Step
          </button>

          <button onClick={() => client.resetSimulation()} title="Reset Clock">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Right: Device Palette & Theme Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => addDevice('ROUTER')} title="Add Router">
            <RouterIcon size={14} />
            + Router
          </button>

          <button onClick={() => addDevice('SWITCH')} title="Add Switch">
            <Network size={14} />
            + Switch
          </button>

          <button onClick={() => addDevice('HOST')} title="Add Host PC">
            <Monitor size={14} />
            + PC
          </button>

          <button onClick={() => setShowWiringWizard(true)} title="Connect Cable (Touch Wizard)">
            <Cable size={14} />
            Connect
          </button>

          {/* Theme Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <Palette size={14} color="var(--text-secondary)" />
            <select
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Workspace (React Flow + Flying Canvas Overlay) */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnectEdge}
          fitView
          style={{ width: '100%', height: '100%' }}
        >
          <Background color="var(--canvas-grid, #1a2230)" gap={20} size={1} />
          <Controls style={{ bottom: 32, left: 16 }} />

          {/* Decoupled 60 FPS Canvas Overlay for Flying Packets */}
          <PacketFlightOverlay
            packets={flyingPackets}
            nodes={nodes}
            width={canvasDimensions.width}
            height={canvasDimensions.height - 76} // subtracting header and status bar
          />
        </ReactFlow>

        {/* Floating packet inspector shortcut button if packets in flight */}
        {flyingPackets.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 30,
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              className="primary"
              onClick={() => setInspectedPacket(flyingPackets[0])}
              style={{ boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)' }}
            >
              <Layers size={14} />
              Inspect PDU ({flyingPackets.length} in flight)
            </button>
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer
        style={{
          height: 28,
          backgroundColor: 'var(--bg-panel)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono, monospace)' }}>
          <span>Virtual Clock: <strong style={{ color: 'var(--text-primary)' }}>{virtualTimeMs} ms</strong></span>
          <span>Packets in Flight: <strong style={{ color: 'var(--accent-cyan)' }}>{flyingPackets.length}</strong></span>
          <span>Event Queue: <strong style={{ color: 'var(--text-primary)' }}>{simStats.queueSize}</strong></span>
        </div>

        <div>
          <span>Nodes: {devices.length} | Links: {edges.length}</span>
        </div>
      </footer>

      {/* Active Cisco Console Modal */}
      {activeDevice && (
        <ConsoleModal
          deviceId={activeDevice.id}
          deviceName={activeDevice.name}
          client={client}
          onClose={() => setActiveConsoleDeviceId(null)}
        />
      )}

      {/* Mobile Touch Wiring Wizard Bottom Sheet */}
      {showWiringWizard && (
        <WiringWizardModal
          devices={devices}
          onConnect={(source, target) => {
            const linkId = `link-${source.deviceId}-${target.deviceId}-${Date.now()}`;
            client.connectLink(linkId, source, target);
          }}
          onClose={() => setShowWiringWizard(false)}
        />
      )}

      {/* PDU Packet Inspector Modal */}
      {inspectedPacket && (
        <PacketInspectorModal
          packet={inspectedPacket}
          onClose={() => setInspectedPacket(null)}
        />
      )}
    </div>
  );
};
