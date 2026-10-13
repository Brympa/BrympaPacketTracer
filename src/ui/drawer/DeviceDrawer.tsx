import React, { useState } from 'react';
import {
  X,
  Trash2,
  Cpu,
  Monitor,
  Send,
  Globe,
  Plus,
  Unplug,
  Settings2,
  Check,
} from 'lucide-react';
import { SerializedDevice } from '../../worker/protocol';
import { SimulationWorkerClient } from '../../worker/worker-client';
import { ConsoleModal } from '../terminal/ConsoleModal';

export interface DeviceDrawerProps {
  device: SerializedDevice;
  client: SimulationWorkerClient;
  onClose: () => void;
  onDeleteDevice: (deviceId: string) => void;
}

export const DeviceDrawer: React.FC<DeviceDrawerProps> = ({
  device,
  client,
  onClose,
  onDeleteDevice,
}) => {
  const [activeTab, setActiveTab] = useState<'DESKTOP' | 'CLI' | 'PHYSICAL'>('DESKTOP');

  // Host IP config state
  const eth0 = device.interfaces[0];
  const [hostIp, setHostIp] = useState(eth0?.ipAddress || '');
  const [hostMask, setHostMask] = useState(eth0?.subnetMask || '255.255.255.0');
  const [hostGateway, setHostGateway] = useState(device.defaultGateway || '');
  const [hostIpSaved, setHostIpSaved] = useState(false);

  // Quick Ping state
  const [pingTarget, setPingTarget] = useState('192.168.1.1');
  const [pingLog, setPingLog] = useState<string[]>([]);

  // Web Browser Mock state
  const [browserUrl, setBrowserUrl] = useState('http://192.168.1.1');
  const [browserPage, setBrowserPage] = useState<string | null>(null);

  // Router interface config state
  const [selectedRouterIface, setSelectedRouterIface] = useState(device.interfaces[0]?.name || '');
  const currentRouterIface = device.interfaces.find((i) => i.name === selectedRouterIface) || device.interfaces[0];
  const [routerIfaceIp, setRouterIfaceIp] = useState(currentRouterIface?.ipAddress || '');
  const [routerIfaceMask, setRouterIfaceMask] = useState(currentRouterIface?.subnetMask || '255.255.255.0');
  const [routerIfaceAdmin, setRouterIfaceAdmin] = useState<'UP' | 'DOWN'>(currentRouterIface?.adminStatus || 'UP');

  // Static Route state
  const [staticNet, setStaticNet] = useState('');
  const [staticMask, setStaticMask] = useState('255.255.255.0');
  const [staticNextHop, setStaticNextHop] = useState('');

  // Switch port config state
  const [selectedSwitchPort, setSelectedSwitchPort] = useState(device.interfaces[0]?.name || '');
  const currentSwitchPort = device.interfaces.find((i) => i.name === selectedSwitchPort) || device.interfaces[0];
  const [switchMode, setSwitchMode] = useState<'access' | 'trunk'>(currentSwitchPort?.mode === 'trunk' ? 'trunk' : 'access');
  const [switchVlan, setSwitchVlan] = useState(currentSwitchPort?.accessVlan || 1);
  const [switchPortAdmin, setSwitchPortAdmin] = useState<'UP' | 'DOWN'>(currentSwitchPort?.adminStatus || 'UP');

  // Handle saving Host IP
  const handleSaveHostIp = (e: React.FormEvent) => {
    e.preventDefault();
    client.configureHost(device.id, hostIp.trim(), hostMask.trim(), hostGateway.trim() || undefined);
    setHostIpSaved(true);
    setTimeout(() => setHostIpSaved(false), 2000);
  };

  // Handle Router interface save
  const handleSaveRouterIface = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRouterIface) return;
    client.configureInterface(device.id, currentRouterIface.name, {
      ip: routerIfaceIp.trim(),
      mask: routerIfaceMask.trim(),
      adminStatus: routerIfaceAdmin,
    });
    alert(`Applied interface ${currentRouterIface.name} configuration!`);
  };

  // Handle adding static route
  const handleAddStaticRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staticNet || !staticMask || !staticNextHop) return;
    client.addStaticRoute(device.id, staticNet.trim(), staticMask.trim(), staticNextHop.trim());
    setStaticNet('');
    setStaticNextHop('');
  };

  // Handle Switch port save
  const handleSaveSwitchPort = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSwitchPort) return;
    client.configureInterface(device.id, currentSwitchPort.name, {
      mode: switchMode,
      accessVlan: Number(switchVlan),
      adminStatus: switchPortAdmin,
    });
    alert(`Applied port ${currentSwitchPort.name} settings!`);
  };

  // Handle Ping
  const handleSendPing = () => {
    if (!pingTarget) return;
    setPingLog((prev) => [...prev, `Pinging ${pingTarget}...`]);
    client.ping(device.id, pingTarget.trim());
  };

  // Handle Web Browser
  const handleBrowse = () => {
    setBrowserPage(
      `<html><body><h2>Cisco Integrated Management</h2><p>Host: ${device.name}</p><p>Web Server is online.</p></body></html>`
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 48,
        right: 0,
        width: 'min(480px, 100vw)',
        height: 'calc(100vh - 48px - 28px)',
        backgroundColor: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {device.type === 'ROUTER' ? (
            <Cpu size={18} color="var(--accent-cyan)" />
          ) : device.type === 'SWITCH' ? (
            <Settings2 size={18} color="var(--status-up)" />
          ) : (
            <Monitor size={18} color="var(--text-primary)" />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{device.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Type: {device.type} | Ports: {device.interfaces.length}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => onDeleteDevice(device.id)}
            title="Delete this device from lab"
            style={{ color: 'var(--status-down)', borderColor: 'var(--status-down)' }}
          >
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <button
          onClick={() => setActiveTab('DESKTOP')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'DESKTOP' ? '2px solid var(--accent-cyan)' : 'none',
            backgroundColor: activeTab === 'DESKTOP' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'DESKTOP' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            padding: '10px 0',
          }}
        >
          {device.type === 'HOST' ? 'Desktop Tools' : 'Configuration'}
        </button>

        <button
          onClick={() => setActiveTab('CLI')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'CLI' ? '2px solid var(--accent-cyan)' : 'none',
            backgroundColor: activeTab === 'CLI' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'CLI' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            padding: '10px 0',
          }}
        >
          CLI Terminal
        </button>

        <button
          onClick={() => setActiveTab('PHYSICAL')}
          style={{
            flex: 1,
            borderRadius: 0,
            border: 'none',
            borderBottom: activeTab === 'PHYSICAL' ? '2px solid var(--accent-cyan)' : 'none',
            backgroundColor: activeTab === 'PHYSICAL' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'PHYSICAL' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            padding: '10px 0',
          }}
        >
          Physical Ports
        </button>
      </div>

      {/* Drawer Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* ===================== HOST DESKTOP TAB ===================== */}
        {activeTab === 'DESKTOP' && device.type === 'HOST' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* IP Configuration Applet */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--accent-cyan)' }}>
                IP Configuration (IPv4)
              </div>
              <form onSubmit={handleSaveHostIp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    IPv4 Address
                  </label>
                  <input
                    type="text"
                    value={hostIp}
                    onChange={(e) => setHostIp(e.target.value)}
                    placeholder="192.168.1.10"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Subnet Mask
                  </label>
                  <input
                    type="text"
                    value={hostMask}
                    onChange={(e) => setHostMask(e.target.value)}
                    placeholder="255.255.255.0"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Default Gateway
                  </label>
                  <input
                    type="text"
                    value={hostGateway}
                    onChange={(e) => setHostGateway(e.target.value)}
                    placeholder="192.168.1.1"
                    style={{ width: '100%' }}
                  />
                </div>

                <button type="submit" className="primary" style={{ marginTop: 4 }}>
                  {hostIpSaved ? <Check size={14} /> : null}
                  {hostIpSaved ? 'Configuration Saved!' : 'Apply IP Configuration'}
                </button>
              </form>
            </div>

            {/* Quick Ping Tool */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Ping & Traffic Generator
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                  placeholder="Target IP (e.g. 192.168.1.1)"
                  style={{ flex: 1 }}
                />
                <button className="primary" onClick={handleSendPing}>
                  <Send size={13} />
                  Ping
                </button>
              </div>

              {pingLog.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 8,
                    backgroundColor: 'var(--bg-canvas)',
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    maxHeight: 100,
                    overflowY: 'auto',
                  }}
                >
                  {pingLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Web Browser Applet */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={14} color="var(--accent-cyan)" />
                Web Browser
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button onClick={handleBrowse}>Go</button>
              </div>
              {browserPage && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                  dangerouslySetInnerHTML={{ __html: browserPage }}
                />
              )}
            </div>
          </div>
        )}

        {/* ===================== ROUTER CONFIG TAB ===================== */}
        {activeTab === 'DESKTOP' && device.type === 'ROUTER' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Interface Configuration */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent-cyan)' }}>
                Interface Configuration
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Select Interface:
                </label>
                <select
                  value={selectedRouterIface}
                  onChange={(e) => {
                    const ifName = e.target.value;
                    setSelectedRouterIface(ifName);
                    const iface = device.interfaces.find((i) => i.name === ifName);
                    if (iface) {
                      setRouterIfaceIp(iface.ipAddress || '');
                      setRouterIfaceMask(iface.subnetMask || '255.255.255.0');
                      setRouterIfaceAdmin(iface.adminStatus);
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  {device.interfaces.map((i) => (
                    <option key={i.id} value={i.name}>
                      {i.name} ({i.status})
                    </option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleSaveRouterIface} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Port Status:
                  </label>
                  <button
                    type="button"
                    onClick={() => setRouterIfaceAdmin((prev) => (prev === 'UP' ? 'DOWN' : 'UP'))}
                    style={{
                      backgroundColor: routerIfaceAdmin === 'UP' ? 'var(--status-up)' : 'var(--bg-hover)',
                      color: routerIfaceAdmin === 'UP' ? '#090d14' : 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {routerIfaceAdmin === 'UP' ? 'Port Status: ON (no shutdown)' : 'Port Status: OFF (shutdown)'}
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={routerIfaceIp}
                    onChange={(e) => setRouterIfaceIp(e.target.value)}
                    placeholder="192.168.1.1"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Subnet Mask
                  </label>
                  <input
                    type="text"
                    value={routerIfaceMask}
                    onChange={(e) => setRouterIfaceMask(e.target.value)}
                    placeholder="255.255.255.0"
                    style={{ width: '100%' }}
                  />
                </div>

                <button type="submit" className="primary" style={{ marginTop: 4 }}>
                  Save Interface Settings
                </button>
              </form>
            </div>

            {/* Static Routing */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--status-up)' }}>
                Static Routing
              </div>

              <form onSubmit={handleAddStaticRoute} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Network (e.g. 192.168.2.0)"
                  value={staticNet}
                  onChange={(e) => setStaticNet(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Mask (e.g. 255.255.255.0)"
                  value={staticMask}
                  onChange={(e) => setStaticMask(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Next Hop (e.g. 10.0.0.2)"
                  value={staticNextHop}
                  onChange={(e) => setStaticNextHop(e.target.value)}
                />
                <button type="submit" className="primary">
                  <Plus size={14} />
                  Add Static Route
                </button>
              </form>

              {device.routingTable && device.routingTable.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Current Routing Table:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: 11 }}>
                    {device.routingTable.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'var(--bg-canvas)',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{r.type === 'CONNECTED' ? 'C' : 'S'} {r.network}/{r.prefixLength}</span>
                        <span>{r.type === 'CONNECTED' ? r.interfaceName : `via ${r.nextHop}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== SWITCH CONFIG TAB ===================== */}
        {activeTab === 'DESKTOP' && device.type === 'SWITCH' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Switchport VLAN Config */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--status-up)' }}>
                Switchport & VLAN Settings
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Select Port:
                </label>
                <select
                  value={selectedSwitchPort}
                  onChange={(e) => {
                    const pName = e.target.value;
                    setSelectedSwitchPort(pName);
                    const iface = device.interfaces.find((i) => i.name === pName);
                    if (iface) {
                      setSwitchMode(iface.mode === 'trunk' ? 'trunk' : 'access');
                      setSwitchVlan(iface.accessVlan);
                      setSwitchPortAdmin(iface.adminStatus);
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  {device.interfaces.map((i) => (
                    <option key={i.id} value={i.name}>
                      {i.name} ({i.mode.toUpperCase()}) [{i.status}]
                    </option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleSaveSwitchPort} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Port Status:
                  </label>
                  <button
                    type="button"
                    onClick={() => setSwitchPortAdmin((prev) => (prev === 'UP' ? 'DOWN' : 'UP'))}
                    style={{
                      backgroundColor: switchPortAdmin === 'UP' ? 'var(--status-up)' : 'var(--bg-hover)',
                      color: switchPortAdmin === 'UP' ? '#090d14' : 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {switchPortAdmin === 'UP' ? 'Port Status: UP' : 'Port Status: SHUTDOWN'}
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Switchport Mode:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSwitchMode('access')}
                      style={{
                        backgroundColor: switchMode === 'access' ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                        color: switchMode === 'access' ? '#090d14' : 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      Access
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwitchMode('trunk')}
                      style={{
                        backgroundColor: switchMode === 'trunk' ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                        color: switchMode === 'trunk' ? '#090d14' : 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      Trunk (802.1Q)
                    </button>
                  </div>
                </div>

                {switchMode === 'access' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Access VLAN ID:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4094}
                      value={switchVlan}
                      onChange={(e) => setSwitchVlan(parseInt(e.target.value, 10))}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                <button type="submit" className="primary" style={{ marginTop: 4 }}>
                  Apply Port Settings
                </button>
              </form>
            </div>

            {/* CAM Table */}
            {device.camTable && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  CAM / MAC Address Table ({device.camTable.length})
                </div>
                {device.camTable.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    No MAC addresses learned yet. Send traffic to populate.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: 11 }}>
                    {device.camTable.map((entry, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'var(--bg-canvas)',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>VLAN {entry.vlanId}</span>
                        <span>{entry.mac}</span>
                        <span style={{ color: 'var(--status-up)' }}>{entry.interfaceName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================== CLI TAB ===================== */}
        {activeTab === 'CLI' && (
          <div style={{ height: '100%', minHeight: 380 }}>
            <ConsoleModal
              deviceId={device.id}
              deviceName={device.name}
              client={client}
              onClose={() => setActiveTab('DESKTOP')}
            />
          </div>
        )}

        {/* ===================== PHYSICAL TAB ===================== */}
        {activeTab === 'PHYSICAL' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                Chassis Hardware & Interface LEDs
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: 8,
                }}
              >
                {device.interfaces.map((iface) => (
                  <div
                    key={iface.id}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{iface.name.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi')}</span>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: iface.status === 'UP' ? 'var(--status-up)' : 'var(--status-down)',
                          boxShadow: iface.status === 'UP' ? '0 0 6px var(--status-up)' : 'none',
                        }}
                      />
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {iface.connectedLinkId ? 'Connected' : 'Unplugged'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  for (const iface of device.interfaces) {
                    if (iface.connectedLinkId) {
                      client.disconnectLink(iface.connectedLinkId);
                    }
                  }
                }}
                style={{ color: 'var(--status-alert)', borderColor: 'var(--status-alert)' }}
              >
                <Unplug size={14} />
                Disconnect All Cables
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
