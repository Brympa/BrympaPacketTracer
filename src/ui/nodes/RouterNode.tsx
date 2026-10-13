import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Router as RouterIcon, Terminal } from 'lucide-react';
import { SerializedDevice } from '../../worker/protocol';

export interface DeviceNodeData {
  device: SerializedDevice;
  onOpenConsole: (deviceId: string) => void;
}

export const RouterNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as DeviceNodeData;
  const device = nodeData.device;

  const upInterfaces = device.interfaces.filter((i) => i.status === 'UP').length;

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: `1.5px solid ${selected ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
        borderRadius: 8,
        minWidth: 160,
        boxShadow: selected ? '0 0 0 2px var(--border-focus)' : 'none',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--accent-cyan)' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--accent-cyan)' }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent-cyan)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--accent-cyan)' }} />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RouterIcon size={16} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {device.name}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onOpenConsole(device.id);
          }}
          title="Open Cisco Console"
          style={{ padding: '3px 6px', fontSize: 11 }}
        >
          <Terminal size={12} />
          CLI
        </button>
      </div>

      {/* Interface status badges */}
      <div style={{ padding: '8px 12px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Ports UP:</span>
          <span style={{ color: upInterfaces > 0 ? 'var(--status-up)' : 'var(--text-muted)', fontWeight: 600 }}>
            {upInterfaces} / {device.interfaces.length}
          </span>
        </div>
        {device.interfaces.slice(0, 2).map((iface) => (
          <div
            key={iface.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: iface.status === 'UP' ? 'var(--status-up)' : 'var(--text-muted)',
            }}
          >
            <span>{iface.name.replace('GigabitEthernet', 'Gi')}</span>
            <span>{iface.ipAddress || 'unassigned'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
