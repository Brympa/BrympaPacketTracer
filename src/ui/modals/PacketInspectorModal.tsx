import React from 'react';
import { X, Layers, ShieldCheck } from 'lucide-react';
import { FlyingPacketVisual } from '../../worker/protocol';

export interface PacketInspectorModalProps {
  packet: FlyingPacketVisual;
  onClose: () => void;
}

export const PacketInspectorModal: React.FC<PacketInspectorModalProps> = ({ packet, onClose }) => {
  const isArp = packet.etherType === 0x0806;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(500px, calc(100vw - 32px))',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={18} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 600, fontSize: 16 }}>PDU Packet Inspector</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <X size={18} />
          </button>
        </div>

        {/* Layer 2: Ethernet */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent-cyan)' }}>
            <ShieldCheck size={14} />
            Layer 2 — Ethernet II Frame
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Destination MAC:</span>
            <span>{packet.destMac}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Source MAC:</span>
            <span>{packet.srcMac}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>EtherType:</span>
            <span>0x{packet.etherType.toString(16).padStart(4, '0').toUpperCase()} ({isArp ? 'ARP' : 'IPv4'})</span>
          </div>
        </div>

        {/* Layer 3: IPv4 or ARP */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--status-up)' }}>
            <ShieldCheck size={14} />
            Layer 3 — {isArp ? 'Address Resolution Protocol (ARP)' : 'Internet Protocol v4'}
          </div>
          {isArp ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Hardware / Protocol:</span>
                <span>Ethernet (1) / IPv4 (0x0800)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sender IP / MAC:</span>
                <span>{packet.srcIp || '0.0.0.0'} ({packet.srcMac})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Target IP:</span>
                <span>{packet.destIp || '0.0.0.0'}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Source IP:</span>
                <span>{packet.srcIp}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Destination IP:</span>
                <span>{packet.destIp}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Protocol:</span>
                <span>{packet.protocol === 1 ? '1 (ICMP)' : packet.protocol}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
