import { Ipv4Address, SubnetMask } from '../types/network';

export const LIMITED_BROADCAST_IP: Ipv4Address = '255.255.255.255';
export const ANY_IP: Ipv4Address = '0.0.0.0';

/**
 * Validates whether a string is a valid IPv4 address in dot-decimal notation.
 */
export function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (num < 0 || num > 255 || (part.length > 1 && part.startsWith('0'))) {
      return false;
    }
  }
  return true;
}

/**
 * Converts dot-decimal IPv4 to unsigned 32-bit integer.
 */
export function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`Invalid IPv4 address: ${ip}`);
  return (
    ((parseInt(parts[0], 10) << 24) |
      (parseInt(parts[1], 10) << 16) |
      (parseInt(parts[2], 10) << 8) |
      parseInt(parts[3], 10)) >>> 0
  );
}

/**
 * Converts unsigned 32-bit integer to dot-decimal IPv4.
 */
export function numberToIp(num: number): Ipv4Address {
  const u = num >>> 0;
  const b1 = (u >>> 24) & 0xff;
  const b2 = (u >>> 16) & 0xff;
  const b3 = (u >>> 8) & 0xff;
  const b4 = u & 0xff;
  return `${b1}.${b2}.${b3}.${b4}`;
}

/**
 * Converts a subnet mask (e.g. "255.255.255.0") to prefix length (e.g. 24).
 */
export function maskToPrefix(mask: SubnetMask): number {
  const num = ipToNumber(mask);
  let prefix = 0;
  let seenZero = false;

  for (let i = 31; i >= 0; i--) {
    const bit = (num >>> i) & 1;
    if (bit === 1) {
      if (seenZero) {
        throw new Error(`Non-contiguous subnet mask: ${mask}`);
      }
      prefix++;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

/**
 * Converts a prefix length (0..32) to dot-decimal subnet mask.
 */
export function prefixToMask(prefix: number): SubnetMask {
  if (prefix < 0 || prefix > 32) {
    throw new Error(`Prefix length must be between 0 and 32, got: ${prefix}`);
  }
  if (prefix === 0) return '0.0.0.0';
  const num = ((0xffffffff << (32 - prefix)) & 0xffffffff) >>> 0;
  return numberToIp(num);
}

/**
 * Returns the network address for a given IP and mask (e.g. 192.168.1.10/24 -> 192.168.1.0).
 */
export function getNetworkAddress(ip: Ipv4Address, mask: SubnetMask): Ipv4Address {
  const ipNum = ipToNumber(ip);
  const maskNum = ipToNumber(mask);
  return numberToIp((ipNum & maskNum) >>> 0);
}

/**
 * Returns the directed broadcast address for a given IP and mask (e.g. 192.168.1.10/24 -> 192.168.1.255).
 */
export function getBroadcastAddress(ip: Ipv4Address, mask: SubnetMask): Ipv4Address {
  const ipNum = ipToNumber(ip);
  const maskNum = ipToNumber(mask);
  const invertedMask = (~maskNum) >>> 0;
  return numberToIp((ipNum | invertedMask) >>> 0);
}

/**
 * Checks if two IP addresses are in the same subnet according to the provided mask.
 */
export function isSameSubnet(ip1: Ipv4Address, ip2: Ipv4Address, mask: SubnetMask): boolean {
  const maskNum = ipToNumber(mask);
  return ((ipToNumber(ip1) & maskNum) >>> 0) === ((ipToNumber(ip2) & maskNum) >>> 0);
}

/**
 * Checks if an IP is a broadcast address (either 255.255.255.255 or directed broadcast for the subnet).
 */
export function isBroadcastIp(ip: Ipv4Address, mask?: SubnetMask): boolean {
  if (ip === LIMITED_BROADCAST_IP) return true;
  if (mask) {
    return ip === getBroadcastAddress(ip, mask);
  }
  return false;
}
