import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Monitor, Terminal, Send } from 'lucide-react';
import { SerializedDevice } from '../../worker/protocol';

export interface HostNodeData {
  device: SerializedDevice;
  onOpenConsole: (deviceId: string) => void;
  onQuickPing?: (hostId: string) => void;
}

export const HostNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as HostNodeData;
  const device = nodeData.device;
  const eth0 = device.interfaces[0];

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
      <Handle type="target" position={Position.Top} style={{ background: 'var(--text-secondary)' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--text-secondary)' }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-secondary)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--text-secondary)' }} />

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
          <Monitor size={16} color="var(--text-primary)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {device.name}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {nodeData.onQuickPing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                nodeData.onQuickPing!(device.id);
              }}
              title="Send ICMP Ping"
              style={{ padding: '3px 6px', fontSize: 11 }}
            >
              <Send size={11} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onOpenConsole(device.id);
            }}
            title="Open Host Terminal"
            style={{ padding: '3px 6px', fontSize: 11 }}
          >
            <Terminal size={11} />
            CLI
          </button>
        </div>
      </div>

      {/* Network Config Info */}
      <div style={{ padding: '8px 12px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>IP:</span>
          <span style={{ color: eth0?.ipAddress ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {eth0?.ipAddress || 'DHCP/None'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
          <span style={{ color: 'var(--text-secondary)' }}>MAC:</span>
          <span style={{ color: 'var(--text-muted)' }}>{eth0?.macAddress}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 2 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Link:</span>
          <span style={{ color: eth0?.status === 'UP' ? 'var(--status-up)' : 'var(--status-down)', fontWeight: 600 }}>
            {eth0?.status || 'DOWN'}
          </span>
        </div>
      </div>
    </div>
  );
};
