import React, { useEffect, useRef } from 'react';
import { useViewport, Node } from '@xyflow/react';
import { FlyingPacketVisual } from '../../worker/protocol';

export interface PacketFlightOverlayProps {
  packets: FlyingPacketVisual[];
  nodes: Node[];
  width: number;
  height: number;
  onSelectPacket?: (packet: FlyingPacketVisual) => void;
}

export const PacketFlightOverlay: React.FC<PacketFlightOverlayProps> = ({
  packets,
  nodes,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewport = useViewport(); // { x, y, zoom }
  const packetsRef = useRef<FlyingPacketVisual[]>(packets);
  const nodesRef = useRef<Node[]>(nodes);
  const viewportRef = useRef(viewport);

  packetsRef.current = packets;
  nodesRef.current = nodes;
  viewportRef.current = viewport;

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const vp = viewportRef.current;
      const currentPackets = packetsRef.current;
      const currentNodes = nodesRef.current;

      // Build node centers map: node center is roughly x + 80, y + 40
      const nodeCenterMap = new Map<string, { x: number; y: number }>();
      for (const node of currentNodes) {
        nodeCenterMap.set(node.id, {
          x: node.position.x + 80,
          y: node.position.y + 40,
        });
      }

      for (const packet of currentPackets) {
        const src = nodeCenterMap.get(packet.sourceDeviceId);
        const tgt = nodeCenterMap.get(packet.targetDeviceId);
        if (!src || !tgt) continue;

        // Interpolate graph space
        const gx = src.x + (tgt.x - src.x) * packet.progress;
        const gy = src.y + (tgt.y - src.y) * packet.progress;

        // Project into screen space
        const sx = gx * vp.zoom + vp.x;
        const sy = gy * vp.zoom + vp.y;

        // Skip if outside screen bounds
        if (sx < -20 || sx > canvas.width + 20 || sy < -20 || sy > canvas.height + 20) {
          continue;
        }

        // Color by EtherType
        const isArp = packet.etherType === 0x0806;
        const mainColor = isArp ? '#38bdf8' : '#22c55e'; // Cyan for ARP, Green for IPv4
        const label = isArp ? 'ARP' : packet.protocol === 1 ? 'ICMP' : 'IPv4';

        // Outer glow
        ctx.beginPath();
        ctx.arc(sx, sy, 9 * Math.min(vp.zoom, 1.2), 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = 0.35;
        ctx.fill();

        // Inner solid envelope
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5 * Math.min(vp.zoom, 1.2), 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1.0;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, 4 * Math.min(vp.zoom, 1.2), 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();

        // Label badge if zoomed in enough
        if (vp.zoom >= 0.75) {
          ctx.font = '600 9px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, sx, sy - 8);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
};
