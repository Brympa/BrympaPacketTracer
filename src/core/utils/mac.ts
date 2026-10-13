import { MacAddress } from '../types/network';

export const BROADCAST_MAC: MacAddress = 'FF:FF:FF:FF:FF:FF';
export const ZERO_MAC: MacAddress = '00:00:00:00:00:00';

let macCounter = 1;

/**
 * Validates a MAC address string in standard format (XX:XX:XX:XX:XX:XX).
 */
export function isValidMac(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

/**
 * Normalizes a MAC address to uppercase colon-separated format (e.g. 00:1A:2B:3C:4D:5E).
 */
export function normalizeMac(mac: string): MacAddress {
  const clean = mac.replace(/[:-]/g, '').toUpperCase();
  if (clean.length !== 12) {
    throw new Error(`Invalid MAC address length: ${mac}`);
  }
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    parts.push(clean.substring(i, i + 2));
  }
  return parts.join(':');
}

export function isBroadcastMac(mac: string): boolean {
  return normalizeMac(mac) === BROADCAST_MAC;
}

export function isZeroMac(mac: string): boolean {
  return normalizeMac(mac) === ZERO_MAC;
}

/**
 * Generates a pseudo-unique MAC address with an optional vendor OUI prefix.
 */
export function generateMac(ouiPrefix = '00:1A:2B'): MacAddress {
  const current = macCounter++;
  const b1 = ((current >> 16) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  const b2 = ((current >> 8) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  const b3 = (current & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  return normalizeMac(`${ouiPrefix}:${b1}:${b2}:${b3}`);
}
