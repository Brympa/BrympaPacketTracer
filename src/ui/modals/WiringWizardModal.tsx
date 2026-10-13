import React, { useState } from 'react';
import { Cable, X, Check } from 'lucide-react';
import { SerializedDevice } from '../../worker/protocol';

export interface WiringWizardModalProps {
  devices: SerializedDevice[];
  initialSourceDevId?: string;
  initialTargetDevId?: string;
  onConnect: (source: { deviceId: string; interfaceName: string }, target: { deviceId: string; interfaceName: string }) => void;
  onClose: () => void;
}

export const WiringWizardModal: React.FC<WiringWizardModalProps> = ({
  devices,
  initialSourceDevId,
  initialTargetDevId,
  onConnect,
  onClose,
}) => {
  const [sourceDevId, setSourceDevId] = useState<string>(
    initialSourceDevId || devices[0]?.id || ''
  );
  const [sourceInterface, setSourceInterface] = useState<string>('');
  const [targetDevId, setTargetDevId] = useState<string>(
    initialTargetDevId || devices.find((d) => d.id !== (initialSourceDevId || devices[0]?.id))?.id || devices[1]?.id || ''
  );
  const [targetInterface, setTargetInterface] = useState<string>('');

  const sourceDev = devices.find((d) => d.id === sourceDevId);
  const targetDev = devices.find((d) => d.id === targetDevId);

  // Auto-select first available interface when device changes
  const sourceAvailableIfaces = sourceDev?.interfaces.filter((i) => !i.connectedLinkId) || [];
  const targetAvailableIfaces = targetDev?.interfaces.filter((i) => !i.connectedLinkId) || [];

  const handleConnect = () => {
    const srcIface = sourceInterface || sourceAvailableIfaces[0]?.name;
    const tgtIface = targetInterface || targetAvailableIfaces[0]?.name;

    if (!sourceDevId || !srcIface || !targetDevId || !tgtIface || sourceDevId === targetDevId) {
      return;
    }

    onConnect(
      { deviceId: sourceDevId, interfaceName: srcIface },
      { deviceId: targetDevId, interfaceName: tgtIface }
    );
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'flex-end', // Bottom sheet on mobile, centered on larger screens
        justifyContent: 'center',
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(540px, 100vw)',
          backgroundColor: 'var(--bg-panel)',
          borderTop: '1px solid var(--border-subtle)',
          borderLeft: '1px solid var(--border-subtle)',
          borderRight: '1px solid var(--border-subtle)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cable size={18} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 600, fontSize: 16 }}>Connect Cable (Touch Wizard)</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <X size={18} />
          </button>
        </div>

        {/* Source Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            ENDPOINT A:
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select
              value={sourceDevId}
              onChange={(e) => {
                setSourceDevId(e.target.value);
                setSourceInterface('');
              }}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>

            <select
              value={sourceInterface || sourceAvailableIfaces[0]?.name || ''}
              onChange={(e) => setSourceInterface(e.target.value)}
              disabled={sourceAvailableIfaces.length === 0}
            >
              {sourceAvailableIfaces.length === 0 ? (
                <option>No free ports</option>
              ) : (
                sourceAvailableIfaces.map((i) => (
                  <option key={i.id} value={i.name}>
                    {i.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Target Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            ENDPOINT B:
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select
              value={targetDevId}
              onChange={(e) => {
                setTargetDevId(e.target.value);
                setTargetInterface('');
              }}
            >
              {devices
                .filter((d) => d.id !== sourceDevId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type})
                  </option>
                ))}
            </select>

            <select
              value={targetInterface || targetAvailableIfaces[0]?.name || ''}
              onChange={(e) => setTargetInterface(e.target.value)}
              disabled={targetAvailableIfaces.length === 0}
            >
              {targetAvailableIfaces.length === 0 ? (
                <option>No free ports</option>
              ) : (
                targetAvailableIfaces.map((i) => (
                  <option key={i.id} value={i.name}>
                    {i.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Action Button */}
        <button
          className="primary"
          onClick={handleConnect}
          style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, marginTop: 8 }}
          disabled={sourceAvailableIfaces.length === 0 || targetAvailableIfaces.length === 0}
        >
          <Check size={16} />
          Establish Cable Link
        </button>
      </div>
    </div>
  );
};
