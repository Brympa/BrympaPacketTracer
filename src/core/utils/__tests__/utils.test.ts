import { describe, it, expect } from 'vitest';
import {
  isValidMac,
  normalizeMac,
  isBroadcastMac,
  isZeroMac,
  generateMac,
  BROADCAST_MAC,
} from '../mac';
import {
  isValidIpv4,
  ipToNumber,
  numberToIp,
  maskToPrefix,
  prefixToMask,
  getNetworkAddress,
  getBroadcastAddress,
  isSameSubnet,
  isBroadcastIp,
} from '../ip';
import { MinHeapPriorityQueue } from '../priority-queue';
import { ObjectPool } from '../object-pool';

describe('MAC Utilities', () => {
  it('validates MAC addresses correctly', () => {
    expect(isValidMac('00:1A:2B:3C:4D:5E')).toBe(true);
    expect(isValidMac('00-1A-2B-3C-4D-5E')).toBe(true);
    expect(isValidMac('invalid-mac')).toBe(false);
    expect(isValidMac('00:11:22:33:44')).toBe(false);
  });

  it('normalizes MAC addresses', () => {
    expect(normalizeMac('00-1a-2b-3c-4d-5e')).toBe('00:1A:2B:3C:4D:5E');
  });

  it('detects broadcast and zero MAC', () => {
    expect(isBroadcastMac(BROADCAST_MAC)).toBe(true);
    expect(isZeroMac('00:00:00:00:00:00')).toBe(true);
    expect(isBroadcastMac('00:1A:2B:3C:4D:5E')).toBe(false);
  });

  it('generates unique valid MACs', () => {
    const mac1 = generateMac();
    const mac2 = generateMac();
    expect(isValidMac(mac1)).toBe(true);
    expect(isValidMac(mac2)).toBe(true);
    expect(mac1).not.toBe(mac2);
  });
});

describe('IPv4 Utilities', () => {
  it('validates IPv4 addresses', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false);
    expect(isValidIpv4('not.an.ip')).toBe(false);
  });

  it('converts between IP and number bi-directionally', () => {
    const ip = '192.168.1.100';
    const num = ipToNumber(ip);
    expect(numberToIp(num)).toBe(ip);
  });

  it('converts mask to prefix and back', () => {
    expect(maskToPrefix('255.255.255.0')).toBe(24);
    expect(maskToPrefix('255.255.0.0')).toBe(16);
    expect(maskToPrefix('255.0.0.0')).toBe(8);
    expect(maskToPrefix('255.255.255.252')).toBe(30);

    expect(prefixToMask(24)).toBe('255.255.255.0');
    expect(prefixToMask(16)).toBe('255.255.0.0');
    expect(prefixToMask(30)).toBe('255.255.255.252');
  });

  it('calculates network and broadcast addresses', () => {
    expect(getNetworkAddress('192.168.1.55', '255.255.255.0')).toBe('192.168.1.0');
    expect(getBroadcastAddress('192.168.1.55', '255.255.255.0')).toBe('192.168.1.255');
  });

  it('checks subnet membership', () => {
    expect(isSameSubnet('192.168.1.10', '192.168.1.20', '255.255.255.0')).toBe(true);
    expect(isSameSubnet('192.168.1.10', '192.168.2.10', '255.255.255.0')).toBe(false);
  });

  it('identifies broadcast IPs', () => {
    expect(isBroadcastIp('255.255.255.255')).toBe(true);
    expect(isBroadcastIp('192.168.1.255', '255.255.255.0')).toBe(true);
    expect(isBroadcastIp('192.168.1.50', '255.255.255.0')).toBe(false);
  });
});

describe('MinHeapPriorityQueue', () => {
  interface Item {
    val: number;
  }

  it('orders items by comparator in min-heap order', () => {
    const pq = new MinHeapPriorityQueue<Item>((a, b) => a.val - b.val);
    pq.push({ val: 50 });
    pq.push({ val: 10 });
    pq.push({ val: 30 });
    pq.push({ val: 5 });
    pq.push({ val: 20 });

    expect(pq.size()).toBe(5);
    expect(pq.peek()?.val).toBe(5);

    expect(pq.pop()?.val).toBe(5);
    expect(pq.pop()?.val).toBe(10);
    expect(pq.pop()?.val).toBe(20);
    expect(pq.pop()?.val).toBe(30);
    expect(pq.pop()?.val).toBe(50);
    expect(pq.isEmpty()).toBe(true);
    expect(pq.pop()).toBeUndefined();
  });
});

describe('ObjectPool', () => {
  it('acquires and releases items without unnecessary allocations', () => {
    let createdCount = 0;
    const pool = new ObjectPool<{ id: number; data?: string }>(
      () => {
        createdCount++;
        return { id: createdCount };
      },
      (item) => {
        item.data = undefined;
      }
    );

    const item1 = pool.acquire();
    item1.data = 'test';
    expect(item1.id).toBe(1);

    pool.release(item1);
    expect(pool.size()).toBe(1);

    const itemReused = pool.acquire();
    expect(itemReused.id).toBe(1);
    expect(itemReused.data).toBeUndefined(); // Reset called
    expect(createdCount).toBe(1); // No new allocation
  });
});
