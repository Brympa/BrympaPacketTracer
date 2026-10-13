import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Network, Terminal } from 'lucide-react';
import { DeviceNodeData } from './RouterNode';

export const SwitchNode: React.FC<NodeProps> = ({ data, selected }) => {
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
      <Handle type="target" position={Position.Top} style={{ background: 'var(--status-up)' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--status-up)' }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--status-up)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--status-up)' }} />

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
          <Network size={16} color="var(--status-up)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {device.name}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onOpenConsole(device.id);
          }}
          title="Open Switch Console"
          style={{ padding: '3px 6px', fontSize: 11 }}
        >
          <Terminal size={12} />
          CLI
        </button>
      </div>

      {/* Interface activity indicator */}
      <div style={{ padding: '8px 12px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Active Links:</span>
          <span style={{ color: upInterfaces > 0 ? 'var(--status-up)' : 'var(--text-muted)', fontWeight: 600 }}>
            {upInterfaces} / {device.interfaces.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
          {device.interfaces.slice(0, 12).map((iface) => (
            <div
              key={iface.id}
              title={`${iface.name}: ${iface.status}`}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: iface.status === 'UP' ? 'var(--status-up)' : 'var(--border-subtle)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
